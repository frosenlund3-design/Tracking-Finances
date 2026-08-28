import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { accountFlows, internalTransfers } from '@/services/account-flows';
import { monthRange, formatDay } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyState } from '@/components/ui/primitives';
import { Sparkline } from '@/components/charts/sparkline';
import { DemoBanner } from '@/components/demo-banner';
import type { AccountFlow } from '@/services/account-flows';

export const metadata: Metadata = { title: 'Accounts' };
export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const user = await requireUser();
  const currency = user.baseCurrency;
  const month = monthRange(0);

  const [flows, transfers] = await Promise.all([
    accountFlows(user.id, { from: month.start, to: month.end }),
    internalTransfers(user.id, { from: month.start, to: month.end }),
  ]);

  if (flows.length === 0) {
    return (
      <div className="rise">
        <h1 className="text-[28px] font-semibold tracking-tight">Accounts</h1>
        <Card className="mt-5">
          <EmptyState
            title="No accounts yet"
            description="Connect a bank or Stripe and every account shows up here with exactly what moved through it."
            action={
              <Link href="/connect">
                <Button>Connect an account</Button>
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const active = flows.filter((f) => f.isActive);
  const closed = flows.filter((f) => !f.isActive);
  const byId = new Map(flows.map((f) => [f.accountId, f]));

  const totalExternalIn = active.reduce((s, f) => s + f.externalInMinor, 0);
  const totalExternalOut = active.reduce((s, f) => s + f.externalOutMinor, 0);
  const totalInternal = active.reduce((s, f) => s + f.internalOutMinor, 0);

  return (
    <div className="rise space-y-6">
      <DemoBanner demoMode={user.demoMode} />

      <header>
        <p className="text-[13px] text-ink-muted">{month.label}</p>
        <h1 className="mt-0.5 text-[28px] font-semibold leading-tight tracking-tight">Accounts</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
          Exactly what entered and left each account, with money you moved between your own accounts
          counted separately.
        </p>
      </header>

      <section className="grid grid-cols-3 gap-2.5">
        <Tile label="In from outside" value={formatMoney(totalExternalIn, currency, { compact: true })} />
        <Tile label="Out to outside" value={formatMoney(totalExternalOut, currency, { compact: true })} />
        <Tile
          label="Moved internally"
          value={formatMoney(totalInternal, currency, { compact: true })}
          hint="not income"
        />
      </section>

      <div className="space-y-3">
        {active.map((flow) => (
          <AccountCard key={flow.accountId} flow={flow} currency={currency} />
        ))}
      </div>

      {transfers.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Between your own accounts</CardTitle>
          </CardHeader>
          <CardBody className="pt-0">
            <ul className="divide-y divide-border">
              {transfers.slice(0, 8).map((transfer, i) => (
                <li key={`${transfer.date}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px]">
                      {transfer.fromAccountId ? byId.get(transfer.fromAccountId)?.name ?? 'Elsewhere' : 'Elsewhere'}
                      <span aria-hidden="true" className="mx-1.5 text-ink-subtle">
                        →
                      </span>
                      {transfer.toAccountId ? byId.get(transfer.toAccountId)?.name ?? 'Elsewhere' : 'Elsewhere'}
                    </p>
                    <p className="flex items-center gap-1.5 text-[12px] text-ink-subtle">
                      <span className="truncate">
                        {formatDay(transfer.date)} · {transfer.label}
                      </span>
                      {transfer.inferred ? (
                        <Badge title="Paired by matching amount and date, not stated by the bank.">
                          Matched
                        </Badge>
                      ) : null}
                    </p>
                  </div>
                  <span className="numeral shrink-0 text-[13.5px] text-ink-muted">
                    {formatMoney(transfer.amountMinor, currency, { compact: true })}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-subtle">
              These are not income or spending — the same krone appears on both sides, so they are
              excluded from every total in the app.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {closed.length > 0 ? (
        <section>
          <h2 className="px-1 text-[13px] font-medium uppercase tracking-wide text-ink-subtle">
            Disconnected
          </h2>
          <div className="mt-2 space-y-2 opacity-70">
            {closed.map((flow) => (
              <AccountCard key={flow.accountId} flow={flow} currency={currency} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function AccountCard({ flow, currency }: { flow: AccountFlow; currency: string }) {
  const series = flow.series.map((p) => p.balanceMinor);

  return (
    <Link href={`/accounts/${flow.accountId}`} className="block">
      <Card interactive className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2">
              <span className="truncate text-[16px] font-semibold tracking-tight">{flow.name}</span>
              {flow.ownership === 'business' ? <Badge tone="accent">Business</Badge> : null}
              {!flow.isActive ? <Badge>Disconnected</Badge> : null}
            </p>
            <p className="mt-0.5 truncate text-[12.5px] text-ink-subtle">
              {flow.institution ?? 'Account'}
              {flow.maskedReference ? ` · ${flow.maskedReference}` : ''}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="numeral text-[17px] font-semibold">
              {flow.balanceMinor === null
                ? '—'
                : formatMoney(flow.balanceMinor, flow.currency, { compact: true })}
            </p>
            {series.length > 1 ? (
              <Sparkline
                values={series}
                className="mt-1 h-5 w-20"
                ariaLabel={`Balance trend for ${flow.name}`}
              />
            ) : null}
          </div>
        </div>

        <dl className="mt-3.5 grid grid-cols-3 gap-2 border-t border-border pt-3 text-[12px]">
          <Flow label="In" value={formatMoney(flow.externalInMinor, currency, { compact: true })} />
          <Flow label="Out" value={formatMoney(flow.externalOutMinor, currency, { compact: true })} />
          <Flow
            label="Internal"
            value={formatMoney(flow.internalInMinor + flow.internalOutMinor, currency, { compact: true })}
            muted
          />
        </dl>
      </Card>
    </Link>
  );
}

function Flow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <dt className="text-ink-subtle">{label}</dt>
      <dd className={`numeral mt-0.5 text-[13.5px] ${muted ? 'text-ink-subtle' : 'font-medium'}`}>
        {value}
      </dd>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-tile)] border border-border bg-surface px-3 py-2.5">
      <p className="text-[11px] text-ink-subtle">{label}</p>
      <p className="numeral mt-0.5 text-[15px] font-semibold">{value}</p>
      {hint ? <p className="text-[11px] text-ink-subtle">{hint}</p> : null}
    </div>
  );
}
