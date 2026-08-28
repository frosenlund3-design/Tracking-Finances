'use client';

import { useState, useTransition } from 'react';
import { Badge, Button, Card, CardBody, Field, Input, Select } from '@/components/ui/primitives';
import { formatMoney } from '@/lib/money';
import {
  connectStripeAction,
  disconnectBankAction,
  disconnectStripeAction,
  syncConnectionAction,
  type IntegrationResult,
} from './actions';
import type { ConnectionSummary } from '@/services/sync';
import type { IntegrationStatus } from '@/integrations/registry';
import type { FinancialAccount } from '@/types/finance';

interface StripeConnection {
  accountName: string | null;
  livemode: boolean;
  status: string;
  lastSyncedAt: string | null;
  syncError: string | null;
}

const STATUS_TONE: Record<string, 'positive' | 'notice' | 'negative' | 'neutral'> = {
  ok: 'positive',
  syncing: 'neutral',
  never: 'neutral',
  expired: 'notice',
  error: 'negative',
  revoked: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  ok: 'Connected',
  syncing: 'Syncing',
  never: 'Not synced yet',
  expired: 'Needs reconnecting',
  error: 'Sync problem',
  revoked: 'Disconnected',
};

export function IntegrationsPanel({
  statuses,
  connections,
  stripe,
  accounts,
  encryptionReady,
}: {
  statuses: IntegrationStatus[];
  connections: ConnectionSummary[];
  stripe: StripeConnection | null;
  accounts: FinancialAccount[];
  encryptionReady: boolean;
}) {
  const [result, setResult] = useState<IntegrationResult | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<IntegrationResult>) => {
    setResult(null);
    startTransition(async () => setResult(await fn()));
  };

  const bank = statuses.find((s) => s.kind === 'bank');
  const stripeStatus = statuses.find((s) => s.id === 'stripe');
  const others = statuses.filter((s) => s.id !== 'stripe' && s.kind !== 'bank');
  const activeConnections = connections.filter((c) => c.status !== 'revoked');

  return (
    <div className="space-y-4">
      {result?.error ? (
        <p role="alert" className="rounded-lg bg-negative-soft px-3.5 py-2.5 text-[13px] text-negative">
          {result.error}
        </p>
      ) : null}
      {result?.message ? (
        <p role="status" className="rounded-lg bg-positive-soft px-3.5 py-2.5 text-[13px] text-positive">
          {result.message}
        </p>
      ) : null}

      {activeConnections.length > 0 ? (
        <section className="space-y-2">
          <h2 className="px-1 text-[13px] font-medium uppercase tracking-wide text-ink-subtle">
            Connected
          </h2>
          {activeConnections.map((connection) => {
            const linked = accounts.filter((a) => a.connectionId === connection.id && a.isActive);
            return (
              <Card key={connection.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[15px] font-medium">
                      <span className="truncate">{connection.institutionName}</span>
                      <Badge tone={STATUS_TONE[connection.status] ?? 'neutral'}>
                        {STATUS_LABEL[connection.status] ?? connection.status}
                      </Badge>
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-subtle">
                      {connection.accountCount} account{connection.accountCount === 1 ? '' : 's'}
                      {connection.lastSyncedAt
                        ? ` · last synced ${new Date(connection.lastSyncedAt).toLocaleString('en-GB', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}`
                        : ' · not synced yet'}
                    </p>
                  </div>
                  <Badge tone="positive" className="shrink-0">
                    Read-only
                  </Badge>
                </div>

                {connection.syncError ? (
                  <p className="mt-3 rounded-lg bg-notice-soft px-3 py-2 text-[12px] leading-relaxed text-ink-muted">
                    {connection.syncError} Your imported history is unaffected.
                  </p>
                ) : null}

                {linked.length > 0 ? (
                  <ul className="mt-3 divide-y divide-border border-t border-border pt-1">
                    {linked.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                        <span className="min-w-0 truncate">
                          {a.name}
                          {a.maskedReference ? (
                            <span className="ml-1.5 text-ink-subtle">{a.maskedReference}</span>
                          ) : null}
                        </span>
                        <span className="numeral shrink-0 text-ink-muted">
                          {a.balanceMinor === null
                            ? '—'
                            : formatMoney(a.balanceMinor, a.currency, { compact: true })}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set('connectionId', connection.id);
                      fd.set('target', connection.provider === 'demo' ? 'demo' : 'bank');
                      run(() => syncConnectionAction(fd));
                    }}
                  >
                    {pending ? 'Syncing…' : 'Sync now'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set('connectionId', connection.id);
                      run(() => disconnectBankAction(fd));
                    }}
                  >
                    Disconnect
                  </Button>
                </div>
              </Card>
            );
          })}
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="px-1 text-[13px] font-medium uppercase tracking-wide text-ink-subtle">
          Available
        </h2>

        {bank ? <BankCard status={bank} onResult={setResult} /> : null}

        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-medium">Stripe</p>
              <p className="mt-0.5 text-[12px] text-ink-subtle">
                Payments, refunds, fees and payouts.
              </p>
            </div>
            {stripe ? (
              <Badge tone={STATUS_TONE[stripe.status] ?? 'neutral'} className="shrink-0">
                {stripe.livemode ? 'Live' : 'Test'} · {STATUS_LABEL[stripe.status] ?? stripe.status}
              </Badge>
            ) : (
              <Badge className="shrink-0">Not connected</Badge>
            )}
          </div>

          {stripe ? (
            <>
              <p className="mt-2 text-[13px] text-ink-muted">
                {stripe.accountName ?? 'Stripe account'}
                {stripe.lastSyncedAt
                  ? ` · last synced ${new Date(stripe.lastSyncedAt).toLocaleString('en-GB', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}`
                  : ''}
              </p>
              {stripe.syncError ? (
                <p className="mt-2 rounded-lg bg-notice-soft px-3 py-2 text-[12px] text-ink-muted">
                  {stripe.syncError}
                </p>
              ) : null}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set('target', 'stripe');
                    run(() => syncConnectionAction(fd));
                  }}
                >
                  Sync now
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(disconnectStripeAction)}>
                  Disconnect
                </Button>
              </div>
            </>
          ) : (
            <StripeConnectForm
              disabled={!encryptionReady}
              onResult={setResult}
              hint={stripeStatus?.setupHint}
              docsUrl={stripeStatus?.docsUrl}
            />
          )}
        </Card>

        {others.map((status) => (
          <Card key={status.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-medium">{status.displayName}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{status.setupHint}</p>
              </div>
              <Badge className="shrink-0">{status.configured ? 'Configured' : 'Not set up'}</Badge>
            </div>
            <a
              href={status.docsUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-block text-[13px] font-medium text-accent"
            >
              Provider docs ↗
            </a>
          </Card>
        ))}
      </section>

      <Card className="p-4">
        <p className="text-[15px] font-medium">Demo data</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          Nine months of realistic Danish transactions across personal, business and Stripe
          accounts. It runs through the same pipeline as real data.
        </p>
        <Button
          className="mt-3"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set('target', 'demo');
            run(() => syncConnectionAction(fd));
          }}
        >
          {pending ? 'Working…' : 'Load or refresh demo data'}
        </Button>
      </Card>
    </div>
  );
}

