import '@/lib/server-guard';
import { z } from 'zod';
import { monthRange, lastNDays, weekRange, yearRange, today } from '@/lib/dates';
import { formatMoney, toMajor } from '@/lib/money';
import { ALL_CATEGORIES, categoryLabel } from '@/lib/categories';
import {
  businessSummary,
  categoryBreakdown,
  compareCategories,
  compareMonths,
  largestExpenses,
  merchantBreakdown,
  monthlyTrend,
  periodTotals,
  spendingRate,
} from '@/services/analytics';
import { listSubscriptions, upcomingCharges } from '@/services/subscriptions';
import { cashFlowForecast } from '@/services/forecast';
import { listTransactions } from '@/services/transactions';
import { totalBalanceMinor } from '@/services/accounts';
import type { Ownership } from '@/types/finance';

/**
 * The assistant's entire capability surface.
 *
 * Every tool here reads. There is no write tool, no payment tool, no
 * integration-management tool, and no generic "run SQL" tool — the model can
 * only pick from this list, and the dispatcher rejects anything not in it.
 *
 * Each tool returns figures already computed in SQL. The model's job is to
 * choose the question and phrase the answer; it never does the arithmetic.
 *
 * Naming is part of the contract: every tool name begins with `get_`, `list_`
 * or `compare_`. A test enforces it, so a write-shaped tool cannot be added
 * here without the failure being loud.
 */

const ownershipSchema = z.enum(['personal', 'business', 'mixed', 'all']).default('all');

const periodSchema = z
  .enum([
    'this_month', 'last_month', 'this_week', 'last_week',
    'last_7_days', 'last_30_days', 'last_90_days', 'this_year', 'last_year',
  ])
  .default('this_month');

type Period = z.infer<typeof periodSchema>;

export function resolvePeriod(period: Period, now: Date = new Date()) {
  switch (period) {
    case 'last_month': return monthRange(-1, now);
    case 'this_week': return weekRange(0, now);
    case 'last_week': return weekRange(-1, now);
    case 'last_7_days': return lastNDays(7, now);
    case 'last_30_days': return lastNDays(30, now);
    case 'last_90_days': return lastNDays(90, now);
    case 'this_year': return yearRange(0, now);
    case 'last_year': return yearRange(-1, now);
    default: return monthRange(0, now);
  }
}

export interface ToolContext {
  userId: string;
  currency: string;
  now: Date;
}

interface ReadOnlyTool<S extends z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}

function tool<S extends z.ZodTypeAny>(spec: ReadOnlyTool<S>): ReadOnlyTool<S> {
  return spec;
}

const money = (minor: number, currency: string) => ({
  minor,
  major: toMajor(minor),
  formatted: formatMoney(minor, currency),
});

