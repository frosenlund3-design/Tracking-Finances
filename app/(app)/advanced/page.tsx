import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { monthRange, lastNDays } from '@/lib/dates';
import { formatMoney, percentChange } from '@/lib/money';
import {
  categoryBreakdown,
  compareCategories,
  merchantBreakdown,
  monthlyTrend,
  periodTotals,
  spendingRate,
} from '@/services/analytics';
import { channelBreakdown } from '@/services/mobilepay';
import { accountFlows } from '@/services/account-flows';
import { cashFlowForecast } from '@/services/forecast';
import { listSubscriptions } from '@/services/subscriptions';
import { withUser } from '@/database';
import { Card, CardBody, CardHeader, CardTitle, Badge, EmptyState, Button } from '@/components/ui/primitives';
import { CategoryBars } from '@/components/charts/category-bars';
import { TrendBars } from '@/components/charts/trend-bars';
import { DemoBanner } from '@/components/demo-banner';

export const metadata: Metadata = { title: 'Advanced' };
export const dynamic = 'force-dynamic';

/**
 * The numbers behind the numbers.
 *
 * Everything here is a straight query. Nothing is smoothed, nothing is
 * projected except where it says so, and each figure carries the count it was
 * computed from so it can be checked.
 */
export default async function AdvancedPage() {
  const user = await requireUser();
  const currency = user.baseCurrency;
  const now = new Date();
  const month = monthRange(0, now);
  const range = { from: month.start, to: month.end };
  const ninety = lastNDays(90, now);

  const [
    totals,
    channels,
    flows,
    trend,
    movements,
    merchants,
    categories,
    rate,
    forecast,
    subscriptions,
    fixedVsVariable,
  ] = await Promise.all([
    periodTotals(user.id, range, currency),
    channelBreakdown(user.id, { ...range, excludeInternal: true }),
    accountFlows(user.id, range),
    monthlyTrend(user.id, 12, 'all', now),
    compareCategories(user.id, 'all', now),
    merchantBreakdown(user.id, { from: ninety.start, to: ninety.end }, 12),
    categoryBreakdown(user.id, range, 'expense', 20),
    spendingRate(user.id, 90, 'all', now),
    cashFlowForecast(user.id, currency, now),
    listSubscriptions(user.id, { status: 'active' }),
    // What share of spending is committed before the month starts.
    withUser(user.id, async (db) => {
      const { rows } = await db.query<{ recurring: number | null; total: number | null }>(
        `SELECT
           COALESCE(sum(-amount_minor) FILTER (WHERE recurring_status = 'recurring'), 0) AS recurring,
           COALESCE(sum(-amount_minor), 0) AS total
         FROM transactions
         WHERE user_id = $1 AND amount_minor < 0 AND category <> 'transfers'
           AND transaction_date BETWEEN $2 AND $3`,
        [user.id, ninety.start, ninety.end],
      );
      return {
        recurringMinor: Number(rows[0]?.recurring ?? 0),
        totalMinor: Number(rows[0]?.total ?? 0),
      };
    }),
  ]);

  if (totals.transactionCount === 0 && flows.length === 0) {
    return (
      <div className="rise">
        <h1 className="text-[28px] font-semibold tracking-tight">Advanced</h1>
        <Card className="mt-5">
          <EmptyState
            title="Nothing to analyse yet"
            description="Connect an account or load demo data, and every breakdown here fills in."
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

  const committedShare =
    fixedVsVariable.totalMinor > 0
      ? fixedVsVariable.recurringMinor / fixedVsVariable.totalMinor
      : 0;
  const monthlySubs = subscriptions.reduce((s, x) => s + x.monthlyEquivalentMinor, 0);
  const savingsRate = totals.incomeMinor > 0 ? totals.netMinor / totals.incomeMinor : null;
  const runwayMonths =
    rate.dailyRateMinor > 0
      ? forecast.startingBalanceMinor / (rate.dailyRateMinor * 30.44)
      : null;

  const twelveMonthNet = trend.reduce((s, p) => s + p.netMinor, 0);
  // Months before the history starts are empty, not frugal. Ranking them
  // would report "your tightest month" for a month that never happened.
  const monthsWithActivity = trend.filter((p) => p.incomeMinor > 0 || p.expenseMinor > 0);
  const bestMonth = [...monthsWithActivity].sort((a, b) => b.netMinor - a.netMinor)[0];
  const worstMonth = [...monthsWithActivity].sort((a, b) => a.netMinor - b.netMinor)[0];

  const notableMoves = movements
    .filter((m) => m.changePct !== null && Math.abs(m.changePct) >= 25 && m.previousMinor > 0)
    .slice(0, 8);

  return (
    <div className="rise space-y-6">
      <DemoBanner demoMode={user.demoMode} />

      <header>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Advanced</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
          Every figure here is a direct query over your transactions, with the count it came from.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <Metric
          label="Savings rate"
          value={savingsRate === null ? '—' : `${Math.round(savingsRate * 100)}%`}
          hint={`of ${formatMoney(totals.incomeMinor, currency, { compact: true })} in this month`}
        />
        <Metric
          label="Committed spending"
          value={`${Math.round(committedShare * 100)}%`}
          hint="recurring share, last 90 days"
        />
        <Metric
          label="Daily burn"
          value={formatMoney(rate.dailyRateMinor, currency, { compact: true })}
          hint={`averaged over ${rate.sampleDays} days`}
        />
        <Metric
          label="Runway"
          value={runwayMonths === null ? '—' : `${runwayMonths.toFixed(1)} mo`}
          hint="balance ÷ burn rate, an estimate"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>How money leaves</CardTitle>
        </CardHeader>
        <CardBody>
          {channels.filter((c) => c.outMinor > 0).length > 0 ? (
            <>
              <CategoryBars
                data={channels
                  .filter((c) => c.outMinor > 0)
                  .map((c) => ({
                    category: c.channel,
                    label: c.label,
                    amountMinor: c.outMinor,
                    share: c.share,
                    transactionCount: c.transactionCount,
                  }))}
                currency={currency}
              />
              <p className="mt-3 text-[12px] leading-relaxed text-ink-subtle">
                Read from the payment rail in each bank description. Anything the bank did not label
                is grouped as Other rather than guessed at.
              </p>
            </>
          ) : (
            <p className="py-4 text-center text-[13px] text-ink-muted">No spending this month yet.</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Twelve months</CardTitle>
          <span className="numeral text-[13px] text-ink-muted">
            net {formatMoney(twelveMonthNet, currency, { compact: true, signed: true })}
          </span>
        </CardHeader>
        <CardBody>
          <TrendBars data={trend} currency={currency} />
          {bestMonth && worstMonth && monthsWithActivity.length > 1 ? (
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-[12.5px]">
              <div>
                <dt className="text-ink-subtle">Best month</dt>
                <dd className="numeral mt-0.5 font-medium">
                  {bestMonth.label} · {formatMoney(bestMonth.netMinor, currency, { compact: true, signed: true })}
                </dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Tightest month</dt>
                <dd className="numeral mt-0.5 font-medium">
                  {worstMonth.label} ·{' '}
                  {formatMoney(worstMonth.netMinor, currency, { compact: true, signed: true })}
                </dd>
              </div>
            </dl>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account flow</CardTitle>
          <Link href="/accounts" className="text-[13px] font-medium text-accent">
            Detail
          </Link>
        </CardHeader>
        <CardBody className="pt-0">
          <ul className="divide-y divide-border">
            {flows
              .filter((f) => f.isActive)
              .map((flow) => {
                const gross = flow.externalInMinor + flow.externalOutMinor || 1;
                return (
                  <li key={flow.accountId} className="py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[13.5px] font-medium">{flow.name}</span>
                      <span className="numeral shrink-0 text-[13px] text-ink-muted">
                        {formatMoney(flow.externalInMinor - flow.externalOutMinor, currency, {
                          compact: true,
                          signed: true,
                        })}
                      </span>
                    </div>
                    {/* In and out as one bar, split at the point they balance. */}
                    <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-muted">
                      <span
                        className="h-full"
                        style={{
                          width: `${(flow.externalInMinor / gross) * 100}%`,
                          background: 'var(--color-series-in)',
                        }}
                      />
                      <span className="h-full w-[2px] shrink-0 bg-surface" />
                      <span
                        className="h-full"
                        style={{
                          width: `${(flow.externalOutMinor / gross) * 100}%`,
                          background: 'var(--color-series-out)',
                        }}
                      />
                    </div>
                    <p className="numeral mt-1.5 text-[11.5px] text-ink-subtle">
                      {formatMoney(flow.externalInMinor, currency, { compact: true })} in ·{' '}
                      {formatMoney(flow.externalOutMinor, currency, { compact: true })} out ·{' '}
                      {flow.transactionCount} movements
                    </p>
                  </li>
                );
              })}
          </ul>
        </CardBody>
      </Card>

      {notableMoves.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Biggest changes vs. last month</CardTitle>
          </CardHeader>
          <CardBody className="pt-0">
            <ul className="divide-y divide-border">
              {notableMoves.map((move) => (
                <li key={move.category} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate text-[13.5px]">{move.label}</span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span className="numeral text-[12.5px] text-ink-muted">
                      {formatMoney(move.previousMinor, currency, { compact: true })} →{' '}
                      {formatMoney(move.currentMinor, currency, { compact: true })}
                    </span>
                    <Badge tone={move.changePct! > 0 ? 'notice' : 'positive'}>
                      {move.changePct! > 0 ? '+' : ''}
                      {Math.round(move.changePct!)}%
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Where it goes, last 90 days</CardTitle>
          </CardHeader>
          <CardBody className="pt-0">
            <ul className="divide-y divide-border">
              {merchants.map((merchant) => (
                <li key={merchant.merchantKey}>
                  <Link
                    href={`/transactions?merchant=${encodeURIComponent(merchant.merchantKey)}&range=last_90`}
                    className="flex items-center justify-between gap-3 py-2.5 hover:text-accent"
                  >
                    <span className="min-w-0 truncate text-[13.5px]">{merchant.merchant}</span>
                    <span className="numeral shrink-0 text-[12.5px] text-ink-muted">
                      {formatMoney(merchant.amountMinor, currency, { compact: true })}
                      <span className="ml-1.5 text-ink-subtle">{merchant.transactionCount}×</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Category detail this month</CardTitle>
          </CardHeader>
          <CardBody>
            {categories.length > 0 ? (
              <CategoryBars data={categories} currency={currency} />
            ) : (
              <p className="py-4 text-center text-[13px] text-ink-muted">Nothing spent yet.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fixed costs</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-[13.5px] leading-relaxed text-ink-muted">
            {subscriptions.length} recurring payment{subscriptions.length === 1 ? '' : 's'} commit{' '}
            <strong className="font-medium text-ink">
              {formatMoney(monthlySubs, currency, { compact: true })}
            </strong>{' '}
            a month before you spend anything else — {Math.round(committedShare * 100)}% of what
            actually left your accounts over the last 90 days.
          </p>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-muted">
            <span
              className="h-full rounded-l-full"
              style={{ width: `${Math.min(committedShare * 100, 100)}%`, background: 'var(--color-magnitude)' }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[11.5px] text-ink-subtle">
            <span>Committed</span>
            <span>Discretionary</span>
          </div>
          <Link href="/subscriptions" className="mt-3 inline-block text-[13px] font-medium text-accent">
            See every recurring payment
          </Link>
        </CardBody>
      </Card>

      <p className="px-1 pb-2 text-[12px] leading-relaxed text-ink-subtle">
        Runway and burn rate are estimates from observed spending, not predictions. Savings rate is
        this month only, and the month is not over.
      </p>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <p className="text-[12px] text-ink-muted">{label}</p>
      <p className="numeral mt-1 text-[24px] font-semibold leading-none">{value}</p>
      <p className="mt-1.5 text-[11.5px] leading-snug text-ink-subtle">{hint}</p>
    </div>
  );
}
