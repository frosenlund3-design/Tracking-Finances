import '@/lib/server-guard';
import { withUser } from '@/database';
import { buildWhere, type TransactionFilters } from '@/services/transactions';
import { monthRange, monthProgress, today } from '@/lib/dates';
import { addDays, isoDate } from '@/lib/normalize';
import { categoryLabel } from '@/lib/categories';
import type { Ownership } from '@/types/finance';

/**
 * The single source of every number in the product.
 *
 * The AI assistant calls these functions; it never adds up transactions
 * itself. That is the whole defence against a hallucinated total: the model
 * chooses *which* question to ask, and this file answers it in SQL.
 */

export interface PeriodTotals {
  start: string;
  end: string;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  transactionCount: number;
  /** Rows excluded because they only move money between the user's own accounts. */
  transfersExcluded: number;
  currency: string;
}

export interface CategoryTotal {
  category: string;
  label: string;
  amountMinor: number;
  transactionCount: number;
  share: number;
}

export interface MerchantTotal {
  merchantKey: string;
  merchant: string;
  amountMinor: number;
  transactionCount: number;
}

export interface TrendPoint {
  period: string;
  label: string;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
}

export interface BusinessSummary extends PeriodTotals {
  revenueMinor: number;
  refundsMinor: number;
  processingFeesMinor: number;
  softwareMinor: number;
  advertisingMinor: number;
  contractorsMinor: number;
  payrollMinor: number;
  grossProfitMinor: number;
  /** Revenue that arrived through a payment processor (Stripe, PayPal). */
  processorRevenueMinor: number;
  recurringRevenueMinor: number;
}

/**
 * Totals for an arbitrary filtered slice, income and expense kept separate.
 *
 * Transfers between the user's own accounts — a Stripe payout landing in the
 * business account, money moved to savings — are excluded by default. Counting
 * them would inflate both sides: the same krone would appear as income once
 * and as an expense once, and "money in this month" would stop meaning
 * anything. Every other breakdown in this file excludes them for the same
 * reason, so the numbers reconcile across screens.
 */
export async function periodTotals(
  userId: string,
  filters: TransactionFilters,
  currency = 'DKK',
  options: { includeTransfers?: boolean } = {},
): Promise<PeriodTotals> {
  const where = buildWhere(userId, filters);
  const transferClause = options.includeTransfers ? '' : " AND t.category <> 'transfers'";
  return withUser(userId, async (db) => {
    const { rows } = await db.query<{
      income: number | null; expense: number | null; n: number; transfers: number;
    }>(
      `SELECT
         COALESCE(sum(t.amount_minor) FILTER (WHERE t.amount_minor > 0${
           options.includeTransfers ? '' : " AND t.category <> 'transfers'"
         }), 0) AS income,
         COALESCE(sum(-t.amount_minor) FILTER (WHERE t.amount_minor < 0${
           options.includeTransfers ? '' : " AND t.category <> 'transfers'"
         }), 0) AS expense,
         count(*) FILTER (WHERE TRUE${transferClause})::int AS n,
         count(*) FILTER (WHERE t.category = 'transfers')::int AS transfers
       FROM transactions t WHERE ${where.sql}`,
      where.params,
    );
    const income = Number(rows[0]?.income ?? 0);
    const expense = Number(rows[0]?.expense ?? 0);
    return {
      start: filters.from ?? '',
      end: filters.to ?? '',
      incomeMinor: income,
      expenseMinor: expense,
      netMinor: income - expense,
      transactionCount: Number(rows[0]?.n ?? 0),
      transfersExcluded: options.includeTransfers ? 0 : Number(rows[0]?.transfers ?? 0),
      currency,
    };
  });
}

