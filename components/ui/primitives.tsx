'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
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
        interactive && 'pressable hover:border-border-strong',
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
  primary: 'bg-accent text-white shadow-[0_1px_2px_oklch(0_0_0/0.12)] hover:opacity-92',
  secondary: 'bg-surface border border-border text-ink hover:bg-surface-muted',
  ghost: 'text-ink-muted hover:bg-surface-muted hover:text-ink',
  danger: 'bg-negative text-white hover:opacity-92',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-[13px] rounded-xl',
  // 44px is the smallest comfortable touch target on a phone.
  md: 'h-11 px-4 text-[14px] rounded-xl',
  lg: 'h-[52px] px-5 text-[15px] rounded-2xl',
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
        'pressable inline-flex items-center justify-center gap-2 font-medium',
        'disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100',
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
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 tracking-[0.01em]',
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
          'h-12 w-full rounded-xl border border-border bg-surface px-3.5',
          // 16px minimum stops iOS Safari zooming the page on focus.
          'text-[16px] sm:text-[14px] text-ink placeholder:text-ink-subtle',
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
        'h-12 w-full appearance-none rounded-xl border border-border bg-surface px-3.5 pr-9',
        'text-[16px] sm:text-[14px] text-ink transition-colors focus:border-accent',
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
        'w-full rounded-xl border border-border bg-surface px-3.5 py-3',
        'text-[16px] sm:text-[14px] text-ink placeholder:text-ink-subtle',
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

/**
 * Bottom sheet. On a phone this is the modal people expect: it rises from the
 * thumb, dismisses by tapping away, and clears the home indicator.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Stop the page behind the sheet from scrolling with it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  /*
   * Portalled to the body on purpose. An ancestor carrying a transform — which
   * includes anything running the page-entry animation — becomes the
   * containing block for `position: fixed`, and the sheet would then be laid
   * out inside that element rather than the viewport, landing off-screen.
   */
  return createPortal(
    <div
      className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[3px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={cn(
          'sheet-in max-h-[88dvh] w-full overflow-y-auto bg-surface',
          'rounded-t-[28px] border-t border-border shadow-[var(--shadow-sheet)]',
          'sm:max-w-md sm:rounded-[28px] sm:border',
        )}
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface px-5 pb-3 pt-3">
          <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-border-strong sm:hidden" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>
              {description ? (
                <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 -mt-0.5 shrink-0 rounded-full p-2 text-ink-subtle hover:bg-surface-muted hover:text-ink"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="px-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
