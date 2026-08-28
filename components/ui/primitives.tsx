import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * The whole component vocabulary. Deliberately small: a card, a button, a
 * badge, a field, and the states a screen can be in. Anything that needs more
 * than these is usually a screen that is trying to do too much.
 */

export function Card({
  className,
  interactive = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-card)]',
        interactive && 'transition-colors hover:border-border-strong',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-3 p-4 sm:p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-sm font-medium text-ink-muted', className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 pb-4 sm:px-5 sm:pb-5', className)} {...props} />;
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:opacity-90 active:opacity-95',
  secondary: 'bg-surface border border-border text-ink hover:bg-surface-muted',
  ghost: 'text-ink-muted hover:bg-surface-muted hover:text-ink',
  danger: 'bg-negative text-white hover:opacity-90',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-[15px]',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', full, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
        'transition-[opacity,background-color,color] duration-150',
        'disabled:pointer-events-none disabled:opacity-50',
        // Comfortable tap target on touch screens.
        'touch-manipulation select-none',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        full && 'w-full',
        className,
      )}
      {...props}
    />
  );
});

type BadgeTone = 'neutral' | 'accent' | 'positive' | 'negative' | 'notice';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-ink-muted',
  accent: 'bg-accent-soft text-accent-ink',
  positive: 'bg-positive-soft text-positive',
  negative: 'bg-negative-soft text-negative',
  notice: 'bg-notice-soft text-notice',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4',
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-11 w-full rounded-lg border border-border bg-surface px-3',
          // 16px minimum stops iOS Safari zooming on focus.
          'text-[16px] sm:text-sm text-ink placeholder:text-ink-subtle',
          'transition-colors focus:border-accent',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        'h-11 w-full appearance-none rounded-lg border border-border bg-surface px-3 pr-8',
        'text-[16px] sm:text-sm text-ink transition-colors focus:border-accent',
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22gray%22><path d=%22M5.2 7.5 10 12.3l4.8-4.8H5.2Z%22/></svg>')]",
        'bg-[length:16px] bg-[position:right_0.6rem_center] bg-no-repeat',
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-border bg-surface px-3 py-2.5',
        'text-[16px] sm:text-sm text-ink placeholder:text-ink-subtle',
        'transition-colors focus:border-accent resize-none',
        className,
      )}
      {...props}
    />
  );
});

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] text-negative">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden="true" />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon ? <div className="text-ink-subtle">{icon}</div> : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto max-w-xs text-[13px] leading-relaxed text-ink-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className="rounded-[var(--radius-card)] border border-notice/30 bg-notice-soft p-4"
    >
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{detail}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-t border-border', className)} />;
}

export function SectionHeading({
  title,
  action,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 px-1', className)}>
      <h2 className="text-[13px] font-medium uppercase tracking-wide text-ink-subtle">{title}</h2>
      {action}
    </div>
  );
}
