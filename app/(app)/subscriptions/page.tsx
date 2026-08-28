import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listSubscriptions } from '@/services/subscriptions';
import { formatMoney } from '@/lib/money';
import { formatDay } from '@/lib/dates';
import { categoryLabel } from '@/lib/categories';
import { Badge, Button, Card, CardBody, EmptyState } from '@/components/ui/primitives';
import { StatTile } from '@/components/money';
import { DemoBanner } from '@/components/demo-banner';
import { SubscriptionActions } from './actions-ui';
import type { Subscription } from '@/types/finance';

export const metadata: Metadata = { title: 'Subscriptions' };
export const dynamic = 'force-dynamic';

const INTERVAL_LABEL: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semiannual: 'Twice a year',
  annual: 'Yearly',
};

export default async function SubscriptionsPage() {
  const user = await requireUser();
  const currency = user.baseCurrency;
  const all = await listSubscriptions(user.id);

  const active = all.filter((s) => s.status === 'active');
  const inactive = all.filter((s) => s.status !== 'active');
  const monthly = active.reduce((s, x) => s + x.monthlyEquivalentMinor, 0);
  const personal = active.filter((s) => s.ownership !== 'business');
  const business = active.filter((s) => s.ownership === 'business');
  const repriced = active.filter((s) => s.priceChangedAt && s.previousAmountMinor);

  if (all.length === 0) {
    return (
      <div className="rise">
        <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
        <Card className="mt-5">
          <EmptyState
            title="Nothing detected yet"
            description="A subscription appears once a merchant has charged you at least three times on a regular cadence. Nothing is guessed from the merchant name alone."
            action={
              <Link href="/connect">
                <Button size="sm">Connect an account</Button>
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="rise space-y-5">
      <DemoBanner demoMode={user.demoMode} />

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
        <p className="mt-1 text-[13px] text-ink-muted">
          Detected from the timing of the payments themselves.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <StatTile label="Every month" minor={monthly} currency={currency} hint={`${active.length} active`} />
        <StatTile label="Every year" minor={monthly * 12} currency={currency} />
      </section>

      {repriced.length > 0 ? (
        <Card className="border-notice/30 bg-notice-soft">
          <CardBody className="pt-4">
            <p className="text-[14px] font-medium">
              {repriced.length} price change{repriced.length === 1 ? '' : 's'}
            </p>
            <ul className="mt-2 space-y-1 text-[13px] text-ink-muted">
              {repriced.map((s) => (
                <li key={s.id}>
                  {s.merchantLabel}: {formatMoney(s.previousAmountMinor ?? 0, s.currency)} →{' '}
                  {formatMoney(s.amountMinor, s.currency)} on {formatDay(s.priceChangedAt!)}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {business.length > 0 && personal.length > 0 ? (
        <>
          <Group title="Personal" subscriptions={personal} currency={currency} />
          <Group title="Business" subscriptions={business} currency={currency} />
        </>
      ) : (
        <Group title="Active" subscriptions={active} currency={currency} />
      )}

      {inactive.length > 0 ? (
        <Group
          title="Lapsed or cancelled"
          subscriptions={inactive}
          currency={currency}
          muted
        />
      ) : null}

      <p className="px-1 pb-2 text-[12px] leading-relaxed text-ink-subtle">
        Next payment dates are predictions from past charges, not confirmations from the merchant.
      </p>
    </div>
  );
}

function Group({
  title,
  subscriptions,
  currency,
  muted,
}: {
  title: string;
  subscriptions: Subscription[];
  currency: string;
  muted?: boolean;
}) {
  if (subscriptions.length === 0) return null;
  const total = subscriptions.reduce((s, x) => s + x.monthlyEquivalentMinor, 0);

  return (
    <section>
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-ink-subtle">{title}</h2>
        {!muted ? (
          <span className="numeral text-[13px] text-ink-muted">
            {formatMoney(total, currency, { compact: true })}/mo
          </span>
        ) : null}
      </div>

      <div className={`mt-2 space-y-2 ${muted ? 'opacity-70' : ''}`}>
        {subscriptions.map((s) => (
          <Card key={s.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium">{s.merchantLabel}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-ink-subtle">
                  <span>{INTERVAL_LABEL[s.interval] ?? s.interval}</span>
                  <span aria-hidden="true">·</span>
                  <span>{categoryLabel(s.category)}</span>
                  {s.ownership === 'business' ? <Badge tone="accent">Business</Badge> : null}
                  {s.confidence < 0.6 ? <Badge tone="notice">Uncertain</Badge> : null}
                  {s.status === 'lapsed' ? <Badge>Lapsed</Badge> : null}
                  {s.status === 'cancelled' ? <Badge>Cancelled</Badge> : null}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="numeral text-[15px] font-medium">
                  {formatMoney(s.amountMinor, s.currency)}
                </p>
                <p className="numeral text-[12px] text-ink-subtle">
                  {formatMoney(s.monthlyEquivalentMinor, s.currency)}/mo
                </p>
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-[12px]">
              <div>
                <dt className="text-ink-subtle">Last paid</dt>
                <dd className="mt-0.5">{formatDay(s.lastPaymentDate)}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Next expected</dt>
                <dd className="mt-0.5">{s.status === 'active' ? formatDay(s.nextPredictedDate) : '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Per year</dt>
                <dd className="numeral mt-0.5">
                  {formatMoney(s.annualEquivalentMinor, s.currency, { compact: true })}
                </dd>
              </div>
            </dl>

            <div className="mt-3 flex items-center justify-between gap-2">
              <Link
                href={`/transactions?merchant=${encodeURIComponent(s.merchantKey)}&range=all`}
                className="text-[13px] font-medium text-accent"
              >
                {s.occurrences} payment{s.occurrences === 1 ? '' : 's'}
              </Link>
              <SubscriptionActions id={s.id} status={s.status} />
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
