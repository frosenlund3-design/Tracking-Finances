import { describe, expect, it } from 'vitest';
import { hasStructuredFilters, parseSearchQuery } from '@/lib/search-query';

describe('natural-language search', () => {
  it('reads an amount threshold', () => {
    const parsed = parseSearchQuery('expenses over 1000 kr');
    expect(parsed.minAmountMajor).toBe(1000);
    expect(parsed.direction).toBe('expense');
    expect(parsed.text).toBe('');
  });

  it('reads a business scope and a period together', () => {
    const parsed = parseSearchQuery('business expenses this month');
    expect(parsed.ownership).toBe('business');
    expect(parsed.direction).toBe('expense');
    expect(parsed.range).toBe('this_month');
    expect(parsed.text).toBe('');
  });

  it('keeps a merchant name as free text', () => {
    const parsed = parseSearchQuery('OpenAI');
    expect(parsed.text).toBe('OpenAI');
    expect(hasStructuredFilters(parsed)).toBe(false);
  });

  it('separates a merchant from its qualifiers', () => {
    const parsed = parseSearchQuery('Netflix subscriptions last month');
    expect(parsed.text).toBe('Netflix');
    expect(parsed.recurring).toBe(true);
    expect(parsed.range).toBe('last_month');
  });

  it('recognises a category by its label', () => {
    expect(parseSearchQuery('restaurants').category).toBe('restaurants');
    expect(parseSearchQuery('software this year').category).toBe('business_software');
  });

  it('reads an upper bound and Danish amount formatting', () => {
    const parsed = parseSearchQuery('under 1.500,50 kr');
    expect(parsed.maxAmountMajor).toBe(1500.5);
  });

  it('understands a few Danish qualifiers', () => {
    const parsed = parseSearchQuery('erhverv udgifter over 500');
    expect(parsed.ownership).toBe('business');
    expect(parsed.direction).toBe('expense');
    expect(parsed.minAmountMajor).toBe(500);
  });

  it('leaves an unrecognised phrase entirely as text', () => {
    const parsed = parseSearchQuery('Bregnholt IVS');
    expect(parsed.text).toBe('Bregnholt IVS');
    expect(parsed.minAmountMajor).toBeUndefined();
  });
});
