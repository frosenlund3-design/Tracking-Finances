import type { EnergyLevel, LoopNode, UserPreferences } from '@/db/types'
import { isoDate } from './time'
import { necessaryToday } from './deadlines'
import type { NodeMap } from './nodes'

/**
 * "Der er ikke noget, du skal lige nu."
 *
 * That sentence is the most valuable screen in the app, and until now it was
 * unreachable, it only appeared when literally every loop was closed, which
 * for a person with a full life is never. So it never did its job.
 *
 * Two ways to reach it now:
 *  1. Close a small number of loops. The number scales with the energy she
 *     said she had, and it is small on purpose, three closed loops on a
 *     30% day is a good day, not a failure to reach ten.
 *  2. Say so. "Jeg er færdig for i dag" is a legitimate decision, exactly
 *     like parking something, and it takes one tap.
 *
 * It is never a lock. There is always a quiet way to ask for one more.
 *
 * But it is gated. Feeling finished while a deadline runs out tonight is worse
 * than not feeling finished at all, that is the app helping her miss
 * something. So the finished screen only appears when nothing that genuinely
 * cannot wait is still open. Everything else (the eighteen someday loops) is
 * exactly what she is allowed to feel finished in spite of.
 */

/**
 * Small enough to reach before bedtime, big enough that it does not arrive the
 * moment she closes one thing.
 */
export function dailyGoal(energy: EnergyLevel): number {
  if (energy <= 10) return 2
  if (energy <= 30) return 3
  if (energy <= 60) return 4
  return 5
}

export interface EnoughState {
  /** Today's target, including anything she asked for on top. */
  goal: number
  /** Loops added beyond the base goal by asking for more. */
  extra: number
  closed: number
  /** True when the day is finished, whether reached or declared. */
  done: boolean
  /** She pressed the button rather than reaching the goal. */
  declared: boolean
  /** How much the load has come down since this morning. */
  loadDrop: number
  /** Things that genuinely cannot wait until tomorrow. */
  necessary: LoopNode[]
  /** The goal is met, but something real is still standing in the way. */
  blocked: boolean
}

export function enoughState(
  prefs: UserPreferences,
  closedToday: number,
  loadPercent: number,
  map: NodeMap,
  now = new Date(),
): EnoughState {
  const today = isoDate(now)
  const extra = prefs.extraTodayDate === today ? (prefs.extraToday ?? 0) : 0
  const goal = dailyGoal(prefs.currentEnergy) + extra
  const declared = prefs.doneForDay === today
  const snapshot = prefs.loadSnapshotDate === today ? prefs.loadSnapshot : undefined
  const necessary = necessaryToday(map, now.getTime())
  const reached = closedToday >= goal

  return {
    goal,
    extra,
    closed: closedToday,
    // Declaring it done is hers to make even with things outstanding, she is
    // asked to confirm first, and then it is a decision, not an accident.
    done: declared || (reached && necessary.length === 0),
    declared,
    loadDrop: snapshot !== undefined ? Math.max(0, snapshot - loadPercent) : 0,
    necessary,
    blocked: reached && necessary.length > 0 && !declared,
  }
}

/** Warm, finished, and pointing away from the screen. */
export function enoughHeadline(state: EnoughState): string {
  if (state.declared && state.closed === 0) return 'Så lukker vi ned for i dag'
  if (state.closed === 0) return 'Der er ikke noget, du skal lige nu'
  if (state.closed >= state.goal + 2) return 'Det var mere end nok for i dag'
  return 'Det var nok for i dag'
}

export function enoughBody(state: EnoughState): string {
  if (state.closed === 0) {
    return 'Ligger der noget i hovedet alligevel, så læg det herned. Ellers behøver du ikke være her.'
  }
  const loops = `Du lukkede ${state.closed} ${state.closed === 1 ? 'loop' : 'loops'} i dag.`
  if (state.loadDrop >= 3) return `${loops} Mental load er faldet ${Math.round(state.loadDrop)}% siden i morges.`
  return `${loops} Resten venter, og det er helt fint.`
}

/** Shown when the goal is met but something real is still open. */
export function blockedHeadline(state: EnoughState): string {
  const n = state.necessary.length
  if (n === 1) return 'Du har lavet nok, der er bare én ting med en tid'
  return `Du har lavet nok, der er ${n} ting med en tid i dag`
}
