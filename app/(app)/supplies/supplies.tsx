'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCelebrate } from '@/components/play/celebrate';
import { Button, Input, Sheet } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { archiveSupplyAction, createSupplyAction, restockAction } from './actions';

export interface SupplyRow {
  id: string;
  name: string;
  icon: string;
  typicalDays: number;
  daysLeft: number | null;
  runsOutLabel: string | null;
  state: 'unknown' | 'plenty' | 'soon' | 'out';
}

const STATE_TONE: Record<SupplyRow['state'], string> = {
  out: 'bg-negative-soft text-negative',
  soon: 'bg-notice-soft text-notice',
  plenty: 'bg-surface-muted text-ink-muted',
  unknown: 'bg-surface-muted text-ink-subtle',
};

const STARTERS = [
  { name: 'Toilet paper', icon: '🧻', typicalDays: 21 },
  { name: 'Dishwasher tabs', icon: '🫧', typicalDays: 45 },
  { name: 'Laundry detergent', icon: '🧴', typicalDays: 60 },
  { name: 'Bin bags', icon: '🗑️', typicalDays: 40 },
  { name: 'Kitchen roll', icon: '🧻', typicalDays: 30 },
  { name: 'Toothpaste', icon: '🪥', typicalDays: 45 },
  { name: 'Coffee', icon: '☕', typicalDays: 20 },
  { name: 'Cat litter', icon: '🐈', typicalDays: 25 },
];

/**
 * The things that run out silently.
 *
 * The estimate is honest about what it is: one purchase divided by how long
 * one usually lasts. It says "probably" everywhere, because the alternative —
 * a confident countdown built on one data point — is the kind of thing that
 * makes a person stop trusting every other number in the app.
 */
export function Supplies({ supplies }: { supplies: SupplyRow[] }) {
  const router = useRouter();
  const celebrate = useCelebrate();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', icon: '📦', typicalDays: 30 });
  const [error, setError] = useState<string | null>(null);

  async function restock(id: string) {
    setBusy(id);
    const result = await restockAction({ id });
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.reward?.xp) {
      celebrate({
        xp: result.reward.xp,
        levelUp: result.reward.levelUp,
        unlocked: result.reward.unlocked,
      });
    }
    router.refresh();
  }

  async function create(input: { name: string; icon: string; typicalDays: number }) {
    setBusy('new');
    const result = await createSupplyAction(input);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setAdding(false);
    setDraft({ name: '', icon: '📦', typicalDays: 30 });
    router.refresh();
  }

  const existing = new Set(supplies.map((s) => s.name.toLowerCase()));
  const unused = STARTERS.filter((s) => !existing.has(s.name.toLowerCase()));

  return (
    <div className="rise space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Supplies</h1>
          <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-muted">
            Things that run out quietly, and roughly when.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setAdding(true);
          }}
          className="pressable shrink-0 rounded-full px-4 py-2.5 text-[14px] font-semibold text-white"
          style={{ background: 'var(--color-play-home)' }}
        >
          Add
        </button>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl bg-negative-soft px-3.5 py-2.5 text-[13px] text-negative">
          {error}
        </p>
      ) : null}

      {supplies.length > 0 ? (
        <ul className="space-y-2">
          {supplies.map((supply) => (
            <li
              key={supply.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5"
            >
              <span aria-hidden="true" className="shrink-0 text-[24px]">
                {supply.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold leading-tight">{supply.name}</p>
                <p className="mt-0.5 text-[12.5px] text-ink-muted">
                  {supply.state === 'unknown'
                    ? `Lasts about ${supply.typicalDays} days — mark it bought to start the estimate`
                    : supply.state === 'out'
                      ? 'Probably out by now'
                      : `Probably runs out ${supply.runsOutLabel}`}
                </p>
              </div>
              <button
                type="button"
                disabled={busy === supply.id}
                onClick={() => void restock(supply.id)}
                className={cn(
                  'pressable shrink-0 rounded-full px-3 py-2 text-[12.5px] font-semibold disabled:opacity-60',
                  STATE_TONE[supply.state],
                )}
              >
                Bought it
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {unused.length > 0 ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <p className="text-[14px] font-semibold">
            {supplies.length === 0 ? 'Start with the usual suspects' : 'Add another'}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {unused.map((starter) => (
              <button
                key={starter.name}
                type="button"
                disabled={busy !== null}
                onClick={() => void create(starter)}
                className="pressable rounded-full border border-border bg-surface px-3 py-2 text-[13.5px] disabled:opacity-60"
              >
                {starter.icon} {starter.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="px-1 text-[12.5px] leading-relaxed text-ink-subtle">
        The estimate is one purchase divided by how long one usually lasts. It says "probably"
        because that is genuinely all it knows.
      </p>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Something that runs out">
        <form
          className="space-y-3 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create(draft);
          }}
        >
          <div className="flex flex-wrap gap-1.5">
            {['📦', '🧻', '🫧', '🧴', '🗑️', '🪥', '☕', '🐈', '💊', '🔋'].map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, icon }))}
                className={cn(
                  'pressable h-11 w-11 rounded-xl text-[20px]',
                  draft.icon === icon ? 'bg-accent-soft' : 'bg-surface-muted',
                )}
              >
                {icon}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-ink-muted">What is it</span>
            <Input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Contact lenses"
              maxLength={60}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-ink-muted">
              How many days does one last
            </span>
            <Input
              type="number"
              min={1}
              max={3650}
              value={draft.typicalDays}
              onChange={(e) =>
                setDraft((d) => ({ ...d, typicalDays: Math.max(1, Number(e.target.value) || 1) }))
              }
            />
          </label>
          <Button type="submit" full disabled={busy !== null || draft.name.trim().length === 0}>
            Add it
          </Button>
        </form>
      </Sheet>

      {supplies.length > 0 ? (
        <details className="px-1">
          <summary className="cursor-pointer list-none text-[12.5px] text-ink-subtle">
            Remove one
          </summary>
          <ul className="mt-2 space-y-1">
            {supplies.map((supply) => (
              <li key={supply.id}>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy(supply.id);
                    await archiveSupplyAction({ id: supply.id });
                    setBusy(null);
                    router.refresh();
                  }}
                  className="text-[13px] text-negative disabled:opacity-60"
                >
                  Remove {supply.name}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
