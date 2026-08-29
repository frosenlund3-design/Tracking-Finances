/**
 * Hvad nu, og hvorfor lige den.
 *
 * She said two things about the old version of this, and they are the same
 * thing said twice:
 *
 *   "jeg føler det er ret random hvilken task den putter ind som den jeg skal
 *    lave nu"
 *   "selvom jeg har puttet alle mine mental load ind, synes jeg stadig det er
 *    mega uoverskueligt"
 *
 * Both were fair, and both came from one design mistake. The scoring engine
 * added up eight components into a number out of a hundred, and then sorted on
 * it. That works when the components disagree strongly and fails completely
 * when they do not: twenty open loops with no deadline all land within a few
 * points of each other, the top one changes when the clock crosses an hour or
 * the energy slider moves, and there is no answer to "why that one". A ranking
 * you cannot interrogate is indistinguishable from a random draw, and she is
 * far too clever not to notice.
 *
 * Three changes, in order of how much they matter.
 *
 * ── Tiers before points ────────────────────────────────────────────────────
 *
 * Order is decided first by a category, and only inside a category by the
 * score. A real deadline beats everything. Something already started beats
 * something not. That makes the ordering explainable in one sentence, and it
 * makes it stable, because a task does not drift between tiers when the hour
 * changes.
 *
 * ── The list is three things, not everything ───────────────────────────────
 *
 * Entering all of it was the right thing to do and it should not be punished
 * by a longer list to look at. The shortlist is at most three, chosen once for
 * the day and kept, and the rest is genuinely out of sight rather than sorted
 * lower. This is the only part of the app that has any business showing her a
 * number of things at once.
 *
 * ── Routines are not tasks ─────────────────────────────────────────────────
 *
 * A recurring chore is separated out entirely. Six daily household loops used
 * to sit in the same pool as "ring til kommunen" and shove it off the top,
 * which both buries the thing that matters and makes the list look bottomless.
 */

import type { LoopNode, UserPreferences } from '@/db/types'
import type { NodeMap } from './nodes'
import { actionableLeaves } from './nodes'
import { rankTasks, type ScoreContext, type ScoredTask } from './scoring'
import { hoursUntil, whenLabel } from './deadlines'
import { humanMinutes, isoDate } from './time'

export type Tier = 'must' | 'started' | 'today' | 'fits' | 'rest'

/** Lower sorts first. */
const TIER_ORDER: Record<Tier, number> = { must: 0, started: 1, today: 2, fits: 3, rest: 4 }

export const TIER_LABEL: Record<Tier, string> = {
  must: 'Har en rigtig frist',
  started: 'Du er i gang',
  today: 'Du har lagt den på i dag',
  fits: 'Passer til dig lige nu',
  rest: 'Kan vente',
}

export function tierOf(t: ScoredTask, ctx: ScoreContext): Tier {
  const node = t.node
  const now = ctx.now.getTime()

  // A real deadline inside a day. Nothing about energy or size may outrank
  // this, which is the whole reason she is allowed to put a time on something.
  if (node.dueAt && hoursUntil(node, now) <= 24) return 'must'
  if (node.status === 'active' || node.steps.some((s) => s.done)) return 'started'
  if (node.scheduledDate === isoDate(ctx.now)) return 'today'
  // Small enough that low energy is not an argument against it.
  if (node.estimatedMinutes <= 5 && node.energyRequired <= ctx.energy) return 'fits'
  return 'rest'
}

/** A loop that comes back is furniture, not a task on a list. */
export function isRoutine(node: LoopNode): boolean {
  return !!node.repeat
}

/**
 * Scheduled for a day that has not arrived.
 *
 * A recurring loop closed this morning is dated forward, and showing it again
 * this afternoon as something to do would make closing it meaningless.
 */
export function notYet(node: LoopNode, now: Date): boolean {
  return !!node.scheduledDate && node.scheduledDate > isoDate(now)
}

/** Tier first, then the score inside the tier, then the smaller one. */
export function orderTasks(tasks: ScoredTask[], ctx: ScoreContext): ScoredTask[] {
  return [...tasks].sort((a, b) => {
    const d = TIER_ORDER[tierOf(a, ctx)] - TIER_ORDER[tierOf(b, ctx)]
    if (d !== 0) return d
    return b.score - a.score || a.node.estimatedMinutes - b.node.estimatedMinutes
  })
}

export interface Focus {
  /** At most three, and the only thing the day screen leads with. */
  shortlist: ScoredTask[]
  /** The one to do now. */
  now: ScoredTask | null
  /** Why that one and not another, in her language, honest about ties. */
  why: string
  /** Routines due today, kept in their own group. */
  routines: ScoredTask[]
  /** Everything else. Not hidden, folded. */
  rest: ScoredTask[]
  /** Whether the shortlist was carried over rather than picked fresh. */
  kept: boolean
}

export const SHORTLIST_SIZE = 3

export interface FocusInput {
  map: NodeMap
  ctx: ScoreContext
  prefs: Pick<UserPreferences, 'focusDate' | 'focusIds'>
  skipped?: string[]
}

