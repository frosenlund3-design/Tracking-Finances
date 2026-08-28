import type {
  AccountType,
  Currency,
  Ownership,
  ProviderId,
  TransactionType,
} from '@/types/finance';

/**
 * What a provider must hand back. Everything past this boundary is
 * provider-agnostic, which is what makes GoCardless swappable for Tink or
 * TrueLayer without touching the dashboard, the assistant or the analytics.
 */
export interface NormalizedAccount {
  providerAccountId: string;
  name: string;
  institution: string | null;
  /** Last 4 characters of an account reference. Never a card PAN. */
  maskedReference: string | null;
  type: AccountType;
  currency: Currency;
  balanceMinor: number | null;
  ownership?: Ownership;
}

export interface NormalizedTransaction {
  /** Provider's own stable id. Half of the uniqueness guarantee. */
  transactionId: string;
  providerAccountId: string;
  amountMinor: number;
  currency: Currency;
  transactionDate: string;
  bookingDate: string | null;
  merchant: string | null;
  description: string;
  transactionType?: TransactionType;
  ownershipHint?: Ownership;
  /** Provider payload with anything sensitive already stripped. */
  metadata?: Record<string, unknown>;
}

export interface SyncWindow {
  /** Inclusive ISO date. Providers cap history; ask for what they allow. */
  from: string;
  to: string;
}

export interface ProviderCapabilities {
  readOnly: true;
  supportsBalances: boolean;
  supportsIncrementalSync: boolean;
  maxHistoryDays: number;
}

/** Base contract shared by banks and payment processors. */
export interface FinancialProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  /** True when real credentials are configured; false means demo/setup mode. */
  isConfigured(): boolean;
  listAccounts(context: ProviderContext): Promise<NormalizedAccount[]>;
  listTransactions(
    context: ProviderContext,
    window: SyncWindow,
  ): Promise<NormalizedTransaction[]>;
}

/**
 * Everything a provider call needs, resolved server-side. Access tokens are
 * decrypted immediately before use and never persisted in this shape.
 */
export interface ProviderContext {
  userId: string;
  connectionId: string | null;
  accessToken: string | null;
  externalReference: string | null;
  metadata?: Record<string, unknown>;
}

export interface Institution {
  id: string;
  name: string;
  bic: string | null;
  logoUrl: string | null;
  countries: string[];
  transactionHistoryDays: number;
}

/** A bank reached through an Open Banking/PSD2 authorization flow. */
export interface BankProvider extends FinancialProvider {
  listInstitutions(country: string): Promise<Institution[]>;
  /**
   * Starts the provider-hosted consent flow. The user authenticates with their
   * own bank (MitID, bank app, ...) — those credentials never reach this app.
   */
  createAuthorization(input: {
    userId: string;
    institutionId: string;
    redirectUrl: string;
  }): Promise<{ authorizationUrl: string; externalReference: string; expiresAt: string | null }>;
  /** Called on the redirect back; confirms consent and returns connection state. */
  completeAuthorization(input: {
    externalReference: string;
  }): Promise<{ status: 'ok' | 'pending' | 'failed'; institutionName: string; consentExpiresAt: string | null }>;
  /** Revokes consent provider-side where the API supports it. */
  revokeAuthorization(input: { externalReference: string }): Promise<void>;
}

/** A payment processor (Stripe, PayPal, MobilePay). */
export interface PaymentProvider extends FinancialProvider {
  /** Revenue-side detail the generic transaction model does not carry. */
  listPayouts?(context: ProviderContext, window: SyncWindow): Promise<NormalizedTransaction[]>;
}

/** Turns a provider payload into the internal model. */
export interface TransactionNormalizer<TRaw> {
  normalize(raw: TRaw, accountId: string): NormalizedTransaction;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'not_configured'
      | 'unauthorized'
      | 'consent_expired'
      | 'rate_limited'
      | 'provider_down'
      | 'not_found'
      | 'invalid_response',
    readonly retryable = false,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Maps a provider failure to language the UI can show without alarming. */
export function describeProviderError(err: unknown): {
  title: string;
  detail: string;
  action: 'retry' | 'reconnect' | 'wait' | 'none';
} {
  if (err instanceof ProviderError) {
    switch (err.code) {
      case 'not_configured':
        return {
          title: 'Not connected yet',
          detail: 'Add this provider’s API credentials to enable live syncing.',
          action: 'none',
        };
      case 'unauthorized':
      case 'consent_expired':
        return {
          title: 'Authorization has expired',
          detail:
            'Banks re-confirm consent periodically. Reconnect to resume syncing — your existing history stays put.',
          action: 'reconnect',
        };
      case 'rate_limited':
        return {
          title: 'Too many requests',
          detail: `The provider is rate limiting us. Syncing resumes automatically${
            err.retryAfterSeconds ? ` in about ${Math.ceil(err.retryAfterSeconds / 60)} minutes` : ''
          }.`,
          action: 'wait',
        };
      case 'provider_down':
        return {
          title: 'Provider is unavailable',
          detail: 'The bank’s data service is not responding. Your saved data is unaffected.',
          action: 'retry',
        };
      case 'not_found':
        return { title: 'Connection not found', detail: 'This connection no longer exists at the provider.', action: 'reconnect' };
      default:
        return { title: 'Unexpected response', detail: 'The provider returned data we could not read.', action: 'retry' };
    }
  }
  return {
    title: 'Sync failed',
    detail: 'Something went wrong while syncing. Your saved data is unaffected.',
    action: 'retry',
  };
}
