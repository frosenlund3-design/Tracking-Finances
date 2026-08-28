import { describe, expect, it } from 'vitest';
import { mergeObservations } from '@/services/observations';
import type { Finding } from '@/services/anomalies';
import type { FinancialInsight } from '@/types/finance';

function finding(over: Partial<Finding> = {}): Finding {
  return {
    kind: 'unusual_charge',
    title: 'Cafe Solskin charged more than usual',
    body: '920 kr. against a usual 145 kr.',
    href: '/transactions/1',
    facts: {},
    weightMinor: 77_500,
    ...over,
  };
}

let sequence = 0;
function insight(over: Partial<FinancialInsight> = {}): FinancialInsight {
  sequence += 1;
  return {
    id: `i-${sequence}`,
    userId: 'user-1',
    kind: 'category_change:groceries',
    title: 'Groceries is down 24%',
    body: '4.435 kr. so far this month.',
    facts: { currentMinor: 443_500, previousMinor: 584_400 },
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    severity: 'info',
    createdAt: '2026-08-25T00:00:00.000Z',
    ...over,
  };
}

describe('observations', () => {
  it('keeps standing figures out of the things-to-look-at list', () => {
    const { signals, status } = mergeObservations(
      [],
      [
        insight({ kind: 'subscription_total', facts: { monthlyMinor: 2_358_700 } }),
        insight({ kind: 'run_rate', facts: { projectedMonthMinor: 5_573_700 } }),
        insight({ kind: 'month_net', facts: { netMinor: 5_998_500 } }),
        insight({ kind: 'largest_expense', facts: { amountMinor: 985_000 } }),
        insight(),
      ],
    );
    expect(status).toHaveLength(4);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.title).toBe('Groceries is down 24%');
  });

  it('puts notable observations first, then the biggest amounts', () => {
    const { signals } = mergeObservations(
      [
        finding({ kind: 'overlapping_services', title: 'Two video subscriptions', weightMinor: 22_800 }),
        finding({ kind: 'unusual_charge', title: 'Big charge', weightMinor: 400_000 }),
      ],
      [insight({ kind: 'subscription_price_change', severity: 'notable', title: 'Prices changed', facts: {} })],
    );
    expect(signals.map((s) => s.title)).toEqual(['Prices changed', 'Big charge', 'Two video subscriptions']);
  });

  it('ranks a change by its size, not by the level it changed to', () => {
    // A category that moved 1.400 kr. outranks one that sits at 9.000 kr.
    // and did not move: the news is the movement.
    const { signals } = mergeObservations(
      [],
      [
        insight({ title: 'Rent is up 2%', facts: { currentMinor: 900_000, previousMinor: 882_000 } }),
        insight({ title: 'Groceries is up 40%', facts: { currentMinor: 490_000, previousMinor: 350_000 } }),
      ],
    );
    expect(signals[0]!.title).toBe('Groceries is up 40%');
  });

  it('links a category movement to that category', () => {
    const { signals } = mergeObservations([], [insight({ kind: 'category_change:restaurants' })]);
    expect(signals[0]!.href).toBe('/transactions?category=restaurants');
  });

  it('leaves an observation unlinked when there is nowhere useful to go', () => {
    const { signals } = mergeObservations([], [insight({ kind: 'something_new', facts: {} })]);
    expect(signals[0]!.href).toBeNull();
  });

  it('orders equal weights the same way every time', () => {
    const build = () =>
      mergeObservations(
        [finding({ title: 'A', weightMinor: 1000 }), finding({ title: 'B', weightMinor: 1000 })],
        [],
      ).signals.map((s) => s.title);
    expect(build()).toEqual(build());
  });

  it('is empty when there is nothing to say', () => {
    expect(mergeObservations([], [])).toEqual({ signals: [], status: [] });
  });
});