/** Spending (or income) grouped by category, largest first. */
export async function categoryBreakdown(
  userId: string,
  filters: TransactionFilters,
  direction: 'expense' | 'income' = 'expense',
  limit = 12,
): Promise<CategoryTotal[]> {
  const where = buildWhere(userId, { ...filters, direction });
  return withUser(userId, async (db) => {
    const { rows } = await db.query<{ category: string; amount: number; n: number }>(
      `SELECT t.category, sum(abs(t.amount_minor)) AS amount, count(*)::int AS n
         FROM transactions t
        WHERE ${where.sql} AND t.category <> 'transfers'
        GROUP BY t.category
        ORDER BY amount DESC
        LIMIT $${where.params.length + 1}`,
      [...where.params, limit],
    );
    const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);
    return rows.map((r) => ({
      category: r.category,
      label: categoryLabel(r.category),
      amountMinor: Number(r.amount),
      transactionCount: Number(r.n),
      share: total > 0 ? Number(r.amount) / total : 0,
    }));
  });
}

/**
 * Merchants ranked by amount. Defaults to money out, but respects an explicit
 * direction — the business dashboard uses it to rank paying customers, and
 * hard-coding 'expense' here silently turned that list into a list of costs.
 */
export async function merchantBreakdown(
  userId: string,
  filters: TransactionFilters,
  limit = 10,
): Promise<MerchantTotal[]> {
  const where = buildWhere(userId, { direction: 'expense', ...filters });
  return withUser(userId, async (db) => {
    const { rows } = await db.query<{
      merchant_key: string; merchant: string | null; amount: number; n: number;
    }>(
      `SELECT t.merchant_key, max(t.merchant) AS merchant,
              sum(abs(t.amount_minor)) AS amount, count(*)::int AS n
         FROM transactions t
        WHERE ${where.sql} AND t.merchant_key IS NOT NULL AND t.category <> 'transfers'
        GROUP BY t.merchant_key
        ORDER BY amount DESC
        LIMIT $${where.params.length + 1}`,
      [...where.params, limit],
    );
    return rows.map((r) => ({
      merchantKey: r.merchant_key,
      merchant: r.merchant ?? r.merchant_key,
      amountMinor: Number(r.amount),
      transactionCount: Number(r.n),
    }));
  });
}

/** Month-by-month income/expense, oldest first. */
export async function monthlyTrend(
  userId: string,
  months = 6,
  ownership: Ownership | 'all' = 'all',
  now: Date = new Date(),
): Promise<TrendPoint[]> {
  const first = monthRange(-(months - 1), now);
  const last = monthRange(0, now);
  const where = buildWhere(userId, { from: first.start, to: last.end, ownership });

  const rows = await withUser(userId, async (db) => {
    const result = await db.query<{ period: string; income: number; expense: number }>(
      `SELECT to_char(t.transaction_date, 'YYYY-MM') AS period,
              COALESCE(sum(t.amount_minor) FILTER (WHERE t.amount_minor > 0), 0) AS income,
              COALESCE(sum(-t.amount_minor) FILTER (WHERE t.amount_minor < 0), 0) AS expense
         FROM transactions t
        WHERE ${where.sql} AND t.category <> 'transfers'
        GROUP BY period ORDER BY period`,
      where.params,
    );
    return result.rows;
  });

  const byPeriod = new Map(rows.map((r) => [r.period, r]));
  const points: TrendPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const range = monthRange(-i, now);
    const period = range.start.slice(0, 7);
    const row = byPeriod.get(period);
    const income = Number(row?.income ?? 0);
    const expense = Number(row?.expense ?? 0);
    points.push({
      period,
      label: new Date(`${period}-01T00:00:00Z`).toLocaleDateString('en-GB', {
        month: 'short',
        timeZone: 'UTC',
      }),
      incomeMinor: income,
      expenseMinor: expense,
      netMinor: income - expense,
    });
  }
  return points;
}

/**
 * Business metrics.
 *
 * Gross profit here means revenue minus recorded business costs. Net cash flow
 * is a different figure: every krone of business money in and out, including
 * income that is not revenue. Neither is a tax figure, and neither is ever
 * presented as profit after tax — no tax rules are applied anywhere in this
 * codebase.
 */
