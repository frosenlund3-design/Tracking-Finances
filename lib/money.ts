/**
 * All money is handled as integer minor units (øre for DKK).
 * Floating point never touches a stored amount.
 */

export const MINOR_UNITS_PER_MAJOR = 100;

/**
 * Scales a decimal number to minor units.
 *
 * `1.005 * 100` is 100.49999999999999 in IEEE 754, so a naive Math.round gives
 * 100 øre for what a person wrote as 1,005 kr. Collapsing to 15 significant
 * digits first discards the representation error without touching any digit a
 * real amount depends on, and rounding the magnitude keeps the behaviour
 * symmetric across zero.
 *
 * For user-entered text prefer `parseAmountToMinor`, which never goes through
 * a float at all.
 */
export function toMinor(major: number): number {
  if (!Number.isFinite(major)) throw new Error('toMinor requires a finite number');
  const scaled = Number((Math.abs(major) * MINOR_UNITS_PER_MAJOR).toPrecision(15));
  const rounded = Math.round(scaled);
  return major < 0 ? -rounded : rounded;
}

export function toMajor(minor: number): number {
  return minor / MINOR_UNITS_PER_MAJOR;
}

/** Parses '1.234,56', '1,234.56', '-1234.5' etc. into minor units. */
export function parseAmountToMinor(input: string): number | null {
  const raw = input.trim().replace(/\s| /g, '');
  if (!raw) return null;
  const negative = /^-/.test(raw) || /^\(.*\)$/.test(raw);
  let body = raw.replace(/^[-+]/, '').replace(/^\((.*)\)$/, '$1');
  const lastComma = body.lastIndexOf(',');
  const lastDot = body.lastIndexOf('.');
  const decimalSep = lastComma > lastDot ? ',' : lastDot > lastComma ? '.' : null;
  if (decimalSep) {
    const groupSep = decimalSep === ',' ? '.' : ',';
    body = body.split(groupSep).join('');
    body = body.replace(decimalSep, '.');
  } else {
    body = body.replace(/[.,]/g, '');
  }
  if (!/^\d*(\.\d*)?$/.test(body) || body === '' || body === '.') return null;
  const value = Number(body);
  if (!Number.isFinite(value)) return null;
  const minor = Math.round(value * MINOR_UNITS_PER_MAJOR);
  return negative ? -minor : minor;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, locale: string, fractionDigits: number) {
  const key = `${currency}|${locale}|${fractionDigits}`;
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatterCache.set(key, f);
  }
  return f;
}

export function formatMoney(
  minor: number,
  currency: string = 'DKK',
  options: { locale?: string; compact?: boolean; signed?: boolean } = {},
): string {
  const { locale = 'da-DK', compact = false, signed = false } = options;
  const major = toMajor(minor);
  const digits = compact || Number.isInteger(major) ? 0 : 2;
  const text = formatter(currency, locale, digits).format(Math.abs(major));
  if (signed && minor !== 0) return `${minor > 0 ? '+' : '−'}${text}`;
  return minor < 0 ? `−${text}` : text;
}

/** Percentage change guarded against a zero baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function sumMinor(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
