import type { EnergyLevel, LifeArea, LoopNode, TimePart, UserProfile } from '@/db/types'
import { actionableLeaves, type NodeMap } from './nodes'
import { addDays, isoDate, PARTS, PART_LABELS } from './time'
import { hoursUntil, isAppointment } from './deadlines'
import { calibratedMinutes, type Calibration } from './calibration'

/**
 * Placing loops on the week.
 *
 * The point is not to fill a calendar, a full calendar is the thing she
 * already refuses to use. The point is that when something *does* have a
 * sensible moment, the app should know it and say so, instead of leaving her
 * to work it out at the exact moment she has least capacity to.
 *
 * Four rules do most of the work, and all four are things a person would say
 * out loud:
 *
 *  1. You cannot ring the dentist at nine at night, or on a Sunday. Anything
 *     that depends on someone else being open only lands on a weekday, in
 *     working hours.
 *  2. Heavy things go where her fuel is. She told the app when she has energy
 *     during onboarding; a demanding loop goes there and a small one fills the
 *     flat parts of the day.
 *  3. Nothing lands after its deadline, and a deadline gets a day of slack in
 *     front of it, planning something for the afternoon it is due is planning
 *     to miss it.
 *  4. A slot holds far less than it technically could. Three quarters of an
 *     hour, and time already taken by a real appointment comes off the top.
 *
 * Everything it produces is a proposal. Nothing is moved until she says yes,
 * and most loops are deliberately left unplaced.
 */

export interface PlannedItem {
  node: LoopNode
  date: string
  part: TimePart
  /** One short sentence saying why here. Shown next to the proposal. */
  reason: string
}

export interface Plan {
  items: PlannedItem[]
  /** Loops the planner deliberately left alone. */
  skipped: number
}

/** Realistic, not optimistic. An overfilled slot is a slot she ignores. */
const SLOT_MINUTES: Record<TimePart, number> = {
  morning: 40,
  midday: 45,
  afternoon: 45,
  evening: 30,
}

/** At most this many loops in one part of a day, however short they are. */
const MAX_PER_SLOT = 2

/** How far ahead to plan. A week is enough to be useful and short enough to trust. */
const HORIZON_DAYS = 7

/** Things that need someone else to be open. */
const OFFICE_HOURS =
  /\b(ring|opkald|telefon|kontakt|l[æa]ge|tandl[æa]ge|bank|kommune|borger|myndighed|jobcenter|apotek|fris[øo]r|v[æa]rksted|butik|forsikring|sagsbehandler|skat)\w*/i

/** Errands that need daylight and open shops, but not a weekday. */
const DAYLIGHT = /\b(k[øo]b|indk[øo]b|handle|hent|aflever|post(?:hus)?|genbrug|apotek)\w*/i

const OFFICE_AREAS: LifeArea[] = ['admin']

export function needsOfficeHours(node: LoopNode): boolean {
  return OFFICE_HOURS.test(node.title) || OFFICE_AREAS.includes(node.area)
}

export function needsDaylight(node: LoopNode): boolean {
  return DAYLIGHT.test(node.title)
}

/** How much fuel a slot realistically offers this particular person. */
export function slotEnergy(part: TimePart, peak: UserProfile['energyPeak']): EnergyLevel {
  if (part === 'evening') return peak === 'evening' ? 60 : 30
  // "Det skifter totalt" is a common answer, and treating every slot as
  // middling meant a demanding loop could never be placed anywhere at all.
  // The middle of the day is the fair default for a brain without a pattern.
  if (peak === 'varies') return part === 'midday' || part === 'afternoon' ? 100 : 60
  const peakParts: Record<Exclude<UserProfile['energyPeak'], 'varies'>, TimePart[]> = {
    morning: ['morning', 'midday'],
    midday: ['midday', 'afternoon'],
    evening: ['evening', 'afternoon'],
  }
  return peakParts[peak].includes(part) ? 100 : 60
}

function isWeekend(date: string): boolean {
  const day = new Date(date).getDay()
  return day === 0 || day === 6
}

interface Slot {
  date: string
  part: TimePart
  minutesLeft: number
  count: number
}

function buildSlots(map: NodeMap, now: Date, cal: Calibration): Slot[] {
  const slots: Slot[] = []
  const currentPart = partIndexFor(now)

  for (let d = 0; d < HORIZON_DAYS; d++) {
    const date = isoDate(addDays(now, d))
    PARTS.forEach((part, i) => {
      // Never plan something into a part of today that has already passed.
      if (d === 0 && i <= currentPart) return
      slots.push({ date, part, minutesLeft: SLOT_MINUTES[part], count: 0 })
    })
  }

  // Real appointments take their time out of the slot before anything else.
  for (const node of Object.values(map)) {
    if (!isAppointment(node) || !node.dueAt) continue
    const date = isoDate(new Date(node.dueAt))
    const part = partOfTimestamp(node.dueAt)
    const slot = slots.find((s) => s.date === date && s.part === part)
    if (slot) {
      slot.minutesLeft -= calibratedMinutes(node.estimatedMinutes, cal) + 30
      slot.count += 1
    }
  }

  return slots
}

