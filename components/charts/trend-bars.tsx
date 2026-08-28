'use client';

import * as React from 'react';
import { formatMoney } from '@/lib/money';

export interface TrendDatum {
  period: string;
  label: string;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
}

/**
 * Grouped bars, money in beside money out, one month per group.
 *
 * Two series, so: a legend is always present, both series are also identified
 * by position within the group, and every bar has a hover tooltip. One shared
 * y-scale — never two axes.
 */
export function TrendBars({ data, currency }: { data: TrendDatum[]; currency: string }) {
  const [active, setActive] = React.useState<number | null>(null);
  const max = Math.max(...data.flatMap((d) => [d.incomeMinor, d.expenseMinor]), 1);

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-[12px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ background: 'var(--color-series-in)' }}
            aria-hidden="true"
          />
          Money in
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ background: 'var(--color-series-out)' }}
            aria-hidden="true"
          />
          Money out
        </span>
      </div>

      <div className="relative">
        <div
          className="flex h-40 items-end gap-1.5 sm:gap-3"
          onMouseLeave={() => setActive(null)}
        >
          {data.map((d, i) => (
            <div
              key={d.period}
              className="group relative flex h-full flex-1 flex-col items-center gap-1.5"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              tabIndex={0}
              role="img"
              aria-label={`${d.label}: ${formatMoney(d.incomeMinor, currency)} in, ${formatMoney(
                d.expenseMinor,
                currency,
              )} out`}
            >
              {active === i ? (
                <div
                  className="pointer-events-none absolute bottom-full z-10 mb-2 w-max max-w-[11rem] rounded-lg border border-border bg-surface p-2.5 text-left shadow-[var(--shadow-raised)]"
                  role="tooltip"
                >
                  <p className="text-[12px] font-medium text-ink">{d.label}</p>
                  <p className="numeral mt-1 text-[12px] text-ink-muted">
                    In {formatMoney(d.incomeMinor, currency, { compact: true })}
                  </p>
                  <p className="numeral text-[12px] text-ink-muted">
                    Out {formatMoney(d.expenseMinor, currency, { compact: true })}
                  </p>
                  <p className="numeral mt-1 border-t border-border pt-1 text-[12px] font-medium text-ink">
                    Net {formatMoney(d.netMinor, currency, { compact: true, signed: true })}
                  </p>
                </div>
              ) : null}

              {/* 2px gap between the two fills keeps them separable without colour. */}
              <div className="flex min-h-0 w-full flex-1 items-end justify-center gap-[2px]">
                <Bar valueMinor={d.incomeMinor} max={max} color="var(--color-series-in)" />
                <Bar valueMinor={d.expenseMinor} max={max} color="var(--color-series-out)" />
              </div>
              <span className="shrink-0 text-[11px] text-ink-subtle">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Bar({ valueMinor, max, color }: { valueMinor: number; max: number; color: string }) {
  const height = valueMinor <= 0 ? 2 : Math.max((valueMinor / max) * 100, 2);
  return (
    <div
      className="w-full max-w-[14px] rounded-t-[4px] transition-[height] duration-500 ease-out"
      style={{ height: `${height}%`, background: color }}
    />
  );
}
