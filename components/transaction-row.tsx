import Link from 'next/link';
import { Money } from '@/components/money';
import { Badge } from '@/components/ui/primitives';
import { categoryLabel } from '@/lib/categories';
import { formatDay } from '@/lib/dates';
import type { Transaction } from '@/types/finance';

/** Initials avatar. Cheap, consistent, and no logo-fetching side channel. */
function MerchantMark({ label }: { label: string }) {
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[12px] font-medium text-ink-muted"
    >
      {initials || '?'}
    </span>
  );
}

export function TransactionRow({
  transaction,
  showDate = true,
}: {
  transaction: Transaction;
  showDate?: boolean;
}) {
  const label = transaction.merchant ?? transaction.description;
  const needsReview = transaction.confidenceScore < 0.5 && !transaction.categoryLocked;

  return (
    <Link
      href={`/transactions/${transaction.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted sm:px-5"
    >
      <MerchantMark label={label} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium leading-tight text-ink">{label}</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-ink-subtle">
          {showDate ? <span>{formatDay(transaction.transactionDate)}</span> : null}
          {showDate ? <span aria-hidden="true">·</span> : null}
          <span className="truncate">{categoryLabel(transaction.category)}</span>
          {transaction.ownership === 'business' ? (
            <Badge tone="accent" className="ml-0.5">
              Business
            </Badge>
          ) : null}
          {transaction.recurringStatus === 'recurring' ? (
            <Badge className="ml-0.5">Recurring</Badge>
          ) : null}
          {needsReview ? (
            <Badge tone="notice" className="ml-0.5">
              Review
            </Badge>
          ) : null}
        </p>
      </div>
      <Money
        minor={transaction.amountMinor}
        currency={transaction.currency}
        signed
        className="shrink-0 text-[14px] font-medium"
      />
    </Link>
  );
}

export function TransactionList({
  transactions,
  showDate = true,
}: {
  transactions: Transaction[];
  showDate?: boolean;
}) {
  return (
    <ul className="divide-y divide-border">
      {transactions.map((t) => (
        <li key={t.id}>
          <TransactionRow transaction={t} showDate={showDate} />
        </li>
      ))}
    </ul>
  );
}
