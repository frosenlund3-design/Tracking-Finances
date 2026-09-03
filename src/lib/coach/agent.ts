/**
 * The part of the coach that does things.
 *
 * Everything else in this folder gives advice. This reads a request, works out
 * what she actually wants changed, and returns the change for the UI to make.
 * It matters more than it sounds: an assistant that can only talk is one more
 * thing to manage, and managing things is the part that is broken. If she
 * says "flyt den til fredag", the task should move, not be discussed.
 *
 * Two rules run through all of it.
 *
 * Nothing destructive happens without a yes. Moving, splitting and rewording
 * are reversible and happen straight away. Deleting is not, so it asks.
 *
 * It never pretends to have understood. When the request is outside what it
 * can do, it returns null, the advisory engine answers instead, and she is
 * never left with a confident wrong action.
 */

import type { LoopNode, TimePart } from '@/db/types'
import { GRANULARITIES, decompose, type Granularity } from '@/lib/decompose'
import { analyse, toImperativeSentence } from '@/lib/language'
import { understand } from './understand'
import { cleanFragment } from '@/lib/brainDump'
import { knowHowFor } from '@/lib/knowhow'
import { cueOptions, cueSentence, looksLikeATime } from '@/lib/cues'
import { addDays, humanMinutes, isoDate, PART_LABELS } from '@/lib/time'
import { whenLabel } from '@/lib/deadlines'

export type AgentEffect =
  | { kind: 'resplit'; nodeId: string; granularity: Granularity }
  | { kind: 'add-step'; nodeId: string; title: string }
  | { kind: 'schedule'; nodeId: string; date?: string; part?: TimePart }
  | { kind: 'park'; nodeId: string; until: number }
  | { kind: 'unpark'; nodeId: string }
  | { kind: 'rename'; nodeId: string; title: string }
  | { kind: 'estimate'; nodeId: string; minutes: number }
  | { kind: 'good-enough'; nodeId: string; note: string }
  | { kind: 'delete'; nodeId: string }
  | { kind: 'complete'; nodeId: string }
  | { kind: 'move'; nodeId: string; parentId: string }
  | { kind: 'cue'; nodeId: string; cue: string }
  | { kind: 'repeat'; nodeId: string; repeat: LoopNode['repeat'] }

export interface AgentResult {
  lines: string[]
  /** Applied immediately unless `confirm` is set. */
  effect?: AgentEffect
  /** When present, the effect waits for a yes and this is the button. */
  confirm?: string
  options?: string[]
}

export interface AgentInput {
  text: string
  task: LoopNode | null
  /** The circles she could move something into, so the coach can name them. */
  circles?: Array<{ id: string; title: string }>
  /**
   * Whether she actually referred to this task, rather than it being whatever
   * the app would have suggested next.
   *
   * Only the catch-all cares. Commands like "del den op" are about the task in
   * front of her either way, but answering an unrecognised question with facts
   * about a loop she never mentioned reads as not listening.
   */
  namedTask?: boolean
  /** The fixed points she has told the app she already hits, so cues are hers. */
  routines?: string[]
  now?: Date
}

/* ------------------------------------------------------------------ *
 * Questions about the task in front of her
 * ------------------------------------------------------------------ */

type QuestionKind = 'need' | 'where' | 'how' | 'howLong' | 'when' | 'snag' | 'done' | 'who' | 'why' | 'first'

