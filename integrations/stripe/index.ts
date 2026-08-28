import '@/lib/server-guard';
import { z } from 'zod';
import {
  ProviderError,
  type NormalizedAccount,
  type NormalizedTransaction,
  type PaymentProvider,
  type ProviderContext,
  type SyncWindow,
} from '@/integrations/types';
import { redact } from '@/security/redact';

/**
 * Stripe, read-only.
 *
 * Reads exactly three list endpoints — balance transactions, balance, and the
 * account object — and nothing else. There is no code here that creates a
 * charge, a refund, a payout or a transfer, so the assistant cannot reach one
 * by any path.
 *
 * Use a restricted key (rk_live_...) with read permissions on Balance
 * transactions and Charges. A full secret key works but grants far more than
 * this integration needs.
 */

const API_BASE = process.env.STRIPE_API_BASE ?? 'https://api.stripe.com/v1';

const balanceTransactionSchema = z.object({
  id: z.string(),
  object: z.literal('balance_transaction').optional(),
  amount: z.number(),
  net: z.number(),
  fee: z.number(),
  currency: z.string(),
  created: z.number(),
  available_on: z.number().optional(),
  description: z.string().nullable().optional(),
  reporting_category: z.string().optional(),
  type: z.string(),
  source: z.union([z.string(), z.object({ id: z.string() })]).nullable().optional(),
});

const listSchema = z.object({
  object: z.literal('list'),
  data: z.array(balanceTransactionSchema),
  has_more: z.boolean(),
});

const accountSchema = z.object({
  id: z.string(),
  business_profile: z.object({ name: z.string().nullable().optional() }).nullable().optional(),
  settings: z
    .object({ dashboard: z.object({ display_name: z.string().nullable().optional() }).optional() })
    .optional(),
  default_currency: z.string().optional(),
  charges_enabled: z.boolean().optional(),
});

const balanceSchema = z.object({
  available: z.array(z.object({ amount: z.number(), currency: z.string() })).default([]),
  pending: z.array(z.object({ amount: z.number(), currency: z.string() })).default([]),
});

export type StripeBalanceTransaction = z.infer<typeof balanceTransactionSchema>;

async function stripeRequest<T>(
  path: string,
  apiKey: string,
  schema: z.ZodType<T>,
  query?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET', // read-only by construction
      headers: {
        authorization: `Bearer ${apiKey}`,
        'stripe-version': '2024-06-20',
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ProviderError('Could not reach Stripe.', 'provider_down', true);
  }

  if (response.status === 401) throw new ProviderError('Stripe rejected the API key.', 'unauthorized');
  if (response.status === 403) {
    throw new ProviderError(
      'This Stripe key lacks read access to balance transactions.',
      'unauthorized',
    );
  }
  if (response.status === 429) {
    throw new ProviderError('Stripe is rate limiting requests.', 'rate_limited', true, 30);
  }
  if (response.status >= 500) throw new ProviderError('Stripe is unavailable.', 'provider_down', true);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ProviderError(`Stripe returned ${response.status}: ${redact(body).slice(0, 200)}`, 'invalid_response');
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new ProviderError('Unexpected Stripe response.', 'invalid_response');
  return parsed.data;
}

/** Maps Stripe's reporting categories onto the internal transaction model. */
export function normalizeStripeTransaction(
  raw: StripeBalanceTransaction,
  providerAccountId: string,
): NormalizedTransaction {
  const category = raw.reporting_category ?? raw.type;
  const date = new Date(raw.created * 1000).toISOString().slice(0, 10);

  const type: NormalizedTransaction['transactionType'] =
    category === 'refund' || category === 'partial_capture_reversal'
      ? 'refund'
      : category === 'payout'
        ? 'payout'
        : category === 'fee' || category === 'stripe_fee'
          ? 'fee'
          : raw.amount >= 0
            ? 'income'
            : 'expense';

  const merchant =
    type === 'fee' || type === 'payout' ? 'Stripe' : (raw.description?.split(' - ')[0] ?? null);

  return {
    transactionId: raw.id,
    providerAccountId,
    amountMinor: raw.amount,
    currency: raw.currency.toUpperCase(),
    transactionDate: date,
    bookingDate: raw.available_on ? new Date(raw.available_on * 1000).toISOString().slice(0, 10) : null,
    merchant,
    description: redact(raw.description ?? `Stripe ${category}`).slice(0, 500),
    transactionType: type,
    ownershipHint: 'business',
    metadata: {
      reportingCategory: category,
      stripeType: raw.type,
      feeMinor: raw.fee,
      netMinor: raw.net,
      source: 'stripe',
    },
  };
}

