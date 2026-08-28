/**
 * A small Danish sentence reader.
 *
 * The previous version matched substrings anywhere in the text and took the
 * first hit, which is how "Køb vaskemiddel" ended up with laundry steps and
 * "Aflever pakken på posthuset" ended up being told to record a video: "vask"
 * is inside "vaskemiddel", and "post" is inside "posthuset".
 *
 * So this reads the sentence instead. It finds the verb, the thing the verb
 * acts on, and where it happens — and everything downstream keys off *those*
 * rather than off any word that happens to appear.
 */

export interface Analysis {
  /** Canonical verb, e.g. 'ring', 'køb', 'aflever'. Null when there isn't one. */
  verb: string | null
  /** What the verb acts on, as written: "vaskemiddel", "pakken". */
  object: string
  /** The object with its definite ending removed: "pakken" -> "pakke". */
  objectStem: string
  /** Where or to whom: "posthuset", "banken". */
  target: string | null
  /** The preposition that introduced the target. */
  targetPreposition: string | null
  /** The particle that belongs to the verb, e.g. the "op" in "ryd op". */
  particle: string | null
  /** Whatever is left, for domain matching. */
  rest: string
}

/** Infinitive / perfect / inflected forms mapped to one canonical stem. */
const VERB_FORMS: Record<string, string[]> = {
  ring: ['ring', 'ringe', 'ringer', 'ringet', 'ringede'],
  kontakt: ['kontakt', 'kontakte', 'kontakter', 'kontaktet'],
  køb: ['køb', 'købe', 'køber', 'købt', 'handle', 'handl'],
  skriv: ['skriv', 'skrive', 'skriver', 'skrevet'],
  send: ['send', 'sende', 'sender', 'sendt'],
  svar: ['svar', 'svare', 'svarer', 'svaret', 'besvar', 'besvare'],
  betal: ['betal', 'betale', 'betaler', 'betalt'],
  book: ['book', 'booke', 'booker', 'booket', 'bestil', 'bestille', 'bestilt', 'reserver', 'reservere'],
  aflever: ['aflever', 'aflevere', 'afleverer', 'afleveret', 'indlever', 'indlevere'],
  hent: ['hent', 'hente', 'henter', 'hentet', 'afhent', 'afhente'],
  vask: ['vask', 'vaske', 'vasker', 'vasket'],
  tøm: ['tøm', 'tømme', 'tømmer', 'tømt'],
  fyld: ['fyld', 'fylde', 'fylder', 'fyldt'],
  ryd: ['ryd', 'rydde', 'rydder', 'ryddet'],
  rengør: ['rengør', 'rengøre', 'gør rent', 'gøre rent'],
  støvsug: ['støvsug', 'støvsuge', 'støvsuger', 'støvsuget'],
  find: ['find', 'finde', 'finder', 'fundet'],
  ordn: ['ordn', 'ordne', 'ordner', 'ordnet'],
  lav: ['lav', 'lave', 'laver', 'lavet'],
  planlæg: ['planlæg', 'planlægge', 'planlægger', 'planlagt'],
  print: ['print', 'printe', 'printer', 'printet', 'udskriv', 'udskrive'],
  udfyld: ['udfyld', 'udfylde', 'udfylder', 'udfyldt'],
  ansøg: ['ansøg', 'ansøge', 'ansøger', 'ansøgt'],
  opsig: ['opsig', 'opsige', 'opsiger', 'opsagt'],
  skift: ['skift', 'skifte', 'skifter', 'skiftet', 'udskift', 'udskifte'],
  flyt: ['flyt', 'flytte', 'flytter', 'flyttet'],
  pak: ['pak', 'pakke', 'pakker', 'pakket'],
  post: ['post', 'poste', 'poster', 'postet', 'upload', 'uploade'],
  optag: ['optag', 'optage', 'optager', 'optaget', 'film', 'filme', 'filmer'],
  rediger: ['rediger', 'redigere', 'redigerer', 'redigeret', 'klip', 'klippe'],
  træn: ['træn', 'træne', 'træner', 'trænet'],
  læs: ['læs', 'læse', 'læser', 'læst'],
  tjek: ['tjek', 'tjekke', 'tjekker', 'tjekket', 'undersøg', 'undersøge', 'undersøgt'],
  beslut: ['beslut', 'beslutte', 'beslutter', 'besluttet', 'vælg', 'vælge', 'valgt'],
  spørg: ['spørg', 'spørge', 'spørger', 'spurgt'],
  mal: ['mal', 'male', 'maler', 'malet'],
  reparer: ['reparer', 'reparere', 'reparerer', 'repareret', 'fiks', 'fikse'],
  sorter: ['sorter', 'sortere', 'sorterer', 'sorteret'],
  hæng: ['hæng', 'hænge', 'hænger', 'hængt'],
  få: ['få', 'får', 'fået'],
  gå: ['gå', 'går', 'gået'],
  tag: ['tag', 'tage', 'tager', 'taget'],
  åbn: ['åbn', 'åbne', 'åbner', 'åbnet'],
  luk: ['luk', 'lukke', 'lukker', 'lukket'],
  meld: ['meld', 'melde', 'melder', 'meldt', 'tilmeld', 'tilmelde'],
}

