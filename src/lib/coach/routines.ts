/**
 * What the coach says when she talks about her routines.
 *
 * The reply this replaces was the worst one in the app's history. She dictated
 * her whole everyday routine in one breath, and the coach answered with
 * bookkeeping about an unrelated task, because the words "hver dag" appeared
 * somewhere in the middle. So the bar here is low, but the opportunity is not:
 * a person listing what they already manage to do every day is handing over
 * the single most useful piece of information about themselves.
 *
 * ── The point the reply is built on ────────────────────────────────────────
 *
 * A routine she already keeps must not become a row on a list. It sounds like
 * a small design choice and it is not. Right now she is succeeding at wiping
 * the counter; the moment it becomes a tickable item, there is a way to fail
 * at it, and there will be a day it sits there unticked. Habit trackers do
 * this constantly, and it is why they end up feeling like a second job.
 *
 * What those routines are actually worth is the opposite thing. The scarcest
 * resource in a day with ADHD is a fixed point that arrives without anyone
 * deciding anything. She has several. Every new habit should be attached to
 * one of them rather than to a time, because a time is one more decision to
 * remember to make and the whole difficulty is upstream of that.
 *
 * ── What it is careful about ───────────────────────────────────────────────
 *
 * It does not explain what a habit is, or cite anybody. She knows. It says
 * what it heard, what it will do, and the one thing about her own list she
 * might not have looked at directly, and then it stops.
 */

import type { HabitMention, HabitReading } from '@/lib/habits'
import { anchorFrom, cadenceLabel } from '@/lib/habits'

export interface RoutineReply {
  lines: string[]
  options: string[]
  /** The ones to create as loops, if she says yes. */
  create: HabitMention[]
  /** The ones to keep as anchors, never as tasks. */
  anchors: HabitMention[]
}

function list(items: HabitMention[]): string {
  const names = items.map((h) => h.title.toLowerCase())
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} og ${names[names.length - 1]}`
}

/** Grouped by how often, so a mixed list does not read as one undifferentiated pile. */
function byCadence(items: HabitMention[]): string[] {
  const groups = new Map<string, HabitMention[]>()
  for (const h of items) {
    const key = cadenceLabel(h.cadence)
    groups.set(key, [...(groups.get(key) ?? []), h])
  }
  return [...groups.entries()].map(
    ([label, hs]) => `${label.charAt(0).toUpperCase()}${label.slice(1)}: ${list(hs)}`,
  )
}

export function routineReply(reading: HabitReading): RoutineReply {
  const { doing, wanted } = reading
  const lines: string[] = []

  // First, and before anything else: she is not going to apologise to software
  // for how she talks. Left unanswered it sits there as the last thing she
  // said, and next time she writes less.
  if (reading.apologised) {
    lines.push('Du skal ikke sige undskyld. Jeg fik det hele, også selvom det kom i én køre.')
  }

  if (doing.length) {
    lines.push(`Det her gør du allerede: ${list(doing)}.`)
    lines.push(
      'De skal ikke ind som opgaver. Du klarer dem, og i det sekund de bliver til noget, der kan stå uafkrydset, har du fået en ny måde at fejle på ved noget, der virker.',
    )
  }

  const anchor = anchorFrom(doing)

  if (wanted.length) {
    lines.push(`Det her vil du gerne have til at ske: ${list(wanted)}.`)
    const cadences = byCadence(wanted)
    if (cadences.length > 1 || wanted.some((h) => h.cadence.every > 1)) {
      lines.push(cadences.join('. ') + '.')
    }
    // Only the daily ones get the anchor. Hanging "vask gulv hver tredje dag"
    // on something that happens every morning is a plan that fires on the
    // wrong two mornings out of three, and a plan that is wrong more often
    // than it is right teaches her the whole technique does not work on her.
    if (anchor && wanted.some((h) => h.cadence.unit === 'day' && h.cadence.every === 1)) {
      lines.push(
        `De daglige hænger jeg på noget, du allerede rammer, i stedet for et klokkeslæt. "${anchor}" er den bedste, du har: den sker af sig selv, og så står du der i forvejen.`,
      )
    }
  }

  const medicine = wanted.find((h) => h.medicine) ?? doing.find((h) => h.medicine)
  if (medicine) {
    lines.push(
      'Medicinen er den eneste på listen, hvor en glemt dag ikke kan hentes ind senere. Den skal sidde på din mest sikre rutine, ikke på et tidspunkt. Og en doseringsæske gør, at du kan se svaret i stedet for at skulle huske det.',
    )
  }

  if (!wanted.length && doing.length) {
    lines.push('Vil du have noget nyt ind, så sig det, og jeg hænger det på en af dem her.')
    return { lines, options: ['Gem dem som mine faste punkter', 'Jeg vil have noget nyt ind'], create: [], anchors: doing }
  }

  const options = [
    wanted.length === 1 ? 'Læg den ind' : `Læg de ${wanted.length} ind`,
    'Kun nogle af dem',
    'Ikke lige nu',
  ]

  return { lines, options, create: wanted, anchors: doing }
}

/**
 * The line for "det her ligner en vane, ikke en opgave", about loops that are
 * already in the tree.
 *
 * Kept short and always plural-aware, because it is shown next to a list she
 * is already finding too long, and a paragraph there makes the problem worse
 * rather than better.
 */
export function habitsInListLine(titles: string[]): string | null {
  if (!titles.length) return null
  if (titles.length === 1) {
    return `“${titles[0]}” er en vane, ikke en opgave. Den kommer igen, uanset hvad du gør ved den i dag.`
  }
  return `${titles.length} af dem på listen er vaner, ikke opgaver: ${titles.map((t) => `“${t}”`).join(', ')}. De kommer igen af sig selv, og de fylder på listen som om de var noget, du kunne blive færdig med.`
}