/**
 * Stripe reports a payment and its fee inside one balance transaction
 * (`amount` gross, `fee` deducted). Splitting them into two rows is what lets
 * the business dashboard show revenue and processing fees as separate lines.
 */
export function expandFee(
  raw: StripeBalanceTransaction,
  providerAccountId: string,
): NormalizedTransaction[] {
  const primary = normalizeStripeTransaction(raw, providerAccountId);
  if (raw.fee <= 0 || primary.transactionType === 'fee' || primary.transactionType === 'payout') {
    return [primary];
  }
  return [
    primary,
    {
      ...primary,
      transactionId: `${raw.id}_fee`,
      amountMinor: -raw.fee,
      merchant: 'Stripe',
      description: 'Stripe processing fee',
      transactionType: 'fee',
      metadata: { ...primary.metadata, derivedFrom: raw.id },
    },
  ];
}

export const stripeProvider: PaymentProvider = {
  id: 'stripe',
  displayName: 'Stripe',
  capabilities: {
    readOnly: true,
    supportsBalances: true,
    supportsIncrementalSync: true,
    maxHistoryDays: 3650,
  },

  isConfigured() {
    return Boolean(process.env.STRIPE_API_KEY);
  },

  async listAccounts(context: ProviderContext): Promise<NormalizedAccount[]> {
    const key = context.accessToken ?? process.env.STRIPE_API_KEY;
    if (!key) throw new ProviderError('No Stripe key available.', 'not_configured');

    const [account, balance] = await Promise.all([
      stripeRequest('/account', key, accountSchema),
      stripeRequest('/balance', key, balanceSchema).catch(() => ({ available: [], pending: [] })),
    ]);

    const currency = (account.default_currency ?? 'dkk').toUpperCase();
    const available = balance.available.find((b) => b.currency.toUpperCase() === currency);

    return [
      {
        providerAccountId: account.id,
        name:
          account.settings?.dashboard?.display_name ??
          account.business_profile?.name ??
          'Stripe balance',
        institution: 'Stripe',
        maskedReference: null,
        type: 'payment_processor',
        currency,
        balanceMinor: available?.amount ?? null,
        ownership: 'business',
      },
    ];
  },

  async listTransactions(context: ProviderContext, window: SyncWindow): Promise<NormalizedTransaction[]> {
    const key = context.accessToken ?? process.env.STRIPE_API_KEY;
    if (!key) throw new ProviderError('No Stripe key available.', 'not_configured');

    const accounts = await this.listAccounts(context);
    const providerAccountId = accounts[0]?.providerAccountId ?? 'stripe';

    const out: NormalizedTransaction[] = [];
    let startingAfter: string | undefined;
    const createdGte = Math.floor(new Date(`${window.from}T00:00:00Z`).getTime() / 1000);
    const createdLte = Math.floor(new Date(`${window.to}T23:59:59Z`).getTime() / 1000);

    // Bounded pagination: 20 pages × 100 = 20k transactions per sync.
    for (let page = 0; page < 20; page++) {
      const query: Record<string, string> = {
        limit: '100',
        'created[gte]': String(createdGte),
        'created[lte]': String(createdLte),
      };
      if (startingAfter) query.starting_after = startingAfter;

      const list = await stripeRequest('/balance_transactions', key, listSchema, query);
      for (const raw of list.data) out.push(...expandFee(raw, providerAccountId));
      if (!list.has_more || list.data.length === 0) break;
      startingAfter = list.data[list.data.length - 1]!.id;
    }
    return out;
  },
};
