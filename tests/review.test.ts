import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTemporaryDatabase, createTestUser, createTestAccount } from './helpers/db';
import { categoryScope, isKnownCategory } from '@/lib/categories';
import type { NormalizedTransaction } from '@/integrations/types';

useTemporaryDatabase();

let userId: string;
let accountMap: Map<string, string>;

let sequence = 0;
function tx(over: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
  sequence += 1;
  return {
    transactionId: `tx-${sequence}`,
    providerAccountId: 'acct-1',
    amountMinor: -12900,
    currency: 'DKK',
    transactionDate: '2026-08-01',
    bookingDate: '2026-08-01',
    merchant: null,
    description: 'Ukendt betaling',
    ...over,
  };
}

beforeAll(async () => {
  const { ensureMigrated } = await import('@/database/migrate');
  await ensureMigrated();
  userId = await createTestUser();
  accountMap = (await createTestAccount(userId)).map;

  const batch: NormalizedTransaction[] = [
    // Something nobody can name from the description alone, four times over.
    ...['2026-08-02', '2026-08-09', '2026-08-16', '2026-08-23'].map((date) =>
      tx({ merchant: 'Vestergade 12', description: 'VESTERGADE 12', amountMinor: -47500, transactionDate: date, bookingDate: date }),
    ),
    // A smaller mystery, so ordering can be checked.
    tx({ merchant: 'Kiosk 88', description: 'KIOSK 88', amountMinor: -3200 }),
    // Confirmed history, so the user has habits worth suggesting.
    ...Array.from({ length: 5 }, (_, i) =>
      tx({ merchant: 'Netto', description: 'NETTO 5412', amountMinor: -22000 - i, transactionDate: `2026-07-0${i + 1}` }),
    ),
  ];

  const { ingestTransactions } = await import('@/services/transactions');
  await ingestTransactions(userId, accountMap, batch, 'demo');
});

afterAll(async () => {
  const { closeDatabase } = await import('@/database');
  await closeDatabase();
});

