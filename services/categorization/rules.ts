import { merchantKey } from '@/lib/normalize';
import { MERCHANT_SEEDS, type SeedRule } from './merchant-seeds';
import type { MerchantRule, Ownership, TaxRelevance, TransactionType } from '@/types/finance';

export interface ClassifyInput {
  merchant: string | null;
  description: string;
  amountMinor: number;
  transactionType?: TransactionType;
  provider?: string;
  /** The rail the money moved on, when it could be read from the description. */
  paymentChannel?: string;
  /** The person on the other side of a peer-to-peer payment, if there is one. */
  counterparty?: string | null;
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
 *   1. user rules       — a correction the user made; always wins
 *   2. strong structural — what the transaction *is*: a Stripe fee, a refund,
 *                          a payout, a salary. These are facts, not guesses.
 *   3. merchant seeds    — curated merchant knowledge
 *   4. weak structural   — the description merely *mentions* a transfer. This
 *                          sits below merchant knowledge on purpose: rent paid
 *                          by bank transfer says "overførsel", and treating
 *                          that as an internal transfer would delete rent from
 *                          the user's spending entirely.
 *   5. AI                — only for what is left over
 *   6. fallback          — miscellaneous, low confidence, flagged for review
 *
 * Tiers 1-4 are pure and synchronous, which is what makes them testable and
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

  // 2. Facts about what the transaction is beat merchant names.
  const structural = classifyStructural(input);
  if (structural) return structural;

  // 3. Curated merchants.
  const seed = matchSeed(haystackKey) ?? matchSeed(descKey);
  if (seed) {
    const mentionsTransfer = TRANSFER_HINTS.test(
      merchantKey(`${input.merchant ?? ''} ${input.description}`),
    );
    const category = adjustForDirection(seed.category, input.amountMinor, mentionsTransfer);
    return {
      category,
      subcategory: seed.subcategory ?? null,
      ownership: seed.ownership ?? inferOwnership(category),
      taxRelevant: seed.tax ?? defaultTax(category, input.amountMinor),
      confidence: 0.85,
      source: 'merchant_seed',
    };
  }

  // 4a. A payment to or from a person, where no merchant claimed it.
  //
  // Deliberately below merchant knowledge: "MobilePay til Cafe Hjørne" is a
  // café, and calling it a person-to-person payment would lose that. But an
  // unrecognised name really is a person, and burying eighty of those in
  // "Miscellaneous, needs review" leaves a pile nobody can ever clear.
  if (input.paymentChannel === 'mobilepay' && input.counterparty) {
    return {
      category: 'peer_transfer',
      subcategory: null,
      ownership: 'personal',
      taxRelevant: 'non_deductible',
      // We know exactly what this is; what we cannot know is what it was for.
      confidence: 0.9,
      source: 'structural',
    };
  }

  // 4b. Cash out of an ATM.
  //
  // Not a spending category — what the cash was spent on is unknowable from a
  // bank feed, and saying so is more honest than filing it under Shopping.
  // Naming it does mean fourteen withdrawals stop sitting in the review queue
  // forever waiting for an answer nobody has.
  if (input.paymentChannel === 'cash' && input.amountMinor < 0) {
    return {
      category: 'cash_withdrawal',
      subcategory: null,
      ownership: 'personal',
      taxRelevant: 'non_deductible',
      confidence: 0.9,
      source: 'structural',
    };
  }

  // 4c. The description mentions a transfer and nothing else claimed it.
  const weakTransfer = classifyWeakTransfer(input);
  if (weakTransfer) return weakTransfer;

  // 6. Unknown — deliberately low confidence so the UI can ask.
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
  return null;
}

/**
 * The description mentions a transfer and nothing else identified it.
 *
 * Deliberately last: "Overførsel husleje Boligselskabet" is rent that happens
 * to be paid by transfer, not a move between the user's own accounts, and
 * mislabelling it removes rent from every spending total in the product.
 */
function classifyWeakTransfer(input: ClassifyInput): Classification | null {
  const text = merchantKey(`${input.merchant ?? ''} ${input.description}`);
  if (!TRANSFER_HINTS.test(text)) return null;
  return {
    category: 'transfers',
    subcategory: null,
    ownership: 'personal',
    taxRelevant: 'non_deductible',
    // Lower than a merchant match, because this is an inference about wording.
    confidence: 0.55,
    source: 'structural',
  };
}

/** Money arriving at a cost category is a refund of that cost, not the cost. */
/**
 * Money arriving at a cost category usually means revenue, not the cost.
 *
 * The exception is a payout landing: "Overførsel fra Stripe" in a bank account
 * is the same krone that was already booked as revenue on the processor, so
 * counting it again would inflate income by the whole payout.
 */
function adjustForDirection(
  category: string,
  amountMinor: number,
  mentionsTransfer: boolean,
): string {
  if (amountMinor <= 0) return category;
  if (category === 'business_processing_fees') {
    return mentionsTransfer ? 'transfers' : 'business_revenue';
  }
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
