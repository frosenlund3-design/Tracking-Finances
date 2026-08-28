import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { monthRange } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { generateInsights } from '@/services/insights';
import {
  categoryBreakdown,
  compareCategories,
  largestExpenses,
  merchantBreakdown,
  monthlyTrend,
} from '@/services/analytics';
import { cashFlowForecast } from '@/services/forecast';
import { CategoryBars } from '@/components/charts/category-bars';
import { TrendBars } from '@/components/charts/trend-bars';
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, Button } from '@/components/ui/primitives';
import { DemoBanner } from '@/components/demo-banner';

export const metadata: Metadata = { title: 'Insights' };
export const dynamic = 'force-dynamic';

export default async function InsightsPage() {
  const user = await requireUser();
  const currency = user.baseCurrency;
  const now = new Date();
  const month = monthRange(0, now);

  // Regenerated on view so the figures always match the current data.
  const [insights, spending, merchants, movements, trend, forecast, biggest] = await Promise.all([
    generateInsights(user.id, currency, now),
    categoryBreakdown(user.id, { from: month.start, to: month.end }, 'expense', 10),
    merchantBreakdown(user.id, { from: month.start, to: month.end }, 8),
    compareCategories(user.id, 'all', now),
    monthlyTrend(user.id, 6, 'all', now),
    cashFlowForecast(user.id, currency, now),
    largestExpenses(user.id, { from: month.start, to: month.end }, 5),
  ]);

  if (spending.length === 0 && insights.length === 0) {
    return (
      <div className="rise">
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <Card className="mt-5">
          <EmptyState
            title="Not enough data yet"
            description="Insights compare periods against each other, so they appear once there is a month or two of history."
            action={
              <Link href="/connect">
                <Button size="sm">Add some data</Button>
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const notableMoves = movements
    .filter((m) => m.changePct !== null && Math.abs(m.changePct) >= 20 && m.previousMinor > 0)
    .slice(0, 6);

  return (
    <div className="rise space-y-6">
      <DemoBanner demoMode={user.demoMode} />

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <p className="mt-1 text-[13px] text-ink-muted">
          Computed from your transactions. Every figure here is a database query, not an estimate by
          a language model.
        </p>
      </header>

      {insights.length > 0 ? (
        <section className="space-y-2">
          {insights.map((insight) => (
            <Card key={insight.id} className="p-4">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-[15px] font-medium leading-snug">{insight.title}</p>
                {insight.severity === 'notable' ? <Badge tone="notice">Notable</Badge> : null}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{insight.body}</p>
            </Card>
          ))}
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Cash flow estimate</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-3 gap-3">
            {forecast.points.map((p) => (
              <div key={p.horizonDays} className="rounded-lg border border-border p-3">
                <p className="text-[11px] text-ink-subtle">In {p.horizonDays} days</p>
                <p className="numeral mt-1 text-[16px] font-medium">
                  {formatMoney(p.balanceMinor, currency, { compact: true })}
                </p>
                <p className="numeral mt-0.5 text-[11px] text-ink-subtle">
                  {formatMoney(p.lowMinor, currency, { compact: true })} –{' '}
                  {formatMoney(p.highMinor, currency, { compact: true })}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-surface-muted p-3">
            <p className="text-[13px]">
              Roughly{' '}
              <strong className="font-medium">
                {formatMoney(forecast.safeToSpendMinor, currency, { compact: true })}
              </strong>{' '}
              is free to spend this month after known commitments.
            </p>
            <ul className="mt-2 space-y-0.5 text-[12px] text-ink-subtle">
              {forecast.assumptions.map((a) => (
                <li key={a}>· {a}</li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-[12px] text-ink-subtle">
            These are estimates from observed patterns, not guarantees.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Six months</CardTitle>
        </CardHeader>
        <CardBody>
          <TrendBars data={trend} currency={currency} />
        </CardBody>
      </Card>

      {notableMoves.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>What moved this month</CardTitle>
          </CardHeader>
          <CardBody className="pt-0">
            <ul className="divide-y divide-border">
              {notableMoves.map((m) => (
                <li key={m.category} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate text-[14px]">{m.label}</span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span className="numeral text-[13px] text-ink-muted">
                      {formatMoney(m.previousMinor, currency, { compact: true })} →{' '}
                      {formatMoney(m.currentMinor, currency, { compact: true })}
                    </span>
                    <Badge tone={m.changePct! > 0 ? 'notice' : 'positive'}>
                      {m.changePct! > 0 ? '+' : ''}
                      {Math.round(m.changePct!)}%
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
            <CardTitle>Spending by category</CardTitle>
          </CardHeader>
          <CardBody>
            <CategoryBars data={spending} currency={currency} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where it goes most</CardTitle>
          </CardHeader>
          <CardBody className="pt-0">
            <ul className="divide-y divide-border">
              {merchants.map((m) => (
                <li key={m.merchantKey}>
                  <Link
                    href={`/transactions?merchant=${encodeURIComponent(m.merchantKey)}`}
                    className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-accent"
                  >
                    <span className="min-w-0 truncate text-[14px]">{m.merchant}</span>
                    <span className="numeral shrink-0 text-[13px] text-ink-muted">
                      {formatMoney(m.amountMinor, currency, { compact: true })} · {m.transactionCount}×
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      {biggest.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Largest expenses this month</CardTitle>
          </CardHeader>
          <CardBody className="pt-0">
            <ul className="divide-y divide-border">
              {biggest.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/transactions/${b.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px]">{b.merchant}</span>
                      <span className="text-[12px] text-ink-subtle">{b.transactionDate}</span>
                    </span>
                    <span className="numeral shrink-0 text-[14px]">
                      {formatMoney(b.amountMinor, currency, { compact: true })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
