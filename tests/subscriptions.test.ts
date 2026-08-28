import { describe, expect, it } from 'vitest';
import { detectRecurrence, type RecurrenceCandidate } from '@/services/subscriptions';
import { addDays, addMonths } from '@/lib/normalize';

function monthlyDates(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(start, i));
}

function candidate(over: Partial<RecurrenceCandidate> = {}): RecurrenceCandidate {
  const dates = monthlyDates('2026-01-17', 8);
  return {
    merchantKey: 'netflix',
    merchantLabel: 'Netflix',
    category: 'entertainment',
    ownership: 'personal',
    currency: 'DKK',
    dates,
    amounts: dates.map(() => 13900),
    ...over,
  };
}

const NOW = '2026-08-25';

describe('recurring payment detection', () => {
  it('detects a clean monthly subscription', () => {
    const result = detectRecurrence(candidate(), NOW);
    expect(result).not.toBeNull();
    expect(result!.interval).toBe('monthly');
    expect(result!.amountMinor).toBe(13900);
    expect(result!.monthlyEquivalentMinor).toBe(13900);
    expect(result!.annualEquivalentMinor).toBe(13900 * 12);
    expect(result!.status).toBe('active');
    expect(result!.confidence).toBeGreaterThan(0.7);
  });

  it('tolerates a few days of drift in the charge date', () => {
    const dates = ['2026-01-17', '2026-02-15', '2026-03-19', '2026-04-16', '2026-05-18', '2026-06-17'];
    const result = detectRecurrence(candidate({ dates, amounts: dates.map(() => 13900) }), NOW);
    expect(result?.interval).toBe('monthly');
  });

  it('detects weekly, quarterly and annual cadences', () => {
    const weekly = Array.from({ length: 10 }, (_, i) => addDays('2026-06-01', i * 7));
    expect(
      detectRecurrence(candidate({ dates: weekly, amounts: weekly.map(() => 5000) }), NOW)?.interval,
    ).toBe('weekly');

    const quarterly = Array.from({ length: 5 }, (_, i) => addMonths('2025-03-01', i * 3));
    expect(
      detectRecurrence(candidate({ dates: quarterly, amounts: quarterly.map(() => 90000) }), NOW)
        ?.interval,
    ).toBe('quarterly');

    const annual = Array.from({ length: 3 }, (_, i) => addMonths('2024-08-18', i * 12));
    const annualResult = detectRecurrence(
      candidate({ dates: annual, amounts: annual.map(() => 219000) }),
      NOW,
    );
    expect(annualResult?.interval).toBe('annual');
    // An annual charge spread over twelve months.
    expect(annualResult?.monthlyEquivalentMinor).toBe(Math.round(219000 / 12));
  });

  it('needs at least three charges before calling something recurring', () => {
    const dates = ['2026-06-17', '2026-07-17'];
    expect(detectRecurrence(candidate({ dates, amounts: [13900, 13900] }), NOW)).toBeNull();
  });

  it('ignores irregular everyday spending', () => {
    const dates = ['2026-08-01', '2026-08-02', '2026-08-09', '2026-08-11', '2026-08-23'];
    const amounts = [6800, 21200, 9900, 41200, 15500];
    expect(detectRecurrence(candidate({ merchantKey: 'netto', dates, amounts }), NOW)).toBeNull();
  });

  it('ignores a merchant charged at wildly varying amounts', () => {
    const dates = monthlyDates('2026-01-05', 6);
    const amounts = [5000, 92000, 12000, 148000, 8000, 61000];
    expect(detectRecurrence(candidate({ dates, amounts }), NOW)).toBeNull();
  });

  it('marks a subscription lapsed once charges stop', () => {
    const dates = monthlyDates('2025-08-17', 6); // last charge Jan 2026
    const result = detectRecurrence(candidate({ dates, amounts: dates.map(() => 13900) }), NOW);
    expect(result?.status).toBe('lapsed');
  });

  it('reports a price rise that happened and stuck', () => {
    const dates = monthlyDates('2026-01-17', 8);
    const amounts = [13900, 13900, 13900, 13900, 13900, 15900, 15900, 15900];
    const result = detectRecurrence(candidate({ dates, amounts }), NOW);
    expect(result!.priceChangedAt).toBe(dates[5]);
    expect(result!.previousAmountMinor).toBe(13900);
    // The current price is what is charged now, not the historical median.
    expect(result!.amountMinor).toBe(15900);
  });

  it('ignores a one-off blip that did not stick', () => {
    const dates = monthlyDates('2026-01-17', 8);
    const amounts = [13900, 13900, 13900, 29900, 13900, 13900, 13900, 13900];
    const result = detectRecurrence(candidate({ dates, amounts }), NOW);
    expect(result!.priceChangedAt).toBeNull();
    expect(result!.amountMinor).toBe(13900);
  });

  it('predicts the next charge one interval after the last', () => {
    const dates = monthlyDates('2026-01-17', 8); // last is 2026-08-17
    const result = detectRecurrence(candidate({ dates, amounts: dates.map(() => 13900) }), NOW);
    expect(result!.lastPaymentDate).toBe('2026-08-17');
    expect(result!.nextPredictedDate).toBe('2026-09-17');
  });

  it('rejects charge lists that are not in ascending order', () => {
    const dates = ['2026-03-17', '2026-01-17', '2026-02-17', '2026-04-17'];
    expect(detectRecurrence(candidate({ dates, amounts: dates.map(() => 13900) }), NOW)).toBeNull();
  });

  it('carries the merchant identity through unchanged', () => {
    const result = detectRecurrence(candidate({ merchantKey: 'spotify', merchantLabel: 'Spotify' }), NOW);
    expect(result?.merchantKey).toBe('spotify');
    expect(result?.merchantLabel).toBe('Spotify');
  });
});
