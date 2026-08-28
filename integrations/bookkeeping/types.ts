import type { TaxRelevance, Transaction } from '@/types/finance';

/**
 * Bookkeeping export.
 *
 * Kroner is not an accounting system and does not try to become one. What it
 * can do is hand a bookkeeping tool a clean, labelled set of transactions.
 *
 * The contract is deliberately one-directional: a bookkeeping provider
 * *receives* entries. Nothing here reads back a ledger, posts a journal entry,
 * or reconciles anything — those are an accountant's decisions, and a wrong
 * automated posting is much worse than a manual one.
 */

export interface BookkeepingEntry {
  /** Kroner's transaction id, so a re-export can be deduplicated downstream. */
  externalId: string;
  date: string;
  /** Positive for money in, negative for money out. Minor units. */
  amountMinor: number;
  currency: string;
  description: string;
  counterparty: string | null;
  /** Kroner's category key; providers map it onto their own chart of accounts. */
  category: string;
  deductibility: TaxRelevance;
  /** Only business-labelled transactions are ever exported. */
  ownership: 'business';
  note: string | null;
}

export interface BookkeepingProvider {
  readonly id: 'dinero' | 'billy' | 'economic' | 'csv';
  readonly displayName: string;
  isConfigured(): boolean;
  /**
   * Hands entries over. Returns what the provider accepted so the UI can
   * report honestly rather than assuming success.
   */
  export(entries: BookkeepingEntry[]): Promise<BookkeepingExportResult>;
}

export interface BookkeepingExportResult {
  accepted: number;
  skipped: number;
  /** Human-readable, safe to show. */
  messages: string[];
}

/** Only business transactions, and never one the user has not reviewed. */
export function toBookkeepingEntries(transactions: Transaction[]): BookkeepingEntry[] {
  return transactions
    .filter((t) => t.ownership === 'business')
    .map((t) => ({
      externalId: t.id,
      date: t.transactionDate,
      amountMinor: t.amountMinor,
      currency: t.currency,
      description: t.description,
      counterparty: t.merchant,
      category: t.category,
      deductibility: t.taxRelevant,
      ownership: 'business' as const,
      note: t.notes,
    }));
}
