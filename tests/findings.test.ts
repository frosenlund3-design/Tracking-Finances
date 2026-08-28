import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTemporaryDatabase, createTestUser, createTestAccount } from './helpers/db';
import { addMonths } from '@/lib/normalize';
import type { NormalizedTransaction } from '@/integrations/types';
import type { Finding } from '@/services/anomalies';

useTemporaryDatabase();

let userId: string;
let accountMap: Map<string, string>;

const NOW = '2026-08-25';

let sequence = 0;
function tx(over: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
  sequence += 1;
  return {
    transactionId: `tx-${sequence}`,
    providerAccountId: 'acct-1',
    amountMinor: -12900,
    currency: 'DKK',
    transactionDate: '2026-06-01',
    bookingDate: '2026-06-01',
    merchant: 'Netflix',
    description: 'Netflix.com',
    ...over,
  };
}

function find(findings: Finding[], kind: Finding['kind'], contains: string): Finding | undefined {
  return findings.find((f) => f.kind === kind && f.title.includes(contains));
}

beforeAll(async () => {
  const { ensureMigrated } = await import('@/database/migrate');
  await ensureMigrated();
  userId = await createTestUser();
  accountMap = (await createTestAccount(userId)).map;

  const batch: NormalizedTransaction[] = [];

  // A lunch place with a settled habit, then one evening that was not lunch.
  const lunches = ['2026-03-04', '2026-04-02', '2026-05-06', '2026-06-03', '2026-07-01', '2026-08-05'];
  for (const date of lunches) {
    batch.push(tx({ merchant: 'Cafe Solskin', description: 'CAFE SOLSKIN', amountMinor: -14500, transactionDate: date, bookingDate: date }));
  }
  batch.push(tx({ merchant: 'Cafe Solskin', description: 'CAFE SOLSKIN', amountMinor: -92000, transactionDate: '2026-08-20', bookingDate: '2026-08-20' }));

  // The same shop, same amount, twice in one day.
  for (const id of ['a', 'b']) {
    batch.push(tx({ transactionId: `double-${id}`, merchant: 'Elgiganten', description: 'ELGIGANTEN 4412', amountMinor: -240000, transactionDate: '2026-08-14', bookingDate: '2026-08-14' }));
  }

  // Two video streaming services, both monthly, both recent enough to be active.
  for (let i = 0; i < 8; i += 1) {
    const date = addMonths('2026-01-11', i);
    batch.push(tx({ merchant: 'Netflix', description: 'NETFLIX.COM', amountMinor: -13900, transactionDate: date, bookingDate: date }));
    batch.push(tx({ merchant: 'HBO Max', description: 'HBO MAX', amountMinor: -8900, transactionDate: date, bookingDate: date }));
  }

  // A yearly bill that lands soon.
  for (let i = 0; i < 3; i += 1) {
    const date = addMonths('2023-09-08', i * 12);
    batch.push(tx({ merchant: 'Adobe', description: 'ADOBE CREATIVE CLOUD', amountMinor: -419000, transactionDate: date, bookingDate: date }));
  }

  const { ingestTransactions } = await import('@/services/transactions');
  await ingestTransactions(userId, accountMap, batch, 'demo');
  const { detectAndStoreSubscriptions } = await import('@/services/subscriptions');
  await detectAndStoreSubscriptions(userId, NOW);
});

afterAll(async () => {
  const { closeDatabase } = await import('@/database');
  await closeDatabase();
});

describe('findings', () => {
  it('notices a charge far outside what a merchant normally costs', async () => {
    const { detectFindings } = await import('@/services/anomalies');
    const findings = await detectFindings(userId, 'DKK', NOW);
    const unusual = find(findings, 'unusual_charge', 'Cafe Solskin');
    expect(unusual).toBeDefined();
    expect(unusual!.facts.amountMinor).toBe(92000);
    expect(unusual!.facts.usualMinor).toBe(14500);
    expect(unusual!.facts.historyCount).toBe(6);
  });

  it('leaves a merchant\'s ordinary charges alone', async () => {
    const { detectFindings } = await import('@/services/anomalies');
    const findings = await detectFindings(userId, 'DKK', NOW);
    expect(find(findings, 'unusual_charge', 'Netflix')).toBeUndefined();
  });

  it('flags the same amount charged twice in a day', async () => {
    const { detectFindings } = await import('@/services/anomalies');
    const findings = await detectFindings(userId, 'DKK', NOW);
    const double = find(findings, 'possible_double_charge', 'Elgiganten');
    expect(double).toBeDefined();
    expect(double!.facts.count).toBe(2);
    expect(double!.facts.amountMinor).toBe(240000);
  });

  it('groups subscriptions that do the same job', async () => {
    const { detectFindings } = await import('@/services/anomalies');
    const findings = await detectFindings(userId, 'DKK', NOW);
    const overlap = find(findings, 'overlapping_services', 'video streaming');
    expect(overlap).toBeDefined();
    expect(overlap!.facts.count).toBe(2);
    expect(overlap!.facts.monthlyMinor).toBe(13900 + 8900);
  });

  it('warns before a large yearly renewal, not after', async () => {
    const { detectFindings } = await import('@/services/anomalies');
    const findings = await detectFindings(userId, 'DKK', NOW);
    const renewal = find(findings, 'large_renewal_due', 'Adobe');
    expect(renewal).toBeDefined();
    expect(Number(renewal!.facts.daysAway)).toBeGreaterThanOrEqual(0);
    expect(Number(renewal!.facts.daysAway)).toBeLessThanOrEqual(30);

    // A month earlier the renewal is still too far off to be worth saying.
    const early = await detectFindings(userId, 'DKK', '2026-07-01');
    expect(find(early, 'large_renewal_due', 'Adobe')).toBeUndefined();
  });

  it('sorts by how much money the finding is about', async () => {
    const { detectFindings } = await import('@/services/anomalies');
    const findings = await detectFindings(userId, 'DKK', NOW);
    const weights = findings.map((f) => f.weightMinor);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
  });

  it('reports nothing for an account with no history', async () => {
    const { detectFindings } = await import('@/services/anomalies');
    const other = await createTestUser();
    expect(await detectFindings(other, 'DKK', NOW)).toEqual([]);
  });
});
