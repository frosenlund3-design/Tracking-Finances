import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTemporaryDatabase, createTestUser } from './helpers/db';
import type { NormalizedTransaction } from '@/integrations/types';

useTemporaryDatabase();

let userId: string;
let checkingId: string;
let businessId: string;
const RANGE = { from: '2026-06-01', to: '2026-06-30' };

beforeAll(async () => {
  const { ensureMigrated } = await import('@/database/migrate');
  await ensureMigrated();
  userId = await createTestUser();

  const { upsertAccounts } = await import('@/services/accounts');
  const map = await upsertAccounts(userId, 'demo', null, [
    {
      providerAccountId: 'checking', name: 'Everyday', institution: 'Demo Bank',
      maskedReference: '••1111', type: 'checking', currency: 'DKK', balanceMinor: 2_000_000,
    },
    {
      providerAccountId: 'business', name: 'Business', institution: 'Demo Bank',
      maskedReference: '••2222', type: 'checking', currency: 'DKK', balanceMinor: 1_000_000,
      ownership: 'business',
    },
  ]);
  checkingId = map.get('checking')!;
  businessId = map.get('business')!;

  const ledger: NormalizedTransaction[] = [
    // External income and spending on the personal account.
    { transactionId: 'e1', providerAccountId: 'checking', amountMinor: 500_000, currency: 'DKK', transactionDate: '2026-06-03', bookingDate: null, merchant: 'Frilans Kunde', description: 'Faktura 12' },
    { transactionId: 'e2', providerAccountId: 'checking', amountMinor: -20_000, currency: 'DKK', transactionDate: '2026-06-04', bookingDate: null, merchant: 'Netto', description: 'VISA/DANKORT NETTO' },
    { transactionId: 'e3', providerAccountId: 'checking', amountMinor: -100_000, currency: 'DKK', transactionDate: '2026-06-05', bookingDate: null, merchant: 'Boligselskabet Vest', description: 'Overfoersel husleje Boligselskabet Vest' },
    // A genuine move between the user's own accounts, both legs marked transfer.
    { transactionId: 't1', providerAccountId: 'business', amountMinor: -300_000, currency: 'DKK', transactionDate: '2026-06-10', bookingDate: null, merchant: 'Egen Konto', description: 'Overfoersel til egen konto' },
    { transactionId: 't2', providerAccountId: 'checking', amountMinor: 300_000, currency: 'DKK', transactionDate: '2026-06-12', bookingDate: null, merchant: 'Egen Konto', description: 'Overfoersel fra egen konto' },
    // An owner's draw: leaves as a transfer, lands as salary.
    { transactionId: 'd1', providerAccountId: 'business', amountMinor: -450_000, currency: 'DKK', transactionDate: '2026-06-20', bookingDate: null, merchant: 'Egen Konto', description: 'Overfoersel loen til ejer' },
    { transactionId: 'd2', providerAccountId: 'checking', amountMinor: 450_000, currency: 'DKK', transactionDate: '2026-06-21', bookingDate: null, merchant: 'Eget Firma', description: 'Loenoverfoersel' },
    // MobilePay, both directions.
    { transactionId: 'm1', providerAccountId: 'checking', amountMinor: -15_000, currency: 'DKK', transactionDate: '2026-06-14', bookingDate: null, merchant: 'Anders Kjeldsen', description: 'MobilePay til Anders Kjeldsen' },
    { transactionId: 'm2', providerAccountId: 'checking', amountMinor: 25_000, currency: 'DKK', transactionDate: '2026-06-15', bookingDate: null, merchant: 'Anders Kjeldsen', description: 'MobilePay fra Anders Kjeldsen' },
    { transactionId: 'm3', providerAccountId: 'checking', amountMinor: -8_000, currency: 'DKK', transactionDate: '2026-06-18', bookingDate: null, merchant: 'Sofie Lindberg', description: 'MobilePay til Sofie Lindberg' },
    // Cash and direct debit, for the channel breakdown.
    { transactionId: 'c1', providerAccountId: 'checking', amountMinor: -50_000, currency: 'DKK', transactionDate: '2026-06-16', bookingDate: null, merchant: 'Haeveautomat', description: 'Haeveautomat kontant udbetaling' },
    { transactionId: 'b1', providerAccountId: 'checking', amountMinor: -60_000, currency: 'DKK', transactionDate: '2026-06-06', bookingDate: null, merchant: 'Andel Energi', description: 'BS Andel Energi el-regning' },
  ];

  const { ingestTransactions } = await import('@/services/transactions');
  const result = await ingestTransactions(userId, map, ledger, 'demo');
  expect(result.inserted).toBe(ledger.length);
});

