import { ALL_CATEGORIES } from '@/lib/categories';
import { parseAmountToMinor } from '@/lib/money';

/**
 * Turns a typed search phrase into structured filters.
 *
 * The brief's examples — "expenses over 1000 kr", "business expenses this
 * month" — read like sentences, so the search box accepts them as sentences.
 * Anything it recognises becomes a real filter; anything left over stays as a
 * free-text term. That way a phrase never silently matches nothing just
 * because part of it was a qualifier rather than a merchant name.
 */

export interface ParsedQuery {
  /** What remains after the recognised qualifiers are removed. */
  text: string;
  minAmountMajor?: number;
  maxAmountMajor?: number;
  direction?: 'income' | 'expense';
  ownership?: 'personal' | 'business';
  category?: string;
  range?: 'this_month' | 'last_month' | 'last_30' | 'last_90' | 'this_year' | 'all';
  recurring?: boolean;
}

const CURRENCY = String.raw`(?:kr\.?|dkk|kroner)?`;

/** Qualifiers, longest and most specific first so they win over shorter ones. */
const RULES: Array<{
  re: RegExp;
  apply: (match: RegExpMatchArray, out: ParsedQuery) => void;
}> = [
  {
    re: new RegExp(String.raw`\b(?:over|above|more than|greater than|>)\s*([\d.,]+)\s*${CURRENCY}`, 'i'),
    apply: (m, out) => {
      const minor = parseAmountToMinor(m[1]!);
      if (minor !== null) out.minAmountMajor = minor / 100;
    },
  },
  {
    re: new RegExp(String.raw`\b(?:under|below|less than|<)\s*([\d.,]+)\s*${CURRENCY}`, 'i'),
    apply: (m, out) => {
      const minor = parseAmountToMinor(m[1]!);
      if (minor !== null) out.maxAmountMajor = minor / 100;
    },
  },
  { re: /\b(?:expenses?|spending|spent|udgifter?)\b/i, apply: (_m, out) => { out.direction = 'expense'; } },
  { re: /\b(?:income|earned|revenue|indt(?:ae|æ)gter?)\b/i, apply: (_m, out) => { out.direction = 'income'; } },
  { re: /\b(?:business|erhverv|firma)\b/i, apply: (_m, out) => { out.ownership = 'business'; } },
  { re: /\b(?:personal|private|privat)\b/i, apply: (_m, out) => { out.ownership = 'personal'; } },
  { re: /\b(?:subscriptions?|recurring|abonnement(?:er)?)\b/i, apply: (_m, out) => { out.recurring = true; } },
  { re: /\blast month\b/i, apply: (_m, out) => { out.range = 'last_month'; } },
  { re: /\bthis month\b/i, apply: (_m, out) => { out.range = 'this_month'; } },
  { re: /\blast (?:90 days|quarter|3 months)\b/i, apply: (_m, out) => { out.range = 'last_90'; } },
  { re: /\blast 30 days\b/i, apply: (_m, out) => { out.range = 'last_30'; } },
  { re: /\bthis year\b/i, apply: (_m, out) => { out.range = 'this_year'; } },
  { re: /\b(?:all time|ever|everything)\b/i, apply: (_m, out) => { out.range = 'all'; } },
];

export function parseSearchQuery(input: string): ParsedQuery {
  const out: ParsedQuery = { text: '' };
  let remaining = ` ${input} `;

  for (const rule of RULES) {
    const match = remaining.match(rule.re);
    if (!match) continue;
    rule.apply(match, out);
    remaining = remaining.replace(rule.re, ' ');
  }

  // A bare category name is a filter, not a merchant to search for.
  for (const category of ALL_CATEGORIES) {
    const label = category.label.toLowerCase();
    if (label === 'other business' || label === 'miscellaneous') continue;
    const re = new RegExp(String.raw`\b${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\b`, 'i');
    if (re.test(remaining)) {
      out.category = category.key;
      remaining = remaining.replace(re, ' ');
      break;
    }
  }

  out.text = remaining.replace(/\s+/g, ' ').trim();
  return out;
}

/** True when the phrase produced at least one structured filter. */
export function hasStructuredFilters(parsed: ParsedQuery): boolean {
  return Object.keys(parsed).some((key) => key !== 'text' && parsed[key as keyof ParsedQuery] !== undefined);
}
