import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';

/**
 * Every amount in the product renders through here, so signs, colours and
 * digit alignment stay consistent. Colour never carries the sign alone — the
 * minus character is always present.
 */
export function Money({
  minor,
  currency = 'DKK',
  className,
  signed = false,
  compact = false,
  tone = 'auto',
}: {
  minor: number;
  currency?: string;
  className?: string;
  signed?: boolean;
  compact?: boolean;
  /** 'auto' colours by sign; 'neutral' leaves it in body ink. */
  tone?: 'auto' | 'neutral';
}) {
  const colour =
    tone === 'neutral'
      ? ''
      : minor > 0
        ? 'text-positive'
        : minor < 0
          ? 'text-ink'
          : 'text-ink-muted';

  return (
    <span className={cn('tnum', colour, className)}>
      {formatMoney(minor, currency, { signed, compact })}
    </span>
  );
}

export function StatTile({
  label,
  minor,
  currency,
  hint,
  signed,
  children,
}: {
  label: string;
  minor: number;
  currency: string;
  hint?: string;
  signed?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <p className="text-[12px] font-medium text-ink-muted">{label}</p>
      <p className="tnum mt-1.5 text-[22px] font-semibold leading-tight tracking-tight text-ink sm:text-2xl">
        {formatMoney(minor, currency, { compact: true, signed })}
      </p>
      {hint ? <p className="mt-1 text-[12px] text-ink-subtle">{hint}</p> : null}
      {children}
    </div>
  );
}
