import '@/lib/server-guard';
import { randomUUID } from 'node:crypto';
import { withUser } from '@/database';
import { addDays } from '@/lib/normalize';
import { today } from '@/lib/dates';
import { upsertAccounts } from '@/services/accounts';
import { ingestTransactions, type IngestResult } from '@/services/transactions';
import { detectAndStoreSubscriptions } from '@/services/subscriptions';
import { generateInsights } from '@/services/insights';
import { useToken } from '@/services/token-vault';
import { getBankProvider, getPaymentProvider } from '@/integrations/registry';
import { generateDemoData } from '@/integrations/demo/generator';
import { describeProviderError, ProviderError, type SyncWindow } from '@/integrations/types';
import { AUDIT_ACTIONS, recordAudit } from '@/security/audit';
import type { ProviderId, SyncStatus } from '@/types/finance';

/**
 * The pipeline that runs whenever data arrives:
 *
 *   fetch accounts → fetch transactions → normalize → dedupe → categorize
 *   → detect recurring payments → regenerate insights
 *
 * A failure at the provider step never destroys stored history. The connection
 * is marked, the error recorded, and everything already ingested stays exactly
 * as it was.
 */

export interface SyncOutcome {
  provider: ProviderId;
  status: SyncStatus;
  accountsSynced: number;
  ingest: IngestResult;
  subscriptionsDetected: number;
  insightsGenerated: number;
  error: { title: string; detail: string; action: string } | null;
  durationMs: number;
}

function emptyIngest(): IngestResult {
  return { inserted: 0, duplicatesSkipped: 0, nearDuplicatesSkipped: 0, total: 0 };
}

/** How far back to ask for. Incremental syncs overlap by a week so late-booked
 *  transactions are not missed; the dedupe layer absorbs the overlap. */
async function syncWindow(
  userId: string,
  provider: ProviderId,
  maxHistoryDays: number,
): Promise<SyncWindow> {
  const to = today();
  const lastSync = await withUser(userId, async (db) => {
    const { rows } = await db.query<{ last: string | Date | null }>(
      `SELECT max(last_synced_at) AS last FROM bank_connections
        WHERE user_id = $1 AND provider = $2`,
      [userId, provider],
    );
    return rows[0]?.last ?? null;
  });

  if (lastSync) {
    const since = new Date(lastSync).toISOString().slice(0, 10);
    return { from: addDays(since, -7), to };
  }
  return { from: addDays(to, -Math.min(maxHistoryDays, 730)), to };
}

async function markConnection(
  userId: string,
  connectionId: string | null,
  status: SyncStatus,
  error: string | null,
): Promise<void> {
  if (!connectionId) return;
  await withUser(userId, async (db) => {
    await db.query(
      `UPDATE bank_connections
          SET status = $3, sync_error = $4,
              last_synced_at = CASE WHEN $3 = 'ok' THEN now() ELSE last_synced_at END
        WHERE id = $1 AND user_id = $2`,
      [connectionId, userId, status, error],
    );
  });
}

/** Runs the post-ingest analysis steps shared by every provider. */
async function runAnalysis(userId: string): Promise<{ subscriptions: number; insights: number }> {
  const subs = await detectAndStoreSubscriptions(userId);
  const insights = await generateInsights(userId);
  return { subscriptions: subs.detected, insights: insights.length };
}

