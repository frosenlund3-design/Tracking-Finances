/**
 * Vaner.
 *
 * Two different jobs live here, and they are the same job seen from two sides.
 *
 * The first is reading a routine out of ordinary spoken Danish. She dictated
 * this, in one breath, with no punctuation:
 *
 *   "jeg har nogle vaner til hverdag men for eksempel sådan at jeg tørrer
 *    køkkenbordet af hver dag jeg putter mit pant i pant posen jeg tømmer mine
 *    skraldepose både mad skraldespanden og restaffald ... og så vil jeg også
 *    godt have ... vaske gulv hver tredjedagen ... og så skal det faktisk også
 *    være en del af en vane at pille altså sertralin jeg tager 50 mg"
 *
 * and the coach replied with bookkeeping about a completely unrelated task,
 * because something downstream saw the words "hver dag" in the middle of it and
 * acted on that fragment. That is the failure this module is here to stop.
 *
 * The second job is spotting that something already in the tree is a habit and
 * not a one-off. "Tøm opvaskemaskinen" as a task you tick once is a lie: it
 * comes back tonight. As a one-off it also rots at the top of the list forever
 * and makes the whole list feel untrustworthy.
 *
 * ── Why a lexicon rather than a parser ─────────────────────────────────────
 *
 * Dictated Danish of this kind cannot be parsed into clean sentences, and
 * pretending otherwise is how you get a task called "Eller bruge håndklæde
 * faktisk)". But everyday routines are a small, closed, real vocabulary: the
 * bins, the dishwasher, the floor, the pills. Recognising the ones that are
 * genuinely known and staying quiet about the rest is honest, and it is what
 * actually works on a transcript that has "en maling" in it where she said
 * something else entirely.
 *
 * ── Why already-doing and wanted are kept apart ────────────────────────────
 *
 * They need opposite treatment, and mixing them is the classic habit-tracker
 * mistake. Something she already does every day must never become a row on a
 * list she can fail to tick; it is not a task, it is furniture. What it IS
 * good for is the thing an ADHD brain has almost none of: a fixed point in the
 * day that arrives without a decision. That is the anchor a new habit gets
 * attached to. So the ones she already does become cues, and only the ones she
 * said she wants become loops.
 */

import type { LifeArea, LoopNode } from '@/db/types'

/* ------------------------------------------------------------------ *
 * Cadence
 * ------------------------------------------------------------------ */

export interface Cadence {
  unit: 'day' | 'week' | 'month'
  /** Every n-th. 3 with unit 'day' is "hver tredje dag". */
  every: number
}

export const DAILY: Cadence = { unit: 'day', every: 1 }

const ORDINALS: Record<string, number> = {
  anden: 2,
  andet: 2,
  tredje: 3,
  fjerde: 4,
  femte: 5,
  sjette: 6,
  syvende: 7,
  ottende: 8,
  tiende: 10,
  fjortende: 14,
}

/**
 * The cadence stated in a piece of text, if any.
 *
 * Note the endings. "hver tredjedagen" is what the dictation produced, and it
 * is also just how people say it, so the day/week/month stems have to tolerate
 * a definite ending rather than sitting behind a word boundary. A `\b` after
 * "dag" falls between two word characters in "dagen" and matches nothing.
 */
export function cadenceIn(text: string): Cadence | null {
  const t = text.toLowerCase()

  const ordinal = t.match(
    /\bhver\s+(anden|andet|tredje|fjerde|femte|sjette|syvende|ottende|tiende|fjortende)\s*(dag|uge|m[åa]ned)/,
  )
  if (ordinal) {
    return { unit: unitOf(ordinal[2]), every: ORDINALS[ordinal[1]] ?? 2 }
  }

  const numeric = t.match(/\bhver\s+(\d{1,2})\.?\s*(dag|uge|m[åa]ned)/)
  if (numeric) return { unit: unitOf(numeric[2]), every: Math.max(1, Number(numeric[1])) }

  const perN = t.match(/\b(\d{1,2})\s*gange?\s+om\s+(dagen|ugen|m[åa]neden)/)
  if (perN) return { unit: unitOf(perN[2]), every: 1 }

  if (/\bhver\s*(dag|morgen|aften|nat)|dagligt|hverdag(?:en|e)?\b|hver eneste dag/.test(t)) return DAILY
  if (/\bhver\s*uge|ugentligt|en gang om ugen|hver\s+(?:mandag|tirsdag|onsdag|torsdag|fredag|l[øo]rdag|s[øo]ndag)/.test(t))
    return { unit: 'week', every: 1 }
  if (/\bhver\s*m[åa]ned|m[åa]nedligt|en gang om m[åa]neden/.test(t)) return { unit: 'month', every: 1 }

  return null
}

