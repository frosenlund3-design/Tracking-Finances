import { describe, expect, it } from 'vitest';
import { parseSearchParams, toFilters } from '@/app/(app)/transactions/search-params';
import { buildWhere } from '@/services/transactions';

describe('transaction search parameters', () => {
  it('falls back to safe defaults for junk input', () => {
    const parsed = parseSearchParams({
      range: 'nonsense',
      ownership: '<script>',
      page: '-5',
      min: 'abc',
    });
    expect(parsed.range).toBe('this_month');
    expect(parsed.ownership).toBe('all');
    expect(parsed.page).toBe(0);
    expect(parsed.min).toBeUndefined();
  });

  it('accepts valid parameters', () => {
    const parsed = parseSearchParams({
      q: 'openai',
      range: 'last_90',
      ownership: 'business',
      direction: 'expense',
      min: '1000',
      page: '2',
    });
    expect(parsed.q).toBe('openai');
    expect(parsed.range).toBe('last_90');
    expect(parsed.ownership).toBe('business');
    expect(parsed.min).toBe(1000);
    expect(parsed.page).toBe(2);
  });

  it('rejects an account id that is not a uuid', () => {
    expect(parseSearchParams({ account: "1 OR 1=1" }).account).toBeUndefined();
  });

  it('caps the search term length', () => {
    const parsed = parseSearchParams({ q: 'x'.repeat(500) });
    // Over-length input is dropped rather than truncated into a partial term.
    expect(parsed.q).toBeUndefined();
  });

  it('drops only the invalid parameter, keeping the rest of the filter', () => {
    const parsed = parseSearchParams({
      range: 'last_90',
      ownership: 'business',
      account: 'not-a-uuid',
      q: 'x'.repeat(500),
    });
    expect(parsed.account).toBeUndefined();
    expect(parsed.q).toBeUndefined();
    // The good filters survive a bad neighbour.
    expect(parsed.range).toBe('last_90');
    expect(parsed.ownership).toBe('business');
  });

  it('converts an amount filter from major to minor units', () => {
    const filters = toFilters(parseSearchParams({ min: '1000', max: '2500.5' }));
    expect(filters.minAmountMinor).toBe(100_000);
    expect(filters.maxAmountMinor).toBe(250_050);
  });

  it('drops the date bounds for an all-time range', () => {
    const filters = toFilters(parseSearchParams({ range: 'all' }));
    expect(filters.from).toBeUndefined();
    expect(filters.to).toBeUndefined();
  });
});

describe('query construction', () => {
  const USER = '11111111-2222-3333-4444-555555555555';

  it('always scopes to the user', () => {
    const where = buildWhere(USER, {});
    expect(where.sql).toContain('t.user_id = $1');
    expect(where.params[0]).toBe(USER);
  });

  it('parameterizes every value rather than interpolating it', () => {
    const where = buildWhere(USER, {
      search: "'; DROP TABLE transactions; --",
      merchantKey: "' OR 1=1 --",
      categories: ["'; DELETE FROM users; --"],
      from: '2026-01-01',
    });
    expect(where.sql).not.toContain('DROP TABLE');
    expect(where.sql).not.toContain('OR 1=1');
    expect(where.sql).not.toContain('DELETE FROM');
    expect(where.params).toContain("' OR 1=1 --");
    // Every placeholder is numbered and accounted for.
    const placeholders = where.sql.match(/\$\d+/g) ?? [];
    const highest = Math.max(...placeholders.map((p) => Number(p.slice(1))));
    expect(highest).toBeLessThanOrEqual(where.params.length);
  });

  it('numbers placeholders consecutively as filters are added', () => {
    const where = buildWhere(USER, {
      from: '2026-01-01',
      to: '2026-01-31',
      ownership: 'business',
      direction: 'expense',
      minAmountMinor: 1000,
    });
    const numbers = (where.sql.match(/\$\d+/g) ?? []).map((p) => Number(p.slice(1)));
    expect(new Set(numbers).size).toBe(where.params.length);
    expect(Math.min(...numbers)).toBe(1);
  });

  it('turns a direction filter into a sign comparison, not a parameter', () => {
    expect(buildWhere(USER, { direction: 'income' }).sql).toContain('t.amount_minor > 0');
    expect(buildWhere(USER, { direction: 'expense' }).sql).toContain('t.amount_minor < 0');
    expect(buildWhere(USER, { direction: 'all' }).sql).not.toContain('t.amount_minor >');
  });
});
