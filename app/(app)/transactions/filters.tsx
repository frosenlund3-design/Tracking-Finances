'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { Badge, Button, Input, Select } from '@/components/ui/primitives';
import { ALL_CATEGORIES } from '@/lib/categories';
import { RANGE_OPTIONS } from './search-params';
import type { FinancialAccount } from '@/types/finance';

/**
 * Filters sit in one row above the feed and write straight to the URL.
 * Search is debounced so typing does not fire a query per keystroke.
 */
export function TransactionFilters({
  accounts,
  activeCount,
}: {
  accounts: FinancialAccount[];
  activeCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [expanded, setExpanded] = useState(false);

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '' || value === 'all') next.delete(key);
        else next.set(key, value);
      }
      next.delete('page');
      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      });
    },
    [params, pathname, router],
  );

  // Debounce the search box; the rest apply immediately.
  useEffect(() => {
    const current = params.get('q') ?? '';
    if (query === current) return;
    const id = setTimeout(() => update({ q: query || null }), 300);
    return () => clearTimeout(id);
  }, [query, params, update]);

  const get = (key: string, fallback = 'all') => params.get(key) ?? fallback;

  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search merchant, description or note"
            aria-label="Search transactions"
            className="pl-9"
          />
          <svg
            viewBox="0 0 20 20"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.5 13.5 3 3" strokeLinecap="round" />
          </svg>
        </div>
        <Button
          variant="secondary"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="shrink-0"
        >
          Filters
          {activeCount > 0 ? (
            <Badge tone="accent" className="ml-0.5">
              {activeCount}
            </Badge>
          ) : null}
        </Button>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {RANGE_OPTIONS.map((option) => {
          const active = get('range', 'this_month') === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => update({ range: option.value === 'this_month' ? null : option.value })}
              aria-pressed={active}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
                active
                  ? 'border-accent bg-accent-soft text-accent-ink'
                  : 'border-border bg-surface text-ink-muted hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {expanded ? (
        <div className="rise grid grid-cols-2 gap-2.5 rounded-[var(--radius-card)] border border-border bg-surface p-3">
          <LabelledSelect
            label="Type"
            value={get('ownership')}
            onChange={(v) => update({ ownership: v })}
            options={[
              ['all', 'Personal & business'],
              ['personal', 'Personal'],
              ['business', 'Business'],
              ['mixed', 'Mixed'],
            ]}
          />
          <LabelledSelect
            label="Direction"
            value={get('direction')}
            onChange={(v) => update({ direction: v })}
            options={[
              ['all', 'In & out'],
              ['income', 'Money in'],
              ['expense', 'Money out'],
            ]}
          />
          <LabelledSelect
            label="Category"
            value={get('category', '')}
            onChange={(v) => update({ category: v || null })}
            options={[['', 'All categories'], ...ALL_CATEGORIES.map((c) => [c.key, c.label] as [string, string])]}
          />
          <LabelledSelect
            label="Account"
            value={get('account', '')}
            onChange={(v) => update({ account: v || null })}
            options={[['', 'All accounts'], ...accounts.map((a) => [a.id, a.name] as [string, string])]}
          />
          <LabelledSelect
            label="Source"
            value={get('provider')}
            onChange={(v) => update({ provider: v })}
            options={[
              ['all', 'All sources'],
              ['demo', 'Demo'],
              ['gocardless', 'Bank'],
              ['stripe', 'Stripe'],
              ['manual', 'Manual'],
            ]}
          />
          <LabelledSelect
            label="Recurring"
            value={get('recurring')}
            onChange={(v) => update({ recurring: v })}
            options={[
              ['all', 'All transactions'],
              ['only', 'Subscriptions only'],
            ]}
          />
          <div className="space-y-1.5">
            <span className="block text-[12px] font-medium text-ink-muted">Amount from</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              defaultValue={params.get('min') ?? ''}
              onBlur={(e) => update({ min: e.target.value || null })}
              placeholder="0"
              aria-label="Minimum amount"
            />
          </div>
          <div className="space-y-1.5">
            <span className="block text-[12px] font-medium text-ink-muted">Amount to</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              defaultValue={params.get('max') ?? ''}
              onBlur={(e) => update({ max: e.target.value || null })}
              placeholder="Any"
              aria-label="Maximum amount"
            />
          </div>

          <div className="col-span-2 flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-[13px] text-ink-muted">
              <input
                type="checkbox"
                checked={get('review') === 'only'}
                onChange={(e) => update({ review: e.target.checked ? 'only' : null })}
                className="h-4 w-4 rounded border-border accent-[var(--color-accent)]"
              />
              Only ones needing review
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery('');
                startTransition(() => router.replace(pathname, { scroll: false }));
              }}
            >
              Clear all
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LabelledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-[12px] font-medium text-ink-muted">{label}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    </div>
  );
}