export async function businessSummary(
  userId: string,
  from: string,
  to: string,
  currency = 'DKK',
): Promise<BusinessSummary> {
  const where = buildWhere(userId, { from, to, ownership: 'business' });
  return withUser(userId, async (db) => {
    const { rows } = await db.query<Record<string, number | null>>(
      `SELECT
         COALESCE(sum(t.amount_minor) FILTER (WHERE t.amount_minor > 0 AND t.category <> 'transfers'), 0) AS income,
         COALESCE(sum(-t.amount_minor) FILTER (WHERE t.amount_minor < 0 AND t.category <> 'transfers'), 0) AS expense,
         COALESCE(sum(t.amount_minor) FILTER (WHERE t.category = 'business_revenue' AND t.amount_minor > 0), 0) AS revenue,
         COALESCE(sum(abs(t.amount_minor)) FILTER (WHERE t.category = 'business_refunds'), 0) AS refunds,
         COALESCE(sum(abs(t.amount_minor)) FILTER (WHERE t.category = 'business_processing_fees' AND t.amount_minor < 0), 0) AS fees,
         COALESCE(sum(abs(t.amount_minor)) FILTER (WHERE t.category = 'business_software'), 0) AS software,
         COALESCE(sum(abs(t.amount_minor)) FILTER (WHERE t.category = 'business_advertising'), 0) AS advertising,
         COALESCE(sum(abs(t.amount_minor)) FILTER (WHERE t.category = 'business_contractors'), 0) AS contractors,
         COALESCE(sum(abs(t.amount_minor)) FILTER (WHERE t.category = 'business_payroll'), 0) AS payroll,
         COALESCE(sum(t.amount_minor) FILTER (
           WHERE t.amount_minor > 0 AND t.category = 'business_revenue'
             AND a.type = 'payment_processor'), 0) AS processor_revenue,
         count(*)::int AS n
       FROM transactions t
       JOIN financial_accounts a ON a.id = t.account_id
       WHERE ${where.sql}`,
      where.params,
    );
    const r = rows[0] ?? {};
    const num = (k: string) => Number(r[k] ?? 0);

    // Recurring revenue: income that repeats month over month from the same payer.
    const { rows: recurring } = await db.query<{ amount: number | null }>(
      `SELECT COALESCE(sum(monthly), 0) AS amount FROM (
         SELECT t.merchant_key, avg(t.amount_minor) AS monthly
           FROM transactions t
          WHERE t.user_id = $1 AND t.ownership = 'business' AND t.amount_minor > 0
            AND t.category = 'business_revenue'
            AND t.transaction_date >= $2::date - interval '90 days'
          GROUP BY t.merchant_key
         HAVING count(DISTINCT to_char(t.transaction_date, 'YYYY-MM')) >= 3
       ) recurring_payers`,
      [userId, to],
    );

    const income = num('income');
    const expense = num('expense');
    const revenue = num('revenue');
    return {
      start: from,
      end: to,
      currency,
      incomeMinor: income,
      expenseMinor: expense,
      netMinor: income - expense,
      transactionCount: num('n'),
      transfersExcluded: 0,
      revenueMinor: revenue,
      refundsMinor: num('refunds'),
      processingFeesMinor: num('fees'),
      softwareMinor: num('software'),
      advertisingMinor: num('advertising'),
      contractorsMinor: num('contractors'),
      payrollMinor: num('payroll'),
      // Revenue minus costs. Distinct from netMinor, which counts every krone
      // in and out including income that is not revenue.
      grossProfitMinor: revenue - expense,
      processorRevenueMinor: num('processor_revenue'),
      recurringRevenueMinor: Math.round(Number(recurring[0]?.amount ?? 0)),
    };
  });
}

export interface SpendingRate {
  /** Observed daily spend over the sample window. */
  dailyRateMinor: number;
  projectedMonthMinor: number;
  sampleDays: number;
}

