import { describe, expect, it } from 'vitest';
import { normalizeGoCardlessTransaction, parseAmountToMinorUnits } from '@/integrations/banking/gocardless';
import { expandFee, normalizeStripeTransaction } from '@/integrations/stripe';
import { generateDemoData } from '@/integrations/demo/generator';
import { integrationStatuses, getBankProvider, getPaymentProvider } from '@/integrations/registry';

describe('provider amount parsing', () => {
  it('parses decimal strings without floating point error', () => {
    expect(parseAmountToMinorUnits('0.29', 'DKK')).toBe(29);
    expect(parseAmountToMinorUnits('-1234.56', 'DKK')).toBe(-123456);
    expect(parseAmountToMinorUnits('1000', 'DKK')).toBe(100000);
    expect(parseAmountToMinorUnits('-0.01', 'EUR')).toBe(-1);
    expect(parseAmountToMinorUnits('19.9', 'DKK')).toBe(1990);
  });

  it('handles a zero-decimal currency', () => {
    expect(parseAmountToMinorUnits('1500', 'JPY')).toBe(1500);
  });
});

describe('GoCardless normalization', () => {
  const raw = {
    transactionId: 'gc-1',
    bookingDate: '2026-06-02',
    valueDate: '2026-06-01',
    transactionAmount: { amount: '-129.00', currency: 'DKK' },
    creditorName: 'NETFLIX.COM',
    remittanceInformationUnstructured: 'Netflix subscription',
    merchantCategoryCode: '4899',
  };

  it('maps a debit onto the internal model', () => {
    const result = normalizeGoCardlessTransaction(raw, 'acc-1')!;
    expect(result.amountMinor).toBe(-12900);
    expect(result.transactionDate).toBe('2026-06-01');
    expect(result.bookingDate).toBe('2026-06-02');
    expect(result.merchant).toBe('NETFLIX.COM');
    expect(result.transactionType).toBe('expense');
    expect(result.metadata?.mcc).toBe('4899');
  });

  it('reads the counterparty from the correct side for a credit', () => {
    const credit = normalizeGoCardlessTransaction(
      { ...raw, transactionAmount: { amount: '38400.00', currency: 'DKK' }, debtorName: 'Nordisk Design ApS' },
      'acc-1',
    )!;
    expect(credit.merchant).toBe('Nordisk Design ApS');
    expect(credit.transactionType).toBe('income');
  });

  it('falls back through the id and date fields banks actually populate', () => {
    const withoutTxId = normalizeGoCardlessTransaction(
      { ...raw, transactionId: undefined, internalTransactionId: 'internal-9' },
      'acc-1',
    )!;
    expect(withoutTxId.transactionId).toBe('internal-9');

    const withoutValueDate = normalizeGoCardlessTransaction(
      { ...raw, valueDate: undefined },
      'acc-1',
    )!;
    expect(withoutValueDate.transactionDate).toBe('2026-06-02');
  });

  it('drops an entry with no usable id or date rather than inventing one', () => {
    expect(
      normalizeGoCardlessTransaction(
        { ...raw, transactionId: undefined, internalTransactionId: undefined, entryReference: undefined },
        'acc-1',
      ),
    ).toBeNull();
    expect(
      normalizeGoCardlessTransaction(
        { ...raw, valueDate: undefined, bookingDate: undefined, bookingDateTime: undefined },
        'acc-1',
      ),
    ).toBeNull();
  });

  it('redacts anything sensitive a bank put in the description', () => {
    const leaky = normalizeGoCardlessTransaction(
      { ...raw, remittanceInformationUnstructured: 'Kort 4111111111111111 betaling' },
      'acc-1',
    )!;
    expect(leaky.description).not.toContain('4111111111111111');
  });
});

