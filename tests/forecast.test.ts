import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTemporaryDatabase, createTestUser, createTestAccount } from './helpers/db';
import type { NormalizedTransaction } from '@/integrations/types';
import { addMonths } from '@/lib/normalize';

useTemporaryDatabase();

let userId: string;
const NOW = new Date('2026-06-15T12:00:00Z');

beforeAll(async () => {
  const { ensureMigrated } = await import('@/database/migrate');
  await ensureMigrated();
  userId = await createTestUser();
  const { map } = await createTestAccount(userId);

  const ledger: NormalizedTransaction[] = [];
  // Six months of salary in and a fixed rent out, plus one subscription.
  for (let i = 0; i < 6; i++) {
    const salaryDate = addMonths('2026-01-28', i);
    const rentDate = addMonths('2026-01-01', i);
    const subDate = addMonths('2026-01-17', i);
    ledger.push(
      { transactionId: `sal-${i}`, providerAccountId: 'acct-1', amountMinor: 3_000_000, currency: 'DKK', transactionDate: salaryDate, bookingDate: null, merchant: 'Employer', description: 'Loenoverfoersel' },
      { transactionId: `rent-${i}`, providerAccountId: 'acct-1', amountMinor: -1_000_000, currency: 'DKK', transactionDate: rentDate, bookingDate: null, merchant: 'Boligselskabet Vest', description: 'Husleje' },
      { transactionId: `sub-${i}`, providerAccountId: 'acct-1', amountMinor: -13_900, currency: 'DKK', transactionDate: subDate, bookingDate: null, merchant: 'Netflix', description: 'Netflix.com' },
    );
  }

  const { ingestTransactions } = await import('@/services/transactions');
  await ingestTransactions(userId, map, ledger, 'demo');
  const { detectAndStoreSubscriptions } = await import('@/services/subscriptions');
  await detectAndStoreSubscriptions(userId, NOW.toISOString().slice(0, 10));

  const { withUser } = await import('@/database');
  await withUser(userId, async (db) => {
    await db.query('UPDATE financial_accounts SET balance_minor = 5_000_00 WHERE user_id = $1', [userId]);
  });
});

afterAll(async () => {
  const { closeDatabase } = await import('@/database');
  await closeDatabase();
});

describe('cash flow forecast', () => {
  it('projects 7, 30 and 90 days with a widening band', async () => {
    const { cashFlowForecast } = await import('@/services/forecast');
    const forecast = await cashFlowForecast(userId, 'DKK', NOW);

    expect(forecast.points.map((p) => p.horizonDays)).toEqual([7, 30, 90]);
    for (const point of forecast.points) {
      expect(point.lowMinor).toBeLessThanOrEqual(point.balanceMinor);
      expect(point.highMinor).toBeGreaterThanOrEqual(point.balanceMinor);
    }
    // Uncertainty must grow with the horizon, never shrink.
    const widths = forecast.points.map((p) => p.highMinor - p.lowMinor);
    expect(widths[1]!).toBeGreaterThanOrEqual(widths[0]!);
    expect(widths[2]!).toBeGreaterThanOrEqual(widths[1]!);
  });

  it('recognises repeating income and known recurring costs', async () => {
    const { cashFlowForecast } = await import('@/services/forecast');
    const forecast = await cashFlowForecast(userId, 'DKK', NOW);
    expect(forecast.recurringIncomeMonthlyMinor).toBeGreaterThan(0);
    expect(forecast.recurringExpenseMonthlyMinor).toBeGreaterThan(0);
  });

  it('never suggests spending a negative amount', async () => {
    const { cashFlowForecast } = await import('@/services/forecast');
    const forecast = await cashFlowForecast(userId, 'DKK', NOW);
    expect(forecast.safeToSpendMinor).toBeGreaterThanOrEqual(0);
  });

  it('states its assumptions rather than presenting a bare number', async () => {
    const { cashFlowForecast } = await import('@/services/forecast');
    const forecast = await cashFlowForecast(userId, 'DKK', NOW);
    expect(forecast.assumptions.length).toBeGreaterThan(2);
    expect(forecast.assumptions.join(' ')).toMatch(/recurring|spending|buffer/i);
  });

  it('degrades gracefully for a user with no history at all', async () => {
    const { cashFlowForecast } = await import('@/services/forecast');
    const stranger = await createTestUser();
    const forecast = await cashFlowForecast(stranger, 'DKK', NOW);
    expect(forecast.startingBalanceMinor).toBe(0);
    expect(forecast.safeToSpendMinor).toBe(0);
    for (const point of forecast.points) {
      expect(Number.isFinite(point.balanceMinor)).toBe(true);
    }
  });
});

describe('insight generation', () => {
  it('produces insights whose numbers come from stored facts', async () => {
    const { generateInsights } = await import('@/services/insights');
    const insights = await generateInsights(userId, 'DKK', NOW);
    expect(insights.length).toBeGreaterThan(0);
    for (const insight of insights) {
      expect(insight.title.length).toBeGreaterThan(3);
      expect(Object.keys(insight.facts).length).toBeGreaterThan(0);
    }
  });

  it('avoids alarming or judgemental wording', async () => {
    const { generateInsights } = await import('@/services/insights');
    const insights = await generateInsights(userId, 'DKK', NOW);
    const text = insights.map((i) => `${i.title} ${i.body}`).join(' ').toLowerCase();
    for (const word of ['warning', 'danger', 'alert', 'you overspent', 'too much', 'wasted', 'bad']) {
      expect(text).not.toContain(word);
    }
  });

  it('is idempotent for the same period', async () => {
    const { generateInsights } = await import('@/services/insights');
    const first = await generateInsights(userId, 'DKK', NOW);
    const second = await generateInsights(userId, 'DKK', NOW);
    expect(second.map((i) => i.kind).sort()).toEqual(first.map((i) => i.kind).sort());
  });
});