function unitOf(word: string): Cadence['unit'] {
  if (/dag/.test(word)) return 'day'
  if (/uge/.test(word)) return 'week'
  return 'month'
}

export function cadenceLabel(c: Cadence): string {
  const noun = c.unit === 'day' ? 'dag' : c.unit === 'week' ? 'uge' : 'måned'
  if (c.every === 1) return c.unit === 'day' ? 'hver dag' : `hver ${noun}`
  const ord = Object.entries(ORDINALS).find(([, n]) => n === c.every)?.[0]
  return ord ? `hver ${ord} ${noun}` : `hver ${c.every}. ${noun}`
}

/* ------------------------------------------------------------------ *
 * The lexicon
 * ------------------------------------------------------------------ */

interface Routine {
  key: string
  match: RegExp
  /** Imperative, ready to be a loop title. */
  title: string
  natural: Cadence
  area: LifeArea
  minutes: number
  /**
   * Whether this is a good thing to hang something else on.
   *
   * It has to be something that happens at a fixed point and finishes, so she
   * meets it and then has a free moment. Emptying the dishwasher qualifies.
   * "Vasketøj" does not: it is spread over a day and has no single moment.
   */
  anchor?: boolean
}

/**
 * Everyday routines, in the words people use for them.
 *
 * Deliberately finite. Anything not in here is not claimed to be understood,
 * which is the whole point: a routine the app half-recognised and half-invented
 * is worse than one it did not mention.
 */
