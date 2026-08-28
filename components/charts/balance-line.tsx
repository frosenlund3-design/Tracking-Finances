'use client';

import * as React from 'react';
import { formatMoney } from '@/lib/money';
import { formatDay } from '@/lib/dates';

/**
 * Closing balance over a period.
 *
 * A single series, so no legend — the card title names it. The area under the
 * line is a fill of the same hue rather than a second colour, because it
 * encodes nothing extra.
 */
export function BalanceLine({
  points,
  currency,
}: {
  points: Array<{ date: string; balanceMinor: number }>;
  currency: string;
}) {
  const [active, setActive] = React.useState<number | null>(null);
  if (points.length < 2) return null;

  const width = 300;
  const height = 96;
  const padding = 6;

  const values = points.map((p) => p.balanceMinor);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;

  const x = (i: number) => (i / (points.length - 1)) * (width - padding * 2) + padding;
  const y = (v: number) => height - padding - ((v - min) / span) * (height - padding * 2);

  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.balanceMinor).toFixed(1)}`).join(' ');
  const area = `${padding},${height} ${line} ${(width - padding).toFixed(1)},${height}`;

  const shown = active ?? points.length - 1;
  const shownPoint = points[shown]!;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="numeral text-[15px] font-semibold">
          {formatMoney(shownPoint.balanceMinor, currency, { compact: true })}
        </p>
        <p className="text-[12px] text-ink-subtle">{formatDay(shownPoint.date)}</p>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="mt-2 h-24 w-full touch-none"
        role="img"
        aria-label={`Balance from ${formatMoney(values[0]!, currency)} to ${formatMoney(values[values.length - 1]!, currency)}`}
        onPointerLeave={() => setActive(null)}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          const index = Math.round(ratio * (points.length - 1));
          setActive(Math.min(Math.max(index, 0), points.length - 1));
        }}
      >
        <defs>
          <linearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-magnitude)" stopOpacity="0.20" />
            <stop offset="100%" stopColor="var(--color-magnitude)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <polygon points={area} fill="url(#balance-fill)" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--color-magnitude)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={x(shown)}
          x2={x(shown)}
          y1={padding}
          y2={height - padding}
          stroke="var(--color-border-strong)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {/* A ring in the surface colour keeps the marker readable over the fill. */}
        <circle
          cx={x(shown)}
          cy={y(shownPoint.balanceMinor)}
          r={4}
          fill="var(--color-magnitude)"
          stroke="var(--color-surface)"
          strokeWidth={2}
        />
      </svg>
    </div>
  );
}