const FORM_TO_VERB = new Map<string, string>()
for (const [canonical, forms] of Object.entries(VERB_FORMS)) {
  for (const form of forms) FORM_TO_VERB.set(form, canonical)
}

/** Imperative surface form for each canonical verb. */
export const IMPERATIVE: Record<string, string> = {
  ring: 'Ring', kontakt: 'Kontakt', køb: 'Køb', skriv: 'Skriv', send: 'Send', svar: 'Svar',
  betal: 'Betal', book: 'Book', aflever: 'Aflever', hent: 'Hent', vask: 'Vask', tøm: 'Tøm',
  fyld: 'Fyld', ryd: 'Ryd', rengør: 'Rengør', støvsug: 'Støvsug', find: 'Find', ordn: 'Ordn',
  lav: 'Lav', planlæg: 'Planlæg', print: 'Print', udfyld: 'Udfyld', ansøg: 'Ansøg',
  opsig: 'Opsig', skift: 'Skift', flyt: 'Flyt', pak: 'Pak', post: 'Post', optag: 'Optag',
  rediger: 'Rediger', træn: 'Træn', læs: 'Læs', tjek: 'Tjek', beslut: 'Beslut', spørg: 'Spørg',
  mal: 'Mal', reparer: 'Reparér', sorter: 'Sortér', hæng: 'Hæng', få: 'Få', gå: 'Gå',
  tag: 'Tag', åbn: 'Åbn', luk: 'Luk', meld: 'Meld',
}

/** Multi-word verbs, checked before single words. */
const PHRASE_VERBS: Array<[RegExp, string]> = [
  [/^find\s+ud\s+af\b/i, 'find-ud-af'],
  [/^g[øo]re?\s+rent\b/i, 'rengør'],
  // NB: (?=\s|$) rather than \b. JavaScript's \b is ASCII-only, so "å" counts
  // as a non-word character — /p[åa]\b/ never matches "på" followed by a space,
  // and "Få styr på min pension" was silently read as the verb "få" with the
  // object "styr". Every Danish-final pattern in this file needs the lookahead.
  [/^(?:f[åa]|have|har|havde|f[åa]r|f[åa]et)\s+styr\s+p[åa](?=\s|$)/i, 'få-styr-på'],
  [/^s[æa]tte?\s+over\b/i, 'vask'],
  [/^tage?\s+stilling\s+til\b/i, 'beslut'],
  [/^melde?\s+(?:sig\s+)?til\b/i, 'meld'],
]

IMPERATIVE['find-ud-af'] = 'Find ud af'
IMPERATIVE['få-styr-på'] = 'Få styr på'

const PREPOSITIONS = ['til', 'på', 'hos', 'i', 'med', 'om', 'for', 'fra', 'ved', 'af']

/**
 * Verb particles. Danish glues these onto verbs — "rydde op", "vaske op",
 * "skrive under", "printe ud", "melde fra" — and to a naive parser they sit in
 * exactly the slot where the object should be. That is how "Ryd op i garagen"
 * produced the step "Gå ind til op".
 *
 * Only the unambiguous ones are listed. "af", "på", "til", "med" and "fra" are
 * particles in some constructions ("tør af", "tag med") but prepositions far
 * more often — stripping "til" out of "ring til banken" would eat the bank. A
 * missed particle costs nothing; a swallowed object costs the whole task.
 */
const PARTICLES = new Set([
  'op', 'ud', 'ind', 'ned', 'sammen', 'væk', 'hjem', 'tilbage', 'rundt', 'igennem', 'forbi',
])

/** Words that are not part of the object. */
const STOP_AFTER_VERB = /^(?:en|et|den|det|de|mit|min|mine|sin|sit|noget|nogle|lidt|alt|hele)\b\s*/i

/**
 * Danish definite endings. Removing them lets "pakken", "pakke" and "pakker"
 * all match the same domain knowledge.
 */
export function stem(word: string): string {
  const w = word.toLowerCase()
  for (const suffix of ['erne', 'ерne', 'ene', 'en', 'et', 'er', 'e', 'n', 't']) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) return w.slice(0, -suffix.length)
  }
  return w
}

