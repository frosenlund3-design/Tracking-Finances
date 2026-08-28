'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useCelebrate } from '@/components/play/celebrate';
import { finishSortRound, type RoundOutcome } from './actions';
import type { FractionDef, WasteItem } from '@/lib/waste';

/**
 * Sorter!
 *
 * One item, ten bins, and an answer either way. The design decision that
 * matters is what happens when you get it wrong: nothing is taken away, the
 * correct bin lights up, and the reason is stated in one line. A game that
 * punishes a wrong answer teaches people to stop guessing; this one is trying
 * to teach them that a receipt is coated paper.
 */

type Phase = 'asking' | 'right' | 'wrong' | 'done';

export function SortGame({
  round,
  fractions,
  best,
}: {
  round: WasteItem[];
  fractions: FractionDef[];
  best: number;
}) {
  const router = useRouter();
  const celebrate = useCelebrate();

  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [phase, setPhase] = useState<Phase>('asking');
  const [picked, setPicked] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null);
  const [saving, setSaving] = useState(false);
  const startedAt = useRef(Date.now());

  const item = round[index];
  const progress = index / round.length;

  const finish = useCallback(
    async (finalCorrect: number) => {
      setPhase('done');
      setSaving(true);
      const result = await finishSortRound({
        correct: finalCorrect,
        total: round.length,
        durationMs: Date.now() - startedAt.current,
      });
      setOutcome(result);
      setSaving(false);
      if (!result.error) {
        celebrate({
          xp: result.xp,
          levelUp: result.levelUp,
          unlocked: result.unlocked,
          message: result.isBest ? 'New personal best' : undefined,
        });
      }
      // The board's counters and the collection are both now stale.
      router.refresh();
    },
    [celebrate, round.length, router],
  );

  function answer(fraction: string) {
    if (phase !== 'asking' || !item) return;
    const right = fraction === item.answer;
    setPicked(fraction);
    setPhase(right ? 'right' : 'wrong');
    const nextCorrect = right ? correct + 1 : correct;
    if (right) setCorrect(nextCorrect);

    // A correct answer moves on quickly; a wrong one waits, because the line
    // explaining why is the only part of the round that teaches anything.
    setTimeout(
      () => {
        setPicked(null);
        if (index + 1 >= round.length) void finish(nextCorrect);
        else {
          setIndex((i) => i + 1);
          setPhase('asking');
        }
      },
      right ? 700 : 1900,
    );
  }

  if (phase === 'done') {
    return (
      <Results
        correct={correct}
        total={round.length}
        outcome={outcome}
        saving={saving}
        previousBest={best}
      />
    );
  }

  return (
    <div className="rise space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight">Sorter!</h1>
          <p className="text-[13px] text-ink-muted">Which bin does it go in?</p>
        </div>
        <span className="numeral text-[13px] text-ink-muted">
          {index + 1} / {round.length}
        </span>
      </header>

      <div className="meter h-1.5" role="progressbar" aria-valuenow={index} aria-valuemax={round.length}>
        <span
          style={{ width: `${Math.max(progress * 100, 2)}%`, background: 'var(--color-play-home)' }}
        />
      </div>

      <div
        className={cn(
          'rounded-[var(--radius-card)] border border-border bg-surface p-6 text-center',
          phase === 'right' && 'flash-right',
          phase === 'wrong' && 'shake',
        )}
      >
        <p className="text-[13px] font-medium uppercase tracking-wide text-ink-subtle">
          {item?.danish}
        </p>
        <p className="mt-1 text-[26px] font-bold leading-tight tracking-tight">{item?.name}</p>
        {item?.tricky ? (
          <span className="mt-2 inline-block rounded-full bg-notice-soft px-2.5 py-1 text-[11.5px] font-semibold text-notice">
            People get this one wrong
          </span>
        ) : null}

        <div className="mt-4 min-h-[3.25rem]">
          {phase === 'asking' ? (
            <p className="text-[13px] text-ink-subtle">Tap a bin below.</p>
          ) : (
            <div className="fade-in">
              <p
                className={cn(
                  'text-[15px] font-semibold',
                  phase === 'right' ? 'text-positive' : 'text-negative',
                )}
              >
                {phase === 'right' ? 'Right' : `It goes in ${labelOf(fractions, item!.answer)}`}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{item?.why}</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {fractions.map((fraction) => {
          const isAnswer = phase !== 'asking' && item?.answer === fraction.key;
          const isPicked = picked === fraction.key;
          return (
            <button
              key={fraction.key}
              type="button"
              disabled={phase !== 'asking'}
              onClick={() => answer(fraction.key)}
              className={cn(
                'pressable rounded-2xl border-2 p-3 text-left transition-all',
                isAnswer
                  ? 'border-positive bg-positive-soft'
                  : isPicked
                    ? 'border-negative bg-negative-soft'
                    : 'border-transparent bg-surface',
                phase !== 'asking' && !isAnswer && !isPicked && 'opacity-45',
              )}
              style={
                !isAnswer && !isPicked ? { boxShadow: `inset 0 0 0 2px ${fraction.color}33` } : undefined
              }
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[15px]"
                  style={{ background: fraction.color, color: '#fff' }}
                >
                  {fraction.glyph}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold leading-tight">
                    {fraction.label}
                  </span>
                  <span className="block truncate text-[11px] text-ink-subtle">
                    {fraction.english}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="px-1 text-center text-[12px] text-ink-subtle">
        Nothing is taken away for a wrong answer. Best so far: {best}
      </p>
    </div>
  );
}

function labelOf(fractions: FractionDef[], key: string): string {
  return fractions.find((f) => f.key === key)?.label ?? key;
}

function Results({
  correct,
  total,
  outcome,
  saving,
  previousBest,
}: {
  correct: number;
  total: number;
  outcome: RoundOutcome | null;
  saving: boolean;
  previousBest: number;
}) {
  const flawless = correct === total;
  return (
    <div className="rise space-y-5">
      <header className="pt-6 text-center">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
          Round over
        </p>
        <p className="numeral mt-1 text-[56px] font-bold leading-none tracking-tight">
          {outcome?.score ?? '—'}
        </p>
        <p className="mt-1 text-[15px] text-ink-muted">
          {correct} of {total} right{flawless ? ' — the whole round' : ''}
        </p>
      </header>

      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 text-center">
        {outcome?.error ? (
          <p role="alert" className="text-[14px] text-negative">
            {outcome.error}
          </p>
        ) : saving ? (
          <p className="text-[14px] text-ink-muted">Saving…</p>
        ) : (
          <>
            <p className="text-[15px] font-medium">
              {outcome?.isBest ? 'New personal best' : `Best: ${outcome?.best ?? previousBest}`}
            </p>
            {outcome?.xp ? (
              <p className="numeral mt-1 text-[13px] text-ink-muted">+{outcome.xp} XP</p>
            ) : null}
            {flawless ? (
              <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                A clean round is worth 60 on top. That is the bonus, not the point.
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="flex gap-2">
        <Link
          href="/sort"
          className="pressable flex-1 rounded-2xl py-3.5 text-center text-[15px] font-semibold text-white"
          style={{ background: 'var(--color-play-home)' }}
        >
          Again
        </Link>
        <Link
          href="/play"
          className="pressable flex-1 rounded-2xl border border-border bg-surface py-3.5 text-center text-[15px] font-semibold"
        >
          Back to the board
        </Link>
      </div>

      <Link
        href="/sort/bins"
        className="pressable block rounded-2xl border border-border bg-surface p-4"
      >
        <p className="text-[14px] font-semibold">Which bins do you actually have?</p>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">
          Sorting advice is no use without somewhere to put the result.
        </p>
      </Link>
    </div>
  );
}
