'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCelebrate } from '@/components/play/celebrate';
import { cn } from '@/lib/cn';
import { settleItemAction } from '../actions';
import type { KitchenItem } from '../kitchen-list';

/**
 * Expiry Rush.
 *
 * One card, three buttons, no list. The queue is the whole point: a list of
 * eleven things to decide about is eleven decisions, and a stack of one card
 * is one decision eleven times — which is a completely different feeling for
 * anyone who finds lists paralysing.
 *
 * Binning pays the same as eating. The behaviour being rewarded is deciding.
 */
export function ExpiryDeck({ items }: { items: KitchenItem[] }) {
  const router = useRouter();
  const celebrate = useCelebrate();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tally, setTally] = useState({ rescued: 0, binned: 0 });
  const [leaving, setLeaving] = useState<'eaten' | 'frozen' | 'binned' | null>(null);

  const item = items[index];

  async function decide(outcome: 'eaten' | 'frozen' | 'binned') {
    if (!item || busy) return;
    setBusy(true);
    setError(null);
    setLeaving(outcome);

    const result = await settleItemAction({ id: item.id, outcome });
    setBusy(false);
    setLeaving(null);

    if (result.error) {
      setError(result.error);
      return;
    }
    celebrate({
      xp: result.reward?.xp,
      levelUp: result.reward?.levelUp,
      unlocked: result.reward?.unlocked,
    });
    setTally((t) =>
      outcome === 'binned' ? { ...t, binned: t.binned + 1 } : { ...t, rescued: t.rescued + 1 },
    );
    setIndex((i) => i + 1);
    if (index + 1 >= items.length) router.refresh();
  }

  if (!item) {
    const total = tally.rescued + tally.binned;
    return (
      <div className="rise space-y-5">
        <header className="pt-8 text-center">
          <span aria-hidden="true" className="pop-in inline-block text-[56px]">
            {total > 0 ? '🎉' : '✨'}
          </span>
          <h1 className="mt-2 text-[26px] font-bold tracking-tight">
            {total > 0 ? 'That is the lot' : 'Nothing needs deciding'}
          </h1>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">
            {total > 0
              ? `${tally.rescued} rescued${tally.binned > 0 ? `, ${tally.binned} let go` : ''}. The fridge is honest again.`
              : 'Everything in the kitchen has time left on it.'}
          </p>
        </header>

        <div className="flex gap-2">
          <Link
            href="/kitchen"
            className="pressable flex-1 rounded-2xl py-3.5 text-center text-[15px] font-semibold text-white"
            style={{ background: 'var(--color-play-kitchen)' }}
          >
            The kitchen
          </Link>
          <Link
            href="/dinner"
            className="pressable flex-1 rounded-2xl border border-border bg-surface py-3.5 text-center text-[15px] font-semibold"
          >
            What to cook
          </Link>
        </div>
      </div>
    );
  }

  const urgent = item.freshness === 'expired' || item.freshness === 'today';

  return (
    <div className="rise space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Expiry Rush</h1>
          <p className="text-[13px] text-ink-muted">Eat it, freeze it, or let it go.</p>
        </div>
        <span className="numeral text-[13px] text-ink-muted">
          {index + 1} / {items.length}
        </span>
      </header>

      <div className="meter h-1.5" role="progressbar" aria-valuenow={index} aria-valuemax={items.length}>
        <span
          style={{
            width: `${Math.max((index / items.length) * 100, 2)}%`,
            background: 'var(--color-play-kitchen)',
          }}
        />
      </div>

      <div
        key={item.id}
        className={cn(
          'pop-in rounded-[var(--radius-card)] border-2 bg-surface p-6 text-center',
          urgent ? 'border-negative/40' : 'border-border',
          leaving && 'opacity-50',
        )}
      >
        <span aria-hidden="true" className="text-[56px] leading-none">
          {item.glyph}
        </span>
        <p className="mt-3 text-[22px] font-bold leading-tight tracking-tight">{item.name}</p>
        {item.brand ? <p className="text-[13px] text-ink-subtle">{item.brand}</p> : null}
        <p
          className={cn(
            'mt-2 inline-block rounded-full px-3 py-1 text-[13px] font-semibold',
            urgent ? 'bg-negative-soft text-negative' : 'bg-notice-soft text-notice',
          )}
        >
          {item.expiresLabel ?? 'No date'}
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-negative-soft px-3.5 py-2.5 text-[13px] text-negative">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <Choice glyph="😋" label="Ate it" busy={busy} onClick={() => void decide('eaten')} tone="positive" />
        <Choice glyph="🧊" label="Froze it" busy={busy} onClick={() => void decide('frozen')} tone="accent" />
        <Choice glyph="🗑️" label="Binned" busy={busy} onClick={() => void decide('binned')} tone="muted" />
      </div>

      <p className="px-1 text-center text-[12px] leading-relaxed text-ink-subtle">
        Binning pays the same as eating. Deciding is the part worth rewarding — an honest bin beats
        a fridge full of things nobody will look at again.
      </p>
    </div>
  );
}

const TONE_CLASS = {
  positive: 'bg-positive-soft text-positive',
  accent: 'bg-accent-soft text-accent-ink',
  muted: 'bg-surface-muted text-ink-muted',
} as const;

function Choice({
  glyph,
  label,
  busy,
  onClick,
  tone,
}: {
  glyph: string;
  label: string;
  busy: boolean;
  onClick: () => void;
  tone: keyof typeof TONE_CLASS;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={cn(
        'pressable flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-2xl p-3',
        'text-[13.5px] font-semibold disabled:opacity-60',
        TONE_CLASS[tone],
      )}
    >
      <span aria-hidden="true" className="text-[26px]">
        {glyph}
      </span>
      {label}
    </button>
  );
}