const ROUTINES: Routine[] = [
  {
    key: 'medicine',
    match: /\b(medicin|pill(?:e|er|erne)|tabletter?|sertralin|ritalin|elvanse|concerta|metylfenidat|methylphenidat|lamotrigin|citalopram|fluoxetin|melatonin|vitamin(?:er|pille)?|d-?vitamin)\b/i,
    title: 'Tag medicin',
    natural: DAILY,
    area: 'health',
    minutes: 1,
    anchor: true,
  },
  {
    key: 'counter',
    match: /\b(k[øo]kkenbord(?:et)?|bordet)\b[^.]{0,20}\b(af|reng[øo]r|t[øo]r)|(?:t[øo]r|aft[øo]r)[a-zæøå]*\s+(?:mit |mine |min |det |den )?(?:k[øo]kkenbord|bord)/i,
    title: 'Tør køkkenbordet af',
    natural: DAILY,
    area: 'home',
    minutes: 3,
    anchor: true,
  },
  {
    key: 'deposit',
    match: /\bpant(?:en|flasker|pose|posen)?\b/i,
    title: 'Sæt pant i pantposen',
    natural: DAILY,
    area: 'home',
    minutes: 2,
  },
  {
    key: 'deposit-return',
    match: /\b(aflever[a-zæøå]*|indl[øo]s[a-zæøå]*)\s+(?:min |mit |mine )?pant/i,
    title: 'Aflever pant',
    natural: { unit: 'week', every: 1 },
    area: 'home',
    minutes: 20,
  },
  {
    key: 'food-waste',
    match: /\bmad\s?(?:affald(?:et)?|skrald(?:et)?|skraldespand(?:en)?|pose[rn]?)\b/i,
    title: 'Tøm madaffaldet',
    natural: DAILY,
    area: 'home',
    minutes: 3,
    anchor: true,
  },
  {
    key: 'residual-waste',
    match: /\b(restaffald(?:et)?|restskrald)\b/i,
    title: 'Tøm restaffaldet',
    natural: { unit: 'week', every: 1 },
    area: 'home',
    minutes: 3,
  },
  {
    key: 'bin',
    match: /\b(skraldespand(?:en|e)?|skraldepose(?:r|rne|n)?|skraldet|skrald(?:et)? ud|affaldsposen)\b/i,
    title: 'Tøm skraldespanden',
    natural: DAILY,
    area: 'home',
    minutes: 4,
    anchor: true,
  },
  {
    key: 'vacuum',
    match: /\b(st[øo]vsug[a-zæøå]*|st[øo]vsuger(?:en)?)\b/i,
    title: 'Støvsug',
    natural: { unit: 'week', every: 1 },
    area: 'home',
    minutes: 20,
  },
  {
    key: 'floor',
    match: /\b(vask[a-zæøå]*\s+gulv|gulvvask|gulv(?:et|e)?\s*(?:vask|moppe)|mopp[a-zæøå]*|sv[au]bre)/i,
    title: 'Vask gulv',
    natural: { unit: 'week', every: 1 },
    area: 'home',
    minutes: 25,
  },
  {
    key: 'dishwasher-empty',
    match: /\bt[øo]mm?e?[a-zæøå]*\s+(?:og fylde\s+)?(?:min |mine |den )?opvaskemaskine(?:n)?|opvaskemaskine(?:n)?[^.]{0,25}\bt[øo]m/i,
    title: 'Tøm opvaskemaskinen',
    natural: DAILY,
    area: 'home',
    minutes: 5,
    anchor: true,
  },
  {
    key: 'dishwasher-fill',
    match: /\b(fyld[a-zæøå]*\s+(?:og t[øo]mme\s+)?(?:min |mine |den )?opvaskemaskine(?:n)?|s[æa]tt?e?\s+opvask(?:en)? over)/i,
    title: 'Fyld opvaskemaskinen',
    natural: DAILY,
    area: 'home',
    minutes: 5,
  },
  {
    key: 'dishwasher',
    match: /\bopvaskemaskine(?:n)?\b/i,
    title: 'Tøm og fyld opvaskemaskinen',
    natural: DAILY,
    area: 'home',
    minutes: 8,
    anchor: true,
  },
  {
    key: 'dishes',
    match: /\b(vask[a-zæøå]*\s+op|opvask(?:en)?|tage opvasken)\b/i,
    title: 'Vask op',
    natural: DAILY,
    area: 'home',
    minutes: 10,
    anchor: true,
  },
  {
    key: 'laundry',
    match: /\b(vaskemaskine(?:n)?|vaskt[øo]j(?:et)?|t[øo]jvask|vaske t[øo]j)\b/i,
    title: 'Sæt en maskine over',
    natural: { unit: 'week', every: 1 },
    area: 'home',
    minutes: 10,
  },
  {
    key: 'fold',
    match: /\b(l[æa]gge? t[øo]j (?:sammen|p[åa] plads)|t[øo]j sammen|h[æa]nge? t[øo]j op)\b/i,
    title: 'Læg tøjet sammen',
    natural: { unit: 'week', every: 1 },
    area: 'home',
    minutes: 15,
  },
  {
    key: 'bed',
    match: /\b(red[e]?\s+(?:min |sengen|seng)|sengen redt)\b/i,
    title: 'Red sengen',
    natural: DAILY,
    area: 'home',
    minutes: 2,
    anchor: true,
  },
  {
    key: 'bedlinen',
    match: /\b(skift[a-zæøå]*\s+senget[øo]j|sengelinned|rent sengt?[øo]j)\b/i,
    title: 'Skift sengetøj',
    natural: { unit: 'month', every: 1 },
    area: 'home',
    minutes: 15,
  },
  {
    key: 'bathroom',
    match: /\b(reng[øo]r[a-zæøå]*\s+(?:bade)?v[æa]relset|badev[æa]relset|toilettet|bruseren|g[øo]re? bad(?:et)? rent)\b/i,
    title: 'Gør badeværelset rent',
    natural: { unit: 'week', every: 1 },
    area: 'home',
    minutes: 25,
  },
  {
    key: 'tidy',
    match: /\b(rydd?e?\s+op|oprydning|f[åa] ryddet)\b/i,
    title: 'Ryd op i ti minutter',
    natural: DAILY,
    area: 'home',
    minutes: 10,
  },
  {
    key: 'cook',
    match: /\b(lav[a-zæøå]*\s+mad|madlavning|lave aftensmad)\b/i,
    title: 'Lav mad',
    natural: DAILY,
    area: 'home',
    minutes: 30,
  },
  {
    key: 'air',
    match: /\b(luft[a-zæøå]*\s+ud|udluftning)\b/i,
    title: 'Luft ud',
    natural: DAILY,
    area: 'home',
    minutes: 5,
  },
  {
    key: 'plants',
    match: /\b(vand[a-zæøå]*\s+(?:mine )?(?:blomster|planter))\b/i,
    title: 'Vand planterne',
    natural: { unit: 'week', every: 1 },
    area: 'home',
    minutes: 5,
  },
  {
    key: 'litter',
    match: /\b(kattebakke(?:n)?|grus(?:bakken)?|kattegrus)\b/i,
    title: 'Skift kattebakken',
    natural: DAILY,
    area: 'home',
    minutes: 5,
  },
  {
    key: 'post',
    match: /\b(postkasse(?:n)?|hent[a-zæøå]*\s+post(?:en)?)\b/i,
    title: 'Tøm postkassen',
    natural: DAILY,
    area: 'admin',
    minutes: 2,
    anchor: true,
  },
  {
    key: 'eboks',
    match: /\b(e-?boks(?:en)?|digital post)\b/i,
    title: 'Tjek e-Boks',
    natural: { unit: 'week', every: 1 },
    area: 'admin',
    minutes: 5,
  },
  {
    key: 'walk',
    match: /\b(g[åa]\s+(?:en\s+)?tur|gaatur|g[åa]tur|luft[a-zæøå]*\s+hunden)\b/i,
    title: 'Gå en tur',
    natural: DAILY,
    area: 'health',
    minutes: 25,
  },
  {
    key: 'water',
    match: /\b(drikk?e?\s+(?:mere\s+)?vand)\b/i,
    title: 'Drik et glas vand',
    natural: DAILY,
    area: 'health',
    minutes: 1,
  },
  {
    key: 'teeth',
    match: /\b(b[øo]rst[a-zæøå]*\s+t[æa]nder|tandb[øo]rstning)\b/i,
    title: 'Børst tænder',
    natural: DAILY,
    area: 'health',
    minutes: 3,
    anchor: true,
  },
  {
    key: 'shop',
    match: /\b(handl[a-zæøå]*\s+ind|k[øo]be? ind|indk[øo]b(?:et)?)\b/i,
    title: 'Handl ind',
    natural: { unit: 'week', every: 1 },
    area: 'home',
    minutes: 45,
  },
  {
    key: 'bills',
    match: /\b(betal[a-zæøå]*\s+regninger|regningerne)\b/i,
    title: 'Betal regningerne',
    natural: { unit: 'month', every: 1 },
    area: 'money',
    minutes: 20,
  },
]

