/**
 * GoHighLevel / Agencyflow (samme API, samme adresse).
 *
 * Læsning: kontakter, deres felter, noter, opgaver, aftaler, salgsmuligheder,
 * fakturaer, betalinger og kontrakter/dokumenter.
 *
 * Skrivning: fire ting, og ikke flere. Note, opgave og tag lægger kun noget
 * til. `updateContact` er den ene undtagelse: den *overskriver* de felter den
 * får, så den er også den der skal ses godt efter i bekræftelsen. Der slettes
 * aldrig noget, og skrivning kan slås helt fra med GHL_ALLOW_WRITES=false.
 *
 * Ingen af dem kører af sig selv. Serveren standser hver skrivning og beder om
 * et ja fra brugeren først, fordi teksten der ligger i noter og felter er
 * skrevet af folk udefra og derfor kan forsøge at bede modellen om noget.
 */
import { config, hasGhl } from '../config.js'
import { compact, truncate, clamp } from '../util.js'

const API_VERSION = '2021-07-28'

const notConfigured = {
  ok: false,
  fejl: 'GoHighLevel er ikke sat op på serveren (GHL_API_KEY og GHL_LOCATION_ID mangler).',
}

/** Ét sted hvor alle HTTP-kald til GoHighLevel foregår. */
async function request(method, path, { query, body, version } = {}) {
  const url = new URL(path, config.ghlBaseUrl)
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
  }

  const headers = {
    Authorization: `Bearer ${config.ghlToken}`,
    Version: version || API_VERSION,
    Accept: 'application/json',
  }
  if (body) headers['Content-Type'] = 'application/json'

  let response
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    })
  } catch (error) {
    return { ok: false, fejl: `Kunne ikke nå GoHighLevel: ${error?.message || error}` }
  }

  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raa: truncate(text, 300) }
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      fejl:
        data?.message ||
        data?.error ||
        `GoHighLevel svarede ${response.status}. Tjek at token har de rigtige scopes.`,
    }
  }
  return { ok: true, data }
}

/* --------------------------------------------------------- opslagstabeller */

let fieldCache = { at: 0, byId: new Map(), byName: new Map() }
let pipelineCache = { at: 0, stages: new Map(), pipelines: new Map() }
const CACHE_MS = 10 * 60 * 1000

/** Kundefelter hedder id'er i API'et. Her oversættes de til deres navne. */
async function customFields() {
  if (Date.now() - fieldCache.at < CACHE_MS && fieldCache.byId.size) return fieldCache
  const result = await request('GET', `/locations/${config.ghlLocationId}/customFields`)
  if (!result.ok) return fieldCache
  const byId = new Map()
  const byName = new Map()
  for (const field of result.data?.customFields || []) {
    byId.set(field.id, field.name || field.fieldKey)
    if (field.name) byName.set(field.name.toLowerCase(), field.id)
    if (field.fieldKey) byName.set(String(field.fieldKey).toLowerCase(), field.id)
  }
  fieldCache = { at: Date.now(), byId, byName }
  return fieldCache
}

async function pipelines() {
  if (Date.now() - pipelineCache.at < CACHE_MS && pipelineCache.stages.size) return pipelineCache
  const result = await request('GET', '/opportunities/pipelines', {
    query: { locationId: config.ghlLocationId },
  })
  if (!result.ok) return pipelineCache
  const stages = new Map()
  const names = new Map()
  for (const pipeline of result.data?.pipelines || []) {
    names.set(pipeline.id, pipeline.name)
    for (const stage of pipeline.stages || []) stages.set(stage.id, stage.name)
  }
  pipelineCache = { at: Date.now(), stages, pipelines: names }
  return pipelineCache
}

/* ------------------------------------------------------------------ former */