export const TOOLS = [
  tool({
    name: 'get_period_summary',
    description:
      'Total income, total expenses and net cash flow for a period. Use for "how much did I spend/earn", "am I up or down".',
    schema: z.object({
      period: periodSchema,
      ownership: ownershipSchema,
    }),
    run: async (input, ctx) => {
      const range = resolvePeriod(input.period, ctx.now);
      const totals = await periodTotals(
        ctx.userId,
        { from: range.start, to: range.end, ownership: input.ownership },
        ctx.currency,
      );
      return {
        period: range.label,
        from: range.start,
        to: range.end,
        income: money(totals.incomeMinor, ctx.currency),
        expenses: money(totals.expenseMinor, ctx.currency),
        net: money(totals.netMinor, ctx.currency),
        transactionCount: totals.transactionCount,
      };
    },
  }),

  tool({
    name: 'get_category_spending',
    description:
      'Spending or income broken down by category for a period, largest first. Use for "where did my money go", "how much on groceries/software/restaurants".',
    schema: z.object({
      period: periodSchema,
      ownership: ownershipSchema,
      direction: z.enum(['expense', 'income']).default('expense'),
      category: z
        .string()
        .optional()
        .describe('Optional category key to restrict to, e.g. restaurants or business_software.'),
      limit: z.number().int().min(1).max(30).default(10),
    }),
    run: async (input, ctx) => {
      const range = resolvePeriod(input.period, ctx.now);
      const rows = await categoryBreakdown(
        ctx.userId,
        {
          from: range.start,
          to: range.end,
          ownership: input.ownership,
          categories: input.category ? [input.category] : undefined,
        },
        input.direction,
        input.limit,
      );
      return {
        period: range.label,
        from: range.start,
        to: range.end,
        direction: input.direction,
        categories: rows.map((r) => ({
          key: r.category,
          label: r.label,
          amount: money(r.amountMinor, ctx.currency),
          transactionCount: r.transactionCount,
          sharePct: Math.round(r.share * 1000) / 10,
        })),
      };
    },
  }),

  tool({
    name: 'get_merchant_spending',
    description:
      'Spending grouped by merchant for a period. Use for "who do I pay most", or to check one merchant by name.',
    schema: z.object({
      period: periodSchema,
      ownership: ownershipSchema,
      search: z.string().optional().describe('Optional merchant name to filter by.'),
      limit: z.number().int().min(1).max(30).default(10),
    }),
    run: async (input, ctx) => {
      const range = resolvePeriod(input.period, ctx.now);
      const rows = await merchantBreakdown(
        ctx.userId,
        { from: range.start, to: range.end, ownership: input.ownership, search: input.search },
        input.limit,
      );
      return {
        period: range.label,
        merchants: rows.map((r) => ({
          merchant: r.merchant,
          amount: money(r.amountMinor, ctx.currency),
          transactionCount: r.transactionCount,
        })),
      };
    },
  }),

  tool({
    name: 'list_transactions',
    description:
      'Individual transactions matching filters. Use when the user asks to see specific transactions, or asks about a named merchant.',
    schema: z.object({
      period: periodSchema,
      ownership: ownershipSchema,
      search: z.string().optional(),
      category: z.string().optional(),
      direction: z.enum(['income', 'expense', 'all']).default('all'),
      minAmountMajor: z.number().optional().describe('Minimum absolute amount in major units, e.g. 1000 for 1000 kr.'),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    run: async (input, ctx) => {
      const range = resolvePeriod(input.period, ctx.now);
      const page = await listTransactions(
        ctx.userId,
        {
          from: range.start,
          to: range.end,
          ownership: input.ownership,
          search: input.search,
          categories: input.category ? [input.category] : undefined,
          direction: input.direction,
          minAmountMinor:
            input.minAmountMajor === undefined ? undefined : Math.round(input.minAmountMajor * 100),
        },
        { limit: input.limit },
      );
      return {
        period: range.label,
        matchCount: page.total,
        transactions: page.transactions.map((t) => ({
          date: t.transactionDate,
          merchant: t.merchant ?? t.description,
          category: categoryLabel(t.category),
          ownership: t.ownership,
          amount: money(t.amountMinor, t.currency),
        })),
      };
    },
  }),

  tool({
    name: 'get_subscriptions',
    description:
      'Detected recurring payments with their cadence, monthly and annual cost, and next expected charge.',
    schema: z.object({
      ownership: ownershipSchema,
      includeLapsed: z.boolean().default(false),
    }),
    run: async (input, ctx) => {
      const subs = await listSubscriptions(ctx.userId, {
        ownership: input.ownership,
        status: input.includeLapsed ? undefined : 'active',
      });
      const monthly = subs.reduce((s, x) => s + x.monthlyEquivalentMinor, 0);
      return {
        count: subs.length,
        totalMonthly: money(monthly, ctx.currency),
        totalAnnual: money(monthly * 12, ctx.currency),
        subscriptions: subs.map((s) => ({
          merchant: s.merchantLabel,
          category: categoryLabel(s.category),
          ownership: s.ownership,
          interval: s.interval,
          amount: money(s.amountMinor, s.currency),
          monthlyEquivalent: money(s.monthlyEquivalentMinor, s.currency),
          annualEquivalent: money(s.annualEquivalentMinor, s.currency),
          lastPayment: s.lastPaymentDate,
          nextExpected: s.nextPredictedDate,
          status: s.status,
          priceChanged: s.priceChangedAt
            ? { on: s.priceChangedAt, previous: money(s.previousAmountMinor ?? 0, s.currency) }
            : null,
        })),
      };
    },
  }),

  tool({
    name: 'get_business_summary',
    description:
      'Business revenue, expenses, gross profit, Stripe revenue, refunds, fees and cost lines for a period.',
    schema: z.object({ period: periodSchema }),
    run: async (input, ctx) => {
      const range = resolvePeriod(input.period, ctx.now);
      const s = await businessSummary(ctx.userId, range.start, range.end, ctx.currency);
      return {
        period: range.label,
        from: range.start,
        to: range.end,
        revenue: money(s.revenueMinor, ctx.currency),
        totalIncome: money(s.incomeMinor, ctx.currency),
        totalExpenses: money(s.expenseMinor, ctx.currency),
        grossProfit: money(s.grossProfitMinor, ctx.currency),
        processorRevenue: money(s.processorRevenueMinor, ctx.currency),
        refunds: money(s.refundsMinor, ctx.currency),
        processingFees: money(s.processingFeesMinor, ctx.currency),
        software: money(s.softwareMinor, ctx.currency),
        advertising: money(s.advertisingMinor, ctx.currency),
        contractors: money(s.contractorsMinor, ctx.currency),
        payroll: money(s.payrollMinor, ctx.currency),
        estimatedRecurringRevenueMonthly: money(s.recurringRevenueMinor, ctx.currency),
        note:
          'Gross profit is revenue minus recorded business costs. Net cash flow counts all business money in and out. processorRevenue is the part of revenue that arrived through a payment processor such as Stripe. No tax calculation is applied to any of these.',
      };
    },
  }),

  tool({
    name: 'compare_periods',
    description:
      'Compares this month with last month, overall and per category. Use for "compare this month to last month", "am I spending more".',
    schema: z.object({ ownership: ownershipSchema }),
    run: async (input, ctx) => {
      const [months, categories] = await Promise.all([
        compareMonths(ctx.userId, input.ownership, ctx.now),
        compareCategories(ctx.userId, input.ownership, ctx.now),
      ]);
      return {
        thisMonth: {
          income: money(months.current.incomeMinor, ctx.currency),
          expenses: money(months.current.expenseMinor, ctx.currency),
          net: money(months.current.netMinor, ctx.currency),
        },
        lastMonth: {
          income: money(months.previous.incomeMinor, ctx.currency),
          expenses: money(months.previous.expenseMinor, ctx.currency),
          net: money(months.previous.netMinor, ctx.currency),
        },
        expenseChangePct: months.expenseChangePct === null ? null : Math.round(months.expenseChangePct * 10) / 10,
        incomeChangePct: months.incomeChangePct === null ? null : Math.round(months.incomeChangePct * 10) / 10,
        pacedExpenseChangePct:
          months.pacedExpenseChangePct === null ? null : Math.round(months.pacedExpenseChangePct * 10) / 10,
        pacingNote:
          'The current month is incomplete. pacedExpenseChangePct compares against the same fraction of last month.',
        byCategory: categories.slice(0, 12).map((c) => ({
          label: c.label,
          thisMonth: money(c.currentMinor, ctx.currency),
          lastMonth: money(c.previousMinor, ctx.currency),
          changePct: c.changePct === null ? null : Math.round(c.changePct * 10) / 10,
        })),
      };
    },
  }),

  tool({
    name: 'get_cash_flow_forecast',
    description:
      'Estimated balance at 7, 30 and 90 days, plus a safe-to-spend figure. Use for "how much can I safely spend", "will I be ok".',
    schema: z.object({}),
    run: async (_input, ctx) => {
      const f = await cashFlowForecast(ctx.userId, ctx.currency, ctx.now);
      return {
        currentBalance: money(f.startingBalanceMinor, ctx.currency),
        recurringIncomeMonthly: money(f.recurringIncomeMonthlyMinor, ctx.currency),
        recurringExpensesMonthly: money(f.recurringExpenseMonthlyMinor, ctx.currency),
        safeToSpendThisMonth: money(f.safeToSpendMinor, ctx.currency),
        projections: f.points.map((p) => ({
          horizonDays: p.horizonDays,
          date: p.date,
          estimatedBalance: money(p.balanceMinor, ctx.currency),
          range: [money(p.lowMinor, ctx.currency), money(p.highMinor, ctx.currency)],
        })),
        assumptions: f.assumptions,
        disclaimer: 'These are estimates based on observed patterns, not guarantees.',
      };
    },
  }),

  tool({
    name: 'get_largest_expenses',
    description: 'The single largest expenses in a period. Use for "what was my biggest expense".',
    schema: z.object({
      period: periodSchema,
      ownership: ownershipSchema,
      limit: z.number().int().min(1).max(20).default(5),
    }),
    run: async (input, ctx) => {
      const range = resolvePeriod(input.period, ctx.now);
      const rows = await largestExpenses(
        ctx.userId,
        { from: range.start, to: range.end, ownership: input.ownership },
        input.limit,
      );
      return {
        period: range.label,
        expenses: rows.map((r) => ({
          merchant: r.merchant,
          category: categoryLabel(r.category),
          date: r.transactionDate,
          amount: money(r.amountMinor, ctx.currency),
        })),
      };
    },
  }),

  tool({
    name: 'get_balances_and_rate',
    description:
      'Current total balance across accounts and the recent spending run rate.',
    schema: z.object({}),
    run: async (_input, ctx) => {
      const [balance, rate] = await Promise.all([
        totalBalanceMinor(ctx.userId, ctx.currency),
        spendingRate(ctx.userId, 30, 'all', ctx.now),
      ]);
      return {
        totalBalance: money(balance.totalMinor, ctx.currency),
        accountsExcludedForCurrency: balance.excludedAccounts,
        dailySpendRate: money(rate.dailyRateMinor, ctx.currency),
        projectedMonthlySpend: money(rate.projectedMonthMinor, ctx.currency),
        basedOnDays: rate.sampleDays,
      };
    },
  }),

  tool({
    name: 'get_monthly_trend',
    description: 'Income, expenses and net per month over recent months.',
    schema: z.object({
      months: z.number().int().min(2).max(24).default(6),
      ownership: ownershipSchema,
    }),
    run: async (input, ctx) => {
      const points = await monthlyTrend(ctx.userId, input.months, input.ownership, ctx.now);
      return {
        months: points.map((p) => ({
          month: p.period,
          income: money(p.incomeMinor, ctx.currency),
          expenses: money(p.expenseMinor, ctx.currency),
          net: money(p.netMinor, ctx.currency),
        })),
      };
    },
  }),

  tool({
    name: 'get_upcoming_charges',
    description: 'Recurring payments expected within the next N days.',
    schema: z.object({ days: z.number().int().min(1).max(120).default(30) }),
    run: async (input, ctx) => {
      const subs = await upcomingCharges(ctx.userId, input.days);
      return {
        windowDays: input.days,
        total: money(
          subs.reduce((s, x) => s + x.amountMinor, 0),
          ctx.currency,
        ),
        charges: subs.map((s) => ({
          merchant: s.merchantLabel,
          expectedOn: s.nextPredictedDate,
          amount: money(s.amountMinor, s.currency),
          interval: s.interval,
        })),
      };
    },
  }),

  tool({
    name: 'list_categories',
    description: 'The category keys available, for use with the other tools.',
    schema: z.object({}),
    run: async () => ({
      categories: ALL_CATEGORIES.map((c) => ({ key: c.key, label: c.label, scope: c.scope })),
    }),
  }),
] as const;

export type ToolName = (typeof TOOLS)[number]['name'];

const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t as ReadOnlyTool<z.ZodTypeAny>]));

/** The allowlist. A name not in this set cannot be executed, full stop. */
export const ALLOWED_TOOL_NAMES: ReadonlySet<string> = new Set(TOOLS.map((t) => t.name));

export class ToolRejectedError extends Error {
  constructor(name: string) {
    super(`Tool "${name}" is not available to the assistant.`);
    this.name = 'ToolRejectedError';
  }
}

/**
 * Executes a tool by name. Two gates: the name must be allowlisted, and the
 * arguments must satisfy the tool's schema. Anything else is refused before a
 * query is built.
 */
export async function runTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<unknown> {
  if (!ALLOWED_TOOL_NAMES.has(name)) throw new ToolRejectedError(name);
  const spec = TOOL_MAP.get(name);
  if (!spec) throw new ToolRejectedError(name);
  const parsed = spec.schema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return {
      error: 'invalid_arguments',
      detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  }
  return spec.run(parsed.data, ctx);
}

/** Anthropic tool definitions, generated from the same schemas the runner validates against. */
export function anthropicToolDefinitions() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: z.toJSONSchema(t.schema, { io: 'input' }) as Record<string, unknown>,
  }));
}

export { today };
export type { Ownership };