function BankCard({
  status,
  onResult,
}: {
  status: IntegrationStatus;
  onResult: (result: IntegrationResult) => void;
}) {
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }> | null
  >(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadInstitutions() {
    setBusy(true);
    onResult({});
    try {
      const response = await fetch('/api/banks/institutions?country=DK');
      const data = (await response.json()) as {
        institutions?: Array<{ id: string; name: string }>;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? 'Could not load banks.');
      setInstitutions(data.institutions ?? []);
      setSelected(data.institutions?.[0]?.id ?? '');
    } catch (err) {
      onResult({ error: err instanceof Error ? err.message : 'Could not load banks.' });
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    const institution = institutions?.find((i) => i.id === selected);
    if (!institution) return;
    setBusy(true);
    try {
      const response = await fetch('/api/banks/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ institutionId: institution.id, institutionName: institution.name }),
      });
      const data = (await response.json()) as { authorizationUrl?: string; error?: string };
      if (!response.ok || !data.authorizationUrl) {
        throw new Error(data.error ?? 'Could not start the bank authorization.');
      }
      // Hand off to the bank's own authorization page.
      window.location.href = data.authorizationUrl;
    } catch (err) {
      onResult({ error: err instanceof Error ? err.message : 'Could not connect.' });
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium">Your bank</p>
          <p className="mt-0.5 text-[12px] text-ink-subtle">
            via {status.displayName} · Open Banking (PSD2)
          </p>
        </div>
        <Badge tone={status.configured ? 'positive' : 'neutral'} className="shrink-0">
          {status.configured ? 'Ready' : 'Not set up'}
        </Badge>
      </div>

      {status.configured ? (
        <>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
            You authorize at your own bank. Kroner never sees your MitID or bank password.
          </p>
          {institutions === null ? (
            <Button className="mt-3" size="sm" disabled={busy} onClick={loadInstitutions}>
              {busy ? 'Loading banks…' : 'Connect bank'}
            </Button>
          ) : institutions.length === 0 ? (
            <p className="mt-3 text-[13px] text-ink-muted">No banks were returned for Denmark.</p>
          ) : (
            <div className="mt-3 space-y-2">
              <Select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Choose your bank">
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </Select>
              <Button size="sm" full disabled={busy || !selected} onClick={connect}>
                {busy ? 'Opening your bank…' : 'Continue to your bank'}
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{status.setupHint}</p>
          <a
            href={status.docsUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-block text-[13px] font-medium text-accent"
          >
            Provider docs ↗
          </a>
        </>
      )}
    </Card>
  );
}

function StripeConnectForm({
  disabled,
  onResult,
  hint,
  docsUrl,
}: {
  disabled: boolean;
  onResult: (result: IntegrationResult) => void;
  hint?: string;
  docsUrl?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="mt-3">
        <Button size="sm" disabled={disabled} onClick={() => setOpen(true)}>
          Connect Stripe
        </Button>
        {disabled ? (
          <p className="mt-2 text-[12px] text-ink-subtle">
            Set TOKEN_ENCRYPTION_KEY first — Kroner will not store an unencrypted key.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="mt-3 space-y-2.5"
      action={(formData) => {
        onResult({});
        startTransition(async () => {
          const result = await connectStripeAction(formData);
          onResult(result);
          if (result.ok) setOpen(false);
        });
      }}
    >
      <Field
        label="Stripe API key"
        htmlFor="apiKey"
        hint="Use a restricted key with read access to Balance transactions and Charges. It is encrypted before storage and never shown again."
      >
        <Input
          id="apiKey"
          name="apiKey"
          type="password"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="rk_live_…"
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Verifying…' : 'Connect'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {docsUrl ? (
        <a
          href={docsUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="block text-[12px] text-accent"
        >
          How to create a restricted key ↗
        </a>
      ) : hint ? (
        <p className="text-[12px] text-ink-subtle">{hint}</p>
      ) : null}
    </form>
  );
}
