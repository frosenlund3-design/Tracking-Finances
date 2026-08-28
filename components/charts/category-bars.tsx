'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';

export interface CategoryBarDatum {
  category: string;
  label: string;
  amountMinor: number;
  share: number;
  transactionCount: number;
}

/**
 * Ranked horizontal bars.
 *
 * The job is magnitude comparison across many named things, so: one hue with a
 * lightness step, direct labels on every bar, no legend (a single series does
 * not need one), and no rotating category colours — 29 categories cannot be
 * given 29 distinguishable hues, and pretending otherwise makes the chart
 * unreadable rather than colourful.
 */
export function CategoryBars({
  data,
  currency,
  onSelect,
  max: providedMax,
}: {
  data: CategoryBarDatum[];
  currency: string;
  onSelect?: (key: string) => void;
  max?: number;
}) {
  const max = providedMax ?? Math.max(...data.map((d) => d.amountMinor), 1);

  return (
    <ul className="space-y-2.5">
      {data.map((d, index) => {
        const width = Math.max((d.amountMinor / max) * 100, 1.5);
        // Steps of one hue, strongest at the top of the ranking.
        const opacity = 1 - Math.min(index, 7) * 0.085;
        const Row = onSelect ? 'button' : 'div';
        return (
          <li key={d.category}>
            <Row
              {...(onSelect
                ? { onClick: () => onSelect(d.category), type: 'button' as const }
                : {})}
              className={cn(
                'block w-full text-left',
                onSelect && 'rounded-md transition-opacity hover:opacity-80',
              )}
            >
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate font-medium text-ink">{d.label}</span>
                <span className="numeral shrink-0 text-ink-muted">
                  {formatMoney(d.amountMinor, currency, { compact: true })}
                  <span className="ml-1.5 text-ink-subtle">{Math.round(d.share * 100)}%</span>
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${width}%`,
                    background: 'var(--color-magnitude)',
                    opacity,
                  }}
                />
              </div>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}
