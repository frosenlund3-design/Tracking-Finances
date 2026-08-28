import type { EnergyLevel, UserPreferences } from '@/db/types'
import { isoDate } from './time'

/**
 * "Der er ikke noget, du skal lige nu."
 *
 * That sentence is the most valuable screen in the app, and until now it was
 * unreachable — it only appeared when literally every loop was closed, which
 * for a person with a full life is never. So it never did its job.
 *
 * Two ways to reach it now:
 *  1. Close a small number of loops. The number scales with the energy she
 *     said she had, and it is small on purpose — three closed loops on a
 *     30% day is a good day, not a failure to reach ten.
 *  2. Say so. "Jeg er færdig for i dag" is a legitimate decision, exactly
 *     like parking something, and it takes one tap.
 *
 * It is never a lock. There is always a quiet way to ask for one more.
 */

/** Deliberately small. The point is that it is reachable before bedtime. */
export function dailyGoal(energy: EnergyLevel): number {
  if (energy <= 10) return 1
  if (energy <= 30) return 2
  if (energy <= 60) return 3
  return 4
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
}

export function enoughState(
  prefs: UserPreferences,
  closedToday: number,
  loadPercent: number,
  now = new Date(),
): EnoughState {
  const today = isoDate(now)
  const extra = prefs.extraTodayDate === today ? (prefs.extraToday ?? 0) : 0
  const goal = dailyGoal(prefs.currentEnergy) + extra
  const declared = prefs.doneForDay === today
  const snapshot = prefs.loadSnapshotDate === today ? prefs.loadSnapshot : undefined
  return {
    goal,
    extra,
    closed: closedToday,
    done: declared || closedToday >= goal,
    declared,
    loadDrop: snapshot !== undefined ? Math.max(0, snapshot - loadPercent) : 0,
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