/* ------------------------------------------------------------------ *
 * Reading a routine out of what she said
 * ------------------------------------------------------------------ */

export type Stance = 'doing' | 'wanted'

export interface HabitMention {
  key: string
  title: string
  stance: Stance
  cadence: Cadence
  area: LifeArea
  minutes: number
  anchor: boolean
  /** True for medicine, which is treated differently everywhere. */
  medicine: boolean
  /** The piece of her sentence it came from, so she can be quoted back. */
  source: string
}

export interface HabitReading {
  doing: HabitMention[]
  wanted: HabitMention[]
  /** She was explicitly talking about routines, not just naming a chore. */
  aboutHabits: boolean
  /** She apologised for how she said it. This never goes unanswered. */
  apologised: boolean
}

/** "Jeg har nogle vaner", "det skal være en vane", "jeg plejer at". */
const ABOUT_HABITS =
  /\b(vane[rn]?|vaner|rutine[rn]?|fast(?:e)? rutine|plejer at|til hverdag|hverdagen|hver dag|dagligt|fast rytme)\b/i

/**
 * She wants this to start, rather than reporting that it happens.
 *
 * The distinction is the whole design, so it is drawn on her own words and
 * never guessed: "skal være bedre til", "vil gerne", "burde". Everything else
 * mentioned inside a message about routines is taken as something she already
 * does, which is the safe direction to be wrong in: the cost of treating a
 * habit she has as one she has is nothing, and the cost of putting a chore she
 * already does on a list she can fail to tick is that she stops opening it.
 */
