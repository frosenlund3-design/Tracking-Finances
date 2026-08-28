/**
 * The single internal representation every provider normalizes into.
 * Nothing provider-specific leaks past this boundary.
 */

export type Currency = string; // ISO-4217, e.g. 'DKK'

export type ProviderId =
  | 'gocardless'
  | 'tink'
  | 'truelayer'
  | 'plaid'
  | 'stripe'
  | 'paypal'
  | 'mobilepay'
  | 'manual'
  | 'demo';

export type TransactionType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'refund'
  | 'fee'
  | 'payout'
  | 'adjustment';

export type Ownership = 'personal' | 'business' | 'mixed';

export type RecurringStatus = 'one_off' | 'recurring' | 'suspected_recurring';

export type RecurrenceInterval =
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual';

export type TaxRelevance =
  | 'deductible'
  | 'potentially_deductible'
  | 'non_deductible'
  | 'needs_review';

/** Which rail the money travelled on. */
export type PaymentChannel =
  | 'card'
  | 'mobilepay'
  | 'transfer'
  | 'direct_debit'
  | 'cash'
  | 'processor'
  | 'unknown';

export type AccountType =
  | 'checking'
  | 'savings'
  | 'credit_card'
  | 'payment_processor'
  | 'cash'
  | 'other';

export type SyncStatus = 'never' | 'syncing' | 'ok' | 'error' | 'expired' | 'revoked';

export interface FinancialAccount {
  id: string;
  userId: string;
  provider: ProviderId;
  providerAccountId: string;
  connectionId: string | null;
  name: string;
  institution: string | null;
  /** Last 4 of an IBAN/account reference only. Never a card PAN. */
  maskedReference: string | null;
  type: AccountType;
  currency: Currency;
  /** Minor units (øre). Integers only — never floats for money. */
  balanceMinor: number | null;
  balanceUpdatedAt: string | null;
  ownership: Ownership;
  isActive: boolean;
  createdAt: string;
}

export interface Transaction {
  /** Internal id. */
  id: string;
  userId: string;
  /** Stable id issued by the provider; part of the dedupe key. */
  transactionId: string;
  provider: ProviderId;
  accountId: string;
  /** Minor units. Negative = money out, positive = money in. */
  amountMinor: number;
  currency: Currency;
  /** When the money actually moved (value date). ISO date. */
  transactionDate: string;
  /** When the bank booked it. ISO date, may equal transactionDate. */
  bookingDate: string | null;
  merchant: string | null;
  /** Normalized merchant key used for rules + recurrence grouping. */
  merchantKey: string | null;
  description: string;
  category: string;
  subcategory: string | null;
  transactionType: TransactionType;
  ownership: Ownership;
  recurringStatus: RecurringStatus;
  subscriptionId: string | null;
  taxRelevant: TaxRelevance;
  /** 0..1 confidence in the *categorization*, not in the amount. */
  confidenceScore: number;
  /** True once a human has confirmed/overridden the category. */
  categoryLocked: boolean;
  /** Hash used for near-duplicate detection across providers. */
  dedupeHash: string;
  notes: string | null;
  /** How the money moved: card, MobilePay, transfer, direct debit, cash. */
  paymentChannel: PaymentChannel;
  /** The person on the other side of a peer-to-peer payment, when there is one. */
  counterparty: string | null;
  /** Raw provider payload, minus anything sensitive. Never sent to the model. */
  originalProviderMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  merchantKey: string;
  merchantLabel: string;
  category: string;
  ownership: Ownership;
  interval: RecurrenceInterval;
  /** Typical charge in minor units (positive number). */
  amountMinor: number;
  currency: Currency;
  monthlyEquivalentMinor: number;
  annualEquivalentMinor: number;
  firstSeen: string;
  lastPaymentDate: string;
  nextPredictedDate: string;
  occurrences: number;
  /** 0..1 — how regular the cadence and amount are. */
  confidence: number;
  status: 'active' | 'lapsed' | 'cancelled';
  priceChangedAt: string | null;
  previousAmountMinor: number | null;
}

export interface BankConnection {
  id: string;
  userId: string;
  provider: ProviderId;
  institutionId: string;
  institutionName: string;
  /** Provider-side requisition/link reference. Not a credential. */
  externalReference: string | null;
  status: SyncStatus;
  scope: 'read_only';
  consentExpiresAt: string | null;
  lastSyncedAt: string | null;
  syncError: string | null;
  createdAt: string;
}

export interface MerchantRule {
  id: string;
  userId: string;
  /** Normalized merchant key or substring pattern. */
  matchType: 'merchant_key' | 'contains';
  pattern: string;
  category: string;
  subcategory: string | null;
  ownership: Ownership | null;
  taxRelevant: TaxRelevance | null;
  /** Learned from a user correction vs. seeded default. */
  source: 'user_correction' | 'seed';
  hitCount: number;
  createdAt: string;
}

export interface FinancialInsight {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body: string;
  /** Deterministic values backing the sentence, for auditability. */
  facts: Record<string, number | string>;
  periodStart: string;
  periodEnd: string;
  severity: 'info' | 'notable';
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  userId: string;
  action: string;
  /** Non-sensitive context only. Never amounts, merchants or tokens. */
  detail: Record<string, string | number | boolean | null>;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  /** What the product surfaces: personal, business or both. */
  trackingMode: 'personal' | 'business' | 'both';
  baseCurrency: Currency;
  demoMode: boolean;
  onboardingCompletedAt: string | null;
  createdAt: string;
}
