import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listTransactions } from '@/services/transactions';
import { listAccounts } from '@/services/accounts';
import { periodTotals } from '@/services/analytics';
import { formatMoney } from '@/lib/money';
import { relativeDayLabel } from '@/lib/dates';
import { TransactionRow } from '@/components/transaction-row';
import { Button, Card, EmptyState } from '@/components/ui/primitives';
import { TransactionFilters } from './filters';
import {
  PAGE_SIZE,
  describeFilters,
  parseSearchParams,
  toFilters,
} from './search-params';
import type { Transaction } from '@/types/finance';

export const metadata: Metadata = { title: 'Every krone' };
export const dynamic = 'force-dynamic';

function groupByDay(transactions: Transaction[]): Array<[string, Transaction[]]> {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const list = groups.get(t.transactionDate);
    if (list) list.push(t);
    else groups.set(t.transactionDate, [t]);
  }
  return [...groups.entries()];
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const raw = await searchParams;
  const params = parseSearchParams(raw);
  const filters = toFilters(params);

  const [page, accounts, totals] = await Promise.all([
    listTransactions(user.id, filters, { limit: PAGE_SIZE, offset: params.page * PAGE_SIZE }),
    listAccounts(user.id),
    periodTotals(user.id, filters, user.baseCurrency),
  ]);

  const active = describeFilters(params);
  const groups = groupByDay(page.transactions);

  const queryString = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) =>
      v === undefined ? [] : [[k, Array.isArray(v) ? (v[0] ?? '') : v] as [string, string]],
    ),
  );

  const pageLink = (next: number) => {
    const qs = new URLSearchParams(queryString);
    if (next <= 0) qs.delete('page');
    else qs.set('page', String(next));
    const s = qs.toString();
    return s ? `/transactions?${s}` : '/transactions';
  };

  // The export reuses the exact filters on screen, minus pagination.
  const exportQuery = new URLSearchParams(queryString);
  exportQuery.delete('page');
  const exportHref = `/api/export/transactions${exportQuery.size ? `?${exportQuery}` : ''}`;

  return (
    <div className="rise space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Every krone</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            {page.total.toLocaleString('en-GB')} transaction{page.total === 1 ? '' : 's'}
            {active.length > 0 ? ` · ${active.join(' · ')}` : ''}
          </p>
        </div>
        <Link href="/transactions/new" className="shrink-0">
          <Button size="sm" variant="secondary">
            Add
          </Button>
        </Link>
      </header>

      <TransactionFilters accounts={accounts} activeCount={active.length} />

      {page.total > 0 ? (
        <div>
          <div className="grid grid-cols-3 gap-2.5">
            <SummaryCell label="In" value={formatMoney(totals.incomeMinor, user.baseCurrency, { compact: true })} />
            <SummaryCell label="Out" value={formatMoney(totals.expenseMinor, user.baseCurrency, { compact: true })} />
            <SummaryCell
              label="Net"
              value={formatMoney(totals.netMinor, user.baseCurrency, { compact: true, signed: true })}
            />
          </div>
          {totals.transfersExcluded > 0 ? (
            <p className="mt-1.5 px-1 text-[12px] text-ink-subtle">
              Excludes {totals.transfersExcluded} transfer
              {totals.transfersExcluded === 1 ? '' : 's'} between your own accounts — they are
              listed below but would double-count in these totals.
            </p>
          ) : null}
        </div>
      ) : null}

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            title="No transactions match"
            description={
              active.length > 0
                ? 'Try widening the date range or clearing a filter.'
                : 'Once an account is connected, everything shows up here.'
            }
            action={
              active.length > 0 ? (
                <Link href="/transactions">
                  <Button variant="secondary" size="sm">
                    Clear filters
                  </Button>
                </Link>
              ) : (
                <Link href="/connect">
                  <Button size="sm">Connect an account</Button>
                </Link>
              )
            }
          />
        </Card>
      ) : (
        /*
         * One card per day, with the date as a heading outside it. The heading
         * has to sit outside a rounded, clipped container for `sticky` to
         * resolve against the viewport at all.
         */
        <div className="space-y-4">
          {groups.map(([date, items]) => (
            <section key={date}>
              <h2 className="sticky top-0 z-10 -mx-4 bg-canvas/95 px-5 py-1.5 text-[12px] font-medium text-ink-subtle backdrop-blur-sm sm:mx-0 sm:px-1">
                {relativeDayLabel(date)}
              </h2>
              <Card className="mt-1 overflow-hidden">
                <ul className="divide-y divide-border">
                  {items.map((t) => (
                    <li key={t.id}>
                      <TransactionRow transaction={t} showDate={false} />
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}

      {page.total > PAGE_SIZE ? (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          <Link href={pageLink(params.page - 1)} aria-disabled={params.page === 0}>
            <Button variant="secondary" size="sm" disabled={params.page === 0}>
              Previous
            </Button>
          </Link>
          <span className="text-[13px] text-ink-muted">
            {params.page * PAGE_SIZE + 1}–{Math.min((params.page + 1) * PAGE_SIZE, page.total)} of{' '}
            {page.total.toLocaleString('en-GB')}
          </span>
          <Link href={pageLink(params.page + 1)} aria-disabled={!page.hasMore}>
            <Button variant="secondary" size="sm" disabled={!page.hasMore}>
              Next
            </Button>
          </Link>
        </nav>
      ) : null}

      <p className="px-1 pb-2 text-[12px] text-ink-subtle">
        <Link href={exportHref} prefetch={false} className="font-medium text-accent">
          Export these as CSV
        </Link>{' '}
        — the current filters are applied.
      </p>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <p className="text-[11px] text-ink-subtle">{label}</p>
      <p className="numeral mt-0.5 text-[14px] font-medium">{value}</p>
    </div>
  );
}
