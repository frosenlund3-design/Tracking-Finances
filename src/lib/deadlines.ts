import type { LoopNode } from '@/db/types'
import { actionableLeaves, descendantsOf, isOpen, isParkedNow, type NodeMap } from './nodes'
import { isoDate } from './time'
import { ROOT_ID } from '@/db/db'

/**
 * Real times.
 *
 * Most loops have no deadline, and inventing deadlines is exactly how a calm
 * system turns back into the stressful calendar she already refuses to use. So
 * a time is optional everywhere, but when one is genuinely real, it has to be
 * treated as real.
 *
 * Two different things, which behave differently:
 *   deadline   , must be finished by then. It can be worked on early, and it
 *                 should climb the priority list as it approaches.
 *   appointment, happens at that time whether or not you did anything. A
 *                 doctor's appointment or an exam is never "do this now"; it is
 *                 "be there at 14:30". Suggesting you start an exam at 09:12
 *                 would be nonsense, so appointments are kept out of the
 *                 what-now engine entirely and shown on their own.
 */

const DAY = 86_400_000

export function isAppointment(n: LoopNode): boolean {
  return n.dueKind === 'appointment' && !!n.dueAt
}

export function isDeadline(n: LoopNode): boolean {
  return n.dueKind !== 'appointment' && !!n.dueAt
}

export function hoursUntil(node: LoopNode, now = Date.now()): number {
  return node.dueAt ? (node.dueAt - now) / 3_600_000 : Infinity
}

/** Appointments today or later, soonest first. */
export function upcomingAppointments(map: NodeMap, now = Date.now(), days = 7): LoopNode[] {
  return descendantsOf(map, ROOT_ID)
    .filter(
      (n) =>
        isOpen(n) &&
        !isParkedNow(n, now) &&
        isAppointment(n) &&
        (n.dueAt as number) > now - 2 * 3_600_000 &&
        (n.dueAt as number) < now + days * DAY,
    )
    .sort((a, b) => (a.dueAt as number) - (b.dueAt as number))
}

export function appointmentsToday(map: NodeMap, now = Date.now()): LoopNode[] {
  const today = isoDate(new Date(now))
  return upcomingAppointments(map, now).filter((n) => isoDate(new Date(n.dueAt as number)) === today)
}

/**
 * The things that genuinely cannot wait until tomorrow.
 *
 * This is the gate on "det var nok for i dag". Feeling finished while a
 * deadline runs out tonight is worse than not feeling finished at all, it is
 * the app actively helping her miss something. So the finished screen is only
 * allowed when nothing here is left.
 */
export function necessaryToday(map: NodeMap, now = Date.now()): LoopNode[] {
  const today = isoDate(new Date(now))
  const endOfDay = new Date(new Date(now).setHours(23, 59, 59, 999)).getTime()

  return actionableLeaves(map, ROOT_ID, now).filter((n) => {
    if (isAppointment(n)) return (n.dueAt as number) <= endOfDay && (n.dueAt as number) > now
    if (n.dueAt) return n.dueAt <= endOfDay
    if (n.urgency === 'overdue') return true
    // Something she herself put on today's plan counts as necessary today.
    return n.scheduledDate === today && n.urgency === 'today'
  })
}

/** Deadlines already passed. Stated as a fact, never as an accusation. */
export function overdue(map: NodeMap, now = Date.now()): LoopNode[] {
  return actionableLeaves(map, ROOT_ID, now)
    .filter((n) => isDeadline(n) && (n.dueAt as number) < now)
    .sort((a, b) => (a.dueAt as number) - (b.dueAt as number))
}

/** "i dag kl. 14:30" / "på fredag" / "om 3 dage" */
export function whenLabel(node: LoopNode, now = Date.now()): string {
  if (!node.dueAt) return ''
  const due = new Date(node.dueAt)
  const today = isoDate(new Date(now))
  const tomorrow = isoDate(new Date(now + DAY))
  const dayIso = isoDate(due)
  const time = node.dueHasTime
    ? `kl. ${String(due.getHours()).padStart(2, '0')}.${String(due.getMinutes()).padStart(2, '0')}`
    : ''

  if (node.dueAt < now && isDeadline(node)) {
    const days = Math.floor((now - node.dueAt) / DAY)
    if (days === 0) return `Fristen var i dag ${time}`.trim()
    if (days === 1) return 'Fristen var i går'
    return `Fristen var for ${days} dage siden`
  }

  const prefix = isAppointment(node) ? '' : 'Skal være klar '
  if (dayIso === today) return `${prefix}i dag ${time}`.trim()
  if (dayIso === tomorrow) return `${prefix}i morgen ${time}`.trim()

  const days = Math.ceil((node.dueAt - now) / DAY)
  const names = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag']
  if (days <= 7) return `${prefix}${names[due.getDay()]} ${time}`.trim()
  return `${prefix}d. ${due.getDate()}.${due.getMonth() + 1}. ${time}`.trim()
}

/** Short form for a circle or a list row. */
export function shortWhen(node: LoopNode, now = Date.now()): string {
  if (!node.dueAt) return ''
  const due = new Date(node.dueAt)
  const dayIso = isoDate(due)
  const time = node.dueHasTime
    ? `${String(due.getHours()).padStart(2, '0')}.${String(due.getMinutes()).padStart(2, '0')}`
    : ''
  if (dayIso === isoDate(new Date(now))) return time ? `I dag ${time}` : 'I dag'
  if (dayIso === isoDate(new Date(now + DAY))) return time ? `I morgen ${time}` : 'I morgen'
  return `${due.getDate()}.${due.getMonth() + 1}.${time ? ` ${time}` : ''}`
}

/** Recomputed whenever a due date is set or the day rolls over. */
export function urgencyFor(node: LoopNode, now = Date.now()): LoopNode['urgency'] {
  if (!node.dueAt) return node.urgency === 'overdue' ? 'none' : node.urgency
  const hours = hoursUntil(node, now)
  if (hours < 0) return isAppointment(node) ? 'none' : 'overdue'
  if (hours <= 24) return 'today'
  if (hours <= 72) return 'soon'
  return 'none'
}
