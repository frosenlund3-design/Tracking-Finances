import type { Ownership } from '@/types/finance';

export interface CategoryDef {
  key: string;
  label: string;
  scope: Ownership;
  /** Groups that behave as revenue rather than cost in business reporting. */
  isRevenue?: boolean;
  subcategories?: string[];
}

export const PERSONAL_CATEGORIES: CategoryDef[] = [
  { key: 'groceries', label: 'Groceries', scope: 'personal' },
  { key: 'restaurants', label: 'Restaurants', scope: 'personal' },
  { key: 'transport', label: 'Transport', scope: 'personal' },
  { key: 'shopping', label: 'Shopping', scope: 'personal' },
  { key: 'beauty', label: 'Beauty', scope: 'personal' },
  { key: 'rent', label: 'Rent', scope: 'personal' },
  { key: 'utilities', label: 'Utilities', scope: 'personal' },
  { key: 'entertainment', label: 'Entertainment', scope: 'personal' },
  { key: 'travel', label: 'Travel', scope: 'personal' },
  { key: 'health', label: 'Health', scope: 'personal' },
  { key: 'salary', label: 'Salary', scope: 'personal', isRevenue: true },
  { key: 'transfers', label: 'Transfers', scope: 'personal' },
  { key: 'peer_transfer', label: 'Person to person', scope: 'personal' },
  { key: 'savings', label: 'Savings', scope: 'personal' },
  { key: 'miscellaneous', label: 'Miscellaneous', scope: 'personal' },
];

export const BUSINESS_CATEGORIES: CategoryDef[] = [
  { key: 'business_revenue', label: 'Revenue', scope: 'business', isRevenue: true },
  { key: 'business_refunds', label: 'Refunds', scope: 'business' },
  { key: 'business_processing_fees', label: 'Payment processing fees', scope: 'business' },
  { key: 'business_software', label: 'Software', scope: 'business' },
  { key: 'business_advertising', label: 'Advertising', scope: 'business' },
  { key: 'business_contractors', label: 'Contractors', scope: 'business' },
  { key: 'business_payroll', label: 'Payroll', scope: 'business' },
  { key: 'business_office', label: 'Office', scope: 'business' },
  { key: 'business_equipment', label: 'Equipment', scope: 'business' },
  { key: 'business_education', label: 'Education', scope: 'business' },
  { key: 'business_travel', label: 'Travel', scope: 'business' },
  { key: 'business_client_expenses', label: 'Client expenses', scope: 'business' },
  { key: 'business_taxes', label: 'Taxes', scope: 'business' },
  { key: 'business_other', label: 'Other business', scope: 'business' },
];

export const ALL_CATEGORIES: CategoryDef[] = [...PERSONAL_CATEGORIES, ...BUSINESS_CATEGORIES];

const BY_KEY = new Map(ALL_CATEGORIES.map((c) => [c.key, c]));

export function categoryLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? 'Uncategorized';
}

export function categoryScope(key: string): Ownership {
  return BY_KEY.get(key)?.scope ?? 'personal';
}

export function isRevenueCategory(key: string): boolean {
  return BY_KEY.get(key)?.isRevenue === true;
}

export function isKnownCategory(key: string): boolean {
  return BY_KEY.has(key);
}

export const UNCATEGORIZED = 'miscellaneous';

/**
 * Rank of a category within the taxonomy. Used only for stable ordering —
 * category charts encode magnitude with one hue rather than assigning a
 * different colour to each of 29 categories, which no palette can keep
 * distinguishable.
 */
export const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
  ALL_CATEGORIES.map((c, i) => [c.key, i]),
);
