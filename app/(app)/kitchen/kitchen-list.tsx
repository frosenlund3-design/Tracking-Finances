'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sheet } from '@/components/ui/primitives';
import { useCelebrate } from '@/components/play/celebrate';
import { cn } from '@/lib/cn';
import { FRESHNESS_LABEL, type Freshness } from '@/lib/food';
import { settleItemAction } from './actions';

export interface KitchenItem {
  id: string;
  name: string;
  brand: string | null;
  glyph: string;
  location: string;
  quantity: number;
  expiresOn: string | null;
  expiresLabel: string | null;
  freshness: Freshness;
}

/** Urgency as colour, in the order a person would read it. */
const TONE: Record<Freshness, string> = {
  expired: 'text-negative',
  today: 'text-negative',
  soon: 'text-notice',
  week: 'text-ink-muted',
  fine: 'text-ink-subtle',
  undated: 'text-ink-subtle',
};

const GROUP_ORDER: Freshness[] = ['expired', 'today', 'soon', 'week', 'fine', 'undated'];

export function KitchenList({ items }: { items: KitchenItem[] }) {
  const router = useRouter();
  const celebrate = useCelebrate();
  const [open, setOpen] = useState<KitchenItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function settle(outcome: 'eaten' | 'frozen' | 'binned') {
    if (!open) return;
    setBusy(true);
    setError(null);
    const result = await settleItemAction({ id: open.id, outcome });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    celebrate({
      xp: result.reward?.xp,
      levelUp: result.reward?.levelUp,
      unlocked: result.reward?.unlocked,
      message: result.rescued ? 'Rescued before its date' : undefined,
    });
    setOpen(null);
    router.refresh();
  }

  const groups = GROUP_ORDER.map((key) => ({
    key,
    label: FRESHNESS_LABEL[key],
    items: items.filter((item) => item.freshness === key),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.key}>
            <h2
              className={cn(
                'px-1 text-[12.5px] font-semibold uppercase tracking-wide',
                TONE[group.key],
              )}
            >
              {group.label} · {group.items.length}
            </h2>
            <ul className="mt-2 space-y-1.5">
              {group.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setOpen(item);
                    }}
                    className="pressable flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-left"
                  >
                    <span aria-hidden="true" className="shrink-0 text-[24px]">
                      {item.glyph}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium leading-tight">
                        {item.name}
                        {item.quantity > 1 ? (
                          <span className="numeral ml-1.5 text-[12.5px] text-ink-subtle">
                            ×{item.quantity}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-ink-subtle">
                        {[item.brand, item.location].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className={cn('shrink-0 text-[12.5px] font-medium', TONE[item.freshness])}>
                      {item.expiresLabel ?? '—'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Sheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.name ?? ''}
        description={open?.expiresLabel ? `Best before ${open.expiresLabel}` : 'No date on it'}
      >
        <div className="space-y-2 pb-2">
          <Choice
            label="Ate it"
            detail="Off the list, and it counts as rescued if it was still good."
            glyph="😋"
            disabled={busy}
            onClick={() => void settle('eaten')}
          />
          <Choice
            label="Froze it"
            detail="Buys it months. Also counts as a rescue."
            glyph="🧊"
            disabled={busy}
            onClick={() => void settle('frozen')}
          />
          <Choice
            label="Had to bin it"
            detail="Still worth recording. Deciding is the bit that matters."
            glyph="🗑️"
            disabled={busy}
            onClick={() => void settle('binned')}
          />
          {error ? (
            <p role="alert" className="rounded-xl bg-negative-soft px-3.5 py-2.5 text-[13px] text-negative">
              {error}
            </p>
          ) : null}
          <Link
            href="/kitchen/expiry"
            className="block px-1 pt-2 text-center text-[13px] font-medium text-accent"
          >
            Do these one after another instead →
          </Link>
        </div>
      </Sheet>
    </>
  );
}

function Choice({
  label,
  detail,
  glyph,
  disabled,
  onClick,
}: {
  label: string;
  detail: string;
  glyph: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="pressable flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 text-left disabled:opacity-60"
    >
      <span aria-hidden="true" className="shrink-0 text-[24px]">
        {glyph}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold leading-tight">{label}</span>
        <span className="mt-0.5 block text-[12.5px] text-ink-muted">{detail}</span>
      </span>
    </button>
  );
}
