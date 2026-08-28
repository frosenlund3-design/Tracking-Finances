import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { withUser, databaseKind } from '@/database';
import { listAccounts } from '@/services/accounts';
import { loadMerchantRules } from '@/services/transactions';
import { assistantAvailable } from '@/ai/assistant';
import { hasEncryptionKey } from '@/security/crypto';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/primitives';
import { categoryLabel } from '@/lib/categories';
import { formatDateTime } from '@/lib/dates';
import { SettingsPanels } from './panels';
import { signOutAction } from '@/app/auth-actions';
import { Button } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();

  const [accounts, rules, auditEvents, dbKind] = await Promise.all([
    listAccounts(user.id),
    withUser(user.id, (db) => loadMerchantRules(db, user.id)),
    withUser(user.id, async (db) => {
      const { rows } = await db.query<{ action: string; created_at: string | Date }>(
        'SELECT action, created_at FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 12',
        [user.id],
      );
      return rows.map((r) => ({ action: r.action, at: new Date(r.created_at).toISOString() }));
    }),
    databaseKind(),
  ]);

  const userRules = rules
    .filter((r) => r.source === 'user_correction')
    .map((r) => ({
      id: r.id,
      pattern: r.pattern,
      categoryLabel: categoryLabel(r.category),
      ownership: r.ownership,
    }));

  return (
    <div className="rise space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-[13px] text-ink-muted">{user.email}</p>
      </header>

      <SettingsPanels user={user} accounts={accounts} rules={userRules} />

      <Card>
        <CardHeader>
          <CardTitle>Account activity</CardTitle>
        </CardHeader>
        <CardBody className="pt-0">
          {auditEvents.length === 0 ? (
            <p className="py-3 text-[13px] text-ink-muted">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border text-[13px]">
              {auditEvents.map((event, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <span>{describeAction(event.action)}</span>
                  <span className="shrink-0 text-[12px] text-ink-subtle">
                    {formatDateTime(event.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[12px] leading-relaxed text-ink-subtle">
            Account events only. Amounts, merchants and balances are deliberately never written to
            this log.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>This deployment</CardTitle>
        </CardHeader>
        <CardBody className="pt-0">
          <dl className="divide-y divide-border text-[13px]">
            <SystemRow
              label="Database"
              value={dbKind === 'postgres' ? 'PostgreSQL (DATABASE_URL)' : 'Embedded Postgres (local)'}
            />
            <SystemRow
              label="Token encryption"
              value={hasEncryptionKey() ? 'Configured' : 'Not configured — provider keys cannot be stored'}
            />
            <SystemRow
              label="Assistant"
              value={
                assistantAvailable()
                  ? 'Natural-language questions enabled'
                  : 'Pattern-matched questions only (no ANTHROPIC_API_KEY)'
              }
            />
            <SystemRow label="Provider access" value="Read-only across every integration" />
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/privacy" className="text-[13px] font-medium text-accent">
              Privacy &amp; security
            </Link>
            <Link href="/integrations" className="text-[13px] font-medium text-accent">
              Integrations
            </Link>
            <Link href="/api/export/transactions" prefetch={false} className="text-[13px] font-medium text-accent">
              Export CSV
            </Link>
          </div>
          <form action={signOutAction} className="mt-4">
            <Button type="submit" variant="secondary" size="sm">
              Sign out
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

function SystemRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

const ACTION_COPY: Record<string, string> = {
  'auth.signed_up': 'Account created',
  'auth.signed_in': 'Signed in',
  'auth.signed_out': 'Signed out',
  'auth.password_changed': 'Password changed',
  'auth.password_reset_requested': 'Password reset requested',
  'integration.bank_connected': 'Bank connected',
  'integration.bank_disconnected': 'Bank disconnected',
  'integration.stripe_connected': 'Stripe connected',
  'integration.stripe_disconnected': 'Stripe disconnected',
  'sync.started': 'Sync started',
  'sync.completed': 'Sync completed',
  'sync.failed': 'Sync failed',
  'data.export_requested': 'Data exported',
  'data.financial_deleted': 'Financial data deleted',
  'demo.loaded': 'Demo data loaded',
};

function describeAction(action: string): string {
  return ACTION_COPY[action] ?? action;
}