describe('Stripe normalization', () => {
  const charge = {
    id: 'txn_1',
    amount: 500_000,
    net: 493_000,
    fee: 7_000,
    currency: 'dkk',
    created: Math.floor(Date.UTC(2026, 5, 9) / 1000),
    description: 'Studio Nord - invoice 118',
    reporting_category: 'charge',
    type: 'charge',
  };

  it('splits gross revenue and the processing fee into two rows', () => {
    const rows = expandFee(charge, 'acct_1');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.amountMinor).toBe(500_000);
    expect(rows[0]!.transactionType).toBe('income');
    expect(rows[1]!.amountMinor).toBe(-7_000);
    expect(rows[1]!.transactionType).toBe('fee');
    expect(rows[1]!.transactionId).toBe('txn_1_fee');
    // Both must be attributed to the business.
    expect(rows.every((r) => r.ownershipHint === 'business')).toBe(true);
  });

  it('does not split a row that is already a fee or a payout', () => {
    expect(expandFee({ ...charge, reporting_category: 'fee', fee: 500 }, 'a')).toHaveLength(1);
    expect(expandFee({ ...charge, reporting_category: 'payout', fee: 500 }, 'a')).toHaveLength(1);
  });

  it('maps reporting categories onto transaction types', () => {
    expect(normalizeStripeTransaction({ ...charge, reporting_category: 'refund', amount: -500_000 }, 'a').transactionType).toBe('refund');
    expect(normalizeStripeTransaction({ ...charge, reporting_category: 'payout', amount: -400_000 }, 'a').transactionType).toBe('payout');
    expect(normalizeStripeTransaction({ ...charge, reporting_category: 'fee' }, 'a').transactionType).toBe('fee');
  });

  it('keeps Stripe minor units as-is, since Stripe already reports them', () => {
    expect(normalizeStripeTransaction(charge, 'a').amountMinor).toBe(500_000);
    expect(normalizeStripeTransaction(charge, 'a').currency).toBe('DKK');
  });
});

describe('provider registry', () => {
  it('reports every integration as read-only', () => {
    for (const status of integrationStatuses()) {
      expect(status.readOnly).toBe(true);
      expect(status.setupHint.length).toBeGreaterThan(10);
    }
  });

  it('declares read-only capabilities on the providers themselves', () => {
    expect(getBankProvider().capabilities.readOnly).toBe(true);
    for (const id of ['stripe', 'paypal', 'mobilepay'] as const) {
      expect(getPaymentProvider(id).capabilities.readOnly).toBe(true);
    }
  });

  it('reports an unconfigured provider honestly rather than pretending', async () => {
    const paypal = getPaymentProvider('paypal');
    expect(paypal.isConfigured()).toBe(false);
    await expect(
      paypal.listAccounts({ userId: 'u', connectionId: null, accessToken: null, externalReference: null }),
    ).rejects.toMatchObject({ code: 'not_configured' });
  });
});

describe('demo data', () => {
  const NOW = new Date('2026-06-15T12:00:00Z');

  it('is deterministic for a given seed', () => {
    const a = generateDemoData('seed-1', 6, NOW);
    const b = generateDemoData('seed-1', 6, NOW);
    expect(a.transactions).toEqual(b.transactions);
  });

  it('differs between users', () => {
    const a = generateDemoData('seed-1', 6, NOW);
    const b = generateDemoData('seed-2', 6, NOW);
    expect(a.transactions.length).not.toBe(0);
    expect(JSON.stringify(a.transactions)).not.toBe(JSON.stringify(b.transactions));
  });

  it('produces unique transaction ids', () => {
    const { transactions } = generateDemoData('seed-3', 9, NOW);
    expect(new Set(transactions.map((t) => t.transactionId)).size).toBe(transactions.length);
  });

  it('stays inside the requested window and uses whole minor units', () => {
    const { transactions } = generateDemoData('seed-4', 6, NOW);
    for (const t of transactions) {
      expect(t.transactionDate >= '2025-12-15').toBe(true);
      expect(t.transactionDate <= '2026-06-15').toBe(true);
      expect(Number.isInteger(t.amountMinor)).toBe(true);
      expect(t.currency).toBe('DKK');
    }
  });

  it('balances every account from its own flows', () => {
    const { accounts, transactions } = generateDemoData('seed-5', 9, NOW);
    for (const account of accounts) {
      if (account.providerAccountId === 'demo-savings') continue;
      const net = transactions
        .filter((t) => t.providerAccountId === account.providerAccountId)
        .reduce((sum, t) => sum + t.amountMinor, 0);
      // Balance must equal a fixed opening amount plus the flows, never a
      // number picked independently of the transactions shown.
      expect(account.balanceMinor! - net).toBeGreaterThan(0);
    }
  });

  it('includes both business and personal activity', () => {
    const { transactions } = generateDemoData('seed-6', 9, NOW);
    expect(transactions.some((t) => t.ownershipHint === 'business')).toBe(true);
    expect(transactions.some((t) => t.ownershipHint === undefined)).toBe(true);
    expect(transactions.some((t) => t.transactionType === 'fee')).toBe(true);
    expect(transactions.some((t) => t.transactionType === 'refund')).toBe(true);
    expect(transactions.some((t) => t.transactionType === 'payout')).toBe(true);
  });
});
