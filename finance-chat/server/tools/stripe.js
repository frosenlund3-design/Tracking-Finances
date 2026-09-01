/**
 * Stripe, kun læsning.
 *
 * Der findes med vilje ikke én eneste funktion herinde der opretter, ændrer,
 * refunderer eller udbetaler noget. Alle kald er `list`, `retrieve` eller
 * `search`. Brug oveni det en begrænset nøgle (rk_...) med read-only
 * rettigheder, så er det umuligt at flytte penge herfra, heller ikke ved en fejl.
 */
import Stripe from 'stripe'
import { config, hasStripe } from '../config.js'
import { money, date, dateTime, toUnix, clamp, compact, truncate } from '../util.js'

let client = null
function stripe() {
  if (!hasStripe()) return null
  if (!client) {
    client = new Stripe(config.stripeSecretKey, {
      maxNetworkRetries: 2,
      timeout: 20000,
      appInfo: { name: 'finance-chat', version: '1.0.0' },
    })
  }
  return client
}

const notConfigured = {
  ok: false,
  fejl: 'Stripe er ikke sat op på serveren (STRIPE_SECRET_KEY mangler).',
}

/** Alle Stripe-kald går igennem her, så en fejl bliver til et pænt svar. */
async function guard(run) {
  const api = stripe()
  if (!api) return notConfigured
  try {
    return await run(api)
  } catch (error) {
    return {
      ok: false,
      fejl: error?.message || 'Ukendt fejl fra Stripe.',
      type: error?.type,
    }
  }
}

/* ------------------------------------------------------------------ former */

const shapeCustomer = (c) =>
  compact({
    id: c.id,
    navn: c.name,
    email: c.email,
    telefon: c.phone,
    oprettet: date(c.created),
    beskrivelse: truncate(c.description, 200),
    // Negativ saldo = tilgodehavende hos os. Positiv = kunden skylder.
    saldo: c.balance ? money(c.balance, c.currency || config.currency) : null,
    valuta: c.currency ? c.currency.toUpperCase() : null,
    metadata: Object.keys(c.metadata || {}).length ? c.metadata : null,
  })

function subscriptionAmount(sub) {
  const item = sub.items?.data?.[0]
  const price = item?.price
  if (!price) return null
  const perUnit = price.unit_amount ?? null
  if (perUnit === null) return null
  const total = perUnit * (item.quantity || 1)
  const every =
    price.recurring
      ? `pr. ${price.recurring.interval_count > 1 ? `${price.recurring.interval_count} ` : ''}${
          { day: 'dag', week: 'uge', month: 'måned', year: 'år' }[price.recurring.interval] ||
          price.recurring.interval
        }`
      : ''
  return `${money(total, price.currency)} ${every}`.trim()
}

const shapeSubscription = (s) =>
  compact({
    id: s.id,
    status: s.status, // active, past_due, canceled, trialing, unpaid, incomplete
    kunde_id: typeof s.customer === 'string' ? s.customer : s.customer?.id,
    beloeb: subscriptionAmount(s),
    produkt: s.items?.data?.[0]?.price?.nickname || s.description,
    startet: date(s.start_date),
    // Feltet flyttede fra abonnementet ned på linjerne i nyere API-versioner.
    naeste_betaling: date(s.current_period_end ?? s.items?.data?.[0]?.current_period_end),
    proeveperiode_slutter: date(s.trial_end),
    stopper_ved_periodeslut: s.cancel_at_period_end || null,
    annulleret: date(s.canceled_at),
  })

const shapeInvoice = (i) =>
  compact({
    id: i.id,
    nummer: i.number,
    status: i.status, // draft, open, paid, uncollectible, void
    kunde_id: typeof i.customer === 'string' ? i.customer : i.customer?.id,
    kunde_navn: i.customer_name,
    kunde_email: i.customer_email,
    ialt: money(i.total, i.currency),
    betalt: money(i.amount_paid, i.currency),
    mangler: money(i.amount_remaining, i.currency),
    oprettet: date(i.created),
    forfalder: date(i.due_date),
    betalt_dato: date(i.status_transitions?.paid_at),
    beskrivelse: truncate(i.description, 200),
    link: i.hosted_invoice_url,
  })