export function buildFocus({ map, ctx, prefs, skipped = [] }: FocusInput): Focus {
  const now = ctx.now
  const leaves = actionableLeaves(map, undefined, now.getTime()).filter((n) => !notYet(n, now))
  const scored = rankTasks(map, leaves, ctx)

  const routines = orderTasks(scored.filter((t) => isRoutine(t.node)), ctx)
  const tasks = orderTasks(scored.filter((t) => !isRoutine(t.node)), ctx)

  // What she was already told to look at today, minus whatever has since been
  // closed or skipped. Keeping it is the point: a shortlist that reshuffles
  // between two glances at the screen is not a shortlist.
  const today = isoDate(now)
  const carried =
    prefs.focusDate === today
      ? (prefs.focusIds ?? [])
          .map((id) => tasks.find((t) => t.node.id === id))
          .filter((t): t is ScoredTask => !!t && !skipped.includes(t.node.id))
      : []

  // Anything with a real deadline joins the shortlist whether or not it was on
  // it this morning, because a deadline that appeared since then is exactly the
  // thing a fixed list would hide.
  const must = tasks.filter((t) => tierOf(t, ctx) === 'must' && !carried.some((c) => c.node.id === t.node.id))

  const fill = (avoidSkipped: boolean) => {
    const out = [...must, ...carried]
    for (const t of tasks) {
      if (out.length >= SHORTLIST_SIZE) break
      if (out.some((s) => s.node.id === t.node.id)) continue
      if (avoidSkipped && skipped.includes(t.node.id)) continue
      out.push(t)
    }
    return out
  }

  // "Giv mig en anden" must always give another one. Once she has pushed
  // everything away, the honest thing is to offer something anyway rather than
  // to claim there is nothing there: she can see there is, and a screen that
  // says otherwise is the app calling her a liar about her own list.
  const shortlist = fill(true).length ? fill(true) : fill(false)
  const list = orderTasks(shortlist.slice(0, Math.max(SHORTLIST_SIZE, must.length)), ctx)

  const fresh = list.filter((t) => !skipped.includes(t.node.id))
  const pick = fresh[0] ?? list[0] ?? tasks[0] ?? routines[0] ?? null
  const chosenIds = new Set(list.map((t) => t.node.id))

  return {
    shortlist: list,
    now: pick,
    why: pick ? whyThis(pick, tasks, ctx) : '',
    routines,
    rest: tasks.filter((t) => !chosenIds.has(t.node.id)),
    kept: carried.length > 0,
  }
}

/**
 * Why this one.
 *
 * The rule that matters here is the last branch. When nothing actually
 * distinguishes the top few, the honest answer is that nothing distinguishes
 * them, and saying so is worth more than a confident sentence she can tell is
 * made up. Being told "der er ikke et rigtigt svar her" by a tool is the thing
 * that lets a person pick one and get going; being told a fabricated reason is
 * how they end up arguing with the app instead of doing anything.
 */
export function whyThis(pick: ScoredTask, all: ScoredTask[], ctx: ScoreContext): string {
  const node = pick.node
  const tier = tierOf(pick, ctx)
  const now = ctx.now.getTime()

  if (tier === 'must') {
    return `Den har en rigtig frist: ${whenLabel(node, now).toLowerCase()}. Det er hele grunden til, at den ligger øverst, ikke noget jeg har regnet mig frem til.`
  }
  if (tier === 'started') {
    const done = node.steps.filter((s) => s.done).length
    return done
      ? `Du er ${done} af ${node.steps.length} trin inde. At samle den op koster mindre end at starte forfra på noget andet.`
      : 'Du er allerede gået i gang med den. Den er billigere at samle op end alt andet på listen.'
  }
  if (tier === 'today') {
    return 'Du har selv lagt den på i dag. Jeg flytter den ikke bare, fordi noget andet ser nemmere ud.'
  }
  if (ctx.energy <= 30 && node.estimatedMinutes <= 5) {
    return `Du har sagt ${ctx.energy}% i tanken. Den her tager ${humanMinutes(node.estimatedMinutes)}, og den er en af de få, der passer til det tal.`
  }
  if (node.avoidanceCount >= 2) {
    return `Du har lagt den fra dig ${node.avoidanceCount} gange. Det er ikke en anklage, det er grunden: den bliver dyrere at bære end at lave.`
  }

  // Nothing separates the top of the list. Say that, and do not dress it up as
  // a calculation that came out in this one's favour: she can see the other
  // twelve, and a claim she can check and find false costs more than the
  // sentence was ever worth.
  const peers = all.filter((t) => tierOf(t, ctx) === tier && Math.abs(t.score - pick.score) <= 6)
  const smallest = peers.every((t) => t.node.estimatedMinutes >= node.estimatedMinutes)
  if (peers.length >= 3) {
    return smallest
      ? `Der er ${peers.length}, der er lige gode bud lige nu, og ingen af dem haster. Den her er den korteste af dem, og det er hele grunden. Føles en anden rigtigere, så tag den.`
      : `Der er ${peers.length}, der er lige gode bud lige nu, og ingen af dem haster. Så det her er ikke et regnestykke, den har vundet, det er bare den øverste. Føles en anden rigtigere, så tag den, du taber ikke noget på det.`
  }
  return 'Ingen af dem har en frist. Den ligger øverst på størrelse, hvor længe den har ligget, og hvor meget den fylder. Det er alt, der er i det.'
}
