import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { monthRange } from '@/lib/dates';
import { formatMoney, percentChange } from '@/lib/money';
import {
  businessSummary,
  categoryBreakdown,
  merchantBreakdown,
  monthlyTrend,
} from '@/services/analytics';
import { listTransactions } from '@/services/transactions';
import { listSubscriptions } from '@/services/subscriptions';
import { StatTile } from '@/components/money';
import { TransactionList } from '@/components/transaction-row';
import { CategoryBars } from '@/components/charts/category-bars';
import { TrendBars } from '@/components/charts/trend-bars';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@/components/ui/primitives';
import { DemoBanner } from '@/components/demo-banner';

export const metadata: Metadata = { title: 'Business' };
export const dynamic = 'force-dynamic';

export default async function BusinessPage() {
  const user = await requireUser();
  const currency = user.baseCurrency;
  const now = new Date();
  const month = monthRange(0, now);
  const previous = monthRange(-1, now);

  const [current, prior, trend, costs, topCustomers, recent, subscriptions] = await Promise.all([
    businessSummary(user.id, month.start, month.end, currency),
    businessSummary(user.id, previous.start, previous.end, currency),
    monthlyTrend(user.id, 6, 'business', now),
    categoryBreakdown(user.id, { from: month.start, to: month.end, ownership: 'business' }, 'expense', 8),
    merchantBreakdown(
      user.id,
      { from: month.start, to: month.end, ownership: 'business', direction: 'income' },
      5,
    ),
    listTransactions(user.id, { ownership: 'business' }, { limit: 8 }),
    listSubscriptions(user.id, { ownership: 'business', status: 'active' }),
  ]);

  if (current.transactionCount === 0 && recent.total === 0) {
    return (
      <div className="rise">
        <h1 className="text-2xl font-semibold tracking-tight">Business</h1>
        <Card className="mt-5">
          <EmptyState
            title="No business activity yet"
            description="Mark a transaction as business, or connect Stripe, and the business view fills in."
            action={
              <Link href="/connect">
                <Button>Connect Stripe</Button>
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const revenueChange = percentChange(current.revenueMinor, prior.revenueMinor);
  const businessSubscriptionCost = subscriptions.reduce((s, x) => s + x.monthlyEquivalentMinor, 0);

  return (
    <div className="rise space-y-6">
      <DemoBanner demoMode={user.demoMode} />

      <header>
        <p className="text-[13px] text-ink-muted">{month.label}</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">Business</h1>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <StatTile
          label="Revenue"
          minor={current.revenueMinor}
          currency={currency}
          hint={
            revenueChange === null
              ? 'No comparison for last month'
              : `${revenueChange >= 0 ? 'Up' : 'Down'} ${Math.abs(Math.round(revenueChange))}% vs. ${previous.label}`
          }
        />
        <StatTile label="Expenses" minor={current.expenseMinor} currency={currency} />
        <StatTile
          label="Gross profit"
          minor={current.grossProfitMinor}
          currency={currency}
          signed
          hint="Revenue minus recorded costs. Not a tax figure."
        />
        <StatTile
          label="Net cash flow"
          minor={current.netMinor}
          currency={currency}
          signed
          hint="Every krone in and out, revenue or not"
        />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SmallStat
          label="Via Stripe"
          value={formatMoney(current.processorRevenueMinor, currency, { compact: true })}
          hint="of revenue"
        />
        <SmallStat label="Refunds" value={formatMoney(current.refundsMinor, currency, { compact: true })} />
        <SmallStat label="Processing fees" value={formatMoney(current.processingFeesMinor, currency, { compact: true })} />
        <SmallStat
          label="Est. recurring revenue"
          value={formatMoney(current.recurringRevenueMinor, currency, { compact: true })}
          hint="per month"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Business revenue and costs</CardTitle>
        </CardHeader>
        <CardBody>
          <TrendBars data={trend} currency={currency} />
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cost breakdown</CardTitle>
          </CardHeader>
          <CardBody>
            {costs.length > 0 ? (
              <CategoryBars data={costs} currency={currency} />
            ) : (
              <p className="py-6 text-center text-[13px] text-ink-muted">No business costs this month.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top paying customers</CardTitle>
          </CardHeader>
          <CardBody>
            {topCustomers.length > 0 ? (
              <ul className="divide-y divide-border">
                {topCustomers.map((c) => (
                  <li key={c.merchantKey} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 truncate text-[14px]">{c.merchant}</span>
                    <span className="tnum shrink-0 text-[14px] text-ink-muted">
                      {formatMoney(c.amountMinor, currency, { compact: true })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-[13px] text-ink-muted">No revenue recorded this month.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {subscriptions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Business subscriptions</CardTitle>
            <Link href="/subscriptions" className="text-[13px] font-medium text-accent">
              All
            </Link>
          </CardHeader>
          <CardBody className="pt-0">
            <p className="mb-3 text-[13px] text-ink-muted">
              {subscriptions.length} recurring cost{subscriptions.length === 1 ? '' : 's'} totalling{' '}
              {formatMoney(businessSubscriptionCost, currency, { compact: true })} a month.
            </p>
            <ul className="divide-y divide-border">
              {subscriptions.slice(0, 6).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate text-[14px]">{s.merchantLabel}</span>
                  <span className="tnum shrink-0 text-[14px] text-ink-muted">
                    {formatMoney(s.monthlyEquivalentMinor, s.currency)}/mo
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Recent business activity</CardTitle>
          <Link href="/transactions?ownership=business" className="text-[13px] font-medium text-accent">
            All
          </Link>
        </CardHeader>
        <div className="border-t border-border">
          <TransactionList transactions={recent.transactions} />
        </div>
      </Card>

      <p className="px-1 pb-2 text-[12px] leading-relaxed text-ink-subtle">
        Gross profit is revenue minus the business costs recorded here. No tax rules are applied
        anywhere in Kroner, so nothing on this page is profit after tax. Speak to an accountant
        before filing anything.
      </p>
    </div>
  );
}

function SmallStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <p className="text-[11px] text-ink-subtle">{label}</p>
      <p className="tnum mt-0.5 text-[15px] font-medium">{value}</p>
      {hint ? <p className="text-[11px] text-ink-subtle">{hint}</p> : null}
    </div>
  );
}
