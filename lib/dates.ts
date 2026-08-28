/** Period helpers. Everything is UTC-anchored ISO dates (YYYY-MM-DD). */

export interface DateRange {
  start: string;
  end: string;
  label: string;
}

/*
 * Dates are assembled from parts rather than handed to toLocaleDateString.
 *
 * ICU builds disagree about the separators in a locale's date pattern —
 * Node renders en-GB long dates as "Fri, 14 August 2026" and Chromium as
 * "Fri 14 August 2026". Inside a client component that is a hydration
 * mismatch: the server sends one string and the browser renders another.
 * Month and weekday *names* are stable across builds, so those come from Intl
 * and everything between them is ours.
 */
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function today(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function monthRange(offset = 0, now: Date = new Date()): DateRange {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const start = base.toISOString().slice(0, 10);
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
  const label = `${MONTHS_LONG[base.getUTCMonth()]} ${base.getUTCFullYear()}`;
  return { start, end, label };
}

export function weekRange(offset = 0, now: Date = new Date()): DateRange {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow + offset * 7);
  const start = d.toISOString().slice(0, 10);
  const endDate = new Date(d);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  return { start, end: endDate.toISOString().slice(0, 10), label: offset === 0 ? 'This week' : 'Last week' };
}

export function yearRange(offset = 0, now: Date = new Date()): DateRange {
  const year = now.getUTCFullYear() + offset;
  return { start: `${year}-01-01`, end: `${year}-12-31`, label: String(year) };
}

export function lastNDays(n: number, now: Date = new Date()): DateRange {
  const end = today(now);
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (n - 1));
  return { start: d.toISOString().slice(0, 10), end, label: `Last ${n} days` };
}

/** Fraction of the current month already elapsed, for run-rate projections. */
export function monthProgress(now: Date = new Date()): number {
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return Math.min(1, now.getUTCDate() / daysInMonth);
}

function parseUtc(iso: string): Date {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${iso}`);
  return date;
}

/** "14 Aug" */
export function formatDay(iso: string): string {
  const d = parseUtc(iso);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

/** "Fri 14 August 2026" */
export function formatDayLong(iso: string): string {
  const d = parseUtc(iso);
  return `${WEEKDAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "14 Aug 2026, 09:32" — for timestamps, in the viewer's own zone. */
export function formatDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${hours}:${minutes}`;
}

export function relativeDayLabel(iso: string, now: Date = new Date()): string {
  const t = today(now);
  if (iso === t) return 'Today';
  const yesterday = new Date(`${t}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (iso === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  return formatDayLong(iso);
}
