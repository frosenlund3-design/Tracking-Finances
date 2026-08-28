import '@/lib/server-guard';
import { z } from 'zod';
import { ProviderError, type BankProvider, type Institution, type NormalizedAccount, type NormalizedTransaction, type ProviderContext, type SyncWindow } from '@/integrations/types';
import { toMinor } from '@/lib/money';
import { redact } from '@/security/redact';

/**
 * GoCardless Bank Account Data (formerly Nordigen).
 *
 * Chosen as the first Open Banking implementation because for Denmark it is
 * the shortest path to compliant read-only access: no per-bank contracts, all
 * major Danish banks covered, and the consent flow is hosted entirely by
 * GoCardless and the bank. This app therefore never sees MitID, a bank
 * password, or any other authentication factor — only, after the user has
 * consented at their own bank, a read token for account and transaction data.
 *
 * The access scope requested is read-only. The API exposes no payment
 * initiation on these endpoints, so there is no code path here that could
 * move money even if something else went wrong.
 *
 * Swapping to Tink or TrueLayer means writing another BankProvider; nothing
 * outside this folder changes.
 */

const BASE_URL = process.env.GOCARDLESS_BASE_URL ?? 'https://bankaccountdata.gocardless.com/api/v2';
const SECRET_ID = process.env.GOCARDLESS_SECRET_ID;
const SECRET_KEY = process.env.GOCARDLESS_SECRET_KEY;

/** Days of history to request. GoCardless caps this per institution. */
const DEFAULT_HISTORY_DAYS = 730;

const tokenSchema = z.object({
  access: z.string(),
  access_expires: z.number(),
  refresh: z.string().optional(),
});

const institutionSchema = z.object({
  id: z.string(),
  name: z.string(),
  bic: z.string().optional().nullable(),
  logo: z.string().optional().nullable(),
  countries: z.array(z.string()).default([]),
  transaction_total_days: z.union([z.string(), z.number()]).optional(),
});

const requisitionSchema = z.object({
  id: z.string(),
  link: z.string(),
  status: z.string().optional(),
  accounts: z.array(z.string()).default([]),
  institution_id: z.string().optional(),
});

const accountDetailSchema = z.object({
  account: z
    .object({
      iban: z.string().optional(),
      name: z.string().optional(),
      ownerName: z.string().optional(),
      currency: z.string().optional(),
      product: z.string().optional(),
      cashAccountType: z.string().optional(),
    })
    .optional(),
});

const balanceSchema = z.object({
  balances: z
    .array(
      z.object({
        balanceAmount: z.object({ amount: z.string(), currency: z.string() }),
        balanceType: z.string().optional(),
      }),
    )
    .default([]),
});

const txAmountSchema = z.object({ amount: z.string(), currency: z.string() });

const rawTransactionSchema = z.object({
  transactionId: z.string().optional(),
  internalTransactionId: z.string().optional(),
  entryReference: z.string().optional(),
  bookingDate: z.string().optional(),
  valueDate: z.string().optional(),
  bookingDateTime: z.string().optional(),
  transactionAmount: txAmountSchema,
  creditorName: z.string().optional(),
  debtorName: z.string().optional(),
  remittanceInformationUnstructured: z.string().optional(),
  remittanceInformationUnstructuredArray: z.array(z.string()).optional(),
  additionalInformation: z.string().optional(),
  merchantCategoryCode: z.string().optional(),
  proprietaryBankTransactionCode: z.string().optional(),
});

const transactionsSchema = z.object({
  transactions: z.object({
    booked: z.array(rawTransactionSchema).default([]),
    pending: z.array(rawTransactionSchema).default([]),
  }),
});

export type GoCardlessTransaction = z.infer<typeof rawTransactionSchema>;

let tokenCache: { access: string; expiresAt: number } | null = null;

function credentials(): { secretId: string; secretKey: string } {
  if (!SECRET_ID || !SECRET_KEY) {
    throw new ProviderError('GoCardless credentials are not configured.', 'not_configured');
  }
  return { secretId: SECRET_ID, secretKey: SECRET_KEY };
}

