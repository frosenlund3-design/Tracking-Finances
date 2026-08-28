/**
 * Putting a loop in her real calendar.
 *
 * Everything else in Loops helps her decide what to do. This is the one thing
 * that helps at the moment it has to happen, which is a different problem and
 * the harder one: knowing about an appointment has never been what makes
 * somebody turn up to it.
 *
 * A web app cannot reliably wake a phone. Instead of pretending otherwise with
 * an in-app "reminder" that only fires while the tab is open, this writes a
 * standard calendar file. Her phone's own calendar takes it, and her phone's
 * own alarm goes off, which is the thing that actually works. Nothing is sent
 * anywhere, and the file is built on the device.
 *
 * The alarms are deliberate. An appointment gets one an hour before and one
 * thirty minutes before, because the hour is for leaving and the half hour is
 * for the fact that the first one will get dismissed. A deadline gets one the
 * morning before, because a deadline you find out about on the day is not a
 * deadline, it is a surprise.
 */

import type { LoopNode } from '@/db/types'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Floating local time. A personal reminder should fire at the wall clock she read. */
function localStamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
}

function dateStamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

function utcStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(
    d.getUTCMinutes(),
  )}${pad(d.getUTCSeconds())}Z`
}

/** iCalendar escaping: backslash, semicolon, comma and newline all have meaning. */
function esc(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Fold to 75 octets per line, as the spec requires. Long Danish task titles go
 * past it easily, and an unfolded line makes some calendar apps drop the event
 * without saying why.
 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let current = ''
  let size = 0
  for (const char of line) {
    const charSize = new TextEncoder().encode(char).length
    if (size + charSize > (out.length ? 74 : 75)) {
      out.push(current)
      current = ''
      size = 0
    }
    current += char
    size += charSize
  }
  if (current) out.push(current)
  return out.map((part, i) => (i === 0 ? part : ` ${part}`)).join('\r\n')
}

export function canExport(node: LoopNode): boolean {
  return typeof node.dueAt === 'number'
}

/**
 * One event for one loop. Returns null when there is no real time on it,
 * because an invented time is worse than no calendar entry.
 */
export function icsFor(node: LoopNode, steps = true): string | null {
  if (!node.dueAt) return null
  const when = new Date(node.dueAt)
  const appointment = node.dueKind === 'appointment'
  const timed = node.dueHasTime !== false && appointment

  const body: string[] = []
  if (node.description) body.push(node.description)
  if (steps && node.steps.length) {
    body.push(node.steps.map((s, i) => `${i + 1}. ${s.title}`).join('\n'))
  }
  if (node.goodEnoughNote) body.push(`Godt nok: ${node.goodEnoughNote}`)
  body.push('Lagt i kalenderen fra Loops.')

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Loops//DA//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${node.id}@loops.local`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `SUMMARY:${esc(node.title)}`,
    `DESCRIPTION:${esc(body.join('\n\n'))}`,
  ]

  if (timed) {
    const end = new Date(when.getTime() + Math.max(15, node.estimatedMinutes) * 60000)
    lines.push(`DTSTART:${localStamp(when)}`, `DTEND:${localStamp(end)}`)
  } else {
    // A deadline is a day, not a moment. An all-day entry sits at the top of
    // the day in every calendar app instead of hiding at 23.59.
    const next = new Date(when)
    next.setDate(next.getDate() + 1)
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(when)}`, `DTEND;VALUE=DATE:${dateStamp(next)}`)
  }

  const alarms: Array<[string, string]> = timed
    ? [
        ['-PT1H', `Om en time: ${node.title}`],
        ['-PT30M', `Om en halv time: ${node.title}`],
      ]
    : // Nine in the morning the day before. An all-day event starts at
      // midnight, so fifteen hours before that is the morning before, which is
      // when there is still time to do something about it.
      [['-PT15H', `I morgen: ${node.title}`]]

  for (const [trigger, text] of alarms) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${trigger}`, `DESCRIPTION:${esc(text)}`, 'END:VALARM')
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.map(fold).join('\r\n')
}

/** Hands the file to the phone. The calendar app takes it from there. */
export function addToCalendar(node: LoopNode): boolean {
  const ics = icsFor(node)
  if (!ics) return false
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${node.title.replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 40) || 'loop'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoked late: Safari reads the blob after the click returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
  return true
}