const shapeCharge = (c) =>
  compact({
    id: c.id,
    beloeb: money(c.amount, c.currency),
    refunderet: c.amount_refunded ? money(c.amount_refunded, c.currency) : null,
    status: c.status, // succeeded, pending, failed
    gennemfoert: c.paid || null,
    tidspunkt: dateTime(c.created),
    kunde_id: typeof c.customer === 'string' ? c.customer : c.customer?.id,
    email: c.billing_details?.email || c.receipt_email,
    navn: c.billing_details?.name,
    beskrivelse: truncate(c.description, 200),
    kort: c.payment_method_details?.card
      ? `${c.payment_method_details.card.brand} ••${c.payment_method_details.card.last4}`
      : null,
    fejl: c.failure_message,
    kvittering: c.receipt_url,
  })

/* ------------------------------------------------------------- funktioner */

/** Escaper til Stripes søgesprog, som bruger enkeltcitationstegn. */
const escapeSearch = (text) => String(text).replace(/['\\]/g, '').slice(0, 120)

export async function findCustomers({ query, limit }) {
  return guard(async (api) => {
    const max = clamp(limit, 1, 50, 10)
    const q = String(query || '').trim()
    if (!q) return { ok: false, fejl: 'Skriv et navn, en e-mail eller et kunde-id at søge efter.' }

    if (q.startsWith('cus_')) {
      const customer = await api.customers.retrieve(q)
      return { ok: true, antal: 1, kunder: [shapeCustomer(customer)] }
    }

    if (q.includes('@')) {
      const byEmail = await api.customers.list({ email: q, limit: max })
      if (byEmail.data.length) {
        return { ok: true, antal: byEmail.data.length, kunder: byEmail.data.map(shapeCustomer) }
      }
    }

    const safe = escapeSearch(q)
    const found = await api.customers.search({
      query: `name~'${safe}' OR email~'${safe}'`,
      limit: max,
    })
    return {
      ok: true,
      antal: found.data.length,
      kunder: found.data.map(shapeCustomer),
      bemaerkning: found.data.length ? undefined : 'Ingen kunder i Stripe matchede søgningen.',
    }
  })
}

export async function customerOverview({ customer_id }) {
  return guard(async (api) => {
    const id = String(customer_id || '').trim()
    if (!id.startsWith('cus_')) {
      return { ok: false, fejl: 'customer_id skal være et Stripe-id der starter med cus_.' }
    }

    const [customer, subs, invoices, charges] = await Promise.all([
      api.customers.retrieve(id),
      api.subscriptions.list({ customer: id, status: 'all', limit: 10 }),
      api.invoices.list({ customer: id, limit: 12 }),
      api.charges.list({ customer: id, limit: 12 }),
    ])

    if (customer.deleted) {
      return { ok: true, kunde: { id, slettet: true }, bemaerkning: 'Kunden er slettet i Stripe.' }
    }

    const open = invoices.data.filter((i) => i.status === 'open')
    const udestaaende = open.reduce((sum, i) => sum + (i.amount_remaining || 0), 0)
    const now = Math.floor(Date.now() / 1000)

    return {
      ok: true,
      kunde: shapeCustomer(customer),
      abonnementer: subs.data.map(shapeSubscription),
      fakturaer: invoices.data.map(shapeInvoice),
      betalinger: charges.data.map(shapeCharge),
      opsummering: compact({
        aktive_abonnementer: subs.data.filter((s) => ['active', 'trialing'].includes(s.status))
          .length,
        abonnementer_i_restance: subs.data.filter((s) =>
          ['past_due', 'unpaid'].includes(s.status),
        ).length,
        ubetalte_fakturaer: open.length,
        udestaaende_beloeb: open.length ? money(udestaaende, customer.currency || config.currency) : null,
        forfaldne_fakturaer: open.filter((i) => i.due_date && i.due_date < now).length,
      }),
    }
  })
}

export async function listInvoices({ status, customer_id, created_after, created_before, limit }) {
  return guard(async (api) => {
    const params = { limit: clamp(limit, 1, 100, 25) }
    if (status && status !== 'alle') params.status = status
    if (customer_id) params.customer = customer_id
    const gte = toUnix(created_after)
    const lte = toUnix(created_before)
    if (gte || lte) params.created = compact({ gte, lte })

    const result = await api.invoices.list(params)
    return { ok: true, antal: result.data.length, fakturaer: result.data.map(shapeInvoice) }
  })
}

/** Hvem mangler at betale? Åbne fakturaer, delt op i forfaldne og kommende. */
export async function unpaidInvoices({ limit }) {
  return guard(async (api) => {
    const max = clamp(limit, 1, 100, 50)
    const [open, uncollectible] = await Promise.all([
      api.invoices.list({ status: 'open', limit: max }),
      api.invoices.list({ status: 'uncollectible', limit: 20 }),
    ])

    const now = Math.floor(Date.now() / 1000)
    const shaped = open.data.map((i) => ({
      ...shapeInvoice(i),
      dage_over_forfald: i.due_date && i.due_date < now
        ? Math.floor((now - i.due_date) / 86400)
        : null,
    }))

    const total = open.data.reduce((sum, i) => sum + (i.amount_remaining || 0), 0)
    const currency = open.data[0]?.currency || config.currency

    return {
      ok: true,
      forfaldne: shaped.filter((i) => i.dage_over_forfald !== null && i.dage_over_forfald !== undefined),
      aabne_ikke_forfaldne: shaped.filter((i) => i.dage_over_forfald === undefined || i.dage_over_forfald === null),
      afskrevne: uncollectible.data.map(shapeInvoice),
      samlet_udestaaende: money(total, currency),
      bemaerkning:
        open.data.length >= max
          ? `Der er mindst ${max} åbne fakturaer, så listen kan være afkortet.`
          : undefined,
    }
  })
}

export async function listPayments({ status, customer_id, created_after, created_before, limit }) {
  return guard(async (api) => {
    const max = clamp(limit, 1, 100, 25)
    const params = { limit: max }
    if (customer_id) params.customer = customer_id
    const gte = toUnix(created_after)
    const lte = toUnix(created_before)
    if (gte || lte) params.created = compact({ gte, lte })

    const result = await api.charges.list(params)
    let rows = result.data.map(shapeCharge)
    if (status && status !== 'alle') rows = rows.filter((r) => r.status === status)

    return { ok: true, antal: rows.length, betalinger: rows }
  })
}

export async function listSubscriptions({ status, limit }) {
  return guard(async (api) => {
    const result = await api.subscriptions.list({
      status: status && status !== 'alle' ? status : 'all',
      limit: clamp(limit, 1, 100, 25),
    })
    return {
      ok: true,
      antal: result.data.length,
      abonnementer: result.data.map(shapeSubscription),
    }
  })
}

export async function balanceAndPayouts() {
  return guard(async (api) => {
    const [balance, payouts] = await Promise.all([
      api.balance.retrieve(),
      api.payouts.list({ limit: 10 }),
    ])
    return {
      ok: true,
      til_raadighed: balance.available.map((b) => money(b.amount, b.currency)),
      undervejs: balance.pending.map((b) => money(b.amount, b.currency)),
      seneste_udbetalinger: payouts.data.map((p) =>
        compact({
          id: p.id,
          beloeb: money(p.amount, p.currency),
          status: p.status,
          forventet_i_banken: date(p.arrival_date),
          oprettet: date(p.created),
          beskrivelse: p.description,
        }),
      ),
    }
  })
}

/** Omsætning i en periode. Går igennem betalingerne side for side. */
export async function revenueSummary({ from, to }) {
  return guard(async (api) => {
    const gte = toUnix(from) ?? Math.floor(Date.now() / 1000) - 30 * 86400
    const lte = toUnix(to)

    const perCurrency = new Map()
    const perMonth = new Map()
    let counted = 0
    let failed = 0
    const CAP = 1000

    for await (const charge of api.charges.list({
      created: compact({ gte, lte }),
      limit: 100,
    })) {
      if (counted >= CAP) break
      counted += 1
      if (charge.status !== 'succeeded') {
        if (charge.status === 'failed') failed += 1
        continue
      }
      const net = (charge.amount || 0) - (charge.amount_refunded || 0)
      const cur = charge.currency
      perCurrency.set(cur, (perCurrency.get(cur) || 0) + net)
      const month = new Date(charge.created * 1000).toISOString().slice(0, 7)
      const key = `${month}|${cur}`
      perMonth.set(key, (perMonth.get(key) || 0) + net)
    }

    return {
      ok: true,
      periode: { fra: date(gte), til: lte ? date(lte) : 'i dag' },
      antal_betalinger: counted,
      mislykkede_betalinger: failed,
      omsaetning: [...perCurrency].map(([cur, amount]) => money(amount, cur)),
      pr_maaned: [...perMonth]
        .sort()
        .map(([key, amount]) => {
          const [month, cur] = key.split('|')
          return { maaned: month, beloeb: money(amount, cur) }
        }),
      bemaerkning:
        counted >= CAP
          ? `Kun de første ${CAP} betalinger er talt med. Vælg en kortere periode for et præcist tal.`
          : undefined,
    }
  })
}

/* ------------------------------------------------------------------ tools */

export const stripeTools = [
  {
    name: 'stripe_find_customers',
    description:
      'Find kunder i Stripe ud fra navn, e-mail eller kunde-id (cus_...). Brug denne først, når brugeren nævner en kunde ved navn.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Navn, e-mail eller cus_-id.' },
        limit: { type: 'integer', description: 'Antal resultater, 1-50. Standard 10.' },
      },
      required: ['query'],
    },
    run: findCustomers,
    label: 'Søger efter kunden i Stripe',
  },
  {
    name: 'stripe_customer_overview',
    description:
      'Alt om én Stripe-kunde: stamdata, abonnementer, fakturaer, betalinger og hvad der eventuelt mangler at blive betalt.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'Stripe kunde-id (cus_...).' },
      },
      required: ['customer_id'],
    },
    run: customerOverview,
    label: 'Henter kundens Stripe-overblik',
  },
  {
    name: 'stripe_unpaid_invoices',
    description:
      'Alle ubetalte fakturaer i Stripe, delt op i forfaldne og endnu ikke forfaldne, plus det samlede udestående. Brug denne til "hvem mangler at betale".',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Antal fakturaer, 1-100. Standard 50.' },
      },
    },
    run: unpaidInvoices,
    label: 'Finder ubetalte fakturaer',
  },
  {
    name: 'stripe_list_invoices',
    description:
      'Fakturaer i Stripe, eventuelt filtreret på status, kunde eller periode.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['draft', 'open', 'paid', 'uncollectible', 'void', 'alle'],
          description: 'Fakturastatus. "open" = ubetalt, "paid" = betalt.',
        },
        customer_id: { type: 'string', description: 'Begræns til én kunde (cus_...).' },
        created_after: { type: 'string', description: 'Dato, fx 2026-01-01.' },
        created_before: { type: 'string', description: 'Dato, fx 2026-06-30.' },
        limit: { type: 'integer', description: 'Antal, 1-100. Standard 25.' },
      },
    },
    run: listInvoices,
    label: 'Henter fakturaer fra Stripe',
  },
  {
    name: 'stripe_list_payments',
    description:
      'Betalinger i Stripe (gennemførte, afviste og afventende), eventuelt for én kunde eller én periode.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['succeeded', 'failed', 'pending', 'alle'],
          description: 'Standard: alle.',
        },
        customer_id: { type: 'string' },
        created_after: { type: 'string', description: 'Dato, fx 2026-01-01.' },
        created_before: { type: 'string' },
        limit: { type: 'integer', description: 'Antal, 1-100. Standard 25.' },
      },
    },
    run: listPayments,
    label: 'Henter betalinger fra Stripe',
  },
  {
    name: 'stripe_list_subscriptions',
    description:
      'Abonnementer i Stripe. Brug status "past_due" eller "unpaid" til at finde dem der er bagud med betalingen.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['active', 'past_due', 'unpaid', 'canceled', 'trialing', 'incomplete', 'alle'],
        },
        limit: { type: 'integer', description: 'Antal, 1-100. Standard 25.' },
      },
    },
    run: listSubscriptions,
    label: 'Henter abonnementer fra Stripe',
  },
  {
    name: 'stripe_balance',
    description: 'Saldo i Stripe og de seneste udbetalinger til bankkontoen.',
    input_schema: { type: 'object', properties: {} },
    run: balanceAndPayouts,
    label: 'Henter saldo og udbetalinger',
  },
  {
    name: 'stripe_revenue',
    description:
      'Omsætning i en periode, fordelt pr. måned. Trækker refunderinger fra. Standard er de sidste 30 dage.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Startdato, fx 2026-01-01.' },
        to: { type: 'string', description: 'Slutdato. Udelad for "til i dag".' },
      },
    },
    run: revenueSummary,
    label: 'Regner omsætningen sammen',
  },
]
