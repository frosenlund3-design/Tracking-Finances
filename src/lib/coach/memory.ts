import type { Completion, CoachMemory, LoopNode } from '@/db/types'
import { analyse } from '../language'
import { actionableLeaves, type NodeMap } from '../nodes'
import { DAYS_DA, PART_LABELS, partOfDay } from '../time'
import type { TimePart } from '@/db/types'

/**
 * Patterns in her own data.
 *
 * This is the part of the coach that can genuinely know something she does
 * not, and it does not require being clever about language — only about
 * arithmetic on what actually happened. Which kinds of task rot. Which hour
 * she really finishes things. Whether breaking something down changes anything
 * for her specifically, or is just something the app believes.
 *
 * Two rules make these safe to say out loud:
 *  - Nothing is claimed below a minimum sample. A pattern from three data
 *    points is a coincidence with a confident voice, and being confidently
 *    wrong about someone's own mind is the fastest way to lose them.
 *  - Every observation carries its evidence, so it is offered as a reading of
 *    the data rather than a verdict about her.
 */

export interface Observation {
  id: string
  kind: CoachMemory['kind']
  /** The finding, in one sentence. */
  text: string
  /** The numbers behind it. */
  evidence: string
  /** What follows from it, if anything. */
  move?: string
  /** Higher is more worth saying. */
  weight: number
}

const DAY = 86_400_000

/** Below this, silence is more honest than a pattern. */
const MIN_SAMPLE = 6

export function observe(nodes: LoopNode[], map: NodeMap, completions: Completion[], now = Date.now()): Observation[] {
  const out: Observation[] = []
  const done = completions.filter((c) => c.kind === 'done')

  out.push(...whenSheFinishes(done))
  out.push(...whatRots(map, now))
  out.push(...doStepsHelp(nodes, done))
  out.push(...startedButUnfinished(nodes, now))
  out.push(...deadDay(done))
  out.push(...droppingIsWorking(completions))

  return out.sort((a, b) => b.weight - a.weight)
}

/** The hour she actually closes things, which is rarely the hour she plans for. */
function whenSheFinishes(done: Completion[]): Observation[] {
  if (done.length < MIN_SAMPLE * 2) return []
  const byPart: Record<TimePart, number> = { morning: 0, midday: 0, afternoon: 0, evening: 0 }
  for (const c of done) byPart[partOfDay(new Date(c.completedAt))]++

  const entries = Object.entries(byPart) as Array<[TimePart, number]>
  entries.sort((a, b) => b[1] - a[1])
  const [top, count] = entries[0]
  const share = count / done.length
  if (share < 0.4) return []

  return [
    {
      id: 'peak-hour',
      kind: 'pattern',
      text: `Du lukker det meste ${PART_LABELS[top].toLowerCase()}.`,
      evidence: `${Math.round(share * 100)}% af dine lukkede loops (${count} af ${done.length}).`,
      move: `Det er værd at lægge det, du helst vil undgå, ${PART_LABELS[top].toLowerCase()} — ikke fordi du burde, men fordi det er der, det rent faktisk sker.`,
      weight: 60 + share * 20,
    },
  ]
}

/**
 * Which kind of task rots.
 *
 * Grouped by the verb, because "ring til lægen", "ring til banken" and "ring
 * til skolen" are the same problem wearing different clothes — and seeing that
 * they are one problem is exactly what is hard from the inside.
 */
function whatRots(map: NodeMap, now: number): Observation[] {
  const open = actionableLeaves(map, undefined, now)
  if (open.length < MIN_SAMPLE) return []

  const byVerb = new Map<string, { ages: number[]; titles: string[] }>()
  for (const node of open) {
    const verb = analyse(node.title).verb
    if (!verb) continue
    const entry = byVerb.get(verb) ?? { ages: [], titles: [] }
    entry.ages.push((now - node.createdAt) / DAY)
    entry.titles.push(node.title)
    byVerb.set(verb, entry)
  }

  const overallAvg = open.reduce((sum, n) => sum + (now - n.createdAt) / DAY, 0) / open.length

  const out: Observation[] = []
  for (const [verb, entry] of byVerb) {
    if (entry.ages.length < 3) continue
    const avg = entry.ages.reduce((a, b) => a + b, 0) / entry.ages.length
    if (avg < overallAvg * 1.8 || avg < 5) continue

    out.push({
      id: `rots-${verb}`,
      kind: 'pattern',
      text: `Det er ikke opgaverne — det er én bestemt slags. ${VERB_NOUN[verb] ?? `"${verb}"-opgaver`} bliver liggende.`,
      evidence: `De ligger ${Math.round(avg)} dage i snit, mod ${Math.round(overallAvg)} for alt andet. ${entry.titles.slice(0, 2).join(', ')}${entry.titles.length > 2 ? ' og flere' : ''}.`,
      move: MOVE_FOR_VERB[verb],
      weight: 80 + Math.min(avg, 30),
    })
  }
  return out
}