async function request<T>(
  path: string,
  init: RequestInit & { schema: z.ZodType<T>; auth?: string },
): Promise<T> {
  const { schema, auth, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
        ...(rest.headers ?? {}),
      },
      // Never let a hung provider hold a request open indefinitely.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new ProviderError(
      `Could not reach GoCardless: ${err instanceof Error ? err.name : 'network error'}`,
      'provider_down',
      true,
    );
  }

  if (response.status === 401 || response.status === 403) {
    tokenCache = null;
    throw new ProviderError('GoCardless rejected the credentials.', 'unauthorized');
  }
  if (response.status === 404) {
    throw new ProviderError('Not found at GoCardless.', 'not_found');
  }
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after') ?? '60');
    throw new ProviderError('Rate limited by GoCardless.', 'rate_limited', true, retryAfter);
  }
  if (response.status >= 500) {
    throw new ProviderError('GoCardless is temporarily unavailable.', 'provider_down', true);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ProviderError(
      `GoCardless returned ${response.status}: ${redact(body).slice(0, 200)}`,
      'invalid_response',
    );
  }

  const json: unknown = await response.json().catch(() => {
    throw new ProviderError('GoCardless returned a malformed response.', 'invalid_response');
  });
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError('GoCardless response did not match the expected shape.', 'invalid_response');
  }
  return parsed.data;
}

/** Institution-scoped access token. Cached until shortly before it expires. */
async function accessToken(): Promise<string> {
  const { secretId, secretKey } = credentials();
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.access;
  const token = await request('/token/new/', {
    method: 'POST',
    body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
    schema: tokenSchema,
  });
  tokenCache = {
    access: token.access,
    expiresAt: Date.now() + token.access_expires * 1000,
  };
  return token.access;
}

function parseAmountToMinorUnits(amount: string, currency: string): number {
  // The API returns decimal strings; parse via string arithmetic so a value
  // like "0.29" cannot pick up a floating-point rounding error.
  const negative = amount.trim().startsWith('-');
  const [whole = '0', fraction = ''] = amount.replace(/^[-+]/, '').split('.');
  const scale = currency.toUpperCase() === 'JPY' ? 0 : 2;
  const padded = (fraction + '00').slice(0, scale);
  const minor = Number(whole) * 10 ** scale + (scale > 0 ? Number(padded || '0') : 0);
  return negative ? -minor : minor;
}

export function normalizeGoCardlessTransaction(
  raw: GoCardlessTransaction,
  providerAccountId: string,
): NormalizedTransaction | null {
  const id = raw.transactionId ?? raw.internalTransactionId ?? raw.entryReference;
  const date = raw.valueDate ?? raw.bookingDate ?? raw.bookingDateTime?.slice(0, 10);
  if (!id || !date) return null;

  const amountMinor = parseAmountToMinorUnits(
    raw.transactionAmount.amount,
    raw.transactionAmount.currency,
  );

  const remittance =
    raw.remittanceInformationUnstructured ??
    raw.remittanceInformationUnstructuredArray?.join(' ') ??
    raw.additionalInformation ??
    '';

  // The counterparty is the creditor when money leaves, the debtor when it arrives.
  const counterparty = amountMinor < 0 ? raw.creditorName : raw.debtorName;

  return {
    transactionId: id,
    providerAccountId,
    amountMinor,
    currency: raw.transactionAmount.currency.toUpperCase(),
    transactionDate: date.slice(0, 10),
    bookingDate: raw.bookingDate?.slice(0, 10) ?? null,
    merchant: counterparty ?? null,
    description: redact(remittance || counterparty || 'Bank transaction').slice(0, 500),
    transactionType: amountMinor >= 0 ? 'income' : 'expense',
    metadata: {
      mcc: raw.merchantCategoryCode ?? null,
      bankTransactionCode: raw.proprietaryBankTransactionCode ?? null,
      source: 'gocardless',
    },
  };
}