afterAll(async () => {
  const { closeDatabase } = await import('@/database');
  await closeDatabase();
});

describe('per-account flows', () => {
  it('separates money from outside from money you moved yourself', async () => {
    const { accountFlows } = await import('@/services/account-flows');
    const flows = await accountFlows(userId, RANGE);
    const checking = flows.find((f) => f.accountId === checkingId)!;

    // 500,000 invoice + 250 MobilePay in. Both the 300,000 transfer and the
    // 450,000 owner draw were paired to a leg on the business account, so
    // neither is counted as income here.
    expect(checking.externalInMinor).toBe(525_000);
    expect(checking.internalInMinor).toBe(750_000);
    // 200 groceries + 1,000 rent + 150 + 80 MobilePay + 500 cash + 600 direct debit
    expect(checking.externalOutMinor).toBe(253_000);
  });

  it('reports the same movement as internal on both sides', async () => {
    const { accountFlows } = await import('@/services/account-flows');
    const flows = await accountFlows(userId, RANGE);
    const checking = flows.find((f) => f.accountId === checkingId)!;
    const business = flows.find((f) => f.accountId === businessId)!;
    // What left the business as internal must arrive at the personal account
    // as internal. An asymmetry here means one screen contradicts another.
    expect(business.internalOutMinor).toBe(checking.internalInMinor);
  });

  it('keeps rent in spending rather than hiding it as a transfer', async () => {
    const { categoryBreakdown } = await import('@/services/analytics');
    const rows = await categoryBreakdown(userId, RANGE, 'expense', 20);
    expect(rows.find((r) => r.category === 'rent')?.amountMinor).toBe(100_000);
  });

  it('reports the business account paying out to the owner', async () => {
    const { accountFlows } = await import('@/services/account-flows');
    const business = (await accountFlows(userId, RANGE)).find((f) => f.accountId === businessId)!;
    expect(business.internalOutMinor).toBe(750_000);
    expect(business.externalOutMinor).toBe(0);
  });

  it('ends the balance series at the account’s actual balance', async () => {
    const { accountFlows } = await import('@/services/account-flows');
    const checking = (await accountFlows(userId, RANGE)).find((f) => f.accountId === checkingId)!;
    expect(checking.series.at(-1)!.balanceMinor).toBe(2_000_000);
    expect(checking.series.length).toBeGreaterThan(1);
  });
});

describe('transfers between own accounts', () => {
  it('pairs both legs when both are categorized as transfers', async () => {
    const { internalTransfers } = await import('@/services/account-flows');
    const transfers = await internalTransfers(userId, RANGE);
    const paired = transfers.find((t) => t.amountMinor === 300_000)!;
    expect(paired.fromAccountId).toBe(businessId);
    expect(paired.toAccountId).toBe(checkingId);
    expect(paired.inferred).toBe(false);
  });

  it('pairs an owner draw whose legs have different categories', async () => {
    const { internalTransfers } = await import('@/services/account-flows');
    const transfers = await internalTransfers(userId, RANGE);
    const draw = transfers.find((t) => t.amountMinor === 450_000)!;
    expect(draw.fromAccountId).toBe(businessId);
    expect(draw.toAccountId).toBe(checkingId);
    // Found by matching, not stated by the bank — and labelled as such.
    expect(draw.inferred).toBe(true);
  });

  it('never pairs a movement with itself or within one account', async () => {
    const { internalTransfers } = await import('@/services/account-flows');
    for (const transfer of await internalTransfers(userId, RANGE)) {
      if (transfer.fromAccountId && transfer.toAccountId) {
        expect(transfer.fromAccountId).not.toBe(transfer.toAccountId);
      }
    }
  });
});