const QUESTIONS: Array<[QuestionKind, RegExp]> = [
  ['need', /\b(hvad skal jeg (?:bruge|have|medbringe|tage med)|hvad har jeg brug for|skal jeg have noget med|hvad kr[æa]ver det)\b/i],
  ['where', /\b(hvor (?:er|ligger|foreg[åa]r|finder|skal jeg hen|g[øo]r jeg)|hvilken (?:side|app|hjemmeside)|hvor henne)\b/i],
  ['howLong', /\b(hvor lang tid|hvor l[æa]nge|tager (?:det|den) lang tid|hvor mange minutter)\b/i],
  ['when', /\b(hvorn[åa]r (?:skal|kan|har de|er der|b[øo]r)|er der [åa]bent|hvad er fristen|hvorn[åa]r er deadline)\b/i],
  ['snag', /\b(hvad (?:hvis|nu hvis|s[åa] hvis)|hvad g[øo]r jeg hvis|hvis (?:de|det|den) ikke|kan det g[åa] galt|hvad plejer at g[åa] galt)\b/i],
  ['done', /\b(hvorn[åa]r er jeg f[æa]rdig|hvad er godt nok|hvor meget skal jeg|n[åa]r er den f[æa]rdig|hvad t[æa]ller som)\b/i],
  ['who', /\b(hvem skal jeg|hvem (?:er|ringer|kontakter)|hvem g[øo]r)\b/i],
  ['why', /\b(hvorfor skal jeg|hvad sker der hvis jeg ikke|betyder det noget|er det vigtigt)\b/i],
  ['first', /\b(hvor (?:skal jeg )?starte[r]?|hvad er f[øo]rste|hvad g[øo]r jeg f[øo]rst|hvordan kommer jeg i gang)\b/i],
  ['how', /\b(hvordan (?:g[øo]r jeg|skal jeg|virker|gribe)|hvad g[øo]r jeg)\b/i],
]

function detectQuestion(text: string): QuestionKind | null {
  for (const [kind, re] of QUESTIONS) if (re.test(text)) return kind
  return null
}

/**
 * Answer a concrete question about a concrete task.
 *
 * Where there is real knowledge about this kind of task it is used. Where
 * there is not, the answer is derived from the sentence itself rather than
 * invented, and it says plainly when it does not know. Confidently wrong
 * practical advice is worse than none: she acts on it, it fails, and the app
 * has spent trust it will not get back.
 */
