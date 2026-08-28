import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listPantry, pantrySummary } from '@/services/pantry';
import { today } from '@/lib/dates';
import { nearDayLabel } from '@/lib/dates';
import { Card, EmptyState, Button } from '@/components/ui/primitives';
import { KitchenList, type KitchenItem } from './kitchen-list';

export const metadata: Metadata = { title: 'Kitchen' };
export const dynamic = 'force-dynamic';

export default async function KitchenPage() {
  const user = await requireUser();
  const now = today();
  const [items, summary] = await Promise.all([
    listPantry(user.id, { status: 'in' }, now),
    pantrySummary(user.id, now),
  ]);

  const mapped: KitchenItem[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    brand: item.brand,
    glyph: item.glyph,
    location: item.location,
    quantity: item.quantity,
    expiresOn: item.expiresOn,
    // Formatted on the server, where there is one locale and one clock.
    expiresLabel: item.expiresOn ? nearDayLabel(item.expiresOn) : null,
    freshness: item.freshness,
  }));

  return (
    <div className="rise space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Kitchen</h1>
          <p className="mt-0.5 text-[13.5px] text-ink-muted">
            {summary.total === 0
              ? 'Nothing in it yet.'
              : `${summary.total} thing${summary.total === 1 ? '' : 's'} in${
                  summary.rescuedLast30 > 0 ? ` · ${summary.rescuedLast30} rescued this month` : ''
                }`}
          </p>
        </div>
        <Link
          href="/kitchen/scan"
          className="pressable shrink-0 rounded-full px-4 py-2.5 text-[14px] font-semibold text-white"
          style={{ background: 'var(--color-play-kitchen)' }}
        >
          Scan
        </Link>
      </header>

      {summary.expired + summary.urgent > 0 ? (
        <Link href="/kitchen/expiry" className="pressable block">
          <div
            className="play-tile p-4"
            style={{ background: 'var(--color-play-kitchen)' }}
          >
            <p className="relative text-[15px] font-bold">
              {summary.expired + summary.urgent} need deciding on
            </p>
            <p className="relative mt-0.5 text-[12.5px] text-white/85">
              Eat, freeze or bin — one swipe each, about twenty seconds.
            </p>
          </div>
        </Link>
      ) : null}

      {mapped.length === 0 ? (
        <Card>
          <EmptyState
            title="An empty kitchen"
            description="Scan a barcode and everything else — the kind of thing it is, where it lives, roughly how long it keeps — is filled in for you."
            action={
              <Link href="/kitchen/scan">
                <Button size="sm">Scan the first thing</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <KitchenList items={mapped} />
      )}
    </div>
  );
}