describe('payment channels', () => {
  it('marks movements in a processor account as the processor rail', async () => {
    const { upsertAccounts } = await import('@/services/accounts');
    const { ingestTransactions } = await import('@/services/transactions');
    const { channelBreakdown } = await import('@/services/mobilepay');

    const map = await upsertAccounts(userId, 'demo', null, [
      {
        providerAccountId: 'processor', name: 'Stripe balance', institution: 'Stripe',
        maskedReference: null, type: 'payment_processor', currency: 'DKK', balanceMinor: 0,
        ownership: 'business',
      },
    ]);
    await ingestTransactions(
      userId,
      map,
      [
        {
          transactionId: 'p1', providerAccountId: 'processor', amountMinor: -1_000,
          currency: 'DKK', transactionDate: '2026-06-09', bookingDate: null,
          merchant: 'Stripe', description: 'Stripe processing fee',
        },
      ],
      'demo',
    );

    const rows = await channelBreakdown(userId, { ...RANGE, accountIds: [map.get('processor')!] });
    // The rail follows the account it sat in, not which aggregator delivered it.
    expect(rows.find((r) => r.channel === 'processor')?.outMinor).toBe(1_000);
  });

  it('breaks spending down by the rail it travelled on', async () => {
    const { channelBreakdown } = await import('@/services/mobilepay');
    const rows = await channelBreakdown(userId, RANGE);
    const byChannel = new Map(rows.map((r) => [r.channel, r]));

    expect(byChannel.get('card')?.outMinor).toBe(20_000);
    expect(byChannel.get('cash')?.outMinor).toBe(50_000);
    expect(byChannel.get('direct_debit')?.outMinor).toBe(60_000);
    expect(byChannel.get('mobilepay')?.outMinor).toBe(23_000);
    expect(byChannel.get('mobilepay')?.inMinor).toBe(25_000);
  });
});

describe('account detail', () => {
  it('leaves internal movements out of the biggest-counterparty lists', async () => {
    const { accountDetail } = await import('@/services/account-flows');
    const detail = (await accountDetail(userId, businessId, RANGE))!;
    // The business account only moved money to the owner in this window, so
    // there is nothing it actually paid out to anyone else.
    expect(detail.topOutgoing).toHaveLength(0);
    expect(detail.internalOutMinor).toBe(750_000);
  });

  it('still counts real spending in the counterparty list', async () => {
    const { accountDetail } = await import('@/services/account-flows');
    const detail = (await accountDetail(userId, checkingId, RANGE))!;
    const labels = detail.topOutgoing.map((r) => r.label);
    expect(labels).toContain('Boligselskabet Vest');
    expect(labels).not.toContain('Egen Konto');
  });
});

describe('MobilePay', () => {
  it('groups payments by person with a net per person', async () => {
    const { mobilePaySummary } = await import('@/services/mobilepay');
    const summary = await mobilePaySummary(userId, RANGE);

    expect(summary.available).toBe(true);
    expect(summary.sentMinor).toBe(23_000);
    expect(summary.receivedMinor).toBe(25_000);
    expect(summary.netMinor).toBe(2_000);

    const anders = summary.people.find((p) => p.name === 'Anders Kjeldsen')!;
    expect(anders.sentMinor).toBe(15_000);
    expect(anders.receivedMinor).toBe(25_000);
    expect(anders.netMinor).toBe(10_000);
    expect(anders.transactionCount).toBe(2);

    const sofie = summary.people.find((p) => p.name === 'Sofie Lindberg')!;
    expect(sofie.netMinor).toBe(-8_000);
  });

  it('reports honestly when there is nothing to show', async () => {
    const { mobilePaySummary } = await import('@/services/mobilepay');
    const empty = await mobilePaySummary(userId, { from: '2020-01-01', to: '2020-01-31' });
    expect(empty.available).toBe(false);
    expect(empty.people).toHaveLength(0);
  });
});
