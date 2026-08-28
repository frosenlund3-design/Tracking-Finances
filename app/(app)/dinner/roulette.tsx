'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCelebrate } from '@/components/play/celebrate';
import { Sheet } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { clearMealAction, markCookedAction, planMealAction } from './actions';

export interface DinnerCard {
  key: string;
  name: string;
  blurb: string;
  minutes: number;
  serves: number;
  effort: string;
  coverage: number;
  have: string[];
  missing: string[];
  rescues: string[];
  steps: string[];
  tags: string[];
}

export interface WeekDay {
  date: string;
  label: string;
  weekday: string;
  recipeName: string | null;
  status: 'planned' | 'cooked' | 'skipped' | null;
}

/**
 * Dinner Roulette.
 *
 * The spin is theatre, but the result is not random: the wheel is loaded
 * towards the recipes you can very nearly make, and loaded hardest towards
 * the ones that use up something about to go off. Deciding what is for dinner
 * is the single most reliably exhausting decision of a weekday, so the app
 * makes it and lets you veto — which is a far easier thing to do than choose.
 */
export function Roulette({
  cards,
  week,
  todayIso,
}: {
  cards: DinnerCard[];
  week: WeekDay[];
  todayIso: string;
}) {
  const router = useRouter();
  const celebrate = useCelebrate();
  const [index, setIndex] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickDate, setPickDate] = useState(todayIso);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Every timer this component starts has to die with it, or a spin left
  // running updates state on an unmounted tree.
  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current = [];
    },
    [],
  );

  const spin = useCallback(() => {
    if (spinning || cards.length < 2) return;
    setSpinning(true);
    // Slowing down: eight steps, each a little longer than the last.
    let step = 0;
    const tick = () => {
      setIndex((i) => (i + 1) % cards.length);
      step += 1;
      if (step >= 8) {
        setSpinning(false);
        return;
      }
      timers.current.push(setTimeout(tick, 60 + step * 38));
    };
    timers.current.push(setTimeout(tick, 60));
  }, [cards.length, spinning]);

  const card = cards[index];

  async function plan(date: string) {
    if (!card) return;
    setBusy(true);
    setError(null);
    const result = await planMealAction({ date, recipeKey: card.key });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    celebrate({ xp: result.reward?.xp, levelUp: result.reward?.levelUp, unlocked: result.reward?.unlocked });
    setOpen(false);
    router.refresh();
  }

  async function cooked(date: string) {
    setBusy(true);
    const result = await markCookedAction({ date });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    celebrate({
      xp: result.reward?.xp,
      levelUp: result.reward?.levelUp,
      unlocked: result.reward?.unlocked,
      message: result.recipeName ? 'Dinner done' : undefined,
    });
    router.refresh();
  }

  if (!card) {
    return (
      <p className="rounded-2xl border border-border bg-surface p-5 text-[14px] text-ink-muted">
        No recipes available.
      </p>
    );
  }

  const tonight = week[0];

  return (
    <div className="rise space-y-4">
      <header>
        <h1 className="text-[28px] font-bold tracking-tight">Dinner</h1>
        <p className="mt-0.5 text-[13.5px] text-ink-muted">
          Loaded towards what you already have — hardest towards what is about to go off.
        </p>
      </header>

      {tonight?.recipeName ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">Tonight</p>
          <p className="mt-0.5 text-[19px] font-bold tracking-tight">{tonight.recipeName}</p>
          <div className="mt-3 flex gap-2">
            {tonight.status === 'cooked' ? (
              <span className="rounded-full bg-positive-soft px-3 py-1.5 text-[13px] font-semibold text-positive">
                Cooked ✓
              </span>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void cooked(tonight.date)}
                  className="pressable rounded-full bg-accent px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-60"
                >
                  I cooked it
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await clearMealAction({ date: tonight.date });
                    setBusy(false);
                    router.refresh();
                  }}
                  className="pressable rounded-full border border-border px-4 py-2 text-[13.5px] font-medium disabled:opacity-60"
                >
                  Change it
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          'rounded-[var(--radius-card)] p-5 text-white shadow-raised transition-transform',
          spinning && 'scale-[0.98]',
        )}
        style={{ background: 'var(--color-play-body)' }}
      >
        <div className={cn(spinning ? 'opacity-70' : 'pop-in')} key={card.key}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-[22px] font-bold leading-tight tracking-tight">{card.name}</p>
            <span className="numeral shrink-0 rounded-full bg-black/25 px-2.5 py-1 text-[12px] font-bold">
              {card.minutes} min
            </span>
          </div>
          <p className="mt-1 text-[13.5px] leading-relaxed text-white/85">{card.blurb}</p>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/25">
            <span
              className="block h-full rounded-full bg-white transition-[width] duration-500"
              style={{ width: `${Math.max(card.coverage * 100, 3)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[12.5px] text-white/80">
            You have {card.have.length} of {card.have.length + card.missing.length} ingredients
            {card.missing.length > 0 ? ` · missing ${card.missing.join(', ').toLowerCase()}` : ''}
          </p>

          {card.rescues.length > 0 ? (
            <p className="mt-2 rounded-xl bg-black/25 px-3 py-2 text-[12.5px] leading-relaxed">
              Uses up your {card.rescues.join(' and ').toLowerCase()} — which is why it came up.
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={spin}
          disabled={spinning}
          className="pressable flex-1 rounded-2xl bg-play-ink py-3.5 text-[15px] font-bold text-white disabled:opacity-70"
        >
          {spinning ? 'Spinning…' : '🎰 Spin again'}
        </button>
        <button
          type="button"
          onClick={() => {
            setPickDate(todayIso);
            setError(null);
            setOpen(true);
          }}
          disabled={busy || spinning}
          className="pressable flex-1 rounded-2xl border border-border bg-surface py-3.5 text-[15px] font-semibold disabled:opacity-60"
        >
          This one
        </button>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-negative-soft px-3.5 py-2.5 text-[13px] text-negative">
          {error}
        </p>
      ) : null}

      <details className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <summary className="cursor-pointer list-none text-[14px] font-semibold">
          How to make it
          <span className="ml-1.5 text-[12.5px] font-normal text-ink-subtle">
            · {card.serves} servings · {card.effort}
          </span>
        </summary>
        <ol className="mt-3 space-y-2">
          {card.steps.map((step, i) => (
            <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed">
              <span className="numeral shrink-0 text-ink-subtle">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </details>

      <section>
        <h2 className="px-1 text-[12.5px] font-semibold uppercase tracking-wide text-ink-subtle">
          This week
        </h2>
        <ul className="mt-2 space-y-1.5">
          {week.map((day) => (
            <li
              key={day.date}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
            >
              <span
                className={cn(
                  'w-12 shrink-0 text-[12.5px] font-semibold',
                  day.date === todayIso ? 'text-ink' : 'text-ink-subtle',
                )}
              >
                {day.weekday}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px]">
                {day.recipeName ?? <span className="text-ink-subtle">Nothing yet</span>}
              </span>
              {day.status === 'cooked' ? (
                <span className="shrink-0 text-[13px] text-positive">✓</span>
              ) : (
                <button
                  type="button"
                  disabled={busy || spinning}
                  onClick={() => void plan(day.date)}
                  className="pressable shrink-0 rounded-full bg-surface-muted px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60"
                >
                  {day.recipeName ? 'Replace' : 'Put it here'}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`When are you making ${card.name.toLowerCase()}?`}
      >
        <div className="space-y-1.5 pb-2">
          {week.map((day) => (
            <button
              key={day.date}
              type="button"
              disabled={busy}
              onClick={() => void plan(day.date)}
              className={cn(
                'pressable flex w-full items-center justify-between gap-3 rounded-2xl border border-border p-3.5 text-left',
                day.date === pickDate ? 'bg-accent-soft' : 'bg-surface',
              )}
            >
              <span>
                <span className="block text-[15px] font-semibold">{day.label}</span>
                {day.recipeName ? (
                  <span className="block text-[12.5px] text-ink-subtle">
                    Replaces {day.recipeName.toLowerCase()}
                  </span>
                ) : null}
              </span>
              <span aria-hidden="true" className="text-ink-subtle">
                ›
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
