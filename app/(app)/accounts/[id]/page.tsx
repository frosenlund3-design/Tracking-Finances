import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { accountDetail } from '@/services/account-flows';
import { channelBreakdown } from '@/services/mobilepay';
import { listTransactions } from '@/services/transactions';
import { monthRange } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { Card, CardBody, CardHeader, CardTitle, Badge } from '@/components/ui/primitives';
import { CategoryBars } from '@/components/charts/category-bars';
import { BalanceLine } from '@/components/charts/balance-line';
import { TransactionList } from '@/components/transaction-row';

export const metadata: Metadata = { title: 'Account' };
export const dynamic = 'force-dynamic';

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const currency = user.baseCurrency;
  const month = monthRange(0);
  const range = { from: month.start, to: month.end };

  const detail = await accountDetail(user.id, id, range);
  if (!detail) notFound();

  const [channels, recent] = await Promise.all([
    channelBreakdown(user.id, { ...range, accountIds: [id] }),
    listTransactions(user.id, { ...range, accountIds: [id] }, { limit: 12 }),
  ]);

  const outgoingChannels = channels.filter((c) => c.outMinor > 0);

  return (
    <div className="rise space-y-5">
      <Link
        href="/accounts"
        className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink"
      >
        <span aria-hidden="true">←</span> Accounts
      </Link>

      <header>
        <p className="flex items-center gap-2 text-[13px] text-ink-muted">
          {detail.institution ?? 'Account'}
          {detail.maskedReference ? <span>{detail.maskedReference}</span> : null}
          {detail.ownership === 'business' ? <Badge tone="accent">Business</Badge> : null}
        </p>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight">{detail.name}</h1>
        <p className="numeral mt-1.5 text-[34px] font-semibold leading-none tracking-tight">
          {detail.balanceMinor === null
            ? '—'
            : formatMoney(detail.balanceMinor, detail.currency, { compact: true })}
        </p>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          {detail.transactionCount} movement{detail.transactionCount === 1 ? '' : 's'} in {month.label}
        </p>
      </header>

      {detail.series.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Balance this month</CardTitle>
          </CardHeader>
          <CardBody>
            <BalanceLine points={detail.series} currency={detail.currency} />
          </CardBody>
        </Card>
      ) : null}

      <section className="grid grid-cols-2 gap-3">
        <Stat label="In from outside" minor={detail.externalInMinor} currency={currency} />
        <Stat label="Out to outside" minor={detail.externalOutMinor} currency={currency} />
        <Stat
          label="In from your accounts"
          minor={detail.internalInMinor}
          currency={currency}
          muted
        />
        <Stat
          label="Out to your accounts"
          minor={detail.internalOutMinor}
          currency={currency}
          muted
        />
      </section>

      {outgoingChannels.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>How money left</CardTitle>
          </CardHeader>
          <CardBody>
            <CategoryBars
              data={outgoingChannels.map((c) => ({
                category: c.channel,
                label: c.label,
                amountMinor: c.outMinor,
                share: c.share,
                transactionCount: c.transactionCount,
              }))}
              currency={currency}
            />
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Biggest outgoing</CardTitle>
          </CardHeader>
          <CardBody className="pt-0">
            <CounterpartyList rows={detail.topOutgoing} currency={currency} empty="Nothing left this account." />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Biggest incoming</CardTitle>
          </CardHeader>
          <CardBody className="pt-0">
            <CounterpartyList rows={detail.topIncoming} currency={currency} empty="Nothing arrived this month." />
          </CardBody>
        </Card>
      </div>

      {detail.byCategory.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
          </CardHeader>
          <CardBody>
            <CategoryBars
              data={detail.byCategory.map((c) => ({
                category: c.category,
                label: c.label,
                amountMinor: c.amountMinor,
                share:
                  c.amountMinor /
                  Math.max(detail.byCategory.reduce((s, x) => s + x.amountMinor, 0), 1),
                transactionCount: c.count,
              }))}
              currency={currency}
            />
          </CardBody>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Recent movements</CardTitle>
          <Link
            href={`/transactions?account=${detail.accountId}&range=this_month`}
            className="text-[13px] font-medium text-accent"
          >
            All
          </Link>
        </CardHeader>
        <div className="border-t border-border">
          <TransactionList transactions={recent.transactions} />
        </div>
      </Card>
    </div>
  );
}

function Stat({
  label,
  minor,
  currency,
  muted,
}: {
  label: string;
  minor: number;
  currency: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <p className="text-[12px] text-ink-muted">{label}</p>
      <p className={`numeral mt-1 text-[20px] font-semibold ${muted ? 'text-ink-muted' : ''}`}>
        {formatMoney(minor, currency, { compact: true })}
      </p>
    </div>
  );
}

function CounterpartyList({
  rows,
  currency,
  empty,
}: {
  rows: Array<{ label: string; amountMinor: number; count: number }>;
  currency: string;
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="py-4 text-[13px] text-ink-muted">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center justify-between gap-3 py-2.5">
          <span className="min-w-0 truncate text-[13.5px]">{row.label}</span>
          <span className="numeral shrink-0 text-[13px] text-ink-muted">
            {formatMoney(row.amountMinor, currency, { compact: true })}
            <span className="ml-1.5 text-ink-subtle">{row.count}×</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
