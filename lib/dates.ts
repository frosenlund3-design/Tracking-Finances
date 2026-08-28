/** Period helpers. Everything is UTC-anchored ISO dates (YYYY-MM-DD). */

export interface DateRange {
  start: string;
  end: string;
  label: string;
}

export function today(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function monthRange(offset = 0, now: Date = new Date()): DateRange {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const start = base.toISOString().slice(0, 10);
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
  const label = base.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
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

export function formatDay(iso: string, locale = 'en-GB'): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function formatDayLong(iso: string, locale = 'en-GB'): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function relativeDayLabel(iso: string, now: Date = new Date()): string {
  const t = today(now);
  if (iso === t) return 'Today';
  const yesterday = new Date(`${t}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (iso === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  return formatDayLong(iso);
}
