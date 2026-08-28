'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useCelebrate } from '@/components/play/celebrate';
import { feedback, play, primeSound } from '@/lib/sound';
import { emojiFile } from '@/lib/games/art';
import { blockedBy, formatDuration, planSteps, type PlannedStep } from '@/lib/games/plan';
import {
  DIFFICULTY_BONUS,
  DIFFICULTY_LABEL,
  type Difficulty,
  type Game,
} from '@/lib/games/catalog';
import { finishGameAction, type FinishOutcome } from '../actions';

/**
 * Spilmotoren.
 *
 * Tre tilstande: vælg sværhedsgrad, spil, se resultatet. Motoren indeni
 * afhænger af spillets `kind`, men rammen omkring — uret, lyden, pointene,
 * fejringen — er den samme, så toogtres spil opfører sig ens.
 *
 * Uret tæller op, ikke ned. En nedtælling der rammer nul er en fiasko, og
 * ingenting her må kunne mislykkes: man kan stoppe når som helst, og det
 * man nåede tæller.
 */

type Phase = 'valg' | 'spiller' | 'faerdig';

export function GameRunner({ game, best }: { game: Game; best: number }) {
  const router = useRouter();
  const celebrate = useCelebrate();

  const [phase, setPhase] = useState<Phase>('valg');
  const [difficulty, setDifficulty] = useState<Difficulty>('mellem');
  const [done, setDone] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [outcome, setOutcome] = useState<FinishOutcome | null>(null);
  const [saving, setSaving] = useState(false);
  const [blockedNote, setBlockedNote] = useState<string | null>(null);
  const startedAt = useRef(0);

  const plan = useMemo(() => planSteps(game.steps ?? [], difficulty), [game.steps, difficulty]);
  const total = game.kind === 'steps' ? plan.steps.length : (game.target ?? 1);
  const reached = game.kind === 'steps' ? done.size : count;

  // Uret. Stoppes når runden er slut, og ryddes altid ved unmount.
  useEffect(() => {
    if (phase !== 'spiller') return;
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const start = useCallback(() => {
    primeSound();
    startedAt.current = Date.now();
    setElapsed(0);
    setDone(new Set());
    setCount(0);
    setOutcome(null);
    setPhase('spiller');
    feedback('start', 18);
  }, []);

  const finish = useCallback(
    async (finalDone: number) => {
      setPhase('faerdig');
      setSaving(true);
      play(finalDone >= total ? 'faerdig' : 'trin');

      const result = await finishGameAction({
        gameId: game.id,
        difficulty,
        done: finalDone,
        total,
        seconds: Math.round((Date.now() - startedAt.current) / 1000),
      });
      setOutcome(result);
      setSaving(false);

      if (!result.error) {
        celebrate({
          xp: result.reward?.xp,
          levelUp: result.reward?.levelUp,
          unlocked: result.reward?.unlocked,
          message: result.isBest ? 'Ny personlig rekord' : undefined,
        });
        if (result.reward?.levelUp) play('niveau');
        else if (result.reward?.unlocked?.length) play('figur');
      }
      router.refresh();
    },
    [celebrate, difficulty, game.id, router, total],
  );

  function toggleStep(step: PlannedStep) {
    const already = done.has(step.id);
    if (already) {
      const next = new Set(done);
      next.delete(step.id);
      setDone(next);
      feedback('tap', 8);
      return;
    }

    const blocking = blockedBy(step, done, plan.steps);
    if (blocking.length > 0) {
      // Ikke deaktiveret — forklaret. En knap der ikke virker uden at sige
      // hvorfor, er en fejl; en der siger hvorfor, er en oplysning.
      setBlockedNote(`Tag “${blocking[0]!.text.toLowerCase()}” først. ${step.why ?? ''}`.trim());
      play('forkert');
      setTimeout(() => setBlockedNote(null), 4000);
      return;
    }

    const next = new Set(done);
    next.add(step.id);
    setDone(next);
    feedback('trin', 14);
    if (next.size >= total) void finish(next.size);
  }

  function bump(delta: number) {
    const next = Math.max(0, Math.min(count + delta, total));
    setCount(next);
    if (delta > 0) feedback('trin', 14);
    else feedback('tap', 8);
    if (next >= total) void finish(next);
  }

  /* ---------------------------------------------------------- sværhedsgrad */

  if (phase === 'valg') {
    return (
      <div className="rise space-y-5" onPointerDownCapture={() => primeSound()}>
        {/* Overskriften viser planens tid, ikke katalogets, så de to tal på
            skærmen ikke er uenige om hvor lang tid det tager. */}
        <GameHeader
          game={game}
          best={best}
          seconds={game.kind === 'steps' ? plan.totalSeconds : game.seconds}
        />

        {game.kind === 'steps' && plan.insights.length > 0 ? (
          <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
            <p className="text-[13px] font-bold uppercase tracking-wide text-accent">
              Rækkefølgen betyder noget
            </p>
            <ul className="mt-2 space-y-2.5">
              {plan.insights.map((insight) => (
                <li key={insight.id}>
                  <p className="text-[14px] font-semibold leading-tight">{insight.text}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">
                    {insight.why}
                  </p>
                </li>
              ))}
            </ul>
            {savesTime(plan.totalSeconds, plan.naiveSeconds) ? (
              <p className="mt-3 rounded-xl bg-positive-soft px-3 py-2 text-[12.5px] leading-relaxed text-positive">
                I den rækkefølge er du færdig efter omkring {formatDuration(plan.totalSeconds)} i
                stedet for {formatDuration(plan.naiveSeconds)} — du sparer{' '}
                {formatDuration(plan.naiveSeconds - plan.totalSeconds)} ventetid.
              </p>
            ) : null}

            {plan.handsOnSeconds < plan.totalSeconds * 0.75 ? (
              <p className="mt-2 rounded-xl bg-surface-muted px-3 py-2 text-[12.5px] leading-relaxed text-ink-muted">
                Det tager {formatDuration(plan.totalSeconds)} fra ende til anden — men kun{' '}
                {formatDuration(plan.handsOnSeconds)} af dem er dig. Resten kører selv.
              </p>
            ) : null}
          </div>
        ) : null}

        <div>
          <p className="px-1 text-[12.5px] font-semibold uppercase tracking-wide text-ink-subtle">
            Sværhedsgrad
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(['let', 'mellem', 'svaer'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => {
                  setDifficulty(level);
                  feedback('tap', 8);
                }}
                aria-pressed={difficulty === level}
                className={cn(
                  'pressable rounded-2xl border-2 p-3 text-center',
                  difficulty === level
                    ? 'border-accent bg-accent-soft'
                    : 'border-transparent bg-surface',
                )}
              >
                <span className="block text-[14.5px] font-bold">{DIFFICULTY_LABEL[level]}</span>
                <span className="mt-0.5 block text-[11.5px] text-ink-subtle">
                  ×{DIFFICULTY_BONUS[level]} XP
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 px-1 text-[12px] leading-relaxed text-ink-subtle">
            Sværere giver mere tid på uret og flere point. Der er ingen straf for at vælge let —
            det er den samme opgave.
          </p>
        </div>

        <button
          type="button"
          onClick={start}
          className="pressable w-full rounded-2xl bg-play-ink py-4 text-[17px] font-bold text-white"
        >
          Start
        </button>
      </div>
    );
  }

  /* --------------------------------------------------------------- spiller */

  if (phase === 'spiller') {
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const par = game.kind === 'steps' ? plan.totalSeconds : game.seconds;

    return (
      <div className="rise space-y-4" onPointerDownCapture={() => primeSound()}>
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-bold tracking-tight">{game.name}</h1>
            <p className="text-[12.5px] text-ink-muted">
              {DIFFICULTY_LABEL[difficulty]} · {reached} af {total}
            </p>
          </div>
          <p
            className={cn(
              'numeral shrink-0 text-[26px] font-bold tabular-nums',
              par > 0 && elapsed > par ? 'text-notice' : 'text-ink',
            )}
          >
            {minutes}:{String(seconds).padStart(2, '0')}
          </p>
        </header>

        <div className="meter h-1.5" role="progressbar" aria-valuenow={reached} aria-valuemax={total}>
          <span
            style={{
              width: `${Math.max((reached / total) * 100, 2)}%`,
              background: 'var(--color-play-xp)',
            }}
          />
        </div>

        {blockedNote ? (
          <p role="status" className="shake rounded-xl bg-notice-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-notice">
            {blockedNote}
          </p>
        ) : null}

        {game.kind === 'steps' ? (
          <ol className="space-y-2">
            {plan.steps.map((step) => {
              const isDone = done.has(step.id);
              const blocking = blockedBy(step, done, plan.steps);
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => toggleStep(step)}
                    aria-pressed={isDone}
                    className={cn(
                      'pressable flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors',
                      isDone
                        ? 'border-positive bg-positive-soft'
                        : blocking.length > 0
                          ? 'border-border bg-surface opacity-55'
                          : 'border-border bg-surface',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
                        isDone ? 'bg-positive text-white' : 'bg-surface-muted text-ink-subtle',
                      )}
                    >
                      {isDone ? '✓' : step.order}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-[15px] font-medium leading-snug',
                          isDone && 'text-positive line-through decoration-2',
                        )}
                      >
                        {step.text}
                      </span>
                      {step.background && !isDone ? (
                        <span className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-ink">
                          kører videre uden dig
                        </span>
                      ) : null}
                      {step.why && !isDone && blocking.length === 0 ? (
                        <span className="mt-1 block text-[12px] leading-relaxed text-ink-subtle">
                          {step.why}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <Counter
            game={game}
            count={count}
            total={total}
            onBump={bump}
          />
        )}

        <button
          type="button"
          onClick={() => void finish(reached)}
          className="pressable w-full rounded-2xl border border-border bg-surface py-3.5 text-[15px] font-semibold"
        >
          {reached > 0 ? `Stop her — gem ${reached} af ${total}` : 'Stop'}
        </button>

        <p className="px-1 text-center text-[12px] leading-relaxed text-ink-subtle">
          Halvfærdigt tæller. Du får point for det du nåede.
        </p>
      </div>
    );
  }

  /* --------------------------------------------------------------- færdig */

  return (
    <div className="rise space-y-5">
      <header className="pt-6 text-center">
        <img
          src={emojiFile(game.emoji)}
          alt=""
          aria-hidden="true"
          className="pop-in mx-auto h-24 w-24 drop-shadow-lg"
        />
        <p className="mt-2 text-[13px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
          {outcome?.completed ? 'Gennemført' : 'Så langt kom du'}
        </p>
        <p className="numeral mt-1 text-[52px] font-bold leading-none tracking-tight">
          +{outcome?.score ?? 0}
        </p>
        <p className="mt-1 text-[15px] text-ink-muted">
          {reached} af {total} · {formatDuration(elapsed)}
        </p>
      </header>

      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 text-center">
        {outcome?.error ? (
          <p role="alert" className="text-[14px] text-negative">
            {outcome.error}
          </p>
        ) : saving ? (
          <p className="text-[14px] text-ink-muted">Gemmer…</p>
        ) : (
          <>
            <p className="text-[15px] font-semibold">
              {outcome?.isBest ? 'Ny personlig rekord' : `Bedste: ${outcome?.best ?? best}`}
            </p>
            {!outcome?.completed && reached > 0 ? (
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
                Resten står der stadig. Den er ikke blevet sværere af at vente.
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPhase('valg')}
          className="pressable flex-1 rounded-2xl bg-play-ink py-3.5 text-[15px] font-bold text-white"
        >
          Igen
        </button>
        <Link
          href="/play"
          className="pressable flex-1 rounded-2xl border border-border bg-surface py-3.5 text-center text-[15px] font-semibold"
        >
          Tilbage til brættet
        </Link>
      </div>
    </div>
  );
}

/**
 * Er besparelsen værd at nævne?
 *
 * To minutter og en sjettedel af tiden. Uden den tærskel skriver skærmen
 * "omkring 11 min i stedet for 11 min", og så er der ingen grund til at tro
 * på nogen af de andre tal den viser.
 */
function savesTime(planned: number, naive: number): boolean {
  return naive - planned >= 120 && planned <= naive * 0.85;
}

function GameHeader({ game, best, seconds }: { game: Game; best: number; seconds: number }) {
  return (
    <header className="flex items-start gap-4">
      <img
        src={emojiFile(game.emoji)}
        alt=""
        aria-hidden="true"
        className="h-20 w-20 shrink-0 drop-shadow-md"
      />
      <div className="min-w-0 flex-1">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight">{game.name}</h1>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">{game.tagline}</p>
        <p className="mt-1.5 text-[12.5px] text-ink-subtle">
          {seconds > 0 ? `${formatDuration(seconds)} · ` : ''}
          op til {game.xp} XP
          {best > 0 ? ` · bedste ${best}` : ''}
        </p>
      </div>
    </header>
  );
}

/** Tælleren, til de spil hvor målet er et antal frem for en række trin. */
function Counter({
  game,
  count,
  total,
  onBump,
}: {
  game: Game;
  count: number;
  total: number;
  onBump: (delta: number) => void;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 text-center">
      <p className="numeral text-[64px] font-bold leading-none tracking-tight">
        {count}
        <span className="text-[24px] text-ink-subtle"> / {total}</span>
      </p>
      <p className="mt-1 text-[14px] text-ink-muted">{game.targetUnit}</p>

      <div className="mt-5 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => onBump(-1)}
          disabled={count === 0}
          aria-label="En mindre"
          className="pressable h-14 w-14 rounded-2xl bg-surface-muted text-[24px] font-bold disabled:opacity-40"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => onBump(1)}
          disabled={count >= total}
          aria-label="En mere"
          className="pressable h-20 flex-1 rounded-2xl text-[28px] font-bold text-white disabled:opacity-60"
          style={{ background: 'var(--color-play-xp)' }}
        >
          +1
        </button>
      </div>
    </div>
  );
}
