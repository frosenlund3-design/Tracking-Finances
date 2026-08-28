import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { monthRange } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import {
  businessSummary,
  categoryBreakdown,
  compareMonths,
  monthlyTrend,
  periodTotals,
} from '@/services/analytics';
import { totalBalanceMinor, listAccounts } from '@/services/accounts';
import { listTransactions } from '@/services/transactions';
import { upcomingCharges, listSubscriptions } from '@/services/subscriptions';
import { listInsights } from '@/services/insights';
import { mergeObservations } from '@/services/observations';
import { ObservationList } from '@/components/observation-list';
import { detectFindings } from '@/services/anomalies';
import { reviewCount } from '@/services/review';
import { StatTile } from '@/components/money';
import { TransactionList } from '@/components/transaction-row';
import { CategoryBars } from '@/components/charts/category-bars';
import { TrendBars } from '@/components/charts/trend-bars';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  SectionHeading,
} from '@/components/ui/primitives';
import { formatDay } from '@/lib/dates';
import { DemoBanner } from '@/components/demo-banner';
import { InstallPrompt } from '@/components/pwa';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();
  const currency = user.baseCurrency;
  const now = new Date();
  const month = monthRange(0, now);
  const showBusiness = user.trackingMode !== 'personal';

  const [
    balance,
    accounts,
    totals,
    comparison,
    trend,
    spending,
    income,
    recent,
    upcoming,
    subscriptions,
    insights,
    business,
    findings,
    needsReview,
  ] = await Promise.all([
    totalBalanceMinor(user.id, currency),
    listAccounts(user.id),
    periodTotals(user.id, { from: month.start, to: month.end }, currency),
    compareMonths(user.id, 'all', now),
    monthlyTrend(user.id, 6, 'all', now),
    categoryBreakdown(user.id, { from: month.start, to: month.end }, 'expense', 6),
    categoryBreakdown(user.id, { from: month.start, to: month.end }, 'income', 4),
    listTransactions(user.id, {}, { limit: 6 }),
    upcomingCharges(user.id, 14),
    listSubscriptions(user.id, { status: 'active' }),
    listInsights(user.id, 8),
    showBusiness ? businessSummary(user.id, month.start, month.end, currency) : null,
    detectFindings(user.id, currency),
    reviewCount(user.id),
  ]);

  const hasData = accounts.length > 0 && totals.transactionCount + recent.total > 0;
  // Status figures are already the stat tiles at the top of this screen, so
  // only the signals are worth repeating here.
  const { signals } = mergeObservations(findings, insights);
  const monthlySubscriptionCost = subscriptions.reduce((s, x) => s + x.monthlyEquivalentMinor, 0);

  if (!hasData) {
    return (
      <div className="rise">
        <h1 className="text-2xl font-semibold tracking-tight">Your dashboard</h1>
        <Card className="mt-5">
          <EmptyState
            title="Nothing to show yet"
            description="Load nine months of realistic demo data, or connect a real account. The dashboard fills in immediately either way."
            action={
              <Link href="/connect">
                <Button>Connect or load data</Button>
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const expenseChange = comparison.pacedExpenseChangePct;

  return (
    <div className="rise space-y-6">
      <DemoBanner demoMode={user.demoMode} />

      {/* The balance is a summary of the accounts, so it leads to them. */}
      <Link href="/accounts" className="pressable block">
        <p className="text-[13px] text-ink-muted">{month.label}</p>
        <h1 className="numeral mt-1 text-[34px] font-semibold leading-none sm:text-[40px]">
          {formatMoney(balance.totalMinor, currency, { compact: true })}
        </h1>
        <p className="mt-1.5 flex items-center gap-1 text-[13px] text-ink-muted">
          across {accounts.filter((a) => a.isActive).length} account
          {accounts.filter((a) => a.isActive).length === 1 ? '' : 's'}
          {balance.excludedAccounts > 0
            ? ` · ${balance.excludedAccounts} in another currency not included`
            : ''}
          <span aria-hidden="true" className="text-ink-subtle">
            ›
          </span>
        </p>
      </Link>

      <InstallPrompt />

      <section className="grid grid-cols-2 gap-3">
        <StatTile label="Money in" minor={totals.incomeMinor} currency={currency} />
        <StatTile label="Money out" minor={totals.expenseMinor} currency={currency} />
        <StatTile
          label="Net this month"
          minor={totals.netMinor}
          currency={currency}
          signed
          hint={
            expenseChange === null
              ? undefined
              : `Spending ${expenseChange >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(expenseChange))}% vs. the same point last month`
          }
        />
        <StatTile
          label="Subscriptions"
          minor={monthlySubscriptionCost}
          currency={currency}
          hint={`${subscriptions.length} active · ${formatMoney(monthlySubscriptionCost * 12, currency, { compact: true })}/year`}
        />
      </section>

      {showBusiness && business ? (
        <section>
          <SectionHeading
            title="Business this month"
            action={
              <Link href="/business" className="text-[13px] font-medium text-accent">
                Open
              </Link>
            }
          />
          <div className="mt-2 grid grid-cols-3 gap-3">
            <StatTile label="Revenue" minor={business.revenueMinor} currency={currency} />
            <StatTile label="Costs" minor={business.expenseMinor} currency={currency} />
            <StatTile
              label="Gross profit"
              minor={business.grossProfitMinor}
              currency={currency}
              signed
            />
          </div>
        </section>
      ) : null}

      {needsReview > 0 ? (
        <Link href="/review" className="pressable block">
          <Card className="flex items-center gap-3 p-3.5">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-[15px] font-semibold text-accent-ink"
            >
              {needsReview}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium leading-tight">
                {needsReview === 1 ? 'One transaction needs' : `${needsReview} transactions need`} a
                category
              </span>
              <span className="mt-0.5 block text-[12.5px] text-ink-muted">
                One tap each — the answer sticks for that merchant.
              </span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-ink-subtle">
              ›
            </span>
          </Card>
        </Link>
      ) : null}

      {signals.length > 0 ? (
        <section>
          <SectionHeading
            title="Worth a look"
            action={
              <Link href="/insights" className="text-[13px] font-medium text-accent">
                All
              </Link>
            }
          />
          <div className="mt-2">
            {/* Three on the home screen. The rest live on Insights, which is
                where someone goes when they want to read rather than glance. */}
            <ObservationList observations={signals.slice(0, 3)} limit={3} />
          </div>
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Six-month trend</CardTitle>
        </CardHeader>
        <CardBody>
          <TrendBars data={trend} currency={currency} />
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Where money went</CardTitle>
            <Link href="/insights" className="text-[13px] font-medium text-accent">
              Detail
            </Link>
          </CardHeader>
          <CardBody>
            {spending.length > 0 ? (
              <CategoryBars data={spending} currency={currency} />
            ) : (
              <p className="py-6 text-center text-[13px] text-ink-muted">
                No spending recorded this month yet.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where money came from</CardTitle>
          </CardHeader>
          <CardBody>
            {income.length > 0 ? (
              <CategoryBars data={income} currency={currency} />
            ) : (
              <p className="py-6 text-center text-[13px] text-ink-muted">
                No income recorded this month yet.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      {upcoming.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Expected in the next two weeks</CardTitle>
            <Link href="/subscriptions" className="text-[13px] font-medium text-accent">
              All
            </Link>
          </CardHeader>
          <CardBody className="pt-0">
            <ul className="divide-y divide-border">
              {upcoming.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">{s.merchantLabel}</p>
                    <p className="text-[12px] text-ink-subtle">
                      {formatDay(s.nextPredictedDate)} · {s.interval}
                    </p>
                  </div>
                  <span className="numeral shrink-0 text-[14px] text-ink-muted">
                    {formatMoney(-s.amountMinor, s.currency)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-ink-subtle">
              Predicted from past charges. Dates are estimates.
            </p>
          </CardBody>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <Link href="/transactions" className="text-[13px] font-medium text-accent">
            Every krone
          </Link>
        </CardHeader>
        <div className="border-t border-border">
          <TransactionList transactions={recent.transactions} />
        </div>
      </Card>
    </div>
  );
}