const VERB_NOUN: Record<string, string> = {
  ring: 'Telefonopkald',
  kontakt: 'Det at skulle kontakte nogen',
  skriv: 'Det du selv skal formulere',
  betal: 'Regninger',
  book: 'Det at skulle booke noget',
  udfyld: 'Blanketter',
  ansøg: 'Ansøgninger',
  ryd: 'Oprydning',
  rengør: 'Rengøring',
  find: 'Det at skulle finde noget frem',
  beslut: 'Beslutninger',
  aflever: 'Ærinder ud af huset',
  svar: 'Svar du skylder nogen',
}

const MOVE_FOR_VERB: Record<string, string> = {
  ring:
    'Et opkald har tre ting i sig: at finde nummeret, at vide hvad man siger, og selve samtalen. Det er sjældent samtalen, der stopper det. Prøv at lave de to første som separate, færdige opgaver.',
  skriv:
    'Når du selv skal formulere noget, er der ingen ydre struktur at læne sig op ad. Dikter det i stedet — appen skriver ned, og du retter bagefter.',
  beslut:
    'En beslutning uden deadline har ingen naturlig afslutning. Sæt en tid på hvornår du vælger, ikke hvornår du er færdig.',
  ryd: 'Oprydning har ingen defineret slutning — derfor starter den aldrig. Sæt en timer i stedet for et mål.',
  rengør: 'Rengøring har ingen defineret slutning. En timer giver den en.',
  aflever:
    'Ærinder kræver en overgang ud af huset, og overgangen er det dyre. Kobl det på noget du alligevel skal.',
}

/** Whether breaking things down changes anything for her, or is just doctrine. */
function doStepsHelp(nodes: LoopNode[], done: Completion[]): Observation[] {
  const withSteps = nodes.filter((n) => n.steps.length > 0)
  const withoutSteps = nodes.filter((n) => n.steps.length === 0 && !n.isArea)
  if (withSteps.length < MIN_SAMPLE || withoutSteps.length < MIN_SAMPLE) return []

  const doneIds = new Set(done.map((c) => c.nodeId))
  const rateWith = withSteps.filter((n) => doneIds.has(n.id)).length / withSteps.length
  const rateWithout = withoutSteps.filter((n) => doneIds.has(n.id)).length / withoutSteps.length
  if (rateWith < rateWithout * 1.4) return []

  return [
    {
      id: 'steps-help',
      kind: 'pattern',
      text: 'Opdelte opgaver bliver lukket. De udelte bliver liggende.',
      evidence: `${Math.round(rateWith * 100)}% mod ${Math.round(rateWithout * 100)}% hos dig.`,
      move: 'Det er værd at dele noget op, før du overhovedet beslutter om du gider — ikke bagefter.',
      weight: 70,
    },
  ]
}

/** Starting is not her problem if things stall after the start. */
function startedButUnfinished(nodes: LoopNode[], now: number): Observation[] {
  const stalled = nodes.filter(
    (n) => n.status === 'active' && n.startedAt && now - n.startedAt > 2 * DAY,
  )
  if (stalled.length < 3) return []

  return [
    {
      id: 'stalls-after-start',
      kind: 'pattern',
      text: 'Du starter fint. Det er midten, der taber dig.',
      evidence: `${stalled.length} loops står som påbegyndte og har ikke rykket sig i over to dage.`,
      move:
        'Det peger på afbrydelser og skift, ikke på igangsætning. Det, der hjælper der, er at gemme hvor du kom til — ikke en ny start.',
      weight: 75,
    },
  ]
}

/** A weekday that reliably goes nowhere is worth knowing about, not fixing. */
function deadDay(done: Completion[]): Observation[] {
  if (done.length < MIN_SAMPLE * 3) return []
  const byDay = new Array(7).fill(0)
  const daysSeen = new Set<string>()
  for (const c of done) {
    const d = new Date(c.completedAt)
    byDay[d.getDay()]++
    daysSeen.add(d.toDateString())
  }
  if (daysSeen.size < 10) return []

  const total = done.length
  const min = Math.min(...byDay)
  const day = byDay.indexOf(min)
  if (min / total > 0.06) return []

  return [
    {
      id: 'dead-day',
      kind: 'pattern',
      text: `${DAYS_DA[day]} er din tomme dag.`,
      evidence: `${min} lukkede loops ud af ${total} falder på en ${DAYS_DA[day].toLowerCase()}.`,
      move: `Det er ikke et problem, der skal løses. Det er værd at holde ${DAYS_DA[day].toLowerCase()} fri med vilje, i stedet for at planlægge den og skuffe dig selv.`,
      weight: 55,
    },
  ]
}

/** Deciding something is not important is work, and she may not count it. */
function droppingIsWorking(completions: Completion[]): Observation[] {
  const dropped = completions.filter((c) => c.kind === 'dropped')
  if (dropped.length < 4) return []
  return [
    {
      id: 'dropping',
      kind: 'win',
      text: 'Du er blevet god til at vælge fra.',
      evidence: `${dropped.length} loops er lukket, fordi du besluttede at de ikke var vigtige.`,
      move: 'Det tæller som arbejde. Det er tit den sværeste af de to måder at lukke noget på.',
      weight: 50,
    },
  ]
}

/** Converts an observation into something storable. */
export function toMemory(o: Observation): CoachMemory {
  return {
    id: o.id,
    kind: o.kind,
    text: o.text,
    evidence: o.evidence,
    createdAt: Date.now(),
    strength: 1,
  }
}