function answerQuestion(kind: QuestionKind, task: LoopNode, now: Date): AgentResult | null {
  const know = knowHowFor(task.title)
  const a = analyse(task.title)
  const next = task.steps.find((s) => !s.done)

  const fallbackOptions = ['Del den op', 'Start den nu', 'Noget andet']

  switch (kind) {
    case 'need': {
      if (know?.need) return { lines: [`Til "${task.title}" skal du bruge:`, know.need], options: ['Start den nu', 'Læg det ind som første trin'] }
      return {
        lines: [
          'Det ved jeg ikke med sikkerhed for lige den her, og så vil jeg hellere sige det end at gætte.',
          'Men prøv den her: hvad ville du blive nødt til at rejse dig efter halvvejs inde? Læg det frem nu.',
        ],
        options: fallbackOptions,
      }
    }
    case 'where': {
      if (know?.where) return { lines: [know.where], options: ['Start den nu', 'Hvad skal jeg bruge?'] }
      if (a.target) return { lines: [`Den foregår hos ${a.target}, hvis jeg læser den rigtigt.`, 'Ellers ret titlen, så finder jeg bedre rundt i den.'], options: fallbackOptions }
      return { lines: ['Det står ikke i opgaven, og jeg gætter ikke på det.', 'Skriv hvor det foregår, så husker jeg det til næste gang.'], options: fallbackOptions }
    }
    case 'how': {
      const lines = [know?.how, know?.where].filter(Boolean) as string[]
      if (lines.length) return { lines, options: ['Del den op', 'Start den nu'] }
      if (next) return { lines: ['Sådan her, i den rækkefølge:', ...task.steps.filter((s) => !s.done).slice(0, 3).map((s, i) => `${i + 1}. ${s.title}`)], options: ['Start den nu', 'Flere trin'] }
      return { lines: ['Den har ingen trin endnu. Skal jeg dele den op?'], options: ['Ja, del den op', 'Nej'] }
    }
    case 'howLong': {
      const shown = humanMinutes(task.estimatedMinutes)
      const stepLine = next ? `Det næste trin, "${next.title}", er et par minutter.` : null
      return {
        lines: [
          `Der står ${shown}, og det tal er rettet efter, hvor lang tid tingene faktisk tager dig.`,
          stepLine,
          'Du behøver ikke tage det hele. Sæt en timer på ti minutter og stop der.',
        ].filter(Boolean) as string[],
        options: ['Start den nu', 'Sæt 10 minutter på'],
      }
    }
    case 'when': {
      const lines: string[] = []
      if (task.dueAt) lines.push(`Den har en rigtig tid: ${whenLabel(task, now.getTime())}.`)
      if (know?.timing) lines.push(know.timing)
      if (!lines.length) lines.push('Den har ingen fast tid, så den kan tages, når du har overskud til den.')
      return { lines, options: ['Læg den på en dag', 'Start den nu'] }
    }
    case 'snag': {
      if (know?.snag) return { lines: ['Det, der plejer at gå galt:', know.snag], options: ['Start den nu', 'Hvad skal jeg bruge?'] }
      return {
        lines: [
          'Jeg kender ikke faldgruberne for lige den her.',
          'Men det, der oftest vælter en opgave, er ikke opgaven, det er at skulle finde noget frem midtvejs. Læg det frem først.',
        ],
        options: fallbackOptions,
      }
    }
    case 'done': {
      const lines = [know?.done ?? task.goodEnoughNote ?? 'Den er færdig, når det første rigtige trin er gjort. Resten er bonus.']
      return { lines, options: ['Sæt et godt nok-mål', 'Start den nu'] }
    }
    case 'who': {
      if (a.target) return { lines: [`${capitalise(a.target)}, ud fra det du har skrevet.`], options: fallbackOptions }
      if (know?.where) return { lines: [know.where], options: fallbackOptions }
      return { lines: ['Det står ikke i opgaven. Skriv hvem det er, så har du det næste gang også.'], options: fallbackOptions }
    }
    case 'why': {
      if (know?.stakes) return { lines: [know.stakes, 'Det er ikke for at presse dig. Det er bare svaret.'], options: fallbackOptions }
      return {
        lines: [
          'Ærligt: det ved jeg ikke, og det er dig, der ved det.',
          'Hvis svaret er "ikke noget særligt", er det et rigtigt godt svar. Så kan den slettes eller parkeres.',
        ],
        options: ['Parkér den', 'Slet den', 'Nej, den skal gøres'],
      }
    }
    case 'first': {
      if (next) return { lines: ['Kun den her:', next.title, 'Ikke noget andet.'], options: ['Start den nu', 'Den er stadig for stor'] }
      if (know?.need) return { lines: ['Start med at lægge det frem, du skal bruge:', know.need], options: ['Start den nu', 'Del den op'] }
      return { lines: ['Den har ingen trin. Skal jeg dele den op?'], options: ['Ja, del den op', 'Nej'] }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Commands
 * ------------------------------------------------------------------ */

const WEEKDAYS: Record<string, number> = {
  søndag: 0, mandag: 1, tirsdag: 2, onsdag: 3, torsdag: 4, fredag: 5, lørdag: 6,
}

function nextWeekday(from: Date, dow: number): Date {
  const d = new Date(from)
  const delta = (dow - d.getDay() + 7) % 7 || 7
  d.setDate(d.getDate() + delta)
  return d
}

function readDate(text: string, now: Date): string | undefined {
  const t = text.toLowerCase()
  if (/\b(i dag|idag)\b/.test(t)) return isoDate(now)
  if (/\b(i morgen|imorgen)\b/.test(t)) return isoDate(addDays(now, 1))
  if (/\b(i overmorgen)\b/.test(t)) return isoDate(addDays(now, 2))
  if (/\b(n[æa]ste uge|om en uge)\b/.test(t)) return isoDate(addDays(now, 7))
  if (/\b(i weekenden)\b/.test(t)) return isoDate(nextWeekday(now, 6))
  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b(?:p[åa]\\s+)?${name}\\b`).test(t)) return isoDate(nextWeekday(now, dow))
  }
  return undefined
}

function readPart(text: string): TimePart | undefined {
  const t = text.toLowerCase()
  if (/\bmorgen[\wæøåÆØÅ]*\b/.test(t) && !/\bi morgen\b/.test(t)) return 'morning'
  if (/\bformiddag[\wæøåÆØÅ]*\b/.test(t)) return 'midday'
  if (/\beftermiddag[\wæøåÆØÅ]*\b/.test(t)) return 'afternoon'
  if (/\baften[\wæøåÆØÅ]*\b/.test(t)) return 'evening'
  return undefined
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const NEEDS_TASK = 'Sig hvilken opgave, så gør jeg det. Skriv bare et par ord fra titlen.'

/**
 * A message long enough to be a story is not a command.
 *
 * The bug this exists for: she dictated her entire everyday routine in one
 * breath, six hundred characters of it, and the words "hver dag" landed in the
 * middle. The recurrence branch below matched that fragment and set a daily
 * repeat on a completely unrelated task that happened to be in focus, then
 * announced it. Nothing in the message was about that task.
 *
 * The branches at risk are the ones that match a bare adverbial rather than an
 * imperative: "hver dag", "i morgen", "ti minutter", "når jeg". Those phrases
 * occur in any sentence anybody says about their life. The imperative branches
 * ("del den op", "parkér den", "slet den") name their object and are safe.
 */
const NARRATIVE_LENGTH = 140

/** She is pointing at something, rather than just using the words. */
const REFERS_TO_TASK = /\b(den|dem|denne|den her|den der|opgaven|opgave[rn]?)\b/i

export function handleAgentRequest({ text, task, circles = [], namedTask = false, routines = [], now = new Date() }: AgentInput): AgentResult | null {
  const t = text.trim()
  if (!t) return null
  const lower = t.toLowerCase()
  const narrative = t.length > NARRATIVE_LENGTH
  const aboutThisTask = namedTask || REFERS_TO_TASK.test(t)

  /* --- detail level ------------------------------------------------ */
  if (/\b(flere trin|flere steps|del den (?:mere|yderligere)|mindre bidder|endnu mindre|for store trin|st[øo]rre skridt end jeg kan)\b/i.test(lower)) {
    if (!task) return { lines: [NEEDS_TASK] }
    const current = task.steps.length || 5
    const target = GRANULARITIES.find((g) => g > current) ?? 20
    return {
      lines: [`Så gør vi den mindre. ${target} trin i stedet for ${current || 'ingen'}.`, 'Det du allerede har sat flueben ved, bliver stående.'],
      effect: { kind: 'resplit', nodeId: task.id, granularity: target },
      options: ['Stadig for stort', 'Sådan, start den'],
    }
  }

  //
  // Every pattern in here has to be about the task, not about her life. "Der
  // er alt for meget" used to match this one and quietly trimmed the step list
  // on whatever happened to be open, which is both wrong and slightly insane
  // as a response to somebody saying they are overwhelmed.
  if (/\b(f[æa]rre trin|for mange trin|for mange steps|for detaljeret|kortere liste|simplere liste)\b/i.test(lower) && task?.steps.length) {
    const current = task.steps.length
    const target = [...GRANULARITIES].reverse().find((g) => g < current) ?? 1
    return {
      lines: [`Fint. ${target === 1 ? 'Så er der kun én ting tilbage.' : `Ned til ${target} trin.`}`],
      effect: { kind: 'resplit', nodeId: task.id, granularity: target },
      options: ['Start den nu', 'Endnu færre'],
    }
  }

  if (/\b(del den op|del den i|lav trin|hvad er trinene|giv mig trin)\b/i.test(lower)) {
    if (!task) return { lines: [NEEDS_TASK] }
    const d = decompose(task.title, { granularity: 5 })
    if (!d) {
      // The only thing left that produces no steps is an appointment, and for
      // one of those "der er ikke noget at dele op" is the correct answer, not
      // an apology for not being clever enough.
      return {
        lines: [
          `"${task.title}" er en aftale, ikke en opgave. Der er ikke noget at dele op, du skal møde op.`,
          'Hvis der er noget, der skal gøres inden, så sig hvad, så lægger jeg det ind som sin egen ting.',
        ],
        options: ['Der er noget inden', 'Læg den i kalenderen', 'Okay'],
      }
    }
    return {
      lines: ['Sådan her:', ...d.steps.map((s, i) => `${i + 1}. ${s}`)],
      effect: { kind: 'resplit', nodeId: task.id, granularity: 5 },
      options: ['Start den nu', 'Flere trin', 'Færre trin'],
    }
  }

  /* --- add a step -------------------------------------------------- */
  //
  // Only explicit add-verbs. "Jeg skal også huske at ringe til frisøren" looks
  // like an addition and is almost never one: it is a new thing arriving in her
  // head while she happens to have another task open. Filing it as a step on
  // whatever was on screen buries it. Those go to capture instead.
  const add = t.match(
    /\b(?:tilf[øo]je?r?|kan du tilf[øo]je|s[æa]t ogs[åa]|skriv ogs[åa]|der mangler(?:\s+ogs[åa])?)\s+(?:at\s+)?(.{3,80})$/i,
  )
  if (add && task) {
    // Through the same reader the brain dump uses, so "at jeg skal finde
    // lønsedlerne" becomes the instruction "Find lønsedlerne" rather than a
    // step written in the third person about herself.
    const step = toImperativeSentence(cleanFragment(add[1].replace(/[.!?]+$/, '').trim()))
    return {
      lines: [`Lagt ind: "${step}".`, 'Den ligger nederst, så den ikke skubber det du var i gang med.'],
      effect: { kind: 'add-step', nodeId: task.id, title: step },
      options: ['Start den nu', 'Tilføj en mere'],
    }
  }

  /* --- move it ----------------------------------------------------- */
  if (/\b(flyt den|udskyd den|kan jeg tage den|tag den (?:i morgen|p[åa]|n[æa]ste)|ikke i dag|l[æa]g den (?:til|p[åa]|over p[åa]))\b/i.test(lower)) {
    if (!task) return { lines: [NEEDS_TASK] }
    const date = readDate(lower, now)
    const part = readPart(lower)
    if (date || part) {
      const when = [date ? dayWord(date, now) : null, part ? PART_LABELS[part].toLowerCase() : null].filter(Boolean).join(' ')
      return {
        lines: [`Flyttet til ${when}.`, 'Den ligger ikke og fylder før da.'],
        // Keep the day she already had if she only named a time of day:
        // "tag den om eftermiddagen" must not wipe next Friday.
        effect: { kind: 'schedule', nodeId: task.id, date: date ?? task.scheduledDate, part: part ?? task.scheduledPart },
        options: ['Tak', 'Flyt en mere'],
      }
    }
    return {
      lines: ['Hvornår passer det bedre?'],
      options: ['I morgen', 'På fredag', 'Næste uge', 'Parkér den helt'],
    }
  }

  /* --- park -------------------------------------------------------- */
  if (/\b(park[eé]r|l[æa]g den v[æa]k|gem den til senere|den kan vente|ud af hovedet med den)\b/i.test(lower)) {
    if (!task) return { lines: [NEEDS_TASK] }
    const until = addDays(now, 7).getTime()
    return {
      lines: ['Parkeret i en uge.', 'Den tæller ikke med i din mental load imens, og den kommer selv tilbage.'],
      effect: { kind: 'park', nodeId: task.id, until },
      options: ['Godt', 'Find noget andet til mig'],
    }
  }

  /* --- delete: the one thing that asks first ------------------------ */
  if (/\b(slet den|fjern den|den skal ikke (?:v[æa]re der|st[åa])|den er ikke min|den er ikke relevant|drop den helt)\b/i.test(lower)) {
    if (!task) return { lines: [NEEDS_TASK] }
    return {
      lines: [`Vil du have "${task.title}" helt væk?`, 'At beslutte at noget ikke skal laves er også at få hovedet tilbage. Men den kan ikke hentes igen.'],
      effect: { kind: 'delete', nodeId: task.id },
      confirm: 'Ja, slet den',
      options: ['Nej, parkér den i stedet'],
    }
  }

  /* --- it comes back ------------------------------------------------- */
  const rep = lower.match(/\b(?:hver|hver eneste|en gang om|en gang hver|gentag(?:er)? (?:sig )?hver)\s+(dag|uge|m[åa]ned)\b|\b(dagligt|ugentligt|m[åa]nedligt)\b/i)
  if (rep && task && !narrative && aboutThisTask) {
    const word = (rep[1] ?? rep[2] ?? '').toLowerCase()
    const repeat: LoopNode['repeat'] =
      /dag/.test(word) ? 'day' : /uge/.test(word) ? 'week' : 'month'
    const label = repeat === 'day' ? 'hver dag' : repeat === 'week' ? 'hver uge' : 'hver måned'
    return {
      lines: [
        `Så kommer "${task.title}" igen ${label}, når du har lukket den.`,
        'Den hober sig aldrig op. Springer du en over, findes den bare næste gang.',
      ],
      effect: { kind: 'repeat', nodeId: task.id, repeat },
      options: ['Start den nu', 'Kun én gang alligevel'],
    }
  }
  if (/\b(kun [ée]n gang|ikke gentag|den kommer ikke igen|stop gentagelsen)\b/i.test(lower) && task?.repeat) {
    return {
      lines: ['Fint. Så er den en engangs-ting igen.'],
      effect: { kind: 'repeat', nodeId: task.id, repeat: undefined },
      options: ['Start den nu'],
    }
  }

  /* --- hang it on something she already does ------------------------- */
  const hang = t.match(/\b(?:h[æa]ng den p[åa]|kobl den (?:til|p[åa])|min plan er|n[åa]r jeg har|n[åa]r jeg)\s+(.{3,60})$/i)
  if (hang && task && !narrative && /\b(h[æa]ng|kobl|plan|n[åa]r jeg)\b/i.test(lower)) {
    const raw = hang[0].toLowerCase().startsWith('når jeg') ? hang[0] : hang[1]
    const cue = capitalise(raw.replace(/[.!?]+$/, '').trim())
    if (looksLikeATime(cue)) {
      return {
        lines: [
          'Det ligner et klokkeslæt, og et klokkeslæt er én beslutning mere, du skal huske at tage.',
          'Hæng den på noget, der sker af sig selv i stedet. Kaffen, tandbørsten, døren når du kommer hjem.',
        ],
        options: cueOptions(routines).slice(0, 3).map((c) => `Hæng den på ${c.toLowerCase()}`),
      }
    }
    return {
      lines: [cueSentence(cue, task.title), 'Nu skal du ikke huske den. Du skal bare møde kaffen.'],
      effect: { kind: 'cue', nodeId: task.id, cue },
      options: ['Start den nu', 'Vælg noget andet'],
    }
  }

  if (/\b(jeg glemmer den|glemmer hele tiden|husker den aldrig|falder ud af hovedet|hj[æa]lp mig med at huske)\b/i.test(lower) && task) {
    return {
      lines: [
        'Så skal den ikke huskes. Den skal hænges på noget, du alligevel gør.',
        'En påmindelse skal du selv møde. En vane møder dig.',
        'Hvad af det her rammer du hver dag?',
      ],
      options: cueOptions(routines).slice(0, 3).map((c) => `Hæng den på ${c.toLowerCase()}`),
    }
  }

  /* --- move it to another circle ------------------------------------ */
  const moveTo = t.match(
    /\b(?:flyt den (?:(?:ind )?(?:til|under|over i|i))|l[æa]g den (?:under|i|ind i)|den h[øo]rer (?:til|hjemme) (?:under|i)|s[æa]t den (?:under|i))\s+(.{2,40})$/i,
  )
  if (moveTo) {
    if (!task) return { lines: [NEEDS_TASK] }
    const wanted = moveTo[1].replace(/[.!?"“”]+$/, '').trim().toLowerCase()
    const hit =
      circles.find((c) => c.title.toLowerCase() === wanted) ??
      circles.find((c) => c.title.toLowerCase().startsWith(wanted.slice(0, 5))) ??
      circles.find((c) => wanted.includes(c.title.toLowerCase()))
    if (!hit) {
      return {
        lines: [
          `Jeg kan ikke finde en cirkel, der hedder "${moveTo[1].trim()}".`,
          circles.length ? `Dem du har: ${circles.slice(0, 8).map((c) => c.title).join(', ')}.` : '',
        ].filter(Boolean),
        options: circles.slice(0, 3).map((c) => `Flyt den til ${c.title}`),
      }
    }
    return {
      lines: [`Flyttet ind under ${hit.title}.`],
      effect: { kind: 'move', nodeId: task.id, parentId: hit.id },
      options: ['Start den nu', 'Flyt en mere'],
    }
  }

  /* --- rename ------------------------------------------------------ */
  const rename = t.match(/\b(?:kald den|den skal hedde|omd[øo]b den til|ret titlen til)\s+(.{2,60})$/i)
  if (rename && task) {
    const title = capitalise(rename[1].replace(/["“”.!?]+$/, '').trim())
    return {
      lines: [`Så hedder den "${title}".`],
      effect: { kind: 'rename', nodeId: task.id, title },
      options: ['Del den op', 'Start den nu'],
    }
  }

  /* --- good enough ------------------------------------------------- */
  if (/\b(godt nok|g[øo]r den mindre|20 ?%|s[æa]nk barren|det beh[øo]ver ikke v[æa]re perfekt)\b/i.test(lower) && task) {
    const note = 'Lav en femtedel af den. Det tæller som færdig.'
    return {
      lines: ['Så er målet en femtedel af den.', 'Det er ikke snyd. En femtedel gjort slår en hel opgave, der ikke bliver rørt.'],
      effect: { kind: 'good-enough', nodeId: task.id, note },
      options: ['Start den nu'],
    }
  }

  /* --- done -------------------------------------------------------- */
  if (/\b(jeg har (?:gjort|lavet|klaret) den|den er (?:gjort|klaret|f[æa]rdig|lavet)|s[æa]t flueben)\b/i.test(lower) && task) {
    return {
      lines: [`"${task.title}" er lukket.`, 'Den er ude af hovedet nu.'],
      effect: { kind: 'complete', nodeId: task.id },
      options: ['Hvad så nu?', 'Jeg stopper her'],
    }
  }

  /* --- rephrase ---------------------------------------------------- */
  if (/\b(giver ikke mening|forst[åa]r (?:det )?ikke|hvad mener du|sig det (?:p[åa] en anden m[åa]de|anderledes)|omformul[eé]r|forklar det|p[åa] dansk tak)\b/i.test(lower)) {
    if (!task) {
      return {
        lines: ['Undskyld. Jeg prøver igen, kortere.', 'Hvad er det, du sidder med lige nu?'],
        options: ['Jeg kan ikke komme i gang', 'Der er for meget', 'Hvad skal jeg lave?'],
      }
    }
    const know = knowHowFor(task.title)
    if (know) {
      return {
        lines: [
          'Så siger jeg det uden trin.',
          know.where ?? '',
          know.need ? `Du skal bruge: ${know.need}` : '',
          know.how ?? '',
        ].filter(Boolean),
        options: ['Nu giver det mening', 'Del den op i stedet', 'Stadig for stort'],
      }
    }
    const next = task.steps.find((s) => !s.done)
    return {
      lines: [
        'Fair. Så glem trinene.',
        next ? `Det eneste, der skal ske lige nu, er: ${next.title.toLowerCase()}.` : `Det eneste, der skal ske, er at du åbner "${task.title}" og kigger på den i to minutter.`,
        'Ikke mere end det.',
      ],
      options: ['Okay', 'Stadig for stort', 'Del den op'],
    }
  }

  /* --- something she is missing -------------------------------------- */
  //
  // "Jeg har ikke deres nummer", "jeg mangler policenummeret". This is where a
  // task actually stops, and it stops silently: she does not think of it as
  // being blocked, she thinks of herself as not doing it.
  //
  // The app has no network and cannot look anything up, so it does two honest
  // things instead. If it knows where that kind of thing lives, it says so. And
  // either way it offers to make finding it the task, because "find deres
  // nummer" is a task that can be finished and "ring til dem" is not, while the
  // number is missing.
  const missing = t.match(
    /\b(?:jeg mangler|jeg har ikke|jeg kan ikke finde|hvor finder jeg|jeg ved ikke hvor)\s+(?:(?:mit|min|deres|hans|hendes|et|en|de)\b\s+)?(.{2,50}?)[.!?]*$/i,
  )
  // "Jeg mangler tid" and "jeg har ikke overskud" are not missing objects. They
  // are the thing the rest of the app is for, and answering them with "så lad
  // os finde tid frem" would be absurd.
  const NOT_A_THING = /^(tid|overskud|energi|motivation|lyst|kr[æa]fter|ro|s[øo]vn|hj[æa]lp|penge)\b/i
  if (missing && !NOT_A_THING.test(missing[1].trim())) {
    const thing = missing[1].trim()
    if (task) {
      const know = knowHowFor(task.title)
      const step = capitalise(`Find ${thing} frem`)
      return {
        lines: [
          `Så er det ikke "${task.title}", der er opgaven lige nu. Det er at finde ${thing}.`,
          // Context about the task, labelled as such. It is not a claim about
          // where the missing thing is, and pretending otherwise would send her
          // looking in the wrong place.
          know?.need ? `Til den her opgave skal du i det hele taget bruge: ${know.need}` : '',
          know?.where ?? '',
          'Jeg kan ikke slå det op for dig, jeg har ingen forbindelse til noget udenfor. Men jeg kan gøre det til det eneste, du skal.',
        ].filter(Boolean) as string[],
        effect: { kind: 'add-step', nodeId: task.id, title: step },
        options: ['Godt', 'Parkér hele opgaven til jeg har det'],
      }
    }
    return {
      lines: [
        `At mangle ${thing} er ikke det samme som ikke at være kommet i gang. Det er en anden opgave, og den kan faktisk laves.`,
        `Skal jeg lægge "find ${thing}" ind som sin egen ting?`,
      ],
      options: ['Ja', 'Nej tak'],
    }
  }

  /* --- questions --------------------------------------------------- */
  //
  // But never a question about the coach itself. "Skulle du ikke være
  // terapeut?" is not a question about whatever loop was on screen, and
  // answering it as one is how somebody stops believing there is anything
  // there. Those are handled before this is ever called; this is the guard.
  if (understand(t).meta) return null

  const q = detectQuestion(t)
  if (q && task) return answerQuestion(q, task, now)

  //
  // A question it does not recognise, about a task it does know something
  // about. Rather than falling through to generic encouragement, it lays out
  // everything it actually has and says plainly what it does not. Being told
  // "det ved jeg ikke, men her er hvad jeg ved" is a real answer. Being handed
  // a motivational line instead of an answer is how an assistant stops being
  // asked anything.
  if (/\?\s*$/.test(t) && task && namedTask) {
    const know = knowHowFor(task.title)
    const next = task.steps.find((s) => !s.done)
    const facts = [
      know?.where ? `Hvor: ${know.where}` : null,
      know?.need ? `Du skal bruge: ${know.need}` : null,
      know?.timing ? `Tid: ${know.timing}` : null,
      know?.snag ? `Pas på: ${know.snag}` : null,
      next ? `Næste trin: ${next.title}` : null,
      task.dueAt ? `Frist: ${whenLabel(task, now.getTime())}` : null,
    ].filter(Boolean) as string[]

    if (facts.length) {
      return {
        lines: [
          'Det præcise spørgsmål er jeg ikke sikker på, at jeg forstår. Her er alt, jeg ved om den:',
          ...facts,
          'Spørg igen med andre ord, hvis det ikke var det.',
        ],
        options: ['Hvad skal jeg bruge?', 'Hvad hvis det går galt?', 'Start den nu'],
      }
    }
    return {
      lines: [
        'Det ved jeg ikke, og jeg gætter ikke.',
        `Det eneste jeg har på "${task.title}" er, hvad du selv har skrevet.`,
        'Men jeg kan dele den op, gøre den mindre, flytte den eller finde det første skridt. Sig til.',
      ],
      options: ['Del den op', 'Hvad er første skridt?', 'Flyt den'],
    }
  }
  if (q && !task) {
    return {
      lines: ['Hvilken opgave spørger du om?', 'Skriv et par ord fra den, så finder jeg den.'],
      options: ['Find noget til mig', 'Der er for meget'],
    }
  }

  return null
}

function dayWord(iso: string, now: Date): string {
  const today = isoDate(now)
  if (iso === today) return 'i dag'
  if (iso === isoDate(addDays(now, 1))) return 'i morgen'
  const d = new Date(`${iso}T12:00:00`)
  const days = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag']
  return days[d.getDay()]
}
