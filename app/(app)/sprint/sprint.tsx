'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCelebrate } from '@/components/play/celebrate';
import { cn } from '@/lib/cn';
import { pickTasks } from '@/lib/sprint';
import { finishSprintAction } from './actions';

export interface RoomOption {
  key: string;
  label: string;
  glyph: string;
}

/**
 * The two-minute sprint.
 *
 * A timer that runs out is not a failure — it just stops, and whatever got
 * done got done. That is deliberate: a countdown that scolds you at zero is a
 * countdown people stop starting, and starting is the entire difficulty.
 */
export function Sprint({ rooms, seconds }: { rooms: RoomOption[]; seconds: number }) {
  const router = useRouter();
  const celebrate = useCelebrate();
  const [room, setRoom] = useState<RoomOption | null>(null);
  const [tasks, setTasks] = useState<string[]>([]);
  const [done, setDone] = useState<boolean[]>([]);
  const [left, setLeft] = useState(seconds);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setLeft((value) => {
        if (value <= 1) {
          setRunning(false);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  const start = useCallback((option: RoomOption) => {
    // Three, because four is a list and a list is a project. Drawn by the
    // same function the tests cover, rather than a second copy of it here.
    const picked = pickTasks(option.key, 3);
    setRoom(option);
    setTasks(picked);
    setDone(picked.map(() => false));
    setLeft(seconds);
    setFinished(false);
    setRunning(true);
    startedAt.current = Date.now();
  }, [seconds]);

  const finish = useCallback(async () => {
    const count = done.filter(Boolean).length;
    setRunning(false);
    setFinished(true);
    if (count === 0) return;

    setBusy(true);
    const result = await finishSprintAction({
      done: count,
      total: tasks.length,
      durationMs: Date.now() - startedAt.current,
    });
    setBusy(false);
    if (!result.error && result.reward) {
      celebrate({
        xp: result.reward.xp,
        levelUp: result.reward.levelUp,
        unlocked: result.reward.unlocked,
      });
    }
    router.refresh();
  }, [celebrate, done, router, tasks.length]);

  if (!room) {
    return (
      <div className="rise space-y-5">
        <header>
          <h1 className="text-[28px] font-bold tracking-tight">To-minutters sprint</h1>
          <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-muted">
            Vælg et rum. Du får tre ting, som hver især kan nås på under et minut, og et ur
            der ikke skælder ud når det løber ud.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-3">
          {rooms.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => start(option)}
              className="play-tile p-4 text-left"
              style={{ background: 'var(--color-play-money)' }}
            >
              <span aria-hidden="true" className="relative block text-[30px] leading-none">
                {option.glyph}
              </span>
              <span className="relative mt-6 block text-[16px] font-bold tracking-tight">
                {option.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const doneCount = done.filter(Boolean).length;

  if (finished) {
    return (
      <div className="rise space-y-5">
        <header className="pt-8 text-center">
          <span aria-hidden="true" className="pop-in inline-block text-[56px]">
            {doneCount === tasks.length ? '🎉' : doneCount > 0 ? '👏' : '🤷'}
          </span>
          <h1 className="mt-2 text-[26px] font-bold tracking-tight">
            {doneCount} af {tasks.length} klaret
          </h1>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">
            {doneCount === 0
              ? 'Ingenting denne gang. Rummet er ikke værre end det var.'
              : busy
                ? 'Gemmer…'
                : `Det er ${doneCount} ting der ikke ligger på gulvet mere.`}
          </p>
        </header>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRoom(null)}
            className="pressable flex-1 rounded-2xl py-3.5 text-[15px] font-semibold text-white"
            style={{ background: 'var(--color-play-money)' }}
          >
            Et rum til
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

  const minutes = Math.floor(left / 60);
  const secs = left % 60;

  return (
    <div className="rise space-y-4">
      <header className="text-center">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-subtle">
          {room.glyph} {room.label}
        </p>
        <p
          className={cn(
            'numeral mt-1 text-[64px] font-bold leading-none tracking-tight tabular-nums',
            left === 0 && 'text-ink-subtle',
          )}
        >
          {minutes}:{String(secs).padStart(2, '0')}
        </p>
        <p className="mt-1 text-[13px] text-ink-muted">
          {left === 0 ? 'Tiden er gået — gør det færdigt du står med.' : 'Det der bliver gjort, bliver gjort.'}
        </p>
      </header>

      <div className="meter h-1.5">
        <span
          style={{
            width: `${(left / seconds) * 100}%`,
            background: left <= 20 ? 'var(--color-notice)' : 'var(--color-play-money)',
          }}
        />
      </div>

      <ul className="space-y-2">
        {tasks.map((task, i) => (
          <li key={task}>
            <button
              type="button"
              onClick={() => setDone((d) => d.map((value, j) => (j === i ? !value : value)))}
              aria-pressed={done[i]}
              className={cn(
                'pressable flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left transition-colors',
                done[i] ? 'border-positive bg-positive-soft' : 'border-border bg-surface',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px] font-bold',
                  done[i] ? 'bg-positive text-white' : 'bg-surface-muted text-ink-subtle',
                )}
              >
                {done[i] ? '✓' : i + 1}
              </span>
              <span
                className={cn(
                  'text-[14.5px] leading-snug',
                  done[i] && 'text-positive line-through decoration-2',
                )}
              >
                {task}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void finish()}
          disabled={busy}
          className="pressable flex-1 rounded-2xl bg-play-ink py-3.5 text-[15px] font-bold text-white disabled:opacity-60"
        >
          {doneCount > 0 ? `Færdig — gem ${doneCount}` : 'Stop'}
        </button>
        <button
          type="button"
          onClick={() => setRunning((value) => !value)}
          className="pressable rounded-2xl border border-border bg-surface px-5 py-3.5 text-[15px] font-semibold"
        >
          {running ? 'Pause' : 'Fortsæt'}
        </button>
      </div>
    </div>
  );
}
