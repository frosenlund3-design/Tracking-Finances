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
 * PayPal — architecture in place, credentials not wired.
 *
 * The integration point is PayPal's Transaction Search API
 * (GET /v1/reporting/transactions), reached with an OAuth2 client-credentials
 * token scoped to `https://uri.paypal.com/services/reporting/search/read`.
 * That scope is read-only; PayPal's payout and payment scopes are deliberately
 * not requested anywhere in this codebase.
 *
 * To finish it:
 *   1. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.
 *   2. Implement `token()` against /v1/oauth2/token (client credentials).
 *   3. Map transaction_info.transaction_amount into minor units and
 *      payer_info.payer_name into `merchant`.
 *
 * Until then this reports itself unconfigured, and the UI shows it as
 * available-to-connect rather than pretending it works.
 */

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

export const paypalProvider: PaymentProvider = {
  id: 'paypal',
  displayName: 'PayPal',
  capabilities: {
    readOnly: true,
    supportsBalances: false,
    supportsIncrementalSync: true,
    // PayPal's Transaction Search returns at most 31 days per call, 3 years back.
    maxHistoryDays: 1095,
  },

  isConfigured() {
    return Boolean(CLIENT_ID && CLIENT_SECRET);
  },

  async listAccounts(_context: ProviderContext): Promise<NormalizedAccount[]> {
    throw new ProviderError(
      'PayPal is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to enable it.',
      'not_configured',
    );
  },

  async listTransactions(
    _context: ProviderContext,
    _window: SyncWindow,
  ): Promise<NormalizedTransaction[]> {
    throw new ProviderError(
      'PayPal is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to enable it.',
      'not_configured',
    );
  },
};
