import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { listConnections } from '@/services/sync';
import { listAccounts } from '@/services/accounts';
import { integrationStatuses } from '@/integrations/registry';
import { bookkeepingStatuses } from '@/integrations/bookkeeping';
import { hasEncryptionKey } from '@/security/crypto';
import { withUser } from '@/database';
import Link from 'next/link';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/primitives';
import { IntegrationsPanel } from './panel';

export const metadata: Metadata = { title: 'Integrations' };
export const dynamic = 'force-dynamic';

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ bank?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const [connections, accounts, stripeConnection] = await Promise.all([
    listConnections(user.id),
    listAccounts(user.id),
    withUser(user.id, async (db) => {
      const { rows } = await db.query<{
        account_name: string | null; livemode: boolean; status: string;
        last_synced_at: string | Date | null; sync_error: string | null;
      }>('SELECT account_name, livemode, status, last_synced_at, sync_error FROM stripe_connections WHERE user_id = $1 LIMIT 1', [user.id]);
      const row = rows[0];
      return row
        ? {
            accountName: row.account_name,
            livemode: row.livemode,
            status: row.status,
            lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
            syncError: row.sync_error,
          }
        : null;
    }),
  ]);

  const statuses = integrationStatuses();

  return (
    <div className="rise space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          Every connection here is read-only. Kroner requests data access and nothing else — there
          is no code path in this application that can move money.
        </p>
      </header>

      {params.bank ? <CallbackNotice status={params.bank} /> : null}

      {!hasEncryptionKey() ? (
        <Card className="border-notice/30 bg-notice-soft">
          <CardBody className="pt-4">
            <p className="text-[14px] font-medium">Encryption key not set</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              <code className="font-mono text-[12px]">TOKEN_ENCRYPTION_KEY</code> is missing, so
              provider tokens cannot be encrypted at rest. Kroner refuses to store a key it cannot
              protect — connecting a real provider is disabled until it is set. Demo mode is
              unaffected.
            </p>
          </CardBody>
        </Card>
      ) : null}

      <IntegrationsPanel
        statuses={statuses}
        connections={connections}
        stripe={stripeConnection}
        accounts={accounts}
        encryptionReady={hasEncryptionKey()}
      />

      <Card>
        <CardHeader>
          <CardTitle>Bookkeeping</CardTitle>
        </CardHeader>
        <CardBody className="pt-0">
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Business transactions carry a bookkeeping label — deductible, potentially deductible,
            not deductible, or needs review — and export as CSV with those labels attached.
          </p>
          <ul className="mt-3 divide-y divide-border">
            {bookkeepingStatuses().map((tool) => (
              <li key={tool.id} className="py-2.5">
                <p className="text-[13px] font-medium">{tool.displayName}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-subtle">{tool.note}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-subtle">
            Posting entries automatically needs a mapping from these categories onto your chart of
            accounts, which is specific to your business. Until that exists, CSV export is the
            supported path — a wrong automated posting is worse than a manual one.
          </p>
          <Link
            href="/api/export/transactions?ownership=business&range=this_year"
            prefetch={false}
            className="mt-3 inline-block text-[13px] font-medium text-accent"
          >
            Export this year’s business transactions
          </Link>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How bank access works</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2.5 pt-0 text-[13px] leading-relaxed text-ink-muted">
          <p>
            Kroner uses European Open Banking (PSD2). When you connect, you are handed to your own
            bank’s authorization page. You authenticate there — with MitID, your bank’s app, or
            whatever your bank uses — and Kroner is never part of that exchange.
          </p>
          <p>
            What comes back is a token that permits reading account details, balances and
            transactions. It is encrypted before it is written down, and it is decrypted only for
            the duration of a single call to the provider.
          </p>
          <p>
            Consent expires on a schedule your bank sets, usually every 90 to 180 days. When it
            does, syncing stops and you are asked to reconnect. Nothing already imported is
            deleted.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function CallbackNotice({ status }: { status: string }) {
  const copy: Record<string, { title: string; body: string; tone: string }> = {
    connected: {
      title: 'Bank connected',
      body: 'Your transactions are importing now.',
      tone: 'bg-positive-soft text-positive',
    },
    declined: {
      title: 'Authorization cancelled',
      body: 'Nothing was connected and nothing was stored.',
      tone: 'bg-surface-muted text-ink-muted',
    },
    pending: {
      title: 'Still waiting on your bank',
      body: 'Your bank has not confirmed the consent yet. Try the connection again in a moment.',
      tone: 'bg-notice-soft text-ink-muted',
    },
    failed: {
      title: 'Authorization did not complete',
      body: 'The bank did not confirm access. You can start again.',
      tone: 'bg-negative-soft text-negative',
    },
    unknown: {
      title: 'Could not match that authorization',
      body: 'Start the connection again from this page.',
      tone: 'bg-notice-soft text-ink-muted',
    },
  };
  const entry = copy[status] ?? copy.unknown!;
  return (
    <div role="status" className={`rounded-lg px-3.5 py-2.5 ${entry.tone}`}>
      <p className="text-[13px] font-medium">{entry.title}</p>
      <p className="mt-0.5 text-[13px] opacity-90">{entry.body}</p>
    </div>
  );
}
