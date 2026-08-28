import { merchantKey } from '@/lib/normalize';
import { MERCHANT_SEEDS, type SeedRule } from './merchant-seeds';
import type { MerchantRule, Ownership, TaxRelevance, TransactionType } from '@/types/finance';

export interface ClassifyInput {
  merchant: string | null;
  description: string;
  amountMinor: number;
  transactionType?: TransactionType;
  provider?: string;
}

export interface Classification {
  category: string;
  subcategory: string | null;
  ownership: Ownership;
  taxRelevant: TaxRelevance;
  confidence: number;
  /** Which tier decided. Surfaced in the UI so the user can judge it. */
  source: 'user_rule' | 'merchant_seed' | 'structural' | 'ai' | 'fallback';
}

/**
 * Tiered classifier, cheapest and most certain first:
 *
 *   1. user rules      — a correction the user made; always wins
 *   2. structural      — what the transaction *is* (a Stripe payout, a refund)
 *   3. merchant seeds  — curated merchant knowledge
 *   4. AI              — only for what is left over (see ai/categorize.ts)
 *   5. fallback        — miscellaneous, low confidence, flagged for review
 *
 * Tiers 1-3 are pure and synchronous, which is what makes them testable and
 * makes the vast majority of transactions never reach a model at all.
 */
export function classify(input: ClassifyInput, userRules: MerchantRule[]): Classification {
  const haystackKey = merchantKey(input.merchant ?? input.description);
  const descKey = merchantKey(input.description);

  // 1. User corrections.
  const userMatch = matchUserRule(userRules, haystackKey, descKey);
  if (userMatch) {
    return {
      category: userMatch.category,
      subcategory: userMatch.subcategory,
      ownership: userMatch.ownership ?? inferOwnership(userMatch.category),
      taxRelevant: userMatch.taxRelevant ?? defaultTax(userMatch.category, input.amountMinor),
      confidence: 1,
      source: 'user_rule',
    };
  }

  // 2. Structural facts beat merchant names.
  const structural = classifyStructural(input);
  if (structural) return structural;

  // 3. Curated merchants.
  const seed = matchSeed(haystackKey) ?? matchSeed(descKey);
  if (seed) {
    const category = adjustForDirection(seed.category, input.amountMinor);
    return {
      category,
      subcategory: seed.subcategory ?? null,
      ownership: seed.ownership ?? inferOwnership(category),
      taxRelevant: seed.tax ?? defaultTax(category, input.amountMinor),
      confidence: 0.85,
      source: 'merchant_seed',
    };
  }

  // 5. Unknown — deliberately low confidence so the UI can ask.
  const fallback = input.amountMinor > 0 ? 'miscellaneous' : 'miscellaneous';
  return {
    category: fallback,
    subcategory: null,
    ownership: 'personal',
    taxRelevant: 'needs_review',
    confidence: 0.2,
    source: 'fallback',
  };
}

/**
 * True when one key is a whole-token prefix of the other.
 *
 * The same merchant reaches the bank under several descriptors —
 * "OPENAI *CHATGPT SUBSCR" one month, "OPENAI" the next. Both reduce to keys
 * where one is a token prefix of the other, so a correction made on either
 * form recognises the other. Requiring a *token* boundary is what stops
 * "openai" from also matching "openair festival".
 */
function sharesTokenPrefix(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  return longer.startsWith(`${shorter} `);
}

function matchUserRule(
  rules: MerchantRule[],
  key: string,
  descKey: string,
): MerchantRule | null {
  const keyRules = rules.filter((r) => r.matchType === 'merchant_key');

  // Exact matches are the most specific, so they win outright.
  const exact = keyRules.find((r) => r.pattern === key || r.pattern === descKey);
  if (exact) return exact;

  // Then the same merchant under a longer or shorter descriptor. Longest
  // pattern first, so a rule on "google ads" beats one on "google".
  const prefix = [...keyRules]
    .sort((a, b) => b.pattern.length - a.pattern.length)
    .find((r) => sharesTokenPrefix(r.pattern, key) || sharesTokenPrefix(r.pattern, descKey));
  if (prefix) return prefix;

  const contains = rules
    .filter((r) => r.matchType === 'contains')
    .sort((a, b) => b.pattern.length - a.pattern.length)
    .find((r) => key.includes(r.pattern) || descKey.includes(r.pattern));
  return contains ?? null;
}

// Longest seed first so 'google ads' beats a hypothetical 'google'.
const SORTED_SEEDS = [...MERCHANT_SEEDS].sort((a, b) => b.match.length - a.match.length);

