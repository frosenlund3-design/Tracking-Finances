import * as React from 'react';

/**
 * A single-series line, sized to sit inside a stat tile. No axes, no legend,
 * no point labels — the number above it is the message; this only shows shape.
 */
export function Sparkline({
  values,
  className,
  ariaLabel,
}: {
  values: number[];
  className?: string;
  ariaLabel: string;
}) {
  if (values.length < 2) return null;

  const width = 100;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / span) * (height - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const last = values[values.length - 1]!;
  const lastX = width;
  const lastY = height - ((last - min) / span) * (height - 4) - 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={ariaLabel}
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="var(--color-magnitude)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill="var(--color-magnitude)" />
    </svg>
  );
}
