/**
 * Taking things out of her head, mid conversation.
 *
 * Most of what an ADHD brain is carrying gets said out loud long before it
 * gets written down anywhere, and the moment between saying it and writing it
 * down is exactly where it disappears. So when something she says in the chat
 * is a thing she has to do, the coach offers to keep it. No typing, no
 * switching screens, no second app.
 *
 * The size of what she says changes what happens. One or two things get taken
 * straight in, because asking about them costs more than it saves. A whole
 * head emptied at once does not: five things arriving as five silent new rows
 * is the same overwhelm she came here to get rid of. Those get worked through
 * one at a time, and she decides each one.
 */

import { CERTAIN, parseBrainDump, type ParsedLoop } from '@/lib/brainDump'
import type { NodeMap } from '@/lib/nodes'
import { understand } from './understand'

/** Above this many, we work through them together rather than just filing them. */
export const MANY = 3

export interface CaptureResult {
  items: ParsedLoop[]
  /** True when there is enough here that it should be worked through, not filed. */
  many: boolean
  /**
   * Things she just said that the app already has.
   *
   * Worth saying out loud rather than dropping in silence. Half of what an
   * ADHD brain carries is carried because it does not trust that anything else
   * is holding it, and "den ligger der allerede" puts one of them down.
   */
  already: string[]
}

/**
 * Things that look like tasks to a parser but are not things she is telling
 * the app to remember. Questions, requests aimed at the coach, and reports of
 * what she just did.
 */
const NOT_A_CAPTURE =
  /^\s*(?:hvad|hvorn[åa]r|hvordan|hvorfor|hvem|hvor|kan du|vil du|skal du|hj[æa]lp|giv mig|find|start|[åa]bn|luk|slet|flyt|park|del den|tak)\b/i

/**
 * A report, not a request. "Jeg har åbnet den" is her telling the coach how it
 * went, and filing it as "Åbn den" hands her back the thing she just finished.
 * Any perfect tense counts, not a list of verbs we thought of.
 */
const ALREADY_DONE =
  /\b(?:jeg|vi) (?:lige )?har (?:lige )?[a-zæøå]+(?:et|t|de)\b|\bden er (?:gjort|klaret|f[æa]rdig|lavet|betalt|sendt|[åa]bnet)\b/i

/**
 * A confession, not a task.
 *
 * "Jeg har ikke lavet noget i tre dage" is the hardest thing she is likely to
 * type, and turning it into a to-do called "Har ikke lavet noget i tre dage"
 * is the single worst thing the app could do with it. Anything negated is left
 * alone and answered as what it is.
 */
const NEGATED =
  /\b(?:har|er|f[åa]r|kan|vil|nåede|fik|orkede) (?:bare |lige |simpelthen |overhovedet )?ikke\b|\bikke (?:f[åa]et|lavet|n[åa]et|gjort|kunnet|orket)\b|\baldrig\b/i

/**
 * Does this message carry things she has to do?
 *
 * Deliberately strict. A false positive here silently adds a row to a list
 * that must stay trustworthy, and a list you have to audit is worse than no
 * list. So: only confident tasks, only ones that are not already in the tree,
 * and nothing from a message that is plainly a question or a command.
 */
export function detectCaptures(text: string, map: NodeMap, now = new Date()): CaptureResult | null {
  const t = text.trim()
  if (t.length < 6) return null
  // Asking for help is not a task to be filed. The dispatcher checks this too;
  // it is repeated here because this is the module that must never get it
  // wrong, and "jeg har brug for hjælp til at sortere mine taks" becoming a
  // to-do called "Hjælp til at sortere mine taks" is the exact failure.
  if (understand(t).isRequest) return null
  if (NOT_A_CAPTURE.test(t)) return null
  if (ALREADY_DONE.test(t)) return null
  if (NEGATED.test(t)) return null

  const parsed = parseBrainDump(t, { now })
  const existing = new Set(
    Object.values(map)
      .filter((n) => n.status !== 'done')
      .map((n) => n.title.trim().toLowerCase()),
  )

  const candidates = parsed.filter((p) => p.kind === 'task' && p.confidence >= CERTAIN)
  const items = candidates.filter((p) => !existing.has(p.title.trim().toLowerCase()))
  const already = candidates.filter((p) => existing.has(p.title.trim().toLowerCase())).map((p) => p.title)
  if (!items.length && !already.length) return null

  return { items, many: items.length >= MANY, already }
}

/** "Den ligger der allerede", said so she can stop holding it. */
export function alreadyLine(already: string[]): string | null {
  if (!already.length) return null
  if (already.length === 1) return `“${already[0]}” ligger der allerede. Den er ikke glemt.`
  return `${already.map((t) => `“${t}”`).join(' og ')} ligger der allerede. De er ikke glemt.`
}

/** What the coach says when it wants to keep one or two things. */
export function captureOffer(items: ParsedLoop[]): string[] {
  if (items.length === 1) {
    return [
      `Jeg hørte en opgave i det: "${items[0].title}".`,
      'Skal jeg lægge den ind, så du ikke skal huske på den?',
    ]
  }
  return [
    'Der lå to ting i det:',
    items.map((i) => `“${i.title}”`).join(' og '),
    'Skal jeg lægge dem ind?',
  ]
}

/** What it says when she has emptied a lot at once. */
export function manyOffer(items: ParsedLoop[]): string[] {
  return [
    `Der er ${items.length} ting i det, du lige skrev.`,
    'Det er for meget at læsse ind på én gang uden at kigge på det. Vi tager dem én ad gangen, og du siger til eller fra.',
    `Første: “${items[0].title}”. Er den din?`,
  ]
}
