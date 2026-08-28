import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getTransaction } from '@/services/transactions';
import { listAccounts } from '@/services/accounts';
import { listSubscriptions } from '@/services/subscriptions';
import { formatMoney } from '@/lib/money';
import { formatDayLong } from '@/lib/dates';
import { categoryLabel } from '@/lib/categories';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle } from '@/components/ui/primitives';
import { TransactionEditor } from './editor';
import { DeleteManualTransaction } from './delete-button';

export const metadata: Metadata = { title: 'Transaction' };
export const dynamic = 'force-dynamic';

const CONFIDENCE_COPY: Array<[number, string]> = [
  [0.95, 'Confirmed by you'],
  [0.8, 'High confidence'],
  [0.5, 'Reasonable guess'],
  [0, 'Low confidence — worth a look'],
];

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const transaction = await getTransaction(user.id, id);
  if (!transaction) notFound();

  const [accounts, subscriptions] = await Promise.all([
    listAccounts(user.id),
    transaction.subscriptionId ? listSubscriptions(user.id) : Promise.resolve([]),
  ]);

  const account = accounts.find((a) => a.id === transaction.accountId);
  const subscription = subscriptions.find((s) => s.id === transaction.subscriptionId);
  const confidence =
    CONFIDENCE_COPY.find(([threshold]) => transaction.confidenceScore >= threshold)?.[1] ?? '';

  const meta = Object.entries(transaction.originalProviderMetadata).filter(
    ([, v]) => v !== null && v !== '',
  );

  return (
    <div className="rise space-y-4">
      <Link href="/transactions" className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink">
        <span aria-hidden="true">←</span> Every krone
      </Link>

      <Card>
        <CardBody className="pt-5">
          <p className="text-[13px] text-ink-muted">{formatDayLong(transaction.transactionDate)}</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {transaction.merchant ?? transaction.description}
          </h1>
          <p className="tnum mt-2 text-[30px] font-semibold leading-none tracking-tight">
            {formatMoney(transaction.amountMinor, transaction.currency, { signed: true })}
          </p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            <Badge tone={transaction.ownership === 'business' ? 'accent' : 'neutral'}>
              {transaction.ownership === 'business'
                ? 'Business'
                : transaction.ownership === 'mixed'
                  ? 'Mixed'
                  : 'Personal'}
            </Badge>
            <Badge>{categoryLabel(transaction.category)}</Badge>
            {transaction.recurringStatus === 'recurring' ? <Badge>Recurring</Badge> : null}
            {transaction.categoryLocked ? <Badge tone="positive">Confirmed</Badge> : null}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardBody className="pt-0">
          <dl className="divide-y divide-border text-[13px]">
            <Row label="Account" value={account ? account.name : '—'} />
            <Row label="Source" value={sourceLabel(transaction.provider)} />
            {transaction.bookingDate && transaction.bookingDate !== transaction.transactionDate ? (
              <Row label="Booked" value={formatDayLong(transaction.bookingDate)} />
            ) : null}
            <Row label="Description" value={transaction.description} />
            <Row label="Categorization" value={confidence} />
            {subscription ? (
              <Row
                label="Subscription"
                value={`${subscription.merchantLabel} · ${subscription.interval} · next ${subscription.nextPredictedDate}`}
              />
            ) : null}
            <Row label="Provider reference" value={transaction.transactionId} mono />
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Correct this</CardTitle>
        </CardHeader>
        <CardBody className="pt-0">
          <TransactionEditor transaction={transaction} />
        </CardBody>
      </Card>

      {meta.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>What the provider sent</CardTitle>
          </CardHeader>
          <CardBody className="pt-0">
            <dl className="divide-y divide-border text-[13px]">
              {meta.map(([key, value]) => (
                <Row key={key} label={key} value={String(value)} mono />
              ))}
            </dl>
            <p className="mt-3 text-[12px] text-ink-subtle">
              Stored for traceability. Sensitive fields are stripped before anything is written.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {transaction.provider === 'manual' ? (
        <DeleteManualTransaction id={transaction.id} />
      ) : null}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className={`min-w-0 break-words text-right ${mono ? 'font-mono text-[12px]' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function sourceLabel(provider: string): string {
  switch (provider) {
    case 'demo': return 'Demo data';
    case 'manual': return 'Added by you';
    case 'stripe': return 'Stripe';
    case 'gocardless': return 'Bank (Open Banking)';
    default: return provider;
  }
}
