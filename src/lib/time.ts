import type { TimePart } from '@/db/types'

/** Circular time: year → months → weeks → days → parts of day. */
export type TimeLevel = 'year' | 'month' | 'week' | 'day'

export const MONTHS_DA = [
  'Januar', 'Februar', 'Marts', 'April', 'Maj', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'December',
]

export const DAYS_DA = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag']
export const DAYS_SHORT_DA = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør']

export const PART_LABELS: Record<TimePart, string> = {
  morning: 'Morgen',
  midday: 'Formiddag',
  afternoon: 'Eftermiddag',
  evening: 'Aften',
}

export const PARTS: TimePart[] = ['morning', 'midday', 'afternoon', 'evening']

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** ISO-8601 week number, Denmark uses Monday-first weeks. */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

export function weeksInMonth(year: number, month: number): Array<{ week: number; start: Date }> {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const out: Array<{ week: number; start: Date }> = []
  let cursor = startOfWeek(first)
  while (cursor <= last) {
    out.push({ week: isoWeek(cursor), start: new Date(cursor) })
    cursor = addDays(cursor, 7)
  }
  return out
}

export function daysOfWeek(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function partOfDay(d = new Date()): TimePart {
  const h = d.getHours()
  if (h < 10) return 'morning'
  if (h < 13) return 'midday'
  if (h < 18) return 'afternoon'
  return 'evening'
}

export function greeting(d = new Date()): string {
  const h = d.getHours()
  if (h < 5) return 'Godnat'
  if (h < 10) return 'Godmorgen'
  if (h < 13) return 'God formiddag'
  if (h < 18) return 'God eftermiddag'
  if (h < 22) return 'God aften'
  return 'Godnat'
}

export function relativeDay(iso: string, now = new Date()): string {
  const today = isoDate(now)
  const tomorrow = isoDate(addDays(now, 1))
  const yesterday = isoDate(addDays(now, -1))
  if (iso === today) return 'I dag'
  if (iso === tomorrow) return 'I morgen'
  if (iso === yesterday) return 'I går'
  const d = parseIso(iso)
  return `${DAYS_DA[d.getDay()]} d. ${d.getDate()}.`
}

export function humanMinutes(minutes: number): string {
  if (minutes < 1) return 'under 1 min'
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m ? `${h} t ${m} min` : `${h} time${h > 1 ? 'r' : ''}`
}

/** Preset horizons for parking something out of the head. */
export function parkPresets(now = new Date()): Array<{ label: string; until: number }> {
  const d = (n: number) => addDays(now, n).getTime()
  const nextMonthFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()
  const january = new Date(now.getMonth() >= 0 ? now.getFullYear() + 1 : now.getFullYear(), 0, 5).getTime()
  return [
    { label: 'I morgen', until: d(1) },
    { label: 'Om en uge', until: d(7) },
    { label: 'Næste måned', until: nextMonthFirst },
    { label: 'Om 3 måneder', until: d(90) },
    { label: 'Til januar', until: january },
  ]
}
