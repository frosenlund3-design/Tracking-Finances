'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CreatureArt } from '@/components/creature';
import { creature as lookupCreature } from '@/lib/creatures';
import { RARITY_LABEL, type Creature } from '@/lib/creatures';
import { cn } from '@/lib/cn';

/**
 * The reward moment.
 *
 * One provider so that every screen celebrates identically: points float up
 * from where the thumb was, a level-up gets confetti, and a new creature stops
 * everything and introduces itself. Anything less than a full stop for a new
 * creature and the collection stops feeling like it is worth having.
 *
 * All of it is skippable — tap anywhere — and all of it respects
 * prefers-reduced-motion, because a celebration that cannot be dismissed is
 * an obstacle.
 */

export interface Celebration {
  xp?: number;
  levelUp?: number | null;
  unlocked?: string[];
  message?: string;
}

interface CelebrateContext {
  celebrate: (event: Celebration) => void;
}

const Ctx = createContext<CelebrateContext>({ celebrate: () => {} });

export function useCelebrate(): (event: Celebration) => void {
  return useContext(Ctx).celebrate;
}

let nextId = 0;

interface Floater {
  id: number;
  text: string;
}

export function CelebrateProvider({ children }: { children: React.ReactNode }) {
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [confetti, setConfetti] = useState(0);
  const [queue, setQueue] = useState<Creature[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const celebrate = useCallback((event: Celebration) => {
    if (event.xp && event.xp > 0) {
      const id = (nextId += 1);
      setFloaters((f) => [...f, { id, text: `+${event.xp} XP` }]);
      setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 1600);
    }
    if (event.message) {
      const id = (nextId += 1);
      setFloaters((f) => [...f, { id, text: event.message! }]);
      setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 1800);
    }
    if (event.levelUp) setConfetti((n) => n + 1);
    if (event.unlocked?.length) {
      const found = event.unlocked
        .map((key) => lookupCreature(key))
        .filter((c): c is Creature => Boolean(c));
      if (found.length > 0) {
        setQueue((q) => [...q, ...found]);
        setConfetti((n) => n + 1);
      }
    }
  }, []);

  const value = useMemo(() => ({ celebrate }), [celebrate]);
  const current = queue[0] ?? null;

  return (
    <Ctx.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <>
              <div
                aria-live="polite"
                className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex flex-col items-center gap-1"
              >
                {floaters.map((floater) => (
                  <span
                    key={floater.id}
                    className="xp-float rounded-full bg-play-ink px-3.5 py-1.5 text-[14px] font-semibold text-white shadow-raised"
                  >
                    {floater.text}
                  </span>
                ))}
              </div>
              {confetti > 0 ? <Confetti key={confetti} /> : null}
              {current ? (
                <UnlockCard
                  creature={current}
                  onDismiss={() => setQueue((q) => q.slice(1))}
                  remaining={queue.length - 1}
                />
              ) : null}
            </>,
            document.body,
          )
        : null}
    </Ctx.Provider>
  );
}

const CONFETTI_COLORS = ['#f5a524', '#3987e5', '#2fbf71', '#e0518d', '#8b5cf6', '#f97316'];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        left: `${4 + Math.random() * 92}%`,
        dx: `${(Math.random() - 0.5) * 180}px`,
        spin: `${Math.round((Math.random() - 0.5) * 900)}deg`,
        dur: `${1.5 + Math.random() * 1.1}s`,
        delay: `${Math.random() * 0.35}s`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
      })),
    [],
  );
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setGone(true), 3200);
    return () => clearTimeout(timer);
  }, []);
  if (gone) return null;

  return (
    <div aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="confetti-piece"
          style={
            {
              left: piece.left,
              background: piece.color,
              '--dx': piece.dx,
              '--spin': piece.spin,
              '--dur': piece.dur,
              '--delay': piece.delay,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

const RARITY_RING: Record<string, string> = {
  common: 'from-slate-400/40 to-slate-500/10',
  rare: 'from-sky-400/60 to-sky-500/10',
  epic: 'from-violet-400/70 to-fuchsia-500/10',
  legendary: 'from-amber-300/90 to-orange-500/20',
};

function UnlockCard({
  creature,
  onDismiss,
  remaining,
}: {
  creature: Creature;
  onDismiss: () => void;
  remaining: number;
}) {
  // Escape as well as tap: a modal that only closes one way is a trap on a
  // keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`New: ${creature.name}`}
      onClick={onDismiss}
      className="fade-in fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
    >
      <div
        className={cn(
          'pop-in w-full max-w-xs rounded-[2rem] bg-gradient-to-b p-[2px]',
          RARITY_RING[creature.rarity] ?? RARITY_RING.common,
          creature.rarity === 'legendary' && 'holo',
        )}
      >
        <div className="rounded-[calc(2rem-2px)] bg-surface p-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            {RARITY_LABEL[creature.rarity]} · new
          </p>
          <CreatureArt creature={creature} className="mx-auto mt-3 h-32 w-32" />
          <h2 className="mt-2 text-[24px] font-bold tracking-tight">{creature.name}</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">{creature.blurb}</p>
          <p className="mt-3 rounded-xl bg-surface-muted px-3 py-2 text-[12.5px] text-ink-subtle">
            {creature.unlock}
          </p>
          <button
            type="button"
            onClick={onDismiss}
            className="pressable mt-4 w-full rounded-2xl bg-accent py-3 text-[15px] font-semibold text-white"
          >
            {remaining > 0 ? `Next (${remaining} more)` : 'Nice'}
          </button>
        </div>
      </div>
    </div>
  );
}
