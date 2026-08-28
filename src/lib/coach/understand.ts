/**
 * Reading the whole message before doing anything with it.
 *
 * This layer exists because of a real conversation that went badly. She wrote:
 *
 *   "Jeg har brug for hjælp til at sortere mine taks, og derefter prioritere
 *    de top 3-5 vigtigste, og også brug for hjælp til økonomi og hvordan jeg
 *    skal skaffe penge til husleje.."
 *
 * and the coach answered: "Jeg hørte en opgave i det: 'Hjælp til at sortere
 * mine taks'. Skal jeg lægge den ind?"
 *
 * Three things were wrong, and all three came from the same place: pieces of
 * the app were pattern-matching fragments of the message instead of reading it.
 *
 *  1. She asked for help. Asking for help is not a task to be filed. Nothing
 *     may be captured out of a message that contains a request.
 *  2. She asked for three things. Answering one of them, chosen arbitrarily,
 *     is worse than answering none, because it looks like it understood.
 *  3. "Skulle du ikke være terapeut?" is a question about the coach. It got
 *     answered as a question about a task called "Eller bruge håndklæde
 *     faktisk)", which is the kind of reply that ends the relationship.
 *
 * So: understand first. Every other part of the coach is downstream of this,
 * and none of them get to see the raw string any more.
 */

export type MetaKind = 'what-are-you' | 'are-you-a-therapist' | 'what-can-you-do' | 'are-you-real'

export type AskTopic =
  | 'prioritise'
  | 'sort'
  | 'money'
  | 'start'
  | 'overwhelm'
  | 'plan-time'
  | 'decide'
  | 'talk'

export interface Ask {
  topic: AskTopic
  /** The clause it came from, so a reply can quote her back. */
  text: string
}

export interface Understanding {
  /** A question about the coach itself. Always answered first. */
  meta: MetaKind | null
  /** What she is asking for, in the order she asked. */
  asks: Ask[]
  /** "hjælp mig nu", "nuu". Changes the shape of the answer, not the content. */
  urgent: boolean
  /** She is turning something down. */
  refusal: boolean
  affirmation: boolean
  /**
   * True when the message contains any request at all.
   *
   * The single most important flag here. Nothing may be filed as a task out of
   * a message where this is true.
   */
  isRequest: boolean
  /** Raw clauses, for anything downstream that wants them. */
  clauses: string[]
}

/* ------------------------------------------------------------------ *
 * Questions about the coach itself
 * ------------------------------------------------------------------ */

const META: Array<[MetaKind, RegExp]> = [
  [
    'are-you-a-therapist',
    /\b(er du (?:en )?(?:terapeut|psykolog|behandler|l[æa]ge)|skulle du ikke v[æa]re (?:terapeut|psykolog)|er det her terapi|m[åa] du give r[åa]d)\b/i,
  ],
  [
    'are-you-real',
    /\b(er du (?:et )?(?:menneske|rigtig|ai|robot|computer|en bot|chatgpt)|taler jeg med en (?:rigtig|maskine)|hvem er det jeg skriver med)\b/i,
  ],
  [
    'what-can-you-do',
    /\b(hvad kan du|hvad kan du hj[æa]lpe med|hvad er du god til|kan du overhovedet|hvad er meningen med dig)\b/i,
  ],
  ['what-are-you', /\b(hvem er du|hvad er du (?:for noget|egentlig)?|hvad er du)\b/i],
]

function detectMeta(text: string): MetaKind | null {
  for (const [kind, re] of META) if (re.test(text)) return kind
  return null
}

/* ------------------------------------------------------------------ *
 * Requests
 * ------------------------------------------------------------------ */

/** The shapes a request for help takes in ordinary Danish. */
const ASKING =
  /\b(hj[æa]lp mig|hj[æa]lp til|kan du hj[æa]lpe|jeg har brug for|jeg mangler hj[æa]lp|vil du hj[æa]lpe|hvordan (?:skal|kan) jeg|hvad (?:skal|b[øo]r) jeg|kan du|vil du|giv mig|find|v[æa]lg|s[øo]rg for|jeg ved ikke hvordan|jeg ved ikke hvad|hvad (?:s[åa] )?med|hvad var der med|og s[åa])\b/i

/**
 * What each clause is about. Order matters: a clause about money that also
 * mentions priorities is about money, because money is the harder thing and
 * the one she is actually frightened of.
 */
