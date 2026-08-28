import { db } from '@/db/db'
import type { Completion, LifeArea, RewardEvent, UserPreferences } from '@/db/types'
import { partOfDay, PART_LABELS } from './time'
import type { TimePart } from '@/db/types'

/**
 * The quiet statistics.
 *
 * Kept out of the way on purpose — they live behind Settings, not on the home
 * screen, because a number on the front page becomes a target and a target
 * becomes pressure. Down here they do the other job: on a bad day, evidence
 * that the thing has actually been working.
 *
 * Every figure is either counted from real events or explicitly labelled an
 * estimate. Money in particular is only ever what she told the app a task was
 * worth, or an estimate from an hourly rate she set herself.
 */

export interface Stats {
  closed: number
  dropped: number
  delegated: number
  /** Minutes of work she is no longer carrying. */
  minutesClosed: number
  /** Loops she had pushed away at least twice before closing them. */
  avoidedClosed: number
  starts: number
  brainDumps: number
  totalXP: number
  claimedDKK: number
  /** Only ever the sum of values she put on tasks herself. */
  earnedExact: number
  /** How her time estimates compare to reality, once there is enough to tell. */
  timeFactor: number | null
  timeSamples: number
  /** When she actually closes things. */
  bestPart: TimePart | null
  byPart: Record<TimePart, number>
  byArea: Array<{ area: LifeArea; count: number }>
  firstDay: number | null
  activeDays: number
}

const AREA_LABELS: Record<LifeArea, string> = {
  work: 'Arbejde',
  home: 'Hjem',
  personal: 'Mig',
  family: 'Familie',
  money: 'Økonomi',
  health: 'Sundhed',
  admin: 'Administration',
  other: 'Løst og fast',
}

export function areaLabel(area: LifeArea): string {
  return AREA_LABELS[area] ?? AREA_LABELS.other
}

export async function loadStats(prefs: UserPreferences): Promise<Stats> {
  const [completions, rewards, claimed, dumpCount] = await Promise.all([
    db.completions.toArray(),
    db.rewards.toArray(),
    db.claimed.toArray(),
    db.dumps.count(),
  ])

  const byPart: Record<TimePart, number> = { morning: 0, midday: 0, afternoon: 0, evening: 0 }
  const areaCounts = new Map<LifeArea, number>()
  const days = new Set<string>()

  let closed = 0
  let dropped = 0
  let delegated = 0
  let minutesClosed = 0
  let avoidedClosed = 0
  let earnedExact = 0
  const ratios: number[] = []

  for (const c of completions as Completion[]) {
    days.add(new Date(c.completedAt).toDateString())
    if (c.kind === 'done') closed++
    else if (c.kind === 'dropped') dropped++
    else delegated++

    if (c.kind === 'done') {
      minutesClosed += c.minutes ?? 0
      if (c.wasAvoided) avoidedClosed++
      if (c.valueDKK) earnedExact += c.valueDKK
      if (c.actualMinutes && c.minutes) ratios.push(c.actualMinutes / c.minutes)
      byPart[partOfDay(new Date(c.completedAt))]++
      const area = c.area ?? 'other'
      areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1)
    }
  }

  const bestPart =
    (Object.entries(byPart) as Array<[TimePart, number]>).reduce<[TimePart, number] | null>(
      (best, entry) => (!best || entry[1] > best[1] ? entry : best),
      null,
    )?.[0] ?? null

  return {
    closed,
    dropped,
    delegated,
    minutesClosed,
    avoidedClosed,
    starts: (rewards as RewardEvent[]).filter((r) => r.kind === 'task-started').length,
    brainDumps: dumpCount,
    totalXP: prefs.totalXP,
    claimedDKK: claimed.reduce((sum, c) => sum + c.amountDKK, 0),
    earnedExact,
    timeFactor: ratios.length >= MIN_SAMPLES ? median(ratios) : null,
    timeSamples: ratios.length,
    bestPart: closed >= 5 ? bestPart : null,
    byPart,
    byArea: [...areaCounts.entries()]
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count),
    firstDay: completions.length
      ? Math.min(...completions.map((c) => c.completedAt))
      : null,
    activeDays: days.size,
  }
}

/** Enough completions that the ratio means something rather than noise. */
const MIN_SAMPLES = 5

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function partLabel(part: TimePart): string {
  return PART_LABELS[part]
}

/** "9 timer" / "45 minutter" — the time she is no longer carrying. */
export function humanHours(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} minutter`
  const hours = minutes / 60
  if (hours < 10) return `${hours.toFixed(1).replace('.', ',').replace(',0', '')} timer`
  return `${Math.round(hours)} timer`
}

export function kr(amount: number): string {
  return `${Math.round(amount).toLocaleString('da-DK')} kr.`
}