export async function syncBankConnection(
  userId: string,
  connectionId: string,
): Promise<SyncOutcome> {
  const startedAt = Date.now();
  const connection = await withUser(userId, async (db) => {
    const { rows } = await db.query<{
      id: string; provider: ProviderId; external_reference: string | null; institution_name: string;
    }>(
      'SELECT id, provider, external_reference, institution_name FROM bank_connections WHERE id = $1 AND user_id = $2',
      [connectionId, userId],
    );
    return rows[0] ?? null;
  });

  if (!connection) {
    return {
      provider: 'gocardless',
      status: 'error',
      accountsSynced: 0,
      ingest: emptyIngest(),
      subscriptionsDetected: 0,
      insightsGenerated: 0,
      error: { title: 'Connection not found', detail: 'This bank connection no longer exists.', action: 'none' },
      durationMs: Date.now() - startedAt,
    };
  }

  const provider = getBankProvider(connection.provider);
  await markConnection(userId, connectionId, 'syncing', null);
  await recordAudit(userId, AUDIT_ACTIONS.SYNC_STARTED, { provider: connection.provider });

  try {
    const window = await syncWindow(userId, connection.provider, provider.capabilities.maxHistoryDays);
    const context = {
      userId,
      connectionId,
      accessToken: null,
      externalReference: connection.external_reference,
    };

    const accounts = await provider.listAccounts(context);
    const accountMap = await upsertAccounts(userId, connection.provider, connectionId, accounts);
    const transactions = await provider.listTransactions(context, window);
    const ingest = await ingestTransactions(userId, accountMap, transactions, connection.provider);
    const analysis = await runAnalysis(userId);

    await markConnection(userId, connectionId, 'ok', null);
    await recordAudit(userId, AUDIT_ACTIONS.SYNC_COMPLETED, {
      provider: connection.provider,
      accounts: accounts.length,
      inserted: ingest.inserted,
    });

    return {
      provider: connection.provider,
      status: 'ok',
      accountsSynced: accounts.length,
      ingest,
      subscriptionsDetected: analysis.subscriptions,
      insightsGenerated: analysis.insights,
      error: null,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const described = describeProviderError(err);
    const status: SyncStatus =
      err instanceof ProviderError && (err.code === 'unauthorized' || err.code === 'consent_expired')
        ? 'expired'
        : 'error';
    await markConnection(userId, connectionId, status, `${described.title}: ${described.detail}`);
    await recordAudit(userId, AUDIT_ACTIONS.SYNC_FAILED, {
      provider: connection.provider,
      reason: described.title,
    });
    return {
      provider: connection.provider,
      status,
      accountsSynced: 0,
      ingest: emptyIngest(),
      subscriptionsDetected: 0,
      insightsGenerated: 0,
      error: described,
      durationMs: Date.now() - startedAt,
    };
  }
}

export async function syncStripe(userId: string): Promise<SyncOutcome> {
  const startedAt = Date.now();
  const provider = getPaymentProvider('stripe');

  const connection = await withUser(userId, async (db) => {
    const { rows } = await db.query<{ id: string; stripe_account_id: string }>(
      'SELECT id, stripe_account_id FROM stripe_connections WHERE user_id = $1 LIMIT 1',
      [userId],
    );
    return rows[0] ?? null;
  });

  if (!connection) {
    return {
      provider: 'stripe',
      status: 'error',
      accountsSynced: 0,
      ingest: emptyIngest(),
      subscriptionsDetected: 0,
      insightsGenerated: 0,
      error: { title: 'Stripe is not connected', detail: 'Add a Stripe key first.', action: 'none' },
      durationMs: Date.now() - startedAt,
    };
  }

  try {
    const window = await syncWindow(userId, 'stripe', provider.capabilities.maxHistoryDays);

    const { accounts, transactions } = await useToken(userId, 'stripe', null, async (apiKey) => {
      const context = { userId, connectionId: null, accessToken: apiKey, externalReference: null };
      const accounts = await provider.listAccounts(context);
      const transactions = await provider.listTransactions(context, window);
      return { accounts, transactions };
    });

    const accountMap = await upsertAccounts(userId, 'stripe', null, accounts);
    const ingest = await ingestTransactions(userId, accountMap, transactions, 'stripe');
    const analysis = await runAnalysis(userId);

    await withUser(userId, async (db) => {
      await db.query(
        `UPDATE stripe_connections SET status = 'ok', sync_error = NULL, last_synced_at = now()
          WHERE id = $1 AND user_id = $2`,
        [connection.id, userId],
      );
    });
    await recordAudit(userId, AUDIT_ACTIONS.SYNC_COMPLETED, {
      provider: 'stripe',
      inserted: ingest.inserted,
    });

    return {
      provider: 'stripe',
      status: 'ok',
      accountsSynced: accounts.length,
      ingest,
      subscriptionsDetected: analysis.subscriptions,
      insightsGenerated: analysis.insights,
      error: null,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const described = describeProviderError(err);
    const status: SyncStatus =
      err instanceof ProviderError && err.code === 'unauthorized' ? 'expired' : 'error';
    await withUser(userId, async (db) => {
      await db.query(
        'UPDATE stripe_connections SET status = $3, sync_error = $4 WHERE id = $1 AND user_id = $2',
        [connection.id, userId, status, `${described.title}: ${described.detail}`],
      );
    });
    await recordAudit(userId, AUDIT_ACTIONS.SYNC_FAILED, { provider: 'stripe', reason: described.title });
    return {
      provider: 'stripe',
      status,
      accountsSynced: 0,
      ingest: emptyIngest(),
      subscriptionsDetected: 0,
      insightsGenerated: 0,
      error: described,
      durationMs: Date.now() - startedAt,
    };
  }
}

/**
 * Loads the demo dataset. Runs through the identical pipeline as a real bank —
 * same normalization, same dedupe, same categorizer — so what you evaluate in
 * demo mode is the actual product, not a mock-up of it.
 */
export async function loadDemoData(userId: string, months = 9): Promise<SyncOutcome> {
  const startedAt = Date.now();
  const { accounts, transactions } = generateDemoData(userId, months);

  const connectionId = await withUser(userId, async (db) => {
    const { rows } = await db.query<{ id: string }>(
      'SELECT id FROM bank_connections WHERE user_id = $1 AND provider = $2 LIMIT 1',
      [userId, 'demo'],
    );
    if (rows[0]) return rows[0].id;
    const id = randomUUID();
    await db.query(
      `INSERT INTO bank_connections
         (id, user_id, provider, institution_id, institution_name, status, last_synced_at)
       VALUES ($1,$2,'demo','demo-bank','Demo Bank','ok', now())`,
      [id, userId],
    );
    return id;
  });

  const accountMap = await upsertAccounts(userId, 'demo', connectionId, accounts);
  const ingest = await ingestTransactions(userId, accountMap, transactions, 'demo');
  const analysis = await runAnalysis(userId);

  await recordAudit(userId, AUDIT_ACTIONS.DEMO_DATA_LOADED, {
    transactions: ingest.inserted,
    months,
  });

  return {
    provider: 'demo',
    status: 'ok',
    accountsSynced: accounts.length,
    ingest,
    subscriptionsDetected: analysis.subscriptions,
    insightsGenerated: analysis.insights,
    error: null,
    durationMs: Date.now() - startedAt,
  };
}

/** Re-runs recurring detection and insights without touching any provider. */
export async function refreshAnalysis(userId: string): Promise<{ subscriptions: number; insights: number }> {
  return runAnalysis(userId);
}

export interface ConnectionSummary {
  id: string;
  provider: ProviderId;
  institutionName: string;
  status: SyncStatus;
  lastSyncedAt: string | null;
  syncError: string | null;
  consentExpiresAt: string | null;
  accountCount: number;
}

export async function listConnections(userId: string): Promise<ConnectionSummary[]> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<{
      id: string; provider: ProviderId; institution_name: string; status: SyncStatus;
      last_synced_at: string | Date | null; sync_error: string | null;
      consent_expires_at: string | Date | null; account_count: number;
    }>(
      `SELECT c.id, c.provider, c.institution_name, c.status, c.last_synced_at, c.sync_error,
              c.consent_expires_at,
              (SELECT count(*)::int FROM financial_accounts a WHERE a.connection_id = c.id) AS account_count
         FROM bank_connections c WHERE c.user_id = $1 ORDER BY c.created_at DESC`,
      [userId],
    );
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      institutionName: r.institution_name,
      status: r.status,
      lastSyncedAt: r.last_synced_at ? new Date(r.last_synced_at).toISOString() : null,
      syncError: r.sync_error,
      consentExpiresAt: r.consent_expires_at ? new Date(r.consent_expires_at).toISOString() : null,
      accountCount: Number(r.account_count),
    }));
  });
}
