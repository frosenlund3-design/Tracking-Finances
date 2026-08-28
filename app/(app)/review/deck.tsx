'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Sheet } from '@/components/ui/primitives';
import { Money } from '@/components/money';
import { formatMoney } from '@/lib/money';
import { formatDayLong } from '@/lib/dates';
import { BUSINESS_CATEGORIES, PERSONAL_CATEGORIES, categoryLabel } from '@/lib/categories';
import { cn } from '@/lib/cn';
import { confirmAsIsAction, decideCategoryAction, finishReviewAction } from './actions';
import type { ReviewItem } from '@/services/review';

/**
 * One transaction at a time, with the answer already proposed.
 *
 * The queue exists because a wrong category quietly distorts every total, and
 * the only way people will actually clear it is if a decision costs one tap.
 * So: the biggest amounts first, three or four suggestions ready, and each
 * decision settles the merchant's other unreviewed rows at the same time.
 */
export function ReviewDeck({
  items,
  remaining,
  unreviewedMinor,
  currency,
}: {
  items: ReviewItem[];
  remaining: number;
  unreviewedMinor: number;
  currency: string;
}) {
  const router = useRouter();
  // The queue is walked client-side, so a decision that settles eight other
  // rows has to remove those eight from the deck. Asking about a transaction
  // the last tap already answered is the fastest way to make the flow feel
  // broken.
  const [queue, setQueue] = useState(items);
  const [index, setIndex] = useState(0);
  const [decided, setDecided] = useState(0);
  const [alsoUpdated, setAlsoUpdated] = useState(0);
  const [left, setLeft] = useState(remaining);
  const [leftMinor, setLeftMinor] = useState(unreviewedMinor);
  const [error, setError] = useState<string | null>(null);
  const [allCategoriesOpen, setAllCategoriesOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const item = queue[index];
  const done = index >= queue.length;

  const progress = useMemo(
    () => (queue.length === 0 ? 1 : Math.min(index / queue.length, 1)),
    [index, queue.length],
  );

  /** Records one decision and drops every row it also settled. */
  function advance(extra: number, settledMerchant: boolean) {
    const current = queue[index];
    if (!current) return;
    const merchantKey = current.transaction.merchantKey;

    // Rows after this one only: everything before it is already answered, and
    // removing those would shift the deck under the user's thumb.
    const settled =
      settledMerchant && merchantKey
        ? queue.filter((it, i) => i > index && it.transaction.merchantKey === merchantKey)
        : [];
    const clearedMinor = [current, ...settled].reduce(
      (sum, it) => sum + Math.abs(it.transaction.amountMinor),
      0,
    );

    setAlsoUpdated((n) => n + extra);
    setDecided((n) => n + 1 + extra);
    setLeft((n) => Math.max(n - 1 - extra, 0));
    setLeftMinor((n) => Math.max(n - clearedMinor, 0));
    if (settled.length > 0) {
      setQueue((q) => q.filter((it) => !settled.includes(it)));
    }
    setIndex((i) => i + 1);
  }

  function decide(category: string) {
    if (!item) return;
    setError(null);
    const form = new FormData();
    form.set('id', item.transaction.id);
    form.set('category', category);
    form.set('applyToMerchant', 'true');
    startTransition(async () => {
      const result = await decideCategoryAction(form);
      if (result.error) setError(result.error);
      else advance(result.alsoUpdated ?? 0, true);
      setAllCategoriesOpen(false);
    });
  }

  function keepAsIs() {
    if (!item) return;
    setError(null);
    const form = new FormData();
    form.set('id', item.transaction.id);
    startTransition(async () => {
      const result = await confirmAsIsAction(form);
      if (result.error) setError(result.error);
      else advance(0, false);
    });
  }

  /** Publishes the batch: re-runs recurring detection and refreshes the app. */
  function finish(destination: string) {
    startTransition(async () => {
      await finishReviewAction();
      router.push(destination);
    });
  }

  if (done) {
    return (
      <div className="rise space-y-5">
        <header>
          <h1 className="text-[28px] font-semibold tracking-tight">Done for now</h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
            {decided} transaction{decided === 1 ? '' : 's'} sorted
            {alsoUpdated > 0 ? `, ${alsoUpdated} of them automatically from rules you just made` : ''}.
          </p>
        </header>

        <Card className="p-5 text-center">
          <p className="text-[15px] font-medium">
            {left > 0 ? `${left} left in the queue` : 'The queue is empty'}
          </p>
          <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-ink-muted">
            {left > 0
              ? 'Every decision teaches the categorizer, so this gets shorter each time.'
              : 'Everything has a category Kroner is confident about.'}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {left > 0 ? (
              <Button onClick={() => finish('/review')} disabled={pending}>
                {pending ? 'Loading…' : 'Keep going'}
              </Button>
            ) : null}
            <Button variant="secondary" full disabled={pending} onClick={() => finish('/dashboard')}>
              Back to home
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const { transaction, suggestions, siblingCount } = item!;

  return (
    <div className="rise space-y-4">
      <header>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">What was this?</h1>
          <span className="numeral shrink-0 text-[13px] text-ink-muted">
            {index + 1} / {queue.length}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-ink-muted">
          {left} unsorted, worth {formatMoney(leftMinor, currency, { compact: true })} in total.
        </p>
        <div
          className="mt-3 h-1 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-valuenow={index}
          aria-valuemax={queue.length}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${Math.max(progress * 100, 2)}%` }}
          />
        </div>
      </header>

      <Card className="p-5">
        <p className="text-[13px] text-ink-muted">{formatDayLong(transaction.transactionDate)}</p>
        <p className="mt-1 text-[19px] font-semibold leading-tight tracking-tight">
          {transaction.merchant ?? transaction.description}
        </p>
        <Money
          minor={transaction.amountMinor}
          currency={transaction.currency}
          signed
          className="mt-2 block text-[30px] font-semibold leading-none"
        />

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge>Currently {categoryLabel(transaction.category)}</Badge>
          {transaction.paymentChannel !== 'unknown' ? (
            <Badge>{transaction.paymentChannel.replace('_', ' ')}</Badge>
          ) : null}
          {siblingCount > 0 ? (
            <Badge tone="accent">+{siblingCount} more like this</Badge>
          ) : null}
        </div>

        {transaction.merchant && transaction.description !== transaction.merchant ? (
          <p className="mt-3 break-words rounded-xl bg-surface-muted px-3 py-2 font-mono text-[11.5px] leading-relaxed text-ink-muted">
            {transaction.description}
          </p>
        ) : null}
      </Card>

      <div className="space-y-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.category}
            type="button"
            disabled={pending}
            onClick={() => decide(suggestion.category)}
            className={cn(
              'pressable flex w-full items-center justify-between gap-3 rounded-2xl border border-border',
              'bg-surface p-4 text-left disabled:opacity-60 disabled:active:scale-100',
            )}
          >
            <span className="min-w-0">
              <span className="block text-[15px] font-medium">{suggestion.label}</span>
              <span className="block truncate text-[12.5px] text-ink-subtle">{suggestion.reason}</span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-accent">
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="m4 10.5 4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-negative-soft px-3.5 py-2.5 text-[13px] text-negative">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button variant="secondary" full disabled={pending} onClick={() => setAllCategoriesOpen(true)}>
          Something else
        </Button>
        <Button variant="ghost" full disabled={pending} onClick={keepAsIs}>
          Keep as is
        </Button>
      </div>

      <p className="px-1 text-[12px] leading-relaxed text-ink-subtle">
        Your choice becomes a rule, so the same merchant sorts itself from now on
        {siblingCount > 0 ? ` — including the ${siblingCount} other unsorted charge${siblingCount === 1 ? '' : 's'} from them` : ''}.
      </p>

      <Sheet
        open={allCategoriesOpen}
        onClose={() => setAllCategoriesOpen(false)}
        title="Choose a category"
        description="This becomes the rule for this merchant."
      >
        <div className="space-y-4 pb-3">
          <CategoryGroup title="Personal" categories={PERSONAL_CATEGORIES} onPick={decide} disabled={pending} />
          <CategoryGroup title="Business" categories={BUSINESS_CATEGORIES} onPick={decide} disabled={pending} />
        </div>
      </Sheet>
    </div>
  );
}

function CategoryGroup({
  title,
  categories,
  onPick,
  disabled,
}: {
  title: string;
  categories: Array<{ key: string; label: string }>;
  onPick: (category: string) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <h3 className="px-1 text-[12px] font-medium uppercase tracking-wide text-ink-subtle">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {categories.map((category) => (
          <button
            key={category.key}
            type="button"
            disabled={disabled}
            onClick={() => onPick(category.key)}
            className="pressable rounded-full border border-border bg-surface px-3 py-2 text-[13.5px] disabled:opacity-60"
          >
            {category.label}
          </button>
        ))}
      </div>
    </div>
  );
}
