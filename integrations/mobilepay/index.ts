import '@/lib/server-guard';
import {
  ProviderError,
  type NormalizedAccount,
  type NormalizedTransaction,
  type PaymentProvider,
  type ProviderContext,
  type SyncWindow,
} from '@/integrations/types';

/**
 * MobilePay — architecture in place, with an honest caveat.
 *
 * MobilePay has no consumer-facing transaction API. Personal MobilePay
 * activity reaches this app through the bank feed instead, where it appears as
 * ordinary card or account entries; the normalizer already strips the
 * "MobilePay" prefix so those merchants group correctly.
 *
 * What *is* available is the merchant side: Vipps MobilePay's ePayment and
 * Reporting APIs, for a registered MobilePay business agreement. That is what
 * this provider targets — OAuth client credentials against the Vipps MobilePay
 * API, reading settlements and transactions.
 *
 * To finish it:
 *   1. Register at portal.vippsmobilepay.com and set MOBILEPAY_CLIENT_ID,
 *      MOBILEPAY_CLIENT_SECRET and MOBILEPAY_SUBSCRIPTION_KEY.
 *   2. Exchange them at /accesstoken/get.
 *   3. Read /report/v2/ledgers/{id}/funds — settlement, not payment initiation.
 */

const CLIENT_ID = process.env.MOBILEPAY_CLIENT_ID;
const CLIENT_SECRET = process.env.MOBILEPAY_CLIENT_SECRET;
const SUBSCRIPTION_KEY = process.env.MOBILEPAY_SUBSCRIPTION_KEY;

export const mobilepayProvider: PaymentProvider = {
  id: 'mobilepay',
  displayName: 'MobilePay (business)',
  capabilities: {
    readOnly: true,
    supportsBalances: false,
    supportsIncrementalSync: true,
    maxHistoryDays: 365,
  },

  isConfigured() {
    return Boolean(CLIENT_ID && CLIENT_SECRET && SUBSCRIPTION_KEY);
  },

  async listAccounts(_context: ProviderContext): Promise<NormalizedAccount[]> {
    throw new ProviderError(
      'MobilePay is not configured. A Vipps MobilePay business agreement is required.',
      'not_configured',
    );
  },

  async listTransactions(
    _context: ProviderContext,
    _window: SyncWindow,
  ): Promise<NormalizedTransaction[]> {
    throw new ProviderError(
      'MobilePay is not configured. A Vipps MobilePay business agreement is required.',
      'not_configured',
    );
  },
};
