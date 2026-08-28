'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { withUser } from '@/database';
import { assertSameOrigin, requestContext, requireApiUser } from '@/lib/auth';
import { deleteTokens, storeToken } from '@/services/token-vault';
import { getBankProvider, getPaymentProvider } from '@/integrations/registry';
import { syncStripe, loadDemoData, syncBankConnection } from '@/services/sync';
import { hasEncryptionKey } from '@/security/crypto';
import { AUDIT_ACTIONS, recordAudit } from '@/security/audit';
import { LIMITS, rateLimit } from '@/security/rate-limit';
import { describeProviderError } from '@/integrations/types';

export interface IntegrationResult {
  ok?: boolean;
  error?: string;
  message?: string;
}

/**
 * Stripe keys are accepted, encrypted, stored, and never returned. Only the
 * key's prefix is ever displayed again.
 */
const stripeKeySchema = z
  .string()
  .trim()
  .regex(/^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/, 'That does not look like a Stripe API key.');

export async function connectStripeAction(formData: FormData): Promise<IntegrationResult> {
  await assertSameOrigin();
  const user = await requireApiUser();

  if (!hasEncryptionKey()) {
    return {
      error:
        'TOKEN_ENCRYPTION_KEY is not set on this deployment. Kroner will not store a provider key it cannot encrypt.',
    };
  }
  if (!rateLimit(`connect:${user.id}`, LIMITS.sync.limit, LIMITS.sync.windowMs).allowed) {
    return { error: 'Too many attempts. Try again shortly.' };
  }

  const parsed = stripeKeySchema.safeParse(formData.get('apiKey'));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid key.' };

  const apiKey = parsed.data;

  // Verify the key works and is readable *before* storing it, so a bad key
  // never becomes a stored secret that silently fails later.
  const provider = getPaymentProvider('stripe');
  let accountId: string;
  let accountName: string | null;
  let livemode = false;
  try {
    const accounts = await provider.listAccounts({
      userId: user.id,
      connectionId: null,
      accessToken: apiKey,
      externalReference: null,
    });
    const account = accounts[0];
    if (!account) return { error: 'That key did not return a Stripe account.' };
    accountId = account.providerAccountId;
    accountName = account.name;
    livemode = apiKey.includes('_live_');
  } catch (err) {
    const described = describeProviderError(err);
    return { error: `${described.title}. ${described.detail}` };
  }

  await storeToken({
    userId: user.id,
    provider: 'stripe',
    connectionId: null,
    token: apiKey,
    scopes: ['read'],
  });

  await withUser(user.id, async (db) => {
    await db.query(
      `INSERT INTO stripe_connections (id, user_id, stripe_account_id, account_name, livemode, status)
       VALUES ($1,$2,$3,$4,$5,'never')
       ON CONFLICT (user_id, stripe_account_id) DO UPDATE SET
         account_name = EXCLUDED.account_name, livemode = EXCLUDED.livemode,
         status = 'never', sync_error = NULL`,
      [randomUUID(), user.id, accountId, accountName, livemode],
    );
  });

  await recordAudit(user.id, AUDIT_ACTIONS.STRIPE_CONNECTED, { livemode }, await requestContext());
  const outcome = await syncStripe(user.id);

  revalidatePath('/integrations');
  revalidatePath('/dashboard');
  revalidatePath('/business');

  return outcome.error
    ? { ok: true, message: `Connected, but the first sync failed: ${outcome.error.detail}` }
    : { ok: true, message: `Connected. ${outcome.ingest.inserted} transactions imported.` };
}

export async function disconnectStripeAction(): Promise<IntegrationResult> {
  await assertSameOrigin();
  const user = await requireApiUser();

  await deleteTokens(user.id, 'stripe');
  await withUser(user.id, async (db) => {
    await db.query('DELETE FROM stripe_connections WHERE user_id = $1', [user.id]);
    // Accounts are deactivated, not deleted: the transaction history stays.
    await db.query(
      "UPDATE financial_accounts SET is_active = FALSE WHERE user_id = $1 AND provider = 'stripe'",
      [user.id],
    );
  });
  await recordAudit(user.id, AUDIT_ACTIONS.STRIPE_DISCONNECTED, {}, await requestContext());
  revalidatePath('/integrations');
  return { ok: true, message: 'Stripe disconnected. Imported history is kept.' };
}

const connectionIdSchema = z.string().uuid();

export async function disconnectBankAction(formData: FormData): Promise<IntegrationResult> {
  await assertSameOrigin();
  const user = await requireApiUser();

  const parsed = connectionIdSchema.safeParse(formData.get('connectionId'));
  if (!parsed.success) return { error: 'Unknown connection.' };

  const connection = await withUser(user.id, async (db) => {
    const { rows } = await db.query<{ provider: string; external_reference: string | null }>(
      'SELECT provider, external_reference FROM bank_connections WHERE id = $1 AND user_id = $2',
      [parsed.data, user.id],
    );
    return rows[0] ?? null;
  });
  if (!connection) return { error: 'Unknown connection.' };

  // Withdraw consent at the provider first, then drop the local token.
  if (connection.external_reference && connection.provider !== 'demo') {
    try {
      await getBankProvider(connection.provider as 'gocardless').revokeAuthorization({
        externalReference: connection.external_reference,
      });
    } catch (err) {
      // Consent may already be gone provider-side. Local removal still proceeds.
      console.warn('[integrations] revoke failed', err);
    }
  }

  await deleteTokens(user.id, connection.provider as 'gocardless', parsed.data);
  await withUser(user.id, async (db) => {
    await db.query(
      `UPDATE financial_accounts SET is_active = FALSE, connection_id = NULL
        WHERE user_id = $1 AND connection_id = $2`,
      [user.id, parsed.data],
    );
    await db.query(
      "UPDATE bank_connections SET status = 'revoked', external_reference = NULL, sync_error = NULL WHERE id = $1 AND user_id = $2",
      [parsed.data, user.id],
    );
  });

  await recordAudit(
    user.id,
    AUDIT_ACTIONS.BANK_DISCONNECTED,
    { provider: connection.provider },
    await requestContext(),
  );
  revalidatePath('/integrations');
  revalidatePath('/dashboard');
  return { ok: true, message: 'Disconnected. Your imported history is kept — delete it separately if you want it gone.' };
}

export async function syncConnectionAction(formData: FormData): Promise<IntegrationResult> {
  await assertSameOrigin();
  const user = await requireApiUser();

  if (!rateLimit(`sync:${user.id}`, LIMITS.sync.limit, LIMITS.sync.windowMs).allowed) {
    return { error: 'Syncing too often. Try again in a few minutes.' };
  }

  const target = String(formData.get('target') ?? '');
  let outcome;
  if (target === 'stripe') {
    outcome = await syncStripe(user.id);
  } else if (target === 'demo') {
    outcome = await loadDemoData(user.id);
  } else {
    const parsed = connectionIdSchema.safeParse(formData.get('connectionId'));
    if (!parsed.success) return { error: 'Unknown connection.' };
    outcome = await syncBankConnection(user.id, parsed.data);
  }

  revalidatePath('/integrations');
  revalidatePath('/dashboard');
  revalidatePath('/business');

  if (outcome.error) return { error: `${outcome.error.title}. ${outcome.error.detail}` };
  return {
    ok: true,
    message:
      outcome.ingest.inserted > 0
        ? `${outcome.ingest.inserted} new transaction${outcome.ingest.inserted === 1 ? '' : 's'} imported.`
        : 'Already up to date.',
  };
}