export async function spendingRate(
  userId: string,
  days = 30,
  ownership: Ownership | 'all' = 'all',
  now: Date = new Date(),
): Promise<SpendingRate> {
  const end = today(now);
  const start = addDays(end, -(days - 1));
  const totals = await periodTotals(userId, { from: start, to: end, ownership });
  const daily = totals.expenseMinor / days;
  return {
    dailyRateMinor: Math.round(daily),
    projectedMonthMinor: Math.round(daily * 30.44),
    sampleDays: days,
  };
}

export interface MonthComparison {
  current: PeriodTotals;
  previous: PeriodTotals;
  incomeChangePct: number | null;
  expenseChangePct: number | null;
  /** Same-day-of-month comparison, so a partial month is not read as a drop. */
  pacedExpenseChangePct: number | null;
}

export async function compareMonths(
  userId: string,
  ownership: Ownership | 'all' = 'all',
  now: Date = new Date(),
): Promise<MonthComparison> {
  const cur = monthRange(0, now);
  const prev = monthRange(-1, now);
  const [current, previous] = await Promise.all([
    periodTotals(userId, { from: cur.start, to: cur.end, ownership }),
    periodTotals(userId, { from: prev.start, to: prev.end, ownership }),
  ]);

  const progress = monthProgress(now);
  const pacedPrevious = previous.expenseMinor * progress;

  const pct = (a: number, b: number) => (b === 0 ? null : ((a - b) / Math.abs(b)) * 100);

  return {
    current,
    previous,
    incomeChangePct: pct(current.incomeMinor, previous.incomeMinor),
    expenseChangePct: pct(current.expenseMinor, previous.expenseMinor),
    pacedExpenseChangePct: pct(current.expenseMinor, pacedPrevious),
  };
}

export interface CategoryComparison {
  category: string;
  label: string;
  currentMinor: number;
  previousMinor: number;
  changePct: number | null;
}

export async function compareCategories(
  userId: string,
  ownership: Ownership | 'all' = 'all',
  now: Date = new Date(),
): Promise<CategoryComparison[]> {
  const cur = monthRange(0, now);
  const prev = monthRange(-1, now);
  const [a, b] = await Promise.all([
    categoryBreakdown(userId, { from: cur.start, to: cur.end, ownership }, 'expense', 50),
    categoryBreakdown(userId, { from: prev.start, to: prev.end, ownership }, 'expense', 50),
  ]);
  const prevByCategory = new Map(b.map((c) => [c.category, c.amountMinor]));
  const keys = new Set([...a.map((c) => c.category), ...b.map((c) => c.category)]);
  const curByCategory = new Map(a.map((c) => [c.category, c.amountMinor]));

  return [...keys]
    .map((category) => {
      const current = curByCategory.get(category) ?? 0;
      const previous = prevByCategory.get(category) ?? 0;
      return {
        category,
        label: categoryLabel(category),
        currentMinor: current,
        previousMinor: previous,
        changePct: previous === 0 ? null : ((current - previous) / previous) * 100,
      };
    })
    .sort((x, y) => y.currentMinor - x.currentMinor);
}

export interface LargestTransaction {
  id: string;
  merchant: string;
  category: string;
  amountMinor: number;
  transactionDate: string;
}

export async function largestExpenses(
  userId: string,
  filters: TransactionFilters,
  limit = 5,
): Promise<LargestTransaction[]> {
  const where = buildWhere(userId, { ...filters, direction: 'expense' });
  return withUser(userId, async (db) => {
    const { rows } = await db.query<{
      id: string; merchant: string | null; description: string; category: string;
      amount_minor: number; transaction_date: string | Date;
    }>(
      `SELECT t.id, t.merchant, t.description, t.category, t.amount_minor, t.transaction_date
         FROM transactions t
        WHERE ${where.sql} AND t.category <> 'transfers'
        ORDER BY abs(t.amount_minor) DESC LIMIT $${where.params.length + 1}`,
      [...where.params, limit],
    );
    return rows.map((r) => ({
      id: r.id,
      merchant: r.merchant ?? r.description,
      category: r.category,
      amountMinor: Math.abs(Number(r.amount_minor)),
      transactionDate: isoDate(r.transaction_date),
    }));
  });
}