async function shapeContact(contact, { full = false } = {}) {
  const fields = full ? await customFields() : null
  const custom = {}
  if (full) {
    for (const entry of contact.customFields || contact.customField || []) {
      const name = fields.byId.get(entry.id) || entry.id
      const value = entry.value ?? entry.field_value ?? entry.fieldValue
      if (value !== undefined && value !== null && value !== '') custom[name] = value
    }
  }

  return compact({
    id: contact.id,
    navn:
      contact.contactName ||
      [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
      contact.name,
    email: contact.email,
    telefon: contact.phone,
    firma: contact.companyName,
    tags: contact.tags,
    kilde: contact.source,
    oprettet: contact.dateAdded,
    sidst_aendret: contact.dateUpdated,
    land: contact.country,
    adresse: contact.address1,
    by: contact.city,
    felter: Object.keys(custom).length ? custom : null,
  })
}

const shapeNote = (n) =>
  compact({
    id: n.id,
    tekst: truncate(n.body, 1500),
    oprettet: n.dateAdded || n.createdAt,
    af: n.userId,
  })

const shapeTask = (t) =>
  compact({
    id: t.id,
    titel: t.title,
    tekst: truncate(t.body, 500),
    forfalder: t.dueDate,
    faerdig: t.completed,
  })

/* ------------------------------------------------------------- funktioner */

/**
 * Kontaktsøgning findes i tre udgaver ude i naturen, og hvilken en der virker
 * afhænger af hvor gammel kontoen er. Vi prøver den nyeste først og falder
 * nedad, i stedet for at gætte på én og fejle for halvdelen af brugerne.
 */
function searchAttempts(q, max) {
  const body = { locationId: config.ghlLocationId, page: 1, pageLimit: max, query: q }
  return [
    { method: 'POST', path: '/contacts/search', body },
    { method: 'POST', path: '/contacts/search', body, version: 'v3' },
    // Forældet, men stadig i drift på ældre konti.
    {
      method: 'GET',
      path: '/contacts/',
      query: { locationId: config.ghlLocationId, query: q, limit: max },
    },
  ]
}

export async function searchContacts({ query, limit }) {
  if (!hasGhl()) return notConfigured
  const max = clamp(limit, 1, 50, 10)
  const q = String(query || '').trim()
  if (!q) return { ok: false, fejl: 'Skriv et navn, en e-mail eller et telefonnummer at søge på.' }

  let lastError = null
  for (const attempt of searchAttempts(q, max)) {
    const result = await request(attempt.method, attempt.path, attempt)
    if (!result.ok) {
      lastError = result
      continue
    }
    const contacts = result.data?.contacts || []
    return {
      ok: true,
      antal: contacts.length,
      kontakter: await Promise.all(contacts.map((c) => shapeContact(c))),
      bemaerkning: contacts.length
        ? undefined
        : 'Ingen kontakter i GoHighLevel matchede søgningen.',
    }
  }

  return (
    lastError || { ok: false, fejl: 'Kunne ikke søge efter kontakter i GoHighLevel.' }
  )
}

export async function getContact({ contact_id }) {
  if (!hasGhl()) return notConfigured
  const result = await request('GET', `/contacts/${encodeURIComponent(contact_id)}`)
  if (!result.ok) return result
  const contact = result.data?.contact || result.data
  return { ok: true, kontakt: await shapeContact(contact, { full: true }) }
}

/** Noter, opgaver og aftaler på én kontakt. */
export async function getContactActivity({ contact_id }) {
  if (!hasGhl()) return notConfigured
  const id = encodeURIComponent(contact_id)
  const [notes, tasks, appointments] = await Promise.all([
    request('GET', `/contacts/${id}/notes`),
    request('GET', `/contacts/${id}/tasks`),
    request('GET', `/contacts/${id}/appointments`),
  ])

  return {
    ok: true,
    noter: notes.ok ? (notes.data?.notes || []).map(shapeNote) : { fejl: notes.fejl },
    opgaver: tasks.ok ? (tasks.data?.tasks || []).map(shapeTask) : { fejl: tasks.fejl },
    aftaler: appointments.ok
      ? (appointments.data?.events || appointments.data?.appointments || []).map((a) =>
          compact({
            id: a.id,
            titel: a.title,
            start: a.startTime,
            slut: a.endTime,
            status: a.appointmentStatus || a.status,
          }),
        )
      : { fejl: appointments.fejl },
  }
}

export async function listOpportunities({ contact_id, status, limit }) {
  if (!hasGhl()) return notConfigured
  const result = await request('GET', '/opportunities/search', {
    query: {
      location_id: config.ghlLocationId,
      contact_id: contact_id || undefined,
      status: status && status !== 'alle' ? status : undefined,
      limit: clamp(limit, 1, 100, 20),
    },
  })
  if (!result.ok) return result

  const { stages, pipelines: names } = await pipelines()
  const rows = (result.data?.opportunities || []).map((o) =>
    compact({
      id: o.id,
      navn: o.name,
      status: o.status, // open, won, lost, abandoned
      vaerdi: o.monetaryValue,
      pipeline: names.get(o.pipelineId) || o.pipelineId,
      trin: stages.get(o.pipelineStageId) || o.pipelineStageId,
      kontakt_id: o.contactId || o.contact?.id,
      kontakt: o.contact?.name,
      oprettet: o.createdAt,
      sidst_aendret: o.updatedAt,
    }),
  )
  return { ok: true, antal: rows.length, salgsmuligheder: rows }
}

export async function listGhlInvoices({ contact_id, status, limit }) {
  if (!hasGhl()) return notConfigured
  const result = await request('GET', '/invoices/', {
    query: {
      altId: config.ghlLocationId,
      altType: 'location',
      limit: clamp(limit, 1, 100, 25),
      offset: 0,
      contactId: contact_id || undefined,
      status: status && status !== 'alle' ? status : undefined,
    },
  })
  if (!result.ok) return result

  const rows = (result.data?.invoices || []).map((i) =>
    compact({
      id: i._id || i.id,
      nummer: i.invoiceNumber,
      navn: i.name,
      status: i.status, // draft, sent, payment_processing, paid, void
      ialt: i.total,
      betalt: i.amountPaid,
      mangler: i.amountDue,
      valuta: i.currency,
      forfalder: i.dueDate,
      udstedt: i.issueDate,
      kontakt: i.contactDetails?.name,
      kontakt_id: i.contactDetails?.id,
    }),
  )
  return { ok: true, antal: rows.length, fakturaer: rows }
}

export async function listGhlPayments({ contact_id, limit }) {
  if (!hasGhl()) return notConfigured
  const base = {
    altId: config.ghlLocationId,
    altType: 'location',
    limit: clamp(limit, 1, 100, 25),
    contactId: contact_id || undefined,
  }
  const [transactions, subscriptions] = await Promise.all([
    request('GET', '/payments/transactions', { query: base }),
    request('GET', '/payments/subscriptions', { query: base }),
  ])

  return {
    ok: true,
    transaktioner: transactions.ok
      ? (transactions.data?.data || []).map((t) =>
          compact({
            id: t._id || t.id,
            beloeb: t.amount,
            valuta: t.currency,
            status: t.status,
            tidspunkt: t.createdAt,
            kontakt_id: t.contactId,
            kilde: t.entitySourceType,
          }),
        )
      : { fejl: transactions.fejl },
    abonnementer: subscriptions.ok
      ? (subscriptions.data?.data || []).map((s) =>
          compact({
            id: s._id || s.id,
            status: s.status,
            beloeb: s.amount,
            valuta: s.currency,
            oprettet: s.createdAt,
            kontakt_id: s.contactId,
          }),
        )
      : { fejl: subscriptions.fejl },
  }
}

/** Kontrakter og tilbud ("Documents & Contracts" i menuen). */
export async function listDocuments({ contact_id, status, limit }) {
  if (!hasGhl()) return notConfigured
  const result = await request('GET', '/proposals/document', {
    query: {
      locationId: config.ghlLocationId,
      contactId: contact_id || undefined,
      status: status && status !== 'alle' ? status : undefined,
      limit: clamp(limit, 1, 100, 25),
    },
  })

  if (!result.ok) {
    return {
      ok: false,
      fejl: `${result.fejl} (Kontrakter kræver at tokenet har scope for "documents/contracts". Kontrakt-oplysninger kan også ligge som felter på kontakten.)`,
    }
  }

  const rows = (result.data?.documents || result.data?.data || []).map((d) =>
    compact({
      id: d._id || d.id,
      navn: d.name || d.title,
      status: d.status, // draft, sent, viewed, accepted/signed, declined
      type: d.type,
      beloeb: d.amount ?? d.total,
      valuta: d.currency,
      oprettet: d.createdAt || d.dateAdded,
      sendt: d.sentAt,
      underskrevet: d.signedAt || d.completedAt,
      kontakt_id: d.contactId || d.contact?.id,
      link: d.publicUrl || d.documentUrl,
    }),
  )
  return { ok: true, antal: rows.length, dokumenter: rows }
}

/* --------------------------------------------------------------- skrivning */

function writeGuard() {
  if (!hasGhl()) return notConfigured
  if (!config.ghlAllowWrites) {
    return {
      ok: false,
      fejl: 'Skrivning til GoHighLevel er slået fra på serveren (GHL_ALLOW_WRITES=false).',
    }
  }
  return null
}

export async function addNote({ contact_id, note }) {
  const blocked = writeGuard()
  if (blocked) return blocked
  const text = String(note || '').trim()
  if (!text) return { ok: false, fejl: 'Noten er tom.' }

  const result = await request('POST', `/contacts/${encodeURIComponent(contact_id)}/notes`, {
    body: compact({ body: text, userId: config.ghlUserId || undefined }),
  })
  if (!result.ok) return result
  return {
    ok: true,
    skrevet: true,
    besked: 'Noten er lagt på kontakten i GoHighLevel.',
    note_id: result.data?.note?.id,
  }
}

export async function createTask({ contact_id, title, description, due_date }) {
  const blocked = writeGuard()
  if (blocked) return blocked
  if (!title) return { ok: false, fejl: 'Opgaven mangler en titel.' }

  const due = due_date ? new Date(due_date) : new Date(Date.now() + 86400000)
  const result = await request('POST', `/contacts/${encodeURIComponent(contact_id)}/tasks`, {
    body: compact({
      title: String(title).slice(0, 200),
      body: description ? String(description).slice(0, 2000) : undefined,
      dueDate: Number.isNaN(due.getTime()) ? undefined : due.toISOString(),
      completed: false,
      assignedTo: config.ghlUserId || undefined,
    }),
  })
  if (!result.ok) return result
  return { ok: true, skrevet: true, besked: 'Opgaven er oprettet i GoHighLevel.' }
}

export async function updateContact({ contact_id, first_name, last_name, email, phone, fields }) {
  const blocked = writeGuard()
  if (blocked) return blocked

  const body = compact({
    firstName: first_name,
    lastName: last_name,
    email,
    phone,
  })

  const unknown = []
  if (fields && typeof fields === 'object') {
    const known = await customFields()
    const customFieldsPayload = []
    for (const [name, value] of Object.entries(fields)) {
      const id = known.byName.get(String(name).toLowerCase())
      if (id) customFieldsPayload.push({ id, value: String(value) })
      else unknown.push(name)
    }
    if (customFieldsPayload.length) body.customFields = customFieldsPayload
  }

  if (!Object.keys(body).length) {
    return {
      ok: false,
      fejl: unknown.length
        ? `Ingen af felterne findes i GoHighLevel: ${unknown.join(', ')}. Brug det præcise feltnavn.`
        : 'Der var ikke noget at rette.',
    }
  }

  const result = await request('PUT', `/contacts/${encodeURIComponent(contact_id)}`, { body })
  if (!result.ok) return result
  return {
    ok: true,
    skrevet: true,
    besked: 'Kontakten er opdateret i GoHighLevel.',
    rettet: Object.keys(body),
    ukendte_felter: unknown.length ? unknown : undefined,
  }
}

export async function addTags({ contact_id, tags }) {
  const blocked = writeGuard()
  if (blocked) return blocked
  const list = (Array.isArray(tags) ? tags : [tags]).filter(Boolean).map(String)
  if (!list.length) return { ok: false, fejl: 'Ingen tags angivet.' }

  const result = await request('POST', `/contacts/${encodeURIComponent(contact_id)}/tags`, {
    body: { tags: list },
  })
  if (!result.ok) return result
  return { ok: true, skrevet: true, besked: `Tags tilføjet: ${list.join(', ')}.` }
}

/* ------------------------------------------------------------------ tools */

const readTools = [
  {
    name: 'ghl_search_contacts',
    description:
      'Find kontakter i GoHighLevel/Agencyflow ud fra navn, e-mail eller telefonnummer. Brug denne først når brugeren nævner en kunde.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Navn, e-mail eller telefonnummer.' },
        limit: { type: 'integer', description: 'Antal resultater, 1-50. Standard 10.' },
      },
      required: ['query'],
    },
    run: searchContacts,
    label: 'Søger efter kontakten i GoHighLevel',
  },
  {
    name: 'ghl_get_contact',
    description:
      'Alle oplysninger om én kontakt, inklusive tags og alle brugerdefinerede felter (der kan fx stå kontraktoplysninger).',
    input_schema: {
      type: 'object',
      properties: { contact_id: { type: 'string' } },
      required: ['contact_id'],
    },
    run: getContact,
    label: 'Henter kontaktens oplysninger',
  },
  {
    name: 'ghl_get_contact_activity',
    description: 'Noter, opgaver og aftaler på en kontakt.',
    input_schema: {
      type: 'object',
      properties: { contact_id: { type: 'string' } },
      required: ['contact_id'],
    },
    run: getContactActivity,
    label: 'Henter noter, opgaver og aftaler',
  },
  {
    name: 'ghl_list_opportunities',
    description:
      'Salgsmuligheder (pipelines) i GoHighLevel, altså hvor en kunde er i forløbet. Udelad contact_id for at se dem alle.',
    input_schema: {
      type: 'object',
      properties: {
        contact_id: { type: 'string' },
        status: { type: 'string', enum: ['open', 'won', 'lost', 'abandoned', 'alle'] },
        limit: { type: 'integer', description: 'Antal, 1-100. Standard 20.' },
      },
    },
    run: listOpportunities,
    label: 'Henter salgsmuligheder',
  },
  {
    name: 'ghl_list_invoices',
    description:
      'Fakturaer oprettet i GoHighLevel (ikke Stripe). Brug både denne og stripe_unpaid_invoices når spørgsmålet er om nogen mangler at betale.',
    input_schema: {
      type: 'object',
      properties: {
        contact_id: { type: 'string' },
        status: { type: 'string', description: 'fx draft, sent, paid, void, alle.' },
        limit: { type: 'integer', description: 'Antal, 1-100. Standard 25.' },
      },
    },
    run: listGhlInvoices,
    label: 'Henter fakturaer fra GoHighLevel',
  },
  {
    name: 'ghl_list_payments',
    description: 'Betalinger og abonnementer registreret i GoHighLevels betalingsmodul.',
    input_schema: {
      type: 'object',
      properties: {
        contact_id: { type: 'string' },
        limit: { type: 'integer', description: 'Antal, 1-100. Standard 25.' },
      },
    },
    run: listGhlPayments,
    label: 'Henter betalinger fra GoHighLevel',
  },
  {
    name: 'ghl_list_documents',
    description:
      'Kontrakter, tilbud og dokumenter i GoHighLevel, herunder om de er sendt, set eller underskrevet.',
    input_schema: {
      type: 'object',
      properties: {
        contact_id: { type: 'string' },
        status: { type: 'string', description: 'fx sent, viewed, completed, alle.' },
        limit: { type: 'integer', description: 'Antal, 1-100. Standard 25.' },
      },
    },
    run: listDocuments,
    label: 'Henter kontrakter og dokumenter',
  },
]

