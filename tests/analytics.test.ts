import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTemporaryDatabase, createTestUser, createTestAccount } from './helpers/db';
import type { NormalizedTransaction } from '@/integrations/types';

useTemporaryDatabase();

let userId: string;
const MONTH = { from: '2026-06-01', to: '2026-06-30' };

/**
 * A small, fully known ledger. Every assertion below is checked against a
 * total worked out by hand from this list, so a regression in the SQL cannot
 * hide behind "well, the number changed".
 */
const LEDGER: NormalizedTransaction[] = [
  // Personal income: 38,400.00
  { transactionId: 't1', providerAccountId: 'acct-1', amountMinor: 3_840_000, currency: 'DKK', transactionDate: '2026-06-28', bookingDate: null, merchant: 'Nordisk Design ApS', description: 'Loenoverfoersel' },
  // Rent: 9,850.00 out
  { transactionId: 't2', providerAccountId: 'acct-1', amountMinor: -985_000, currency: 'DKK', transactionDate: '2026-06-01', bookingDate: null, merchant: 'Boligselskabet Vest', description: 'Husleje' },
  // Groceries: 200.00 + 300.00 = 500.00 out
  { transactionId: 't3', providerAccountId: 'acct-1', amountMinor: -20_000, currency: 'DKK', transactionDate: '2026-06-04', bookingDate: null, merchant: 'Netto', description: 'NETTO' },
  { transactionId: 't4', providerAccountId: 'acct-1', amountMinor: -30_000, currency: 'DKK', transactionDate: '2026-06-11', bookingDate: null, merchant: 'Netto', description: 'NETTO' },
  // Restaurants: 150.00 out
  { transactionId: 't5', providerAccountId: 'acct-1', amountMinor: -15_000, currency: 'DKK', transactionDate: '2026-06-14', bookingDate: null, merchant: 'Wolt', description: 'WOLT' },
  // Business revenue: 5,000.00 in
  { transactionId: 't6', providerAccountId: 'acct-1', amountMinor: 500_000, currency: 'DKK', transactionDate: '2026-06-09', bookingDate: null, merchant: 'Studio Nord', description: 'Faktura 118', ownershipHint: 'business' },
  // Business software: 145.00 out
  { transactionId: 't7', providerAccountId: 'acct-1', amountMinor: -14_500, currency: 'DKK', transactionDate: '2026-06-02', bookingDate: null, merchant: 'GitHub', description: 'GITHUB INC', ownershipHint: 'business' },
  // Internal transfer, both legs: must not count as income or expense
  { transactionId: 't8', providerAccountId: 'acct-1', amountMinor: -1_000_000, currency: 'DKK', transactionDate: '2026-06-20', bookingDate: null, merchant: 'Stripe', description: 'Payout to bank account', transactionType: 'payout', ownershipHint: 'business' },
  { transactionId: 't9', providerAccountId: 'acct-1', amountMinor: 1_000_000, currency: 'DKK', transactionDate: '2026-06-22', bookingDate: null, merchant: 'Stripe', description: 'Overfoersel fra Stripe', transactionType: 'payout', ownershipHint: 'business' },
  // Previous month, for comparisons: 1,000.00 groceries
  { transactionId: 't10', providerAccountId: 'acct-1', amountMinor: -100_000, currency: 'DKK', transactionDate: '2026-05-12', bookingDate: null, merchant: 'Netto', description: 'NETTO' },
];

beforeAll(async () => {
  const { ensureMigrated } = await import('@/database/migrate');
  await ensureMigrated();
  userId = await createTestUser();
  const { map } = await createTestAccount(userId);
  const { ingestTransactions } = await import('@/services/transactions');
  const result = await ingestTransactions(userId, map, LEDGER, 'demo');
  expect(result.inserted).toBe(LEDGER.length);
});

afterAll(async () => {
  const { closeDatabase } = await import('@/database');
  await closeDatabase();
});

