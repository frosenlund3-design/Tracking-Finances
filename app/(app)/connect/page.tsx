import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { listConnections } from '@/services/sync';
import { integrationStatuses } from '@/integrations/registry';
import { stripeConnectConfigured } from '@/integrations/stripe/oauth';
import { mobilePayStatus } from '@/integrations/mobilepay';
import { hasEncryptionKey } from '@/security/crypto';
import { withUser } from '@/database';
import { ConnectHub } from './hub';

export const metadata: Metadata = { title: 'Connect' };
export const dynamic = 'force-dynamic';

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ bank?: string; stripe?: string; mobilepay?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const [connections, stripe, mobilePayTransactions] = await Promise.all([
    listConnections(user.id),
    withUser(user.id, async (db) => {
      const { rows } = await db.query<{ status: string; livemode: boolean; account_name: string | null }>(
        'SELECT status, livemode, account_name FROM stripe_connections WHERE user_id = $1 LIMIT 1',
        [user.id],
      );
      return rows[0] ?? null;
    }),
    withUser(user.id, async (db) => {
      const { rows } = await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM transactions WHERE user_id = $1 AND payment_channel = 'mobilepay'",
        [user.id],
      );
      return Number(rows[0]?.n ?? 0);
    }),
  ]);

  const statuses = integrationStatuses();
  const bank = statuses.find((s) => s.kind === 'bank');
  const liveBank = connections.find((c) => c.provider !== 'demo' && c.status !== 'revoked') ?? null;
  const demoLoaded = connections.some((c) => c.provider === 'demo');

  return (
    <ConnectHub
      bankConfigured={bank?.configured ?? false}
      bankSetupHint={bank?.setupHint ?? ''}
      bankConnection={
        liveBank
          ? {
              id: liveBank.id,
              name: liveBank.institutionName,
              status: liveBank.status,
              lastSyncedAt: liveBank.lastSyncedAt,
              accountCount: liveBank.accountCount,
              syncError: liveBank.syncError,
            }
          : null
      }
      stripeConnectAvailable={stripeConnectConfigured()}
      stripeConnection={
        stripe ? { status: stripe.status, livemode: stripe.livemode, name: stripe.account_name } : null
      }
      mobilePay={{ ...mobilePayStatus(), transactionCount: mobilePayTransactions }}
      encryptionReady={hasEncryptionKey()}
      demoLoaded={demoLoaded}
      notice={params}
    />
  );
}
