import { z } from 'zod';
import { monthRange, lastNDays, yearRange } from '@/lib/dates';
import type { TransactionFilters } from '@/services/transactions';

/**
 * URL state for the transaction feed. Everything the user filters by lives in
 * the query string, so a filtered view is shareable, back-buttonable, and
 * survives a reload.
 */

export const RANGE_OPTIONS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'last_90', label: 'Last 90 days' },
  { value: 'this_year', label: 'This year' },
  { value: 'all', label: 'All time' },
] as const;

/**
 * Every field carries its own fallback.
 *
 * Validating the object as a whole would mean one malformed parameter — a
 * pasted URL with a truncated uuid, a search term someone made too long —
 * silently discarding every other filter the user had set. Per-field recovery
 * drops only what is actually wrong.
 */
export const searchParamsSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  range: z
    .enum(['this_month', 'last_month', 'last_30', 'last_90', 'this_year', 'all'])
    .catch('this_month'),
  ownership: z.enum(['all', 'personal', 'business', 'mixed']).catch('all'),
  direction: z.enum(['all', 'income', 'expense']).catch('all'),
  category: z.string().trim().max(60).optional().catch(undefined),
  account: z.uuid().optional().catch(undefined),
  merchant: z.string().trim().max(120).optional().catch(undefined),
  provider: z
    .enum(['all', 'gocardless', 'stripe', 'paypal', 'mobilepay', 'manual', 'demo'])
    .catch('all'),
  min: z.coerce.number().nonnegative().max(100_000_000).optional().catch(undefined),
  max: z.coerce.number().nonnegative().max(100_000_000).optional().catch(undefined),
  recurring: z.enum(['all', 'only']).catch('all'),
  review: z.enum(['all', 'only']).catch('all'),
  page: z.coerce.number().int().min(0).max(500).catch(0),
});

export type TransactionSearchParams = z.infer<typeof searchParamsSchema>;

export function parseSearchParams(raw: Record<string, string | string[] | undefined>): TransactionSearchParams {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value !== undefined && value !== '') flat[k] = value;
  }
  const parsed = searchParamsSchema.safeParse(flat);
  return parsed.success ? parsed.data : searchParamsSchema.parse({});
}

export const PAGE_SIZE = 50;

export function toFilters(
  params: TransactionSearchParams,
  now: Date = new Date(),
): TransactionFilters {
  const range = (() => {
    switch (params.range) {
      case 'last_month': return monthRange(-1, now);
      case 'last_30': return lastNDays(30, now);
      case 'last_90': return lastNDays(90, now);
      case 'this_year': return yearRange(0, now);
      case 'all': return null;
      default: return monthRange(0, now);
    }
  })();

  return {
    from: range?.start,
    to: range?.end,
    ownership: params.ownership,
    direction: params.direction,
    search: params.q,
    categories: params.category ? [params.category] : undefined,
    accountIds: params.account ? [params.account] : undefined,
    merchantKey: params.merchant,
    providers: params.provider === 'all' ? undefined : [params.provider],
    minAmountMinor: params.min === undefined ? undefined : Math.round(params.min * 100),
    maxAmountMinor: params.max === undefined ? undefined : Math.round(params.max * 100),
    subscriptionsOnly: params.recurring === 'only',
    needsReview: params.review === 'only',
  };
}

/** Human summary of the active filters, for the results header. */
export function describeFilters(params: TransactionSearchParams): string[] {
  const parts: string[] = [];
  const range = RANGE_OPTIONS.find((r) => r.value === params.range);
  if (range && params.range !== 'this_month') parts.push(range.label);
  if (params.ownership !== 'all') parts.push(params.ownership);
  if (params.direction !== 'all') parts.push(params.direction);
  if (params.category) parts.push(params.category);
  if (params.merchant) parts.push(params.merchant);
  if (params.provider !== 'all') parts.push(params.provider);
  if (params.min !== undefined) parts.push(`over ${params.min}`);
  if (params.max !== undefined) parts.push(`under ${params.max}`);
  if (params.recurring === 'only') parts.push('recurring');
  if (params.review === 'only') parts.push('needs review');
  return parts;
}