describe('period totals', () => {
  it('adds income and expenses exactly', async () => {
    const { periodTotals } = await import('@/services/analytics');
    const totals = await periodTotals(userId, MONTH);
    // 38,400 salary + 5,000 revenue
    expect(totals.incomeMinor).toBe(4_340_000);
    // 9,850 + 200 + 300 + 150 + 145 = 10,645.00
    expect(totals.expenseMinor).toBe(1_064_500);
    expect(totals.netMinor).toBe(4_340_000 - 1_064_500);
  });

  it('excludes internal transfers from both sides', async () => {
    const { periodTotals } = await import('@/services/analytics');
    const excluded = await periodTotals(userId, MONTH);
    expect(excluded.transfersExcluded).toBe(2);

    const included = await periodTotals(userId, MONTH, 'DKK', { includeTransfers: true });
    expect(included.incomeMinor).toBe(excluded.incomeMinor + 1_000_000);
    expect(included.expenseMinor).toBe(excluded.expenseMinor + 1_000_000);
    // The transfer nets to zero either way, which is the point.
    expect(included.netMinor).toBe(excluded.netMinor);
  });

  it('respects a personal/business filter', async () => {
    const { periodTotals } = await import('@/services/analytics');
    const business = await periodTotals(userId, { ...MONTH, ownership: 'business' });
    expect(business.incomeMinor).toBe(500_000);
    expect(business.expenseMinor).toBe(14_500);

    const personal = await periodTotals(userId, { ...MONTH, ownership: 'personal' });
    expect(personal.incomeMinor).toBe(3_840_000);
    // 9,850 rent + 200 + 300 groceries + 150 restaurants = 10,500.00
    expect(personal.expenseMinor).toBe(1_050_000);
  });

  it('returns zeroes rather than failing on an empty period', async () => {
    const { periodTotals } = await import('@/services/analytics');
    const empty = await periodTotals(userId, { from: '2020-01-01', to: '2020-01-31' });
    expect(empty.incomeMinor).toBe(0);
    expect(empty.expenseMinor).toBe(0);
    expect(empty.netMinor).toBe(0);
    expect(empty.transactionCount).toBe(0);
  });
});

describe('category breakdown', () => {
  it('groups and ranks by amount, and shares sum to one', async () => {
    const { categoryBreakdown } = await import('@/services/analytics');
    const rows = await categoryBreakdown(userId, MONTH, 'expense', 20);
    const rent = rows.find((r) => r.category === 'rent');
    const groceries = rows.find((r) => r.category === 'groceries');

    expect(rent?.amountMinor).toBe(985_000);
    expect(groceries?.amountMinor).toBe(50_000);
    expect(groceries?.transactionCount).toBe(2);
    expect(rows[0]!.category).toBe('rent');
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 6);
    expect(rows.some((r) => r.category === 'transfers')).toBe(false);
  });

  it('matches the expense total from periodTotals', async () => {
    const { categoryBreakdown, periodTotals } = await import('@/services/analytics');
    const rows = await categoryBreakdown(userId, MONTH, 'expense', 50);
    const totals = await periodTotals(userId, MONTH);
    expect(rows.reduce((s, r) => s + r.amountMinor, 0)).toBe(totals.expenseMinor);
  });
});

describe('business summary', () => {
  it('separates revenue, costs and gross profit', async () => {
    const { businessSummary } = await import('@/services/analytics');
    const summary = await businessSummary(userId, MONTH.from, MONTH.to);
    expect(summary.revenueMinor).toBe(500_000);
    expect(summary.expenseMinor).toBe(14_500);
    expect(summary.softwareMinor).toBe(14_500);
    // Gross profit is revenue minus costs, which is not the same question as
    // net cash flow — the two cards must not silently show one number twice.
    expect(summary.grossProfitMinor).toBe(500_000 - 14_500);
    expect(summary.netMinor).toBe(summary.incomeMinor - summary.expenseMinor);
  });

  it('counts processor revenue by the account it landed in', async () => {
    const { businessSummary } = await import('@/services/analytics');
    // The ledger's revenue arrives in a plain checking account, so nothing
    // should be attributed to a payment processor.
    const summary = await businessSummary(userId, MONTH.from, MONTH.to);
    expect(summary.processorRevenueMinor).toBe(0);
  });
});

describe('merchant breakdown', () => {
  it('defaults to money out', async () => {
    const { merchantBreakdown } = await import('@/services/analytics');
    const rows = await merchantBreakdown(userId, MONTH, 10);
    expect(rows.some((r) => r.merchant.includes('Boligselskabet'))).toBe(true);
    expect(rows.some((r) => r.merchant.includes('Studio Nord'))).toBe(false);
  });

  it('respects an explicit income direction, for paying customers', async () => {
    const { merchantBreakdown } = await import('@/services/analytics');
    const rows = await merchantBreakdown(userId, { ...MONTH, direction: 'income' }, 10);
    expect(rows.some((r) => r.merchant.includes('Studio Nord'))).toBe(true);
    // A cost must never show up in a list of customers.
    expect(rows.some((r) => r.merchant.includes('Boligselskabet'))).toBe(false);
  });
});

describe('month comparison', () => {
  it('compares like for like and flags a rise', async () => {
    const { compareCategories } = await import('@/services/analytics');
    const rows = await compareCategories(userId, 'all', new Date('2026-06-15T12:00:00Z'));
    const groceries = rows.find((r) => r.category === 'groceries');
    expect(groceries?.previousMinor).toBe(100_000);
    expect(groceries?.currentMinor).toBe(50_000);
    expect(groceries?.changePct).toBeCloseTo(-50, 5);
  });
});

describe('largest expenses', () => {
  it('ranks by magnitude and excludes transfers', async () => {
    const { largestExpenses } = await import('@/services/analytics');
    const rows = await largestExpenses(userId, MONTH, 3);
    expect(rows[0]!.amountMinor).toBe(985_000);
    expect(rows.every((r) => r.category !== 'transfers')).toBe(true);
  });
});
