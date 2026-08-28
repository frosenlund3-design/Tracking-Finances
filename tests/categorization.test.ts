import { describe, expect, it } from 'vitest';
import { classify, ruleFromCorrection } from '@/services/categorization/rules';
import { merchantKey } from '@/lib/normalize';
import type { MerchantRule } from '@/types/finance';

function userRule(pattern: string, category: string, extra: Partial<MerchantRule> = {}): MerchantRule {
  return {
    id: 'rule-1',
    userId: 'user-1',
    matchType: 'merchant_key',
    pattern,
    category,
    subcategory: null,
    ownership: null,
    taxRelevant: null,
    source: 'user_correction',
    hitCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

describe('categorization tiers', () => {
  it('recognizes curated Danish merchants', () => {
    expect(classify({ merchant: 'NETTO 5412', description: '', amountMinor: -12000 }, []).category)
      .toBe('groceries');
    expect(classify({ merchant: 'Wolt Denmark', description: '', amountMinor: -18000 }, []).category)
      .toBe('restaurants');
    expect(classify({ merchant: 'DSB', description: 'DSB BILLET', amountMinor: -4200 }, []).category)
      .toBe('transport');
  });

  it('marks business software as business and deductible', () => {
    const result = classify(
      { merchant: 'GITHUB INC', description: '', amountMinor: -14500 },
      [],
    );
    expect(result.category).toBe('business_software');
    expect(result.ownership).toBe('business');
    expect(result.taxRelevant).toBe('deductible');
  });

  it('prefers the longer seed when two could match', () => {
    expect(
      classify({ merchant: 'GOOGLE ADS 8842', description: '', amountMinor: -80000 }, []).category,
    ).toBe('business_advertising');
    expect(
      classify({ merchant: 'Google Workspace', description: '', amountMinor: -9600 }, []).category,
    ).toBe('business_software');
  });

  it('matches whole tokens only', () => {
    // 'sats' is a gym; it must not swallow an unrelated word containing it.
    const unrelated = classify(
      { merchant: 'Satsning Holding', description: '', amountMinor: -1000 },
      [],
    );
    expect(unrelated.category).not.toBe('health');
  });

  it('reads Danish compound words for salary', () => {
    const result = classify(
      { merchant: 'Nordisk Design ApS', description: 'Loenoverfoersel', amountMinor: 3840000 },
      [],
    );
    expect(result.category).toBe('salary');
    expect(result.source).toBe('structural');
  });

  it('treats an invoice payment as business revenue', () => {
    const result = classify(
      { merchant: 'Studio Nord', description: 'Faktura 2026-118', amountMinor: 450000 },
      [],
    );
    expect(result.category).toBe('business_revenue');
    expect(result.ownership).toBe('business');
  });

  it('classifies by what the transaction is before what the merchant is', () => {
    // A Stripe fee is a fee even though 'stripe' also seeds a category.
    const fee = classify(
      { merchant: 'Stripe', description: 'fee', amountMinor: -180, transactionType: 'fee' },
      [],
    );
    expect(fee.source).toBe('structural');
    expect(fee.category).toBe('business_processing_fees');

    const payout = classify(
      { merchant: 'Stripe', description: 'payout', amountMinor: -500000, transactionType: 'payout' },
      [],
    );
    expect(payout.category).toBe('transfers');
  });

  it('falls back with low confidence rather than guessing', () => {
    const result = classify(
      { merchant: 'Ukendt Butik 77', description: 'kortkoeb', amountMinor: -5000 },
      [],
    );
    expect(result.category).toBe('miscellaneous');
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.taxRelevant).toBe('needs_review');
  });

  it('lets a user rule override a curated merchant', () => {
    const rules = [userRule(merchantKey('NETTO'), 'business_client_expenses', { ownership: 'business' })];
    const result = classify({ merchant: 'NETTO 5412', description: '', amountMinor: -12000 }, rules);
    expect(result.category).toBe('business_client_expenses');
    expect(result.ownership).toBe('business');
    expect(result.confidence).toBe(1);
    expect(result.source).toBe('user_rule');
  });

  it('applies a learned OpenAI correction to future OpenAI charges', () => {
    // The scenario from the brief: OPENAI moved from Miscellaneous to Software.
    const correction = ruleFromCorrection({
      merchant: 'OPENAI *CHATGPT SUBSCR',
      description: 'OPENAI *CHATGPT SUBSCR',
      category: 'business_software',
      subcategory: null,
      ownership: 'business',
      taxRelevant: 'deductible',
    });
    expect(correction).not.toBeNull();

    const rules = [userRule(correction!.pattern, correction!.category, { ownership: 'business' })];
    // A later charge with a differently formatted description still matches.
    const later = classify(
      { merchant: 'OpenAI ChatGPT', description: 'OPENAI', amountMinor: -15200 },
      rules,
    );
    expect(later.category).toBe('business_software');
    expect(later.source).toBe('user_rule');
  });

  it('does not let a prefix rule leak into an unrelated merchant', () => {
    const rules = [userRule('openai', 'business_software')];
    const unrelated = classify(
      { merchant: 'Openair Festival', description: '', amountMinor: -45000 },
      rules,
    );
    expect(unrelated.category).not.toBe('business_software');
  });

  it('prefers an exact merchant rule over a broad contains rule', () => {
    const rules = [
      userRule('shop', 'shopping', { matchType: 'contains', id: 'r-broad' }),
      userRule(merchantKey('Proshop'), 'business_equipment', { id: 'r-exact' }),
    ];
    expect(classify({ merchant: 'Proshop', description: '', amountMinor: -89950 }, rules).category)
      .toBe('business_equipment');
  });

  it('does not build a rule from an unidentifiable merchant', () => {
    expect(
      ruleFromCorrection({
        merchant: '',
        description: '',
        category: 'groceries',
        subcategory: null,
        ownership: null,
        taxRelevant: null,
      }),
    ).toBeNull();
  });

  it('reads money arriving at a fee category as revenue, not a negative cost', () => {
    const result = classify({ merchant: 'Stripe', description: '', amountMinor: 500000 }, []);
    expect(result.category).toBe('business_revenue');
  });
});
