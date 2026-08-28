import '@/lib/server-guard';
import type { BookkeepingProvider } from './types';

export * from './types';

/**
 * Bookkeeping connectors, prepared but not wired.
 *
 * The three Danish tools a small business actually uses all expose a REST API
 * with OAuth2 and a voucher/entry endpoint:
 *
 *   Dinero     https://api.dinero.dk       POST /v1/{orgId}/entries
 *   Billy      https://api.billysbilling.com  POST /v2/bankLines
 *   e-conomic  https://restapi.e-conomic.com  POST /journals/{n}/vouchers
 *
 * Each needs an account mapping from Kroner's category keys onto that tool's
 * chart of accounts, which is specific to the business and cannot be guessed.
 * That mapping is the missing piece, not the HTTP call — so rather than ship a
 * connector that posts to the wrong account, CSV export is the supported path
 * and these stay declared, honest about their state.
 */
const PROVIDERS: BookkeepingProvider[] = [
  {
    id: 'dinero',
    displayName: 'Dinero',
    isConfigured: () => Boolean(process.env.DINERO_CLIENT_ID && process.env.DINERO_CLIENT_SECRET),
    export: async () => ({
      accepted: 0,
      skipped: 0,
      messages: ['Dinero is not configured. Export as CSV and import it in Dinero for now.'],
    }),
  },
  {
    id: 'billy',
    displayName: 'Billy',
    isConfigured: () => Boolean(process.env.BILLY_ACCESS_TOKEN),
    export: async () => ({
      accepted: 0,
      skipped: 0,
      messages: ['Billy is not configured. Export as CSV and import it in Billy for now.'],
    }),
  },
  {
    id: 'economic',
    displayName: 'e-conomic',
    isConfigured: () =>
      Boolean(process.env.ECONOMIC_APP_SECRET_TOKEN && process.env.ECONOMIC_AGREEMENT_TOKEN),
    export: async () => ({
      accepted: 0,
      skipped: 0,
      messages: ['e-conomic is not configured. Export as CSV and import it in e-conomic for now.'],
    }),
  },
];

export function bookkeepingProviders(): BookkeepingProvider[] {
  return PROVIDERS;
}

export interface BookkeepingStatus {
  id: BookkeepingProvider['id'];
  displayName: string;
  configured: boolean;
  note: string;
}

export function bookkeepingStatuses(): BookkeepingStatus[] {
  return PROVIDERS.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    configured: p.isConfigured(),
    note: p.isConfigured()
      ? 'Credentials present. An account mapping is still required before entries can be posted.'
      : 'Not connected. Use CSV export in the meantime.',
  }));
}
