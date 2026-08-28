import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { useTemporaryDatabase, createTestUser } from './helpers/db';

useTemporaryDatabase();

let alice: string;
let bob: string;
let aliceAccount: string;
let bobAccount: string;

beforeAll(async () => {
  const { ensureMigrated } = await import('@/database/migrate');
  await ensureMigrated();
  alice = await createTestUser('alice@test.local');
  bob = await createTestUser('bob@test.local');

  const { upsertAccounts } = await import('@/services/accounts');
  const { ingestTransactions } = await import('@/services/transactions');

  for (const [userId, label] of [[alice, 'alice'], [bob, 'bob']] as const) {
    const map = await upsertAccounts(userId, 'demo', null, [
      {
        providerAccountId: `${label}-acct`,
        name: `${label} account`,
        institution: 'Test Bank',
        maskedReference: '••1111',
        type: 'checking',
        currency: 'DKK',
        balanceMinor: 100_000,
      },
    ]);
    const accountId = [...map.values()][0]!;
    if (userId === alice) aliceAccount = accountId;
    else bobAccount = accountId;

    await ingestTransactions(
      userId,
      map,
      [
        {
          transactionId: `${label}-tx-1`,
          providerAccountId: `${label}-acct`,
          amountMinor: -12345,
          currency: 'DKK',
          transactionDate: '2026-06-01',
          bookingDate: '2026-06-01',
          merchant: `${label} secret merchant`,
          description: `${label} private description`,
        },
      ],
      'demo',
    );
  }
});

afterAll(async () => {
  const { closeDatabase } = await import('@/database');
  await closeDatabase();
});

describe('user isolation', () => {
  it('shows each user only their own transactions', async () => {
    const { listTransactions } = await import('@/services/transactions');
    const forAlice = await listTransactions(alice, {});
    expect(forAlice.transactions).toHaveLength(1);
    expect(forAlice.transactions[0]!.merchant).toContain('alice');

    const forBob = await listTransactions(bob, {});
    expect(forBob.transactions).toHaveLength(1);
    expect(forBob.transactions[0]!.merchant).toContain('bob');
  });

  it('refuses to fetch another user’s transaction by id', async () => {
    const { listTransactions, getTransaction } = await import('@/services/transactions');
    const bobTx = (await listTransactions(bob, {})).transactions[0]!;
    expect(await getTransaction(alice, bobTx.id)).toBeNull();
    expect(await getTransaction(bob, bobTx.id)).not.toBeNull();
  });

  it('refuses to update another user’s transaction', async () => {
    const { listTransactions, updateTransaction } = await import('@/services/transactions');
    const bobTx = (await listTransactions(bob, {})).transactions[0]!;
    await expect(
      updateTransaction(alice, bobTx.id, { category: 'groceries' }),
    ).rejects.toThrow(/not found/i);
  });

  it('returns nothing even when a query explicitly names the other user', async () => {
    // Row-level security is doing the work here, not a WHERE clause in the app.
    const { withUser } = await import('@/database');
    const rows = await withUser(alice, async (db) => {
      const result = await db.query('SELECT id FROM transactions WHERE user_id = $1', [bob]);
      return result.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('cannot write a row belonging to another user', async () => {
    const { withUser } = await import('@/database');
    await expect(
      withUser(alice, async (db) => {
        await db.query(
          `INSERT INTO merchant_rules (id, user_id, match_type, pattern, category)
           VALUES ($1, $2, 'merchant_key', 'smuggled', 'groceries')`,
          [randomUUID(), bob],
        );
      }),
    ).rejects.toThrow();
  });

  it('keeps accounts, subscriptions and audit rows separated too', async () => {
    const { listAccounts } = await import('@/services/accounts');
    const { recordAudit, AUDIT_ACTIONS } = await import('@/security/audit');
    const { withUser } = await import('@/database');

    expect((await listAccounts(alice)).map((a) => a.id)).toEqual([aliceAccount]);
    expect((await listAccounts(bob)).map((a) => a.id)).toEqual([bobAccount]);

    await recordAudit(alice, AUDIT_ACTIONS.SIGNED_IN);
    const bobsView = await withUser(bob, async (db) => {
      const result = await db.query('SELECT count(*)::int AS n FROM audit_logs');
      return result.rows[0] as { n: number };
    });
    expect(bobsView.n).toBe(0);
  });

  it('rejects a malformed user id rather than running the query', async () => {
    const { withUser } = await import('@/database');
    await expect(
      withUser("' OR 1=1 --", async (db) => db.query('SELECT 1')),
    ).rejects.toThrow(/invalid user id/i);
  });

  it('deletes only the requesting user’s financial data', async () => {
    const { deleteFinancialData } = await import('@/services/users');
    const { listTransactions } = await import('@/services/transactions');

    await deleteFinancialData(alice);
    expect((await listTransactions(alice, {})).transactions).toHaveLength(0);
    expect((await listTransactions(bob, {})).transactions).toHaveLength(1);
  });
});
