import '@/lib/server-guard';
import { gocardlessProvider } from './banking/gocardless';
import { stripeProvider } from './stripe';
import { paypalProvider } from './paypal';
import { mobilepayProvider } from './mobilepay';
import type { BankProvider, FinancialProvider, PaymentProvider } from './types';
import type { ProviderId } from '@/types/finance';

/**
 * The swap point. Everything else in the app asks the registry for a provider
 * by id; changing the Danish bank aggregator from GoCardless to Tink means
 * writing a new BankProvider and changing the line below.
 */

const BANK_PROVIDERS: Record<string, BankProvider> = {
  gocardless: gocardlessProvider,
};

const PAYMENT_PROVIDERS: Record<string, PaymentProvider> = {
  stripe: stripeProvider,
  paypal: paypalProvider,
  mobilepay: mobilepayProvider,
};

/** Which aggregator handles Open Banking. Overridable per deployment. */
export const ACTIVE_BANK_PROVIDER_ID: ProviderId =
  (process.env.BANK_PROVIDER as ProviderId | undefined) ?? 'gocardless';

export function getBankProvider(id: ProviderId = ACTIVE_BANK_PROVIDER_ID): BankProvider {
  const provider = BANK_PROVIDERS[id];
  if (!provider) throw new Error(`Unknown bank provider: ${id}`);
  return provider;
}

export function getPaymentProvider(id: ProviderId): PaymentProvider {
  const provider = PAYMENT_PROVIDERS[id];
  if (!provider) throw new Error(`Unknown payment provider: ${id}`);
  return provider;
}

export function getProvider(id: ProviderId): FinancialProvider {
  return BANK_PROVIDERS[id] ?? PAYMENT_PROVIDERS[id] ?? getBankProvider(id);
}

export interface IntegrationStatus {
  id: ProviderId;
  displayName: string;
  kind: 'bank' | 'payment';
  configured: boolean;
  readOnly: true;
  /** What the user sees when it is not configured. */
  setupHint: string;
  docsUrl: string;
}

const SETUP_HINTS: Record<string, { hint: string; docs: string }> = {
  gocardless: {
    hint: 'Add GOCARDLESS_SECRET_ID and GOCARDLESS_SECRET_KEY to connect Danish banks.',
    docs: 'https://developer.gocardless.com/bank-account-data/overview',
  },
  stripe: {
    hint: 'Add STRIPE_API_KEY — a restricted key with read access is enough.',
    docs: 'https://docs.stripe.com/keys#limit-access',
  },
  paypal: {
    hint: 'Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET with the reporting read scope.',
    docs: 'https://developer.paypal.com/docs/api/transaction-search/v1/',
  },
  mobilepay: {
    hint: 'Requires a Vipps MobilePay business agreement and API keys.',
    docs: 'https://developer.vippsmobilepay.com/',
  },
};

export function integrationStatuses(): IntegrationStatus[] {
  const entries: Array<[FinancialProvider, 'bank' | 'payment']> = [
    [getBankProvider(), 'bank'],
    [stripeProvider, 'payment'],
    [paypalProvider, 'payment'],
    [mobilepayProvider, 'payment'],
  ];
  return entries.map(([provider, kind]) => ({
    id: provider.id,
    displayName: provider.displayName,
    kind,
    configured: provider.isConfigured(),
    readOnly: true,
    setupHint: SETUP_HINTS[provider.id]?.hint ?? 'Add API credentials to enable this integration.',
    docsUrl: SETUP_HINTS[provider.id]?.docs ?? '#',
  }));
}
