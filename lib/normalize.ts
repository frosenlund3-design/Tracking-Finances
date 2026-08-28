import crypto from 'node:crypto';

/**
 * Bank descriptions are noisy: card terminal prefixes, dates, city names,
 * reference numbers. Reducing them to a stable "merchant key" is what makes
 * category rules and recurring-payment detection work at all.
 */

const NOISE_PATTERNS: RegExp[] = [
  /^den\s+\d{1,2}[.\-/]\d{1,2}[.\-/]?\d{0,4}\s*/i, // "Den 12.03"
  /^k(?:ø|oe|o)b\s+/i,
  /^visa\/?dankort\s*/i,
  /^dankort[- ]?nota\s*/i,
  /^visa\s+/i,
  /^mastercard\s+/i,
  /^mobilepay(?:\s*[-:])?\s*/i,
  /^bs\s+/i,
  // Danish text arrives both accented and ASCII-folded depending on the bank.
  /^overf(?:ø|oe|o)rsel(?:\s*til|\s*fra)?\s*/i,
  /^betaling(?:skort)?\s*/i,
  /^pbs\s+/i,
  /^nets\s+/i,
  /\bkortk(?:ø|oe|o)b\b/i,
  /\bpurchase\b/i,
  /\bpayment\s+to\b/i,
  /\bcard\s+\d{4}\b/i,
];

const TRAILING_NOISE: RegExp[] = [
  /\s+\d{1,2}[.\-/]\d{1,2}([.\-/]\d{2,4})?$/, // trailing date
  /\s+\d{6,}$/, // long reference numbers
  /\s+kbh(?:\s*[a-zø]+)?$/i,
  /\s+n(?:ø|oe)rrebro$/i,
  /\s+(?:cph|copenhagen|k(?:ø|oe|o)benhavn|aarhus|odense|aalborg)$/i,
  /\s+dk$/i,
  /\s+\*+\d+$/,
];

/** Human-facing merchant label: cleaned but still readable. */
export function normalizeMerchant(raw: string): string {
  let s = (raw ?? '').replace(/\s+/g, ' ').trim();
  for (const p of NOISE_PATTERNS) s = s.replace(p, '');
  for (const p of TRAILING_NOISE) s = s.replace(p, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  if (!s) return raw?.trim() || 'Unknown';
  // Title-case words that are all-caps; leave mixed-case brands alone.
  return s
    .split(' ')
    .map((word) =>
      word.length > 1 && word === word.toUpperCase() && /[A-ZÆØÅ]/.test(word)
        ? word.charAt(0) + word.slice(1).toLowerCase()
        : word,
    )
    .join(' ');
}

/**
 * Machine key for grouping. Diacritics folded, punctuation dropped, digits
 * that look like references removed. "OpenAI *ChatGPT" and "OPENAI CHATGPT"
 * both become "openai chatgpt".
 */
export function merchantKey(raw: string): string {
  const cleaned = normalizeMerchant(raw)
    .toLowerCase()
    // Danish letters fold before NFD, otherwise 'aa' would decompose to 'a'.
    .replace(/\u00e6/g, 'ae')
    .replace(/\u00f8/g, 'oe')
    .replace(/\u00e5/g, 'aa')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    // Drop long digit runs: they are references, not part of the name.
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'unknown';
}

/**
 * Fingerprint for near-duplicate detection: the same purchase arriving twice,
 * e.g. once from the bank feed and once from Stripe, or a pending transaction
 * re-issued with a new provider id once booked.
 *
 * Deliberately excludes the provider transaction id — that is handled by a
 * unique constraint — and excludes the account, so a genuine transfer between
 * two of your own accounts is not collapsed.
 */
export function dedupeHash(input: {
  amountMinor: number;
  currency: string;
  transactionDate: string;
  merchantKey: string;
}): string {
  const payload = [
    input.amountMinor,
    input.currency.toUpperCase(),
    input.transactionDate.slice(0, 10),
    input.merchantKey,
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

/**
 * Normalizes a value read from a DATE/TIMESTAMP column to `YYYY-MM-DD`.
 *
 * Both Postgres drivers hand DATE columns back as JavaScript `Date` objects,
 * whose default string form is "Mon Aug 04 2025 ...". Slicing that produces
 * "Mon Aug 04", which is not a date at all — so every read of a date column
 * goes through here rather than through String().
 */
export function isoDate(value: string | Date): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('Invalid date value');
    return value.toISOString().slice(0, 10);
  }
  const text = String(value);
  if (ISO_DATE_RE.test(text.slice(0, 10))) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date: ${text}`);
  return parsed.toISOString().slice(0, 10);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE_RE.test(value);
}

export function daysBetween(a: string, b: string): number {
  // Fail loudly on a malformed date rather than returning NaN, which would
  // quietly poison every downstream comparison.
  if (!isIsoDate(a) || !isIsoDate(b)) {
    throw new Error(`daysBetween expects YYYY-MM-DD, received "${a}" and "${b}"`);
  }
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

export function addDays(date: string, days: number): string {
  if (!isIsoDate(date)) throw new Error(`addDays expects YYYY-MM-DD, received "${date}"`);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number): string {
  if (!isIsoDate(date)) throw new Error(`addMonths expects YYYY-MM-DD, received "${date}"`);
  const d = new Date(`${date}T00:00:00Z`);
  const targetDay = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(targetDay, lastDay));
  return d.toISOString().slice(0, 10);
}
