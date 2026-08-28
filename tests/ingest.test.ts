import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTemporaryDatabase, createTestUser, createTestAccount } from './helpers/db';
import type { NormalizedTransaction } from '@/integrations/types';

useTemporaryDatabase();

let userId: string;
let accountMap: Map<string, string>;

function tx(over: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
  return {
    transactionId: 'tx-1',
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

beforeAll(async () => {
  const { ensureMigrated } = await import('@/database/migrate');
  await ensureMigrated();
  userId = await createTestUser();
  accountMap = (await createTestAccount(userId)).map;
});

afterAll(async () => {
  const { closeDatabase } = await import('@/database');
  await closeDatabase();
});

describe('duplicate prevention', () => {
  it('ingests a batch once', async () => {
    const { ingestTransactions } = await import('@/services/transactions');
    const result = await ingestTransactions(userId, accountMap, [tx()], 'demo');
    expect(result.inserted).toBe(1);
  });

  it('is idempotent when the same sync runs again', async () => {
    const { ingestTransactions } = await import('@/services/transactions');
    const result = await ingestTransactions(userId, accountMap, [tx()], 'demo');
    expect(result.inserted).toBe(0);
    expect(result.duplicatesSkipped).toBe(1);
  });

  it('drops duplicates inside a single batch', async () => {
    const { ingestTransactions } = await import('@/services/transactions');
    const result = await ingestTransactions(
      userId,
      accountMap,
      [tx({ transactionId: 'tx-dup' }), tx({ transactionId: 'tx-dup' })],
      'demo',
    );
    expect(result.inserted).toBe(1);
    expect(result.duplicatesSkipped).toBe(1);
  });

  it('catches the same payment arriving from a second provider', async () => {
    const { ingestTransactions } = await import('@/services/transactions');
    const { upsertAccounts } = await import('@/services/accounts');
    const stripeMap = await upsertAccounts(userId, 'stripe', null, [
      {
        providerAccountId: 'acct_stripe',
        name: 'Stripe',
        institution: 'Stripe',
        maskedReference: null,
        type: 'payment_processor',
        currency: 'DKK',
        balanceMinor: 0,
      },
    ]);
    // Same amount, date and merchant, but a different provider and id.
    const result = await ingestTransactions(
      userId,
      stripeMap,
      [tx({ transactionId: 'ch_abc', providerAccountId: 'acct_stripe' })],
      'stripe',
    );
    expect(result.inserted).toBe(0);
    expect(result.nearDuplicatesSkipped).toBe(1);
  });

  it('keeps a genuine repeat purchase from the same provider', async () => {
    const { ingestTransactions } = await import('@/services/transactions');
    const result = await ingestTransactions(
      userId,
      accountMap,
      [tx({ transactionId: 'tx-repeat', merchant: 'Espresso House', amountMinor: -4500 })],
      'demo',
    );
    expect(result.inserted).toBe(1);

    const second = await ingestTransactions(
      userId,
      accountMap,
      [tx({ transactionId: 'tx-repeat-2', merchant: 'Espresso House', amountMinor: -4500 })],
      'demo',
    );
    // Same provider, different provider id: two coffees on one day are two
    // coffees, not a double-import.
    expect(second.inserted).toBe(1);
  });

  it('keeps both legs of a transfer between the user’s own accounts', async () => {
    const { ingestTransactions } = await import('@/services/transactions');
    const out = await ingestTransactions(
      userId,
      accountMap,
      [tx({ transactionId: 'xfer-out', merchant: 'Savings', amountMinor: -500000, transactionDate: '2026-06-10' })],
      'demo',
    );
    const back = await ingestTransactions(
      userId,
      accountMap,
      [tx({ transactionId: 'xfer-in', merchant: 'Savings', amountMinor: 500000, transactionDate: '2026-06-10' })],
      'demo',
    );
    expect(out.inserted).toBe(1);
    expect(back.inserted).toBe(1);
  });

  it('skips transactions for an account it does not know', async () => {
    const { ingestTransactions } = await import('@/services/transactions');
    const result = await ingestTransactions(
      userId,
      accountMap,
      [tx({ transactionId: 'orphan', providerAccountId: 'not-a-real-account' })],
      'demo',
    );
    expect(result.inserted).toBe(0);
  });
});

describe('ingest hygiene', () => {
  it('strips secrets out of provider metadata', async () => {
    const { sanitizeMetadata } = await import('@/services/transactions');
    const cleaned = sanitizeMetadata({
      access_token: 'super-secret',
      card_number: '4111111111111111',
      nested: { client_secret: 'x', mcc: '5411' },
      mcc: '5814',
      note: 'Card 4111 1111 1111 1111 used',
    });
    expect(cleaned).not.toHaveProperty('access_token');
    expect(cleaned).not.toHaveProperty('card_number');
    expect(cleaned.nested).not.toHaveProperty('client_secret');
    expect(cleaned.mcc).toBe('5814');
    expect(String(cleaned.note)).toContain('[redacted-card]');
  });

  it('redacts a card number a bank put in the description', async () => {
    const { ingestTransactions, listTransactions } = await import('@/services/transactions');
    await ingestTransactions(
      userId,
      accountMap,
      [tx({ transactionId: 'leaky', description: 'Payment card 4111111111111111 accepted' })],
      'demo',
    );
    const page = await listTransactions(userId, { search: 'accepted' });
    expect(page.transactions[0]!.description).not.toContain('4111111111111111');
    expect(page.transactions[0]!.description).toContain('[redacted-card]');
  });

  it('assigns a category and confidence on the way in', async () => {
    const { listTransactions } = await import('@/services/transactions');
    const page = await listTransactions(userId, { search: 'netflix' });
    expect(page.transactions[0]!.category).toBe('entertainment');
    expect(page.transactions[0]!.confidenceScore).toBeGreaterThan(0.5);
  });
});