export function analyse(text: string): Analysis {
  const clean = text.trim().replace(/\s+/g, ' ')
  const lower = clean.toLowerCase()

  let verb: string | null = null
  let remainder = clean

  for (const [re, canonical] of PHRASE_VERBS) {
    const m = lower.match(re)
    if (m) {
      verb = canonical
      remainder = clean.slice(m[0].length).trim()
      break
    }
  }

  if (!verb) {
    const parts = clean.split(' ')
    const word = (i: number) => (parts[i] ?? '').toLowerCase().replace(/[^a-zæøå]/g, '')

    // The perfect construction: "have booket en tid", "få skiftet dæk". The
    // auxiliary carries no meaning, and reading it as the verb is how
    // "Skal have booket en tid" stayed "Have booket en tid" instead of
    // becoming the instruction "Book en tid".
    const auxiliary = ['have', 'har', 'havde', 'få', 'får', 'fået', 'blive', 'bliver', 'blevet']
    if (auxiliary.includes(word(0)) && FORM_TO_VERB.has(word(1))) {
      verb = FORM_TO_VERB.get(word(1)) as string
      remainder = parts.slice(2).join(' ')
    } else {
      const canonical = FORM_TO_VERB.get(word(0))
      if (canonical) {
        verb = canonical
        remainder = parts.slice(1).join(' ')
      }
    }
  }

  // `rest` keeps her own wording — determiner, particle and all. It is what
  // gets shown back to her, so "køb ind" must not become "køb".
  const rest = remainder.trim()

  // A particle is never the object, so removing one that sits directly after a
  // recognised verb is always safe.
  let particle: string | null = null
  if (verb) {
    const first = remainder.split(' ')[0]?.toLowerCase().replace(/[^a-zæøå]/g, '') ?? ''
    if (PARTICLES.has(first)) {
      particle = first
      remainder = remainder.split(' ').slice(1).join(' ')
    }
  }

  // Only the object is normalised, because that is what the domain rules match
  // on — the determiner would stop "mit rod" from matching "rod".
  remainder = remainder.replace(STOP_AFTER_VERB, '').trim()

  // Split off the first prepositional phrase — that is the target.
  let object = remainder
  let target: string | null = null
  let targetPreposition: string | null = null
  const words = remainder.split(' ')
  for (let i = 0; i < words.length; i++) {
    if (PREPOSITIONS.includes(words[i].toLowerCase())) {
      object = words.slice(0, i).join(' ').trim()
      targetPreposition = words[i].toLowerCase()
      // Stop at the next preposition: in "ring til banken om mit lån" the
      // target is the bank, not "banken om mit lån".
      const tail = words.slice(i + 1)
      const nextPrep = tail.findIndex((w) => PREPOSITIONS.includes(w.toLowerCase()))
      target = (nextPrep === -1 ? tail : tail.slice(0, nextPrep))
        .join(' ')
        .replace(STOP_AFTER_VERB, '')
        .trim()
      break
    }
  }

  // Danish also puts the particle *after* the object: "print billetterne ud",
  // "smid posen ud", "hæng tøjet op". Left in place it became the step "Find
  // billetterne ud frem".
  {
    const ow = object.split(' ').filter(Boolean)
    const last = ow[ow.length - 1]?.toLowerCase().replace(/[^a-zæøå]/g, '') ?? ''
    if (ow.length > 1 && PARTICLES.has(last)) {
      particle = particle ?? last
      object = ow.slice(0, -1).join(' ')
    }
  }

  // "Ryd op i garagen": nothing sits between the particle and the preposition,
  // so the garage is what she is tidying — not somewhere she goes to tidy
  // something else.
  if (particle && !object && target) {
    object = target
    target = null
    targetPreposition = null
  }

  return {
    verb,
    object,
    objectStem: stem(object.split(' ')[0] ?? ''),
    target: target || null,
    targetPreposition,
    particle,
    rest,
  }
}

/** Turns any form of a sentence into a clean imperative instruction. */
export function toImperativeSentence(text: string): string {
  const a = analyse(text)
  if (!a.verb) {
    const t = text.trim()
    return t.charAt(0).toUpperCase() + t.slice(1)
  }
  const head = IMPERATIVE[a.verb] ?? a.verb
  return `${head} ${a.rest}`.replace(/\s+/g, ' ').trim()
}

/** True when the text names an action, in any Danish verb form. */
export function hasAction(text: string): boolean {
  const a = analyse(text)
  if (a.verb) return true
  // A verb can also sit later in the sentence: "en tid skal bookes".
  return text
    .toLowerCase()
    .split(/\s+/)
    .some((w) => FORM_TO_VERB.has(w.replace(/[^a-zæøå]/g, '')))
}

/**
 * Wording that says a thing is broken rather than that something must be done
 * to it. Lives here rather than next to the brain-dump rules because both the
 * classifier and the step generator need it, and they must agree.
 */
export const BROKEN =
  /\b(larmer|st[øo]jer|brummer|virker\s+ikke|er\s+i\s+stykker|g[åa]et\s+i\s+stykker|l[æa]kker|drypper|siver|fejler|starter\s+ikke|t[æa]nder\s+ikke|lukker\s+ikke|kan\s+ikke\s+lukke|h[æa]nger\s+fast|sidder\s+fast|er\s+stoppet|stopper\s+til|l[øo]ber\s+ud)\b/i