function partIndexFor(now: Date): number {
  const h = now.getHours()
  if (h < 10) return -1
  if (h < 13) return 0
  if (h < 18) return 1
  return 2
}

function partOfTimestamp(ts: number): TimePart {
  const h = new Date(ts).getHours()
  if (h < 10) return 'morning'
  if (h < 13) return 'midday'
  if (h < 18) return 'afternoon'
  return 'evening'
}

interface Fit {
  score: number
  reason: string
}

/** Can this loop go in this slot at all, and if so how well does it sit? */
function fit(node: LoopNode, slot: Slot, minutes: number, peak: UserProfile['energyPeak'], now: Date): Fit | null {
  if (slot.minutesLeft < minutes) return null
  if (slot.count >= MAX_PER_SLOT) return null

  const weekend = isWeekend(slot.date)

  // --- hard rules ---------------------------------------------------------
  if (needsOfficeHours(node)) {
    if (weekend || slot.part === 'evening') return null
  }
  if (needsDaylight(node) && slot.part === 'evening') return null

  if (node.dueAt) {
    const slotStart = new Date(`${slot.date}T${{ morning: '08', midday: '10', afternoon: '13', evening: '18' }[slot.part]}:00`)
    // A day of slack: finishing something the afternoon it is due is planning
    // to miss it.
    if (slotStart.getTime() > node.dueAt - 12 * 3_600_000) return null
  }

  // --- preference ---------------------------------------------------------
  let score = 40
  const reasons: string[] = []

  const available = slotEnergy(slot.part, peak)
  if (node.energyRequired <= available) {
    score += 20 - Math.min((available - node.energyRequired) / 5, 12)
    if (node.energyRequired >= 60 && available >= 100) {
      reasons.push('du har mest energi der')
    }
  } else {
    return null
  }

  if (needsOfficeHours(node) && (slot.part === 'morning' || slot.part === 'midday')) {
    score += 14
    reasons.push('der har de åbent')
  }

  if (node.dueAt) {
    const daysBefore = (node.dueAt - new Date(slot.date).getTime()) / 86_400_000
    score += Math.max(0, 22 - daysBefore * 4)
    if (daysBefore <= 2) reasons.push('i god tid inden fristen')
  } else {
    // Without a deadline, sooner is mildly better, but not urgent.
    const daysOut = (new Date(slot.date).getTime() - now.getTime()) / 86_400_000
    score += Math.max(0, 8 - daysOut)
  }

  if (slot.part === 'evening' && minutes <= 10) {
    score += 6
    reasons.push('den er lille nok til en aften')
  }

  return { score, reason: reasons[0] ?? 'der er plads' }
}

export interface PlanOptions {
  profile: Pick<UserProfile, 'energyPeak'>
  calibration: Calibration
  now?: Date
  /** Don't propose more than this in one go. */
  max?: number
}

export function buildPlan(map: NodeMap, opts: PlanOptions): Plan {
  const now = opts.now ?? new Date()
  const slots = buildSlots(map, now, opts.calibration)

  const candidates = actionableLeaves(map, undefined, now.getTime())
    .filter((n) => !isAppointment(n))
    // Something she already put on a day stays where she put it.
    .filter((n) => !n.scheduledDate)
    .sort((a, b) => {
      // Deadlines first, then the things that have waited longest.
      const ah = a.dueAt ? hoursUntil(a, now.getTime()) : Infinity
      const bh = b.dueAt ? hoursUntil(b, now.getTime()) : Infinity
      if (ah !== bh) return ah - bh
      return a.createdAt - b.createdAt
    })

  const items: PlannedItem[] = []
  const max = opts.max ?? 8
  let skipped = 0

  for (const node of candidates) {
    if (items.length >= max) {
      skipped++
      continue
    }
    const minutes = calibratedMinutes(node.estimatedMinutes, opts.calibration)

    let best: { slot: Slot; fit: Fit } | null = null
    for (const slot of slots) {
      const f = fit(node, slot, minutes, opts.profile.energyPeak, now)
      if (!f) continue
      if (!best || f.score > best.fit.score) best = { slot, fit: f }
    }

    if (!best) {
      skipped++
      continue
    }

    best.slot.minutesLeft -= minutes
    best.slot.count += 1
    items.push({ node, date: best.slot.date, part: best.slot.part, reason: best.fit.reason })
  }

  return { items, skipped }
}

export function partName(part: TimePart): string {
  return PART_LABELS[part]
}