const writeTools = [
  {
    name: 'ghl_add_note',
    description:
      'Skriver en note på en kontakt i GoHighLevel. Brug denne når brugeren beder om at få noget noteret på en kunde. Skriv noten på dansk og præcist som brugeren mener det.',
    input_schema: {
      type: 'object',
      properties: {
        contact_id: { type: 'string' },
        note: { type: 'string', description: 'Selve teksten der skal stå på kontakten.' },
      },
      required: ['contact_id', 'note'],
    },
    run: addNote,
    label: 'Skriver en note på en kontakt',
    writes: true,
    describe: (i) => [
      ['Kontakt', i.contact_id],
      ['Noten der skrives', i.note],
    ],
  },
  {
    name: 'ghl_create_task',
    description: 'Opretter en opgave på en kontakt i GoHighLevel, fx en opfølgning.',
    input_schema: {
      type: 'object',
      properties: {
        contact_id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        due_date: { type: 'string', description: 'Dato eller tidspunkt, fx 2026-09-10.' },
      },
      required: ['contact_id', 'title'],
    },
    run: createTask,
    label: 'Opretter en opgave på en kontakt',
    writes: true,
    describe: (i) => [
      ['Kontakt', i.contact_id],
      ['Opgave', i.title],
      ['Beskrivelse', i.description],
      ['Forfalder', i.due_date],
    ],
  },
  {
    name: 'ghl_update_contact',
    description:
      'Retter oplysninger på en kontakt: navn, e-mail, telefon eller brugerdefinerede felter. Angivne felter bliver overskrevet, så udfyld kun det der skal ændres. Brug ghl_get_contact først, så du kender de præcise feltnavne. Sletter aldrig en kontakt.',
    input_schema: {
      type: 'object',
      properties: {
        contact_id: { type: 'string' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        fields: {
          type: 'object',
          description:
            'Brugerdefinerede felter som navn/værdi, fx {"Kontraktstart": "2026-09-01"}. Feltnavnet skal findes i forvejen i GoHighLevel.',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['contact_id'],
    },
    run: updateContact,
    label: 'Overskriver felter på en kontakt',
    writes: true,
    describe: (i) => [
      ['Kontakt', i.contact_id],
      ['Fornavn', i.first_name],
      ['Efternavn', i.last_name],
      ['E-mail', i.email],
      ['Telefon', i.phone],
      ...Object.entries(i.fields || {}),
    ],
  },
  {
    name: 'ghl_add_tags',
    description: 'Sætter et eller flere tags på en kontakt.',
    input_schema: {
      type: 'object',
      properties: {
        contact_id: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['contact_id', 'tags'],
    },
    run: addTags,
    label: 'Sætter tags på en kontakt',
    writes: true,
    describe: (i) => [
      ['Kontakt', i.contact_id],
      ['Tags', Array.isArray(i.tags) ? i.tags.join(', ') : i.tags],
    ],
  },
]

export const ghlTools = config.ghlAllowWrites ? [...readTools, ...writeTools] : readTools
