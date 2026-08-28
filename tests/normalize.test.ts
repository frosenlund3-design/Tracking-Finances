import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  dedupeHash,
  isoDate,
  merchantKey,
  normalizeMerchant,
} from '@/lib/normalize';

describe('merchant normalization', () => {
  it('strips card-terminal noise from Danish descriptions', () => {
    expect(normalizeMerchant('Den 12.03 NETTO 5412')).toBe('Netto 5412');
    expect(normalizeMerchant('VISA/DANKORT Wolt Denmark')).toBe('Wolt Denmark');
    expect(normalizeMerchant('MobilePay Anders')).toBe('Anders');
    expect(normalizeMerchant('OVERFØRSEL TIL Egen Konto')).toBe('Egen Konto');
  });

  it('leaves short acronyms shouting', () => {
    expect(normalizeMerchant('DSB BILLET')).toBe('DSB Billet');
    expect(normalizeMerchant('AWS EMEA')).toBe('AWS Emea');
    expect(normalizeMerchant('NETTO')).toBe('Netto');
  });

  it('keeps a store number in the display label but not in the grouping key', () => {
    // "Rema 1000" and "Netto 5412" are indistinguishable to a stripper, so the
    // human-facing label keeps both and only the key drops the digits.
    expect(normalizeMerchant('NETTO 5412')).toBe('Netto 5412');
    expect(merchantKey('NETTO 5412')).toBe(merchantKey('NETTO 9981'));
  });

  it('never returns an empty label', () => {
    expect(normalizeMerchant('')).toBe('Unknown');
    expect(normalizeMerchant('   ')).toBe('Unknown');
  });

  it('collapses case and punctuation to one key', () => {
    expect(merchantKey('OPENAI *CHATGPT')).toBe(merchantKey('OpenAI ChatGPT'));
    expect(merchantKey('Netto 5412 København')).toBe(merchantKey('NETTO'));
  });

  it('folds Danish letters consistently', () => {
    expect(merchantKey('Føtex')).toBe('foetex');
    expect(merchantKey('Årstiderne')).toBe('aarstiderne');
    expect(merchantKey('Æblegården')).toBe('aeblegaarden');
  });

  it('drops reference numbers but keeps short ones that are part of a name', () => {
    expect(merchantKey('GOOGLE ADS 8842')).toBe('google ads');
    expect(merchantKey('Rema 1000')).toBe('rema');
    expect(merchantKey('Q8 Benzin')).toBe('q8 benzin');
  });
});

describe('dedupe fingerprint', () => {
  const base = {
    amountMinor: -12900,
    currency: 'DKK',
    transactionDate: '2026-03-04',
    merchantKey: 'netflix',
  };

  it('is stable for identical content', () => {
    expect(dedupeHash(base)).toBe(dedupeHash({ ...base }));
  });

  it('ignores the time portion of a date', () => {
    expect(dedupeHash({ ...base, transactionDate: '2026-03-04T10:00:00Z' })).toBe(dedupeHash(base));
  });

  it('is case-insensitive on currency', () => {
    expect(dedupeHash({ ...base, currency: 'dkk' })).toBe(dedupeHash(base));
  });

  it('differs when any component differs', () => {
    expect(dedupeHash({ ...base, amountMinor: -12901 })).not.toBe(dedupeHash(base));
    expect(dedupeHash({ ...base, transactionDate: '2026-03-05' })).not.toBe(dedupeHash(base));
    expect(dedupeHash({ ...base, merchantKey: 'spotify' })).not.toBe(dedupeHash(base));
  });

  it('separates the two legs of a transfer, which have opposite signs', () => {
    expect(dedupeHash({ ...base, amountMinor: 12900 })).not.toBe(dedupeHash(base));
  });
});

describe('date helpers', () => {
  it('normalizes Date objects, which is how the driver returns DATE columns', () => {
    expect(isoDate(new Date('2026-03-04T22:30:00Z'))).toBe('2026-03-04');
    expect(isoDate('2026-03-04')).toBe('2026-03-04');
    expect(isoDate('2026-03-04T10:00:00Z')).toBe('2026-03-04');
  });

  it('refuses a malformed date instead of returning NaN', () => {
    expect(() => daysBetween('Mon Aug 04', '2026-03-04')).toThrow();
    expect(() => addDays('not-a-date', 1)).toThrow();
    expect(() => isoDate('nonsense')).toThrow();
  });

  it('counts days across month and year boundaries', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(daysBetween('2026-03-01', '2026-03-01')).toBe(0);
    // 2028 is a leap year.
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('clamps month arithmetic to the last valid day', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-01-15', 12)).toBe('2027-01-15');
  });

  it('adds days across a DST boundary without drifting', () => {
    // Europe/Copenhagen shifts on 29 March 2026; UTC anchoring must ignore it.
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
  });
});