const WANTS =
  /\b(vil (?:jeg )?(?:ogs[åa] )?(?:godt|gerne)|skal (?:jeg )?(?:ogs[åa] )?(?:v[æa]re bedre|blive bedre)|b[øo]r jeg|burde jeg|jeg burde|skal begynde|vil begynde|skal i gang med|mangler at f[åa]|skal (?:det )?(?:faktisk )?(?:ogs[åa] )?v[æa]re (?:en del af )?en vane|vil have (?:det )?ind|skal ind som)/i

const APOLOGY =
  /\b(undskyld|beklager|sorry|h[åa]ber du forst[åa]r|hvis du ikke forstod|giver det mening|jeg ved godt det er rodet|det var rodet)\b/i

/**
 * Cut a dictated run-on into pieces that each hold one routine.
 *
 * This is the part that decides whether the whole module works, because the
 * cadence and the "do I already do this" both have to be read from the piece
 * of sentence the routine actually sits in. Read them from the whole message
 * instead and one "hver tredje dag" near the end makes every chore in the list
 * every third day, which is exactly what the first version did.
 *
 * Real punctuation where it exists, then the spoken joins, and then the one
 * that matters most in dictation: a fresh "jeg <et-eller-andet>er" is a new
 * clause. That is how a person lists things out loud when no one is putting in
 * full stops, and it is the only reliable boundary in
 * "...køkkenbordet af hver dag jeg putter mit pant i pantposen jeg tømmer...".
 *
 * The verb ending is required. Splitting before every "jeg" would cut "vil jeg
 * også godt have" in half and lose the one signal that says she is asking for
 * something rather than reporting it.
 */
function pieces(text: string): string[] {
  return text
    .split(
      /[.;!?\n]+|\bog (?:ja )?(?:så|også|derefter)(?![\wæøå])|\bmen\b|\bfor eksempel\b|\bs[åa]dan at\b|\s+(?=jeg\s+[a-zæøå]+er(?![\wæøå]))/i,
    )
    .map((p) => p.trim())
    .filter((p) => p.length > 2)
}

/**
 * Every routine named in the text, with what she said about each one.
 *
 * Returns null when the message is not about routines at all, so callers can
 * check one thing and move on.
 */
export function readHabits(text: string): HabitReading | null {
  const t = text.trim()
  if (t.length < 12) return null
  const aboutHabits = ABOUT_HABITS.test(t)

  const found = new Map<string, HabitMention>()
  const chunks = pieces(t)

  for (const chunk of chunks) {
    const stated = cadenceIn(chunk)
    const wanted = WANTS.test(chunk)
    const hereKeys: string[] = []

    for (const r of ROUTINES) {
      if (!r.match.test(chunk)) continue
      hereKeys.push(r.key)

      const existing = found.get(r.key)
      if (existing) {
        // Said twice. Asking for it beats reporting it, because the ask is the
        // part with something to do about it: "jeg tager piller hver dag" and
        // "det skal v\u00e6re en del af en vane" are both true, and the second is
        // the one she wants help with. A stated cadence beats an assumed one.
        if (wanted) existing.stance = 'wanted'
        if (stated) existing.cadence = stated
        continue
      }

      found.set(r.key, {
        key: r.key,
        title: r.title,
        stance: wanted ? 'wanted' : 'doing',
        cadence: stated ?? r.natural,
        area: r.area,
        minutes: r.minutes,
        anchor: r.anchor === true,
        medicine: r.key === 'medicine',
        source: chunk,
      })
    }

    // "b\u00e5de t\u00f8mme og fylde opvaskemaskinen" is one habit, not two. Two rows
    // for one trip to the kitchen is the kind of bookkeeping that makes a list
    // feel like work in its own right.
    if (hereKeys.includes('dishwasher-empty') && hereKeys.includes('dishwasher-fill')) {
      const half = found.get('dishwasher-empty')
      found.delete('dishwasher-empty')
      found.delete('dishwasher-fill')
      if (half) found.set('dishwasher', { ...half, key: 'dishwasher', title: 'T\u00f8m og fyld opvaskemaskinen', minutes: 8 })
    }
  }

  // More specific wins. She named the food and residual bins, so the generic
  // "T\u00f8m skraldespanden" is the same trip listed a third time.
  if (found.has('food-waste') || found.has('residual-waste')) found.delete('bin')
  if (found.has('dishwasher')) {
    found.delete('dishwasher-empty')
    found.delete('dishwasher-fill')
  }
  if (found.has('deposit-return')) found.delete('deposit')

  if (!found.size) return null
  if (!aboutHabits && found.size < 2) return null

  const mentions = [...found.values()]
  return {
    doing: mentions.filter((h) => h.stance === 'doing'),
    wanted: mentions.filter((h) => h.stance === 'wanted'),
    aboutHabits,
    apologised: APOLOGY.test(t),
  }
}

