import '@/lib/server-guard';
import { randomUUID } from 'node:crypto';
import { withUser } from '@/database';
import { monthRange } from '@/lib/dates';
import { isoDate } from '@/lib/normalize';
import { formatMoney } from '@/lib/money';
import { categoryLabel } from '@/lib/categories';
import {
  businessSummary,
  compareCategories,
  compareMonths,
  largestExpenses,
  spendingRate,
} from '@/services/analytics';
import { listSubscriptions } from '@/services/subscriptions';
import type { FinancialInsight, Ownership } from '@/types/finance';

/**
 * Insights are generated from computed figures, then written into a sentence
 * by a template. The language model is not involved: an insight that says a
 * number must be able to prove it, and every one carries the facts it used.
 *
 * Tone rule: describe, don't scold. No "you overspent", no red warnings for
 * ordinary variation.
 */

interface Draft {
  kind: string;
  title: string;
  body: string;
  facts: Record<string, number | string>;
  severity: 'info' | 'notable';
}

const MATERIAL_CHANGE_PCT = 20;
const MATERIAL_AMOUNT_MINOR = 20_000; // 200 kr — below this, a swing is noise.

export async function generateInsights(
  userId: string,
  currency = 'DKK',
  now: Date = new Date(),
): Promise<FinancialInsight[]> {
  const cur = monthRange(0, now);
  const prev = monthRange(-1, now);
  const drafts: Draft[] = [];

  const [months, categories, subscriptions, biggest, rate, business] = await Promise.all([
    compareMonths(userId, 'all', now),
    compareCategories(userId, 'all', now),
    listSubscriptions(userId, { status: 'active' }),
    largestExpenses(userId, { from: cur.start, to: cur.end }, 1),
    spendingRate(userId, 30, 'all', now),
    businessSummary(userId, cur.start, cur.end, currency),
  ]);

  const money = (minor: number) => formatMoney(minor, currency, { compact: true });

  // 1. Category movements worth mentioning.
  for (const c of categories.slice(0, 8)) {
    if (c.previousMinor === 0 || c.changePct === null) continue;
    if (Math.abs(c.changePct) < MATERIAL_CHANGE_PCT) continue;
    if (Math.abs(c.currentMinor - c.previousMinor) < MATERIAL_AMOUNT_MINOR) continue;
    const up = c.changePct > 0;
    drafts.push({
      kind: `category_change:${c.category}`,
      title: `${c.label} is ${up ? 'up' : 'down'} ${Math.abs(Math.round(c.changePct))}%`,
      body: `${money(c.currentMinor)} so far this month, compared with ${money(c.previousMinor)} in ${prev.label}.`,
      facts: {
        category: c.category,
        currentMinor: c.currentMinor,
        previousMinor: c.previousMinor,
        changePct: Math.round(c.changePct * 10) / 10,
      },
      severity: 'info',
    });
  }

  // 2. Subscription load.
  if (subscriptions.length > 0) {
    const monthly = subscriptions.reduce((s, x) => s + x.monthlyEquivalentMinor, 0);
    drafts.push({
      kind: 'subscription_total',
      title: `${subscriptions.length} active subscription${subscriptions.length === 1 ? '' : 's'}`,
      body: `Together they come to ${money(monthly)} a month, or ${money(monthly * 12)} a year.`,
      facts: { count: subscriptions.length, monthlyMinor: monthly, annualMinor: monthly * 12 },
      severity: 'info',
    });

    // A price change from a year ago is history, not news. Only surface ones
    // recent enough that the user might still do something about them.
    const cutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
    const repriced = subscriptions.filter(
      (s) => s.priceChangedAt && s.previousAmountMinor && s.priceChangedAt >= cutoff,
    );
    if (repriced.length > 0) {
      const names = repriced.slice(0, 3).map((s) => s.merchantLabel).join(', ');
      drafts.push({
        kind: 'subscription_price_change',
        title: `${repriced.length} subscription${repriced.length === 1 ? '' : 's'} changed price`,
        body: `${names}${repriced.length > 3 ? ' and others' : ''} now charge${
          repriced.length === 1 ? 's' : ''
        } a different amount than before. The change is shown on the subscriptions screen.`,
        facts: { count: repriced.length, merchants: names },
        severity: 'notable',
      });
    }
  }

  // 3. Largest single expense.
  if (biggest[0]) {
    drafts.push({
      kind: 'largest_expense',
      title: `Largest expense: ${biggest[0].merchant}`,
      body: `${money(biggest[0].amountMinor)} on ${biggest[0].transactionDate}, categorized as ${categoryLabel(
        biggest[0].category,
      )}.`,
      facts: {
        merchant: biggest[0].merchant,
        amountMinor: biggest[0].amountMinor,
        category: biggest[0].category,
      },
      severity: 'info',
    });
  }

  // 4. Run rate.
  if (rate.dailyRateMinor > 0) {
    drafts.push({
      kind: 'run_rate',
      title: `Spending about ${money(rate.projectedMonthMinor)} a month`,
      body: `Based on the last ${rate.sampleDays} days. This is a projection, not a commitment.`,
      facts: {
        dailyMinor: rate.dailyRateMinor,
        projectedMonthMinor: rate.projectedMonthMinor,
        sampleDays: rate.sampleDays,
      },
      severity: 'info',
    });
  }

  // 5. Net position for the month.
  if (months.current.transactionCount > 0) {
    const net = months.current.netMinor;
    drafts.push({
      kind: 'month_net',
      title: net >= 0 ? `Ahead by ${money(net)} this month` : `Spending exceeds income by ${money(-net)}`,
      body: `${money(months.current.incomeMinor)} in, ${money(months.current.expenseMinor)} out across ${
        months.current.transactionCount
      } transactions.`,
      facts: {
        netMinor: net,
        incomeMinor: months.current.incomeMinor,
        expenseMinor: months.current.expenseMinor,
      },
      severity: 'info',
    });
  }

  // 6. Business revenue movement.
  if (business.revenueMinor > 0) {
    const previousBusiness = await businessSummary(userId, prev.start, prev.end, currency);
    if (previousBusiness.revenueMinor > 0) {
      const change =
        ((business.revenueMinor - previousBusiness.revenueMinor) / previousBusiness.revenueMinor) * 100;
      if (Math.abs(change) >= 10) {
        drafts.push({
          kind: 'business_revenue_change',
          title: `Business revenue is ${change > 0 ? 'up' : 'down'} ${Math.abs(Math.round(change))}%`,
          body: `${money(business.revenueMinor)} this month against ${money(
            previousBusiness.revenueMinor,
          )} in ${prev.label}.`,
          facts: {
            currentMinor: business.revenueMinor,
            previousMinor: previousBusiness.revenueMinor,
            changePct: Math.round(change * 10) / 10,
          },
          severity: 'info',
        });
      }
    }
  }

  return persistInsights(userId, drafts, cur.start, cur.end);
}

