import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { mobilePaySummary } from '@/services/mobilepay';
import { listTransactions } from '@/services/transactions';
import { monthRange, lastNDays, formatDay } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { Button, Card, CardBody, CardHeader, CardTitle, EmptyState } from '@/components/ui/primitives';
import { TransactionList } from '@/components/transaction-row';
import { DemoBanner } from '@/components/demo-banner';

export const metadata: Metadata = { title: 'MobilePay' };
export const dynamic = 'force-dynamic';

export default async function MobilePayPage() {
  const user = await requireUser();
  const currency = user.baseCurrency;
  const month = monthRange(0);
  const quarter = lastNDays(90);

  const [thisMonth, recentQuarter, recent] = await Promise.all([
    mobilePaySummary(user.id, { from: month.start, to: month.end }),
    mobilePaySummary(user.id, { from: quarter.start, to: quarter.end }),
    listTransactions(user.id, { paymentChannels: ['mobilepay'] }, { limit: 15 }),
  ]);

  if (!recentQuarter.available) {
    return (
      <div className="rise">
        <h1 className="text-[28px] font-semibold tracking-tight">MobilePay</h1>
        <Card className="mt-5">
          <EmptyState
            title="No MobilePay payments found"
            description="MobilePay has no consumer API, so Kroner reads these out of your bank feed. Connect a bank and they appear here automatically."
            action={
              <Link href="/connect">
                <Button>Connect your bank</Button>
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const owedToYou = recentQuarter.people.filter((p) => p.netMinor > 0).slice(0, 6);
  const youOwe = recentQuarter.people.filter((p) => p.netMinor < 0).slice(0, 6);

  return (
    <div className="rise space-y-6">
      <DemoBanner demoMode={user.demoMode} />

      <header>
        <p className="text-[13px] text-ink-muted">{month.label}</p>
        <h1 className="mt-0.5 text-[28px] font-semibold leading-tight tracking-tight">MobilePay</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
          Read from your bank feed — MobilePay itself offers no way to connect a personal account.
        </p>
      </header>

      <section className="grid grid-cols-3 gap-2.5">
        <Tile label="Sent" value={formatMoney(thisMonth.sentMinor, currency, { compact: true })} />
        <Tile label="Received" value={formatMoney(thisMonth.receivedMinor, currency, { compact: true })} />
        <Tile
          label="Net"
          value={formatMoney(thisMonth.netMinor, currency, { compact: true, signed: true })}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>They owe you</CardTitle>
          </CardHeader>
          <CardBody className="pt-0">
            <PeopleList people={owedToYou} currency={currency} empty="Nobody, on the last 90 days." />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>You owe them</CardTitle>
          </CardHeader>
          <CardBody className="pt-0">
            <PeopleList people={youOwe} currency={currency} empty="Nobody, on the last 90 days." />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Everyone, last 90 days</CardTitle>
        </CardHeader>
        <CardBody className="pt-0">
          <ul className="divide-y divide-border">
            {recentQuarter.people.map((person) => (
              <li key={person.name} className="py-2.5">
                <Link
                  href={`/transactions?q=${encodeURIComponent(person.name)}&range=last_90`}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{person.name}</span>
                    <span className="block text-[12px] text-ink-subtle">
                      {person.transactionCount} payment{person.transactionCount === 1 ? '' : 's'} · last{' '}
                      {formatDay(person.lastDate)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className={`numeral block text-[14px] font-medium ${
                        person.netMinor > 0 ? 'text-positive' : ''
                      }`}
                    >
                      {formatMoney(person.netMinor, currency, { compact: true, signed: true })}
                    </span>
                    <span className="numeral block text-[11.5px] text-ink-subtle">
                      {formatMoney(person.sentMinor, currency, { compact: true })} out ·{' '}
                      {formatMoney(person.receivedMinor, currency, { compact: true })} in
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Recent MobilePay</CardTitle>
          <Link href="/transactions?q=MobilePay&range=all" className="text-[13px] font-medium text-accent">
            All
          </Link>
        </CardHeader>
        <div className="border-t border-border">
          <TransactionList transactions={recent.transactions} />
        </div>
      </Card>

      <p className="px-1 pb-2 text-[12px] leading-relaxed text-ink-subtle">
        Net is what has actually moved between you and each person over the period, not a settled
        balance — someone may have paid you back in cash.
      </p>
    </div>
  );
}

function PeopleList({
  people,
  currency,
  empty,
}: {
  people: Array<{ name: string; netMinor: number; transactionCount: number }>;
  currency: string;
  empty: string;
}) {
  if (people.length === 0) return <p className="py-4 text-[13px] text-ink-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {people.map((person) => (
        <li key={person.name} className="flex items-center justify-between gap-3 py-2.5">
          <span className="min-w-0 truncate text-[13.5px]">{person.name}</span>
          <span className="numeral shrink-0 text-[13.5px] font-medium">
            {formatMoney(Math.abs(person.netMinor), currency, { compact: true })}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-tile)] border border-border bg-surface px-3 py-2.5">
      <p className="text-[11px] text-ink-subtle">{label}</p>
      <p className="numeral mt-0.5 text-[15px] font-semibold">{value}</p>
    </div>
  );
}