describe('review queue', () => {
  it('queues only what the classifier was unsure about', async () => {
    const { reviewQueue, reviewCount } = await import('@/services/review');
    const queue = await reviewQueue(userId);
    expect(queue.remaining).toBe(await reviewCount(userId));
    const merchants = queue.items.map((i) => i.transaction.merchant);
    expect(merchants).toContain('Vestergade 12');
    expect(merchants).not.toContain('Netto');
  });

  it('puts the transactions that matter most first', async () => {
    const { reviewQueue } = await import('@/services/review');
    const { items } = await reviewQueue(userId);
    const amounts = items.map((i) => Math.abs(i.transaction.amountMinor));
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    expect(items[0]!.transaction.merchant).toBe('Vestergade 12');
  });

  it('says how many other transactions one answer would settle', async () => {
    const { reviewQueue } = await import('@/services/review');
    const { items } = await reviewQueue(userId);
    const first = items.find((i) => i.transaction.merchant === 'Vestergade 12')!;
    expect(first.siblingCount).toBe(3);
  });

  it('always arrives with answers to tap, never an empty screen', async () => {
    const { reviewQueue } = await import('@/services/review');
    const { items } = await reviewQueue(userId);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.suggestions.length).toBeGreaterThanOrEqual(3);
      expect(item.suggestions.length).toBeLessThanOrEqual(4);
      // Never propose the category it already has, and never the same twice.
      const categories = item.suggestions.map((s) => s.category);
      expect(categories).not.toContain(item.transaction.category);
      expect(new Set(categories).size).toBe(categories.length);
      for (const suggestion of item.suggestions) {
        expect(isKnownCategory(suggestion.category)).toBe(true);
        expect(suggestion.label).not.toBe('Uncategorized');
        expect(suggestion.label.length).toBeGreaterThan(0);
        expect(suggestion.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('proposes money-in categories for money coming in', async () => {
    const { reviewQueue } = await import('@/services/review');
    const other = await createTestUser();
    const { map } = await createTestAccount(other);
    const { ingestTransactions } = await import('@/services/transactions');
    await ingestTransactions(other, map, [
      { transactionId: 'in-1', providerAccountId: 'acct-1', amountMinor: 850000, currency: 'DKK',
        transactionDate: '2026-08-10', bookingDate: '2026-08-10', merchant: 'Ukendt', description: 'INDBETALING' },
    ], 'demo');

    const { items } = await reviewQueue(other);
    const categories = items[0]!.suggestions.map((s) => s.category);
    expect(categories).toContain('salary');
    expect(categories).not.toContain('groceries');
  });

  it('leads with the choice the user already made for that merchant', async () => {
    const { reviewQueue } = await import('@/services/review');
    const { updateTransaction } = await import('@/services/transactions');

    const before = await reviewQueue(userId);
    const target = before.items.find((i) => i.transaction.merchant === 'Vestergade 12')!;
    const outcome = await updateTransaction(userId, target.transaction.id, {
      category: 'rent',
      ownership: 'personal',
      applyToFutureMerchant: true,
      applyToPastMerchant: false,
    });
    expect(outcome.ruleCreated).toBe(true);

    const after = await reviewQueue(userId);
    const sibling = after.items.find((i) => i.transaction.merchant === 'Vestergade 12')!;
    expect(sibling.transaction.id).not.toBe(target.transaction.id);
    expect(sibling.suggestions[0]!.category).toBe('rent');
    expect(sibling.suggestions[0]!.reason).toMatch(/before/i);
  });

  it('settles every sibling from one answer', async () => {
    const { reviewQueue } = await import('@/services/review');
    const { updateTransaction } = await import('@/services/transactions');

    const before = await reviewQueue(userId);
    const target = before.items.find((i) => i.transaction.merchant === 'Vestergade 12')!;
    expect(target.siblingCount).toBeGreaterThan(0);

    await updateTransaction(userId, target.transaction.id, {
      category: 'rent',
      ownership: 'personal',
      applyToFutureMerchant: true,
      applyToPastMerchant: true,
    });

    const after = await reviewQueue(userId);
    expect(after.items.map((i) => i.transaction.merchant)).not.toContain('Vestergade 12');
    expect(after.remaining).toBeLessThan(before.remaining);
  });

  it('does not offer business categories for a personal card payment', async () => {
    const { reviewQueue } = await import('@/services/review');
    const { ingestTransactions } = await import('@/services/transactions');
    const other = await createTestUser();
    const { map } = await createTestAccount(other);

    // A business that generates far more rows than the private side does.
    const business = Array.from({ length: 30 }, (_, i) => ({
      transactionId: `fee-${i}`, providerAccountId: 'acct-1', amountMinor: -1200, currency: 'DKK',
      transactionDate: '2026-07-15', bookingDate: '2026-07-15',
      merchant: 'Stripe', description: 'STRIPE PROCESSING FEE',
    }));
    await ingestTransactions(other, map, [
      ...business,
      { transactionId: 'nota-1', providerAccountId: 'acct-1', amountMinor: -115000, currency: 'DKK',
        transactionDate: '2026-08-04', bookingDate: '2026-08-04',
        merchant: null, description: 'DANKORT-NOTA 4471 KBH K' },
    ], 'demo');

    const { items } = await reviewQueue(other);
    const nota = items.find((i) => i.transaction.description.startsWith('DANKORT-NOTA'))!;
    expect(nota.transaction.ownership).toBe('personal');
    for (const suggestion of nota.suggestions) {
      expect(categoryScope(suggestion.category), suggestion.category).toBe('personal');
    }
  });

  it('suggests transfer categories for a bare bank transfer', async () => {
    const { reviewQueue } = await import('@/services/review');
    const { ingestTransactions } = await import('@/services/transactions');
    const other = await createTestUser();
    const { map } = await createTestAccount(other);
    await ingestTransactions(other, map, [
      { transactionId: 'ref-1', providerAccountId: 'acct-1', amountMinor: -240000, currency: 'DKK',
        transactionDate: '2026-08-07', bookingDate: '2026-08-07',
        merchant: null, description: 'OVERFOERSEL REF 88213004' },
    ], 'demo');

    const { items } = await reviewQueue(other);
    const categories = items[0]!.suggestions.map((s) => s.category);
    expect(items[0]!.transaction.paymentChannel).toBe('transfer');
    expect(categories).toContain('transfers');
    expect(categories).toContain('peer_transfer');
    expect(categories).not.toContain('groceries');
  });

  it('is empty for an account with nothing to review', async () => {
    const { reviewQueue, reviewCount } = await import('@/services/review');
    const other = await createTestUser();
    const queue = await reviewQueue(other);
    expect(queue.items).toEqual([]);
    expect(queue.remaining).toBe(0);
    expect(queue.unreviewedMinor).toBe(0);
    expect(await reviewCount(other)).toBe(0);
  });
});