/**
 * The cue a new habit should hang on.
 *
 * Picked from the things she just said she already does, because a cue is only
 * worth anything if she genuinely meets it. Falls back to null rather than
 * inventing one: an anchor she does not actually have is a plan that never
 * fires, and she will conclude the technique does not work on her.
 */
export function anchorFrom(doing: HabitMention[]): string | null {
  const candidate = doing.find((h) => h.anchor) ?? null
  return candidate ? anchorPhrase(candidate) : null
}

/** "Tøm skraldespanden" -> "Når jeg har tømt skraldespanden". */
export function anchorPhrase(h: HabitMention): string {
  return `Når jeg har ${lowerVerb(h.title)}`
}

/** "Tøm skraldespanden" -> "tømt skraldespanden", for use after "når jeg har". */
function lowerVerb(title: string): string {
  const [verb, ...rest] = title.split(' ')
  const v = verb.toLowerCase()
  const perfect =
    PERFECT[v] ?? (v.endsWith('e') ? `${v}t` : v.endsWith('t') ? v : `${v}et`)
  return [perfect, ...rest].join(' ')
}

const PERFECT: Record<string, string> = {
  tøm: 'tømt',
  tør: 'tørret',
  tag: 'taget',
  sæt: 'sat',
  vask: 'vasket',
  støvsug: 'støvsuget',
  fyld: 'fyldt',
  red: 'redt',
  skift: 'skiftet',
  ryd: 'ryddet',
  luft: 'luftet',
  vand: 'vandet',
  hent: 'hentet',
  tjek: 'tjekket',
  gå: 'været',
  drik: 'drukket',
  børst: 'børstet',
  handl: 'handlet',
  betal: 'betalt',
  læg: 'lagt',
  lav: 'lavet',
  gør: 'gjort',
  aflever: 'afleveret',
}

/* ------------------------------------------------------------------ *
 * Spotting a habit that is already in the tree pretending to be a task
 * ------------------------------------------------------------------ */

export interface HabitCandidate {
  node: LoopNode
  cadence: Cadence
  /** Why the app thinks so, in one sentence she can disagree with. */
  why: string
}

/**
 * Open loops that are really routines.
 *
 * A recurring chore filed as a one-off is a specific kind of trap. Ticking it
 * is a lie, because it is back tonight; not ticking it leaves it at the top of
 * the list where it teaches her that the list is not to be believed. Either way
 * she stops trusting the app, which is the only thing it actually has.
 *
 * Only ever offered, never applied. She knows her own life; the app is
 * pattern-matching on a word.
 */
export function spotHabits(nodes: LoopNode[]): HabitCandidate[] {
  const out: HabitCandidate[] = []
  for (const node of nodes) {
    if (node.repeat) continue
    if (node.isArea || node.status === 'done' || node.status === 'dropped') continue
    const stated = cadenceIn(node.title)
    const r = ROUTINES.find((x) => x.match.test(node.title))
    if (!r && !stated) continue
    const cadence = stated ?? r?.natural ?? DAILY
    out.push({
      node,
      cadence,
      why: stated
        ? `Du har selv skrevet "${cadenceLabel(stated)}" i den.`
        : `Sådan en kommer igen af sig selv, typisk ${cadenceLabel(cadence)}.`,
    })
  }
  return out
}

/** Turn a mention into the fields a loop needs. */
export function toLoopInput(h: HabitMention): {
  title: string
  area: LifeArea
  estimatedMinutes: number
  repeat: 'day' | 'week' | 'month'
  repeatEvery: number
} {
  return {
    title: h.title,
    area: h.area,
    estimatedMinutes: h.minutes,
    repeat: h.cadence.unit,
    repeatEvery: h.cadence.every,
  }
}