async function persistInsights(
  userId: string,
  drafts: Draft[],
  periodStart: string,
  periodEnd: string,
): Promise<FinancialInsight[]> {
  return withUser(userId, async (db) => {
    // The current period is fully recomputed each run, so stale figures never linger.
    await db.query(
      'DELETE FROM financial_insights WHERE user_id = $1 AND period_start = $2 AND period_end = $3',
      [userId, periodStart, periodEnd],
    );
    const out: FinancialInsight[] = [];
    for (const draft of drafts) {
      const id = randomUUID();
      await db.query(
        `INSERT INTO financial_insights
           (id, user_id, kind, title, body, facts, period_start, period_end, severity)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
         ON CONFLICT (user_id, kind, period_start, period_end) DO NOTHING`,
        [id, userId, draft.kind, draft.title, draft.body, JSON.stringify(draft.facts),
         periodStart, periodEnd, draft.severity],
      );
      out.push({
        id,
        userId,
        kind: draft.kind,
        title: draft.title,
        body: draft.body,
        facts: draft.facts,
        periodStart,
        periodEnd,
        severity: draft.severity,
        createdAt: new Date().toISOString(),
      });
    }
    return out;
  });
}

export async function listInsights(userId: string, limit = 12): Promise<FinancialInsight[]> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<{
      id: string; user_id: string; kind: string; title: string; body: string;
      facts: Record<string, number | string> | string;
      period_start: string | Date; period_end: string | Date;
      severity: 'info' | 'notable'; created_at: string | Date;
    }>(
      `SELECT * FROM financial_insights WHERE user_id = $1
        ORDER BY created_at DESC, severity DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      facts: typeof r.facts === 'string' ? JSON.parse(r.facts) : r.facts,
      periodStart: isoDate(r.period_start),
      periodEnd: isoDate(r.period_end),
      severity: r.severity,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  });
}

export type { Ownership };