export const gocardlessProvider: BankProvider = {
  id: 'gocardless',
  displayName: 'GoCardless Bank Account Data',
  capabilities: {
    readOnly: true,
    supportsBalances: true,
    supportsIncrementalSync: true,
    maxHistoryDays: DEFAULT_HISTORY_DAYS,
  },

  isConfigured() {
    return Boolean(SECRET_ID && SECRET_KEY);
  },

  async listInstitutions(country: string): Promise<Institution[]> {
    const token = await accessToken();
    const list = await request(`/institutions/?country=${encodeURIComponent(country)}`, {
      schema: z.array(institutionSchema),
      auth: token,
    });
    return list.map((i) => ({
      id: i.id,
      name: i.name,
      bic: i.bic ?? null,
      logoUrl: i.logo ?? null,
      countries: i.countries,
      transactionHistoryDays: Number(i.transaction_total_days ?? 90),
    }));
  },

  async createAuthorization({ institutionId, redirectUrl, userId }) {
    const token = await accessToken();
    // The end-user agreement fixes the scope. Only these three data types are
    // requested; none of them permits initiating a payment.
    const agreement = await request('/agreements/enduser/', {
      method: 'POST',
      auth: token,
      body: JSON.stringify({
        institution_id: institutionId,
        max_historical_days: DEFAULT_HISTORY_DAYS,
        access_valid_for_days: 180,
        access_scope: ['balances', 'details', 'transactions'],
      }),
      schema: z.object({ id: z.string(), access_valid_for_days: z.number().optional() }),
    });

    const requisition = await request('/requisitions/', {
      method: 'POST',
      auth: token,
      body: JSON.stringify({
        redirect: redirectUrl,
        institution_id: institutionId,
        agreement: agreement.id,
        // Correlates the callback without exposing anything about the user.
        reference: `${userId.slice(0, 8)}-${Date.now().toString(36)}`,
        user_language: 'DA',
      }),
      schema: requisitionSchema,
    });

    const validDays = agreement.access_valid_for_days ?? 180;
    return {
      authorizationUrl: requisition.link,
      externalReference: requisition.id,
      expiresAt: new Date(Date.now() + validDays * 86_400_000).toISOString(),
    };
  },

  async completeAuthorization({ externalReference }) {
    const token = await accessToken();
    const requisition = await request(`/requisitions/${encodeURIComponent(externalReference)}/`, {
      schema: requisitionSchema,
      auth: token,
    });
    const status = requisition.status ?? '';
    // 'LN' = linked; 'CR'/'GC'/'UA' are still mid-flow; anything else failed.
    const mapped =
      status === 'LN' ? 'ok' : ['CR', 'GC', 'UA', 'SA', 'GA'].includes(status) ? 'pending' : 'failed';
    return {
      status: mapped,
      institutionName: requisition.institution_id ?? 'Bank',
      consentExpiresAt: null,
    };
  },

  async revokeAuthorization({ externalReference }) {
    const token = await accessToken();
    // Deleting the requisition withdraws consent at the provider.
    await fetch(`${BASE_URL}/requisitions/${encodeURIComponent(externalReference)}/`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    }).catch(() => {
      // A failure here must not block local disconnection; the user's data is
      // removed either way and the consent expires on its own.
    });
  },

  async listAccounts(context: ProviderContext): Promise<NormalizedAccount[]> {
    if (!context.externalReference) throw new ProviderError('Missing requisition.', 'not_found');
    const token = await accessToken();
    const requisition = await request(`/requisitions/${encodeURIComponent(context.externalReference)}/`, {
      schema: requisitionSchema,
      auth: token,
    });

    const accounts: NormalizedAccount[] = [];
    for (const accountId of requisition.accounts) {
      const [details, balances] = await Promise.all([
        request(`/accounts/${accountId}/details/`, { schema: accountDetailSchema, auth: token }),
        request(`/accounts/${accountId}/balances/`, { schema: balanceSchema, auth: token }).catch(
          () => ({ balances: [] }),
        ),
      ]);

      const detail = details.account ?? {};
      const currency = (detail.currency ?? 'DKK').toUpperCase();
      const preferred =
        balances.balances.find((b) => b.balanceType === 'interimAvailable') ??
        balances.balances.find((b) => b.balanceType === 'closingBooked') ??
        balances.balances[0];

      accounts.push({
        providerAccountId: accountId,
        name: detail.name ?? detail.product ?? 'Bank account',
        institution: requisition.institution_id ?? null,
        // Only the last four characters of the IBAN are retained.
        maskedReference: detail.iban ? `••${detail.iban.slice(-4)}` : null,
        type: detail.cashAccountType === 'SVGS' ? 'savings' : 'checking',
        currency,
        balanceMinor: preferred
          ? parseAmountToMinorUnits(preferred.balanceAmount.amount, preferred.balanceAmount.currency)
          : null,
      });
    }
    return accounts;
  },

  async listTransactions(
    context: ProviderContext,
    window: SyncWindow,
  ): Promise<NormalizedTransaction[]> {
    const accounts = await this.listAccounts(context);
    const token = await accessToken();
    const out: NormalizedTransaction[] = [];

    for (const account of accounts) {
      const params = new URLSearchParams({ date_from: window.from, date_to: window.to });
      const payload = await request(
        `/accounts/${account.providerAccountId}/transactions/?${params.toString()}`,
        { schema: transactionsSchema, auth: token },
      );
      // Pending entries are deliberately skipped: their ids churn, and they
      // would otherwise be ingested twice — once pending, once booked.
      for (const raw of payload.transactions.booked) {
        const normalized = normalizeGoCardlessTransaction(raw, account.providerAccountId);
        if (normalized) out.push(normalized);
      }
    }
    return out;
  },
};

export { parseAmountToMinorUnits, toMinor };