const TOPICS: Array<[AskTopic, RegExp]> = [
  [
    'money',
    /\b([øo]konomi[\wæøåÆØÅ]*|penge|husleje[\wæøåÆØÅ]*|leje[nr]?\b|regning[\wæøåÆØÅ]*|g[æa]ld[\wæøåÆØÅ]*|betale?[\wæøåÆØÅ]*|r[åa]d til|budget[\wæøåÆØÅ]*|restance[\wæøåÆØÅ]*|rykker[\wæøåÆØÅ]*|udsat af (?:min )?bolig)\b/i,
  ],
  //
  // Every stem here ends in [\wæøåÆØÅ]* rather than \b. "Rækkefølgen" is the
  // way a person writes it, and \b after "rækkefølge" falls between two word
  // characters, so it never matched. Danish definite endings mean a bare word
  // boundary is almost always wrong.
  [
    'prioritise',
    /\b(prioriter[\wæøåÆØÅ]*|vigtigst[\wæøåÆØÅ]*|top ?\d|hvad er vigtigst|hvad skal f[øo]rst|r[æa]kkef[øo]lge[\wæøåÆØÅ]*)/i,
  ],
  [
    'sort',
    /\b(sorter[\wæøåÆØÅ]*|ordne mine|f[åa] styr p[åa] mine|rydde op i (?:mine )?(?:opgaver|taks|tasks|listen)|organiser[\wæøåÆØÅ]*|overblik[\wæøåÆØÅ]*)/i,
  ],
  [
    'plan-time',
    /\b(hvorn[åa]r skal jeg|planl[æa]g[\wæøåÆØÅ]*|fordel dem|l[æa]gge dem (?:ind )?i (?:en )?(?:kalender|uge)|tidsplan[\wæøåÆØÅ]*|skema[\wæøåÆØÅ]*)/i,
  ],
  [
    'overwhelm',
    /\b(for meget|kan ikke overskue|drukner|kaos|alt for mange|ved ikke hvor jeg skal starte|uoverskuelig[\wæøåÆØÅ]*|panik[\wæøåÆØÅ]*)/i,
  ],
  ['decide', /\b(kan ikke bestemme|kan ikke v[æa]lge|hvad skal jeg v[æa]lge|beslutning[\wæøåÆØÅ]*)/i],
  [
    'start',
    /\b(komme i gang|start[\wæøåÆØÅ]*|g[åa] i gang|hj[æa]lp mig i gang|hvad skal jeg lave|find noget til mig|v[æa]lg (?:noget|en) for mig)/i,
  ],
  ['talk', /\b(snakke|tale om|bare snakke|har brug for at (?:sige|snakke)|lytte)/i],
]

function topicOf(clause: string): AskTopic | null {
  for (const [topic, re] of TOPICS) if (re.test(clause)) return topic
  return null
}

/**
 * Cut a message into the things it is actually asking for.
 *
 * "og derefter", "og også", "og" between two requests are all list separators
 * here, unlike in the brain dump, where "og" usually joins one thought.
 */
function toClauses(text: string): string[] {
  return text
    .split(/[,.;!?]+|\bog (?:derefter|ogs[åa]|s[åa])\b|\bderefter\b|\bdesuden\b|\bplus\b|\bog\b/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 2)
}

const URGENT = /\b(nu+|med det samme|akut|haster|lige nu|hurtigt)\b/i
const REFUSAL = /^\s*(nej|n[åa]h|nope|ikke det|det er ikke det|ellers tak|drop det|glem det)\b/i
const AFFIRM = /^\s*(ja+|jep|jeps|yes|okay|ok|gerne|k[øo]r|please|g[øo]r det|s[åa] gerne)\b/i

export function understand(text: string): Understanding {
  const t = text.trim()
  const meta = detectMeta(t)
  const clauses = toClauses(t)

  const asks: Ask[] = []
  const seen = new Set<AskTopic>()

  // A request in any clause makes the whole message a request. People write
  // "jeg har brug for hjælp til X, og Y, og Z" and only say "hjælp" once.
  const asking = ASKING.test(t)

  for (const clause of clauses) {
    const topic = topicOf(clause)
    if (!topic || seen.has(topic)) continue
    // A topic only counts as a request when she is asking about it, or when the
    // topic is itself a cry for help. "Der er for meget" needs no please.
    if (!asking && topic !== 'overwhelm') continue
    seen.add(topic)
    asks.push({ topic, text: clause })
  }

  // Asked for help with nothing nameable: still a request.
  if (asking && !asks.length && /\bhj[æa]lp/i.test(t)) asks.push({ topic: 'start', text: t })

  return {
    meta,
    asks,
    urgent: URGENT.test(t),
    refusal: REFUSAL.test(t),
    affirmation: AFFIRM.test(t),
    isRequest: meta !== null || asks.length > 0 || asking,
    clauses,
  }
}

/** What each ask is called when the coach says it back to her. */
export const TOPIC_NAMES: Record<AskTopic, string> = {
  prioritise: 'rækkefølgen',
  sort: 'overblikket',
  money: 'økonomien',
  start: 'at komme i gang',
  overwhelm: 'at der er for meget',
  'plan-time': 'tidspunkterne',
  decide: 'beslutningen',
  talk: 'det du ville snakke om',
}

/**
 * Which of a set of topics she just named.
 *
 * For picking up the thread: after "bagefter tager vi overblikket og
 * rækkefølgen", "og hvad så med rækkefølgen?" has to mean the order, not
 * whichever one happened to be first in the queue.
 */
export function namedTopic(text: string, among: AskTopic[]): AskTopic | null {
  for (const [topic, re] of TOPICS) {
    if (among.includes(topic) && re.test(text)) return topic
  }
  return null
}
