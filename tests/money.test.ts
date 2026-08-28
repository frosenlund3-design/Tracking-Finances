import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  parseAmountToMinor,
  percentChange,
  sumMinor,
  toMajor,
  toMinor,
} from '@/lib/money';

describe('money', () => {
  it('converts to minor units without floating point drift', () => {
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(toMinor(1234.56)).toBe(123456);
    expect(toMinor(-19.99)).toBe(-1999);
    expect(toMinor(0)).toBe(0);
  });

  it('rounds half away from zero symmetrically', () => {
    expect(toMinor(1.005)).toBe(101);
    expect(toMinor(-1.005)).toBe(-101);
  });

  it('round-trips through major units', () => {
    for (const value of [0, 1, -1, 99999, -123456]) {
      expect(toMinor(toMajor(value))).toBe(value);
    }
  });

  it('parses Danish and English decimal conventions', () => {
    expect(parseAmountToMinor('1.234,56')).toBe(123456);
    expect(parseAmountToMinor('1,234.56')).toBe(123456);
    expect(parseAmountToMinor('1234.5')).toBe(123450);
    expect(parseAmountToMinor('99')).toBe(9900);
    expect(parseAmountToMinor('-42,50')).toBe(-4250);
    expect(parseAmountToMinor('(42,50)')).toBe(-4250);
  });

  it('rejects input that is not an amount', () => {
    expect(parseAmountToMinor('')).toBeNull();
    expect(parseAmountToMinor('abc')).toBeNull();
    // Ambiguous separator soup is refused rather than guessed at.
    expect(parseAmountToMinor('12.34.56.78')).toBeNull();
    expect(parseAmountToMinor('.')).toBeNull();
    expect(parseAmountToMinor('12kr')).toBeNull();
  });

  it('formats with a real minus sign and no false precision', () => {
    expect(formatMoney(-125000, 'DKK')).toContain('−');
    expect(formatMoney(0, 'DKK')).not.toContain('−');
    expect(formatMoney(100000, 'DKK', { signed: true })).toContain('+');
  });

  it('guards percentage change against a zero baseline', () => {
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    // A negative baseline still yields a sensible magnitude.
    expect(percentChange(-50, -100)).toBe(50);
  });

  it('sums exactly', () => {
    expect(sumMinor([1, 2, 3, -6])).toBe(0);
    expect(sumMinor([])).toBe(0);
  });
});