function matchSeed(key: string): SeedRule | null {
  if (!key) return null;
  for (const seed of SORTED_SEEDS) {
    if (containsToken(key, seed.match)) return seed;
  }
  return null;
}

/** Whole-token substring match, so 'sats' does not match 'satsning'. */
function containsToken(haystack: string, needle: string): boolean {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return false;
  const before = idx === 0 ? ' ' : haystack[idx - 1]!;
  const afterIdx = idx + needle.length;
  const after = afterIdx >= haystack.length ? ' ' : haystack[afterIdx]!;
  return before === ' ' && after === ' ';
}

/**
 * Danish compounds a lot: "loenoverfoersel" is one word meaning "salary
 * transfer". Word-boundary matching would miss every one of them, so these
 * deliberately match as substrings of the normalized key.
 */
const SALARY_HINTS = /(loen|loenoverfoersel|salary|payroll|gage|udbetaling loen)/;
const TRANSFER_HINTS = /(overfoersel|overforsel|transfer|egen konto|own account|mellemregning)/;
const INVOICE_HINTS = /(faktura|invoice|honorar|konsulent)/;

function classifyStructural(input: ClassifyInput): Classification | null {
  const text = merchantKey(`${input.merchant ?? ''} ${input.description}`);

  if (input.transactionType === 'fee') {
    return {
      category: 'business_processing_fees',
      subcategory: null,
      ownership: 'business',
      taxRelevant: 'deductible',
      confidence: 0.97,
      source: 'structural',
    };
  }
  if (input.transactionType === 'refund') {
    return {
      category: input.amountMinor > 0 ? 'business_refunds' : 'business_refunds',
      subcategory: null,
      ownership: 'business',
      taxRelevant: 'needs_review',
      confidence: 0.9,
      source: 'structural',
    };
  }
  if (input.transactionType === 'payout') {
    return {
      category: 'transfers',
      subcategory: 'Processor payout',
      ownership: 'business',
      taxRelevant: 'non_deductible',
      confidence: 0.95,
      source: 'structural',
    };
  }
  if (input.amountMinor > 0 && SALARY_HINTS.test(text)) {
    return {
      category: 'salary',
      subcategory: null,
      ownership: 'personal',
      taxRelevant: 'non_deductible',
      confidence: 0.92,
      source: 'structural',
    };
  }
  if (input.amountMinor > 0 && INVOICE_HINTS.test(text)) {
    return {
      category: 'business_revenue',
      subcategory: null,
      ownership: 'business',
      taxRelevant: 'non_deductible',
      confidence: 0.85,
      source: 'structural',
    };
  }
  if (TRANSFER_HINTS.test(text)) {
    return {
      category: 'transfers',
      subcategory: null,
      ownership: 'personal',
      taxRelevant: 'non_deductible',
      confidence: 0.8,
      source: 'structural',
    };
  }
  return null;
}

/** Money arriving at a cost category is a refund of that cost, not the cost. */
function adjustForDirection(category: string, amountMinor: number): string {
  if (amountMinor <= 0) return category;
  if (category === 'business_processing_fees') return 'business_revenue';
  return category;
}

export function inferOwnership(category: string): Ownership {
  return category.startsWith('business_') ? 'business' : 'personal';
}

function defaultTax(category: string, amountMinor: number): TaxRelevance {
  if (!category.startsWith('business_')) return 'non_deductible';
  if (amountMinor > 0) return 'non_deductible'; // income is not a deduction
  if (category === 'business_taxes') return 'non_deductible';
  if (category === 'business_client_expenses') return 'potentially_deductible';
  return 'deductible';
}

/**
 * Builds the rule a correction implies. Prefers an exact merchant-key rule so
 * one correction to "OPENAI" does not silently recategorize "Open Air Camping".
 */
export function ruleFromCorrection(input: {
  merchant: string | null;
  description: string;
  category: string;
  subcategory: string | null;
  ownership: Ownership | null;
  taxRelevant: TaxRelevance | null;
}): { matchType: 'merchant_key'; pattern: string; category: string; subcategory: string | null; ownership: Ownership | null; taxRelevant: TaxRelevance | null } | null {
  const key = merchantKey(input.merchant ?? input.description);
  if (!key || key === 'unknown') return null;
  return {
    matchType: 'merchant_key',
    pattern: key,
    category: input.category,
    subcategory: input.subcategory,
    ownership: input.ownership,
    taxRelevant: input.taxRelevant,
  };
}
