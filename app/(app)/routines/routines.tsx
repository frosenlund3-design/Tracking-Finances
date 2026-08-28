'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCelebrate } from '@/components/play/celebrate';
import { Button, Input, Select, Sheet } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import {
  archiveRoutineAction,
  createRoutineAction,
  tickRoutineAction,
  untickRoutineAction,
} from './actions';

export interface RoutineRow {
  id: string;
  name: string;
  icon: string;
  area: string;
  targetPerWeek: number;
  doneThisWeek: number;
  doneToday: boolean;
  doneEver: number;
  hitTarget: boolean;
  /** Monday-first, seven booleans for the current week. */
  week: boolean[];
}

const SUGGESTIONS = [
  { name: 'Training', icon: '🏋️', area: 'body' as const, targetPerWeek: 3 },
  { name: 'Skincare, evening', icon: '🧴', area: 'body' as const, targetPerWeek: 5 },
  { name: 'Walk outside', icon: '🚶', area: 'body' as const, targetPerWeek: 4 },
  { name: 'Stretch', icon: '🧘', area: 'body' as const, targetPerWeek: 3 },
  { name: 'Vitamin D', icon: '💊', area: 'body' as const, targetPerWeek: 7 },
  { name: 'Tidy one surface', icon: '🧽', area: 'home' as const, targetPerWeek: 3 },
  { name: 'Read something', icon: '📖', area: 'mind' as const, targetPerWeek: 3 },
  { name: 'Wash bedding', icon: '🛏️', area: 'home' as const, targetPerWeek: 1 },
];

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Routines, without a streak in sight.
 *
 * Each one shows a weekly target and the seven days it could be done on, so a
 * missed Tuesday is visibly just one of seven boxes rather than a broken run.
 * Nothing here ever goes red, and nothing resets a total to zero.
 */
export function Routines({ routines }: { routines: RoutineRow[] }) {
  const router = useRouter();
  const celebrate = useCelebrate();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', icon: '✨', area: 'body', targetPerWeek: 3 });
  const [error, setError] = useState<string | null>(null);

  async function toggle(routine: RoutineRow) {
    setBusy(routine.id);
    const result = routine.doneToday
      ? await untickRoutineAction({ id: routine.id })
      : await tickRoutineAction({ id: routine.id });
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
        message: result.hitTarget ? 'Weekly target reached' : undefined,
      });
    }
    router.refresh();
  }

  async function create(input: { name: string; icon: string; area: string; targetPerWeek: number }) {
    setBusy('new');
    const result = await createRoutineAction(input);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setAdding(false);
    setDraft({ name: '', icon: '✨', area: 'body', targetPerWeek: 3 });
    router.refresh();
  }

  return (
    <div className="rise space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Routines</h1>
          <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-muted">
            Weekly targets, never daily ones. Seven chances to hit three.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setAdding(true);
          }}
          className="pressable shrink-0 rounded-full px-4 py-2.5 text-[14px] font-semibold text-white"
          style={{ background: 'var(--color-play-body)' }}
        >
          Add
        </button>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl bg-negative-soft px-3.5 py-2.5 text-[13px] text-negative">
          {error}
        </p>
      ) : null}

      {routines.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
          <p className="text-[15px] font-semibold">Nothing tracked yet</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            Pick one to start with. One is genuinely better than five — five is how a person ends up
            with five things they are behind on.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.name}
                type="button"
                disabled={busy !== null}
                onClick={() => void create(s)}
                className="pressable rounded-full border border-border bg-surface px-3 py-2 text-[13.5px] disabled:opacity-60"
              >
                {s.icon} {s.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {routines.map((routine) => (
            <li key={routine.id} className="rounded-2xl border border-border bg-surface p-3.5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={busy === routine.id}
                  onClick={() => void toggle(routine)}
                  aria-pressed={routine.doneToday}
                  className={cn(
                    'pressable flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[22px] transition-colors',
                    routine.doneToday ? 'bg-positive text-white' : 'bg-surface-muted',
                  )}
                >
                  {routine.doneToday ? '✓' : routine.icon}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold leading-tight">{routine.name}</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-muted">
                    {routine.hitTarget
                      ? `Target hit · ${routine.doneThisWeek} this week`
                      : `${routine.doneThisWeek} of ${routine.targetPerWeek} this week`}
                    {routine.doneEver > routine.doneThisWeek ? ` · ${routine.doneEver} all time` : ''}
                  </p>
                </div>
                {routine.hitTarget ? (
                  <span className="shrink-0 rounded-full bg-positive-soft px-2.5 py-1 text-[11.5px] font-bold text-positive">
                    ✓ target
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex items-center gap-1.5">
                {routine.week.map((done, i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    className={cn(
                      'flex h-6 flex-1 items-center justify-center rounded-md text-[10.5px] font-semibold',
                      done ? 'bg-positive text-white' : 'bg-surface-muted text-ink-subtle',
                    )}
                  >
                    {DAY_LETTERS[i]}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {routines.length > 0 ? (
        <p className="px-1 text-[12.5px] leading-relaxed text-ink-subtle">
          A blank day is a blank day, not a broken streak. The week starts again on Monday whatever
          happened in this one.
        </p>
      ) : null}

      <Sheet open={adding} onClose={() => setAdding(false)} title="New routine">
        <form
          className="space-y-3 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create(draft);
          }}
        >
          <div className="flex flex-wrap gap-1.5">
            {['✨', '🏋️', '🧴', '🚶', '🧘', '💊', '📖', '🧽', '🛏️', '🦷'].map((icon) => (
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
              placeholder="Training"
              maxLength={60}
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-medium text-ink-muted">Times a week</span>
              <Select
                value={String(draft.targetPerWeek)}
                onChange={(e) => setDraft((d) => ({ ...d, targetPerWeek: Number(e.target.value) }))}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n}×
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-medium text-ink-muted">Kind</span>
              <Select
                value={draft.area}
                onChange={(e) => setDraft((d) => ({ ...d, area: e.target.value }))}
              >
                <option value="body">Body</option>
                <option value="home">Home</option>
                <option value="mind">Mind</option>
              </Select>
            </label>
          </div>
          <p className="text-[12px] leading-relaxed text-ink-subtle">
            Pick a target you would hit on a bad week, not a good one. It is much easier to add one
            later than to be behind from the first Monday.
          </p>
          <Button type="submit" full disabled={busy !== null || draft.name.trim().length === 0}>
            Add it
          </Button>
        </form>
      </Sheet>

      {routines.length > 0 ? (
        <details className="px-1">
          <summary className="cursor-pointer list-none text-[12.5px] text-ink-subtle">
            Remove one
          </summary>
          <ul className="mt-2 space-y-1">
            {routines.map((routine) => (
              <li key={routine.id}>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy(routine.id);
                    await archiveRoutineAction({ id: routine.id });
                    setBusy(null);
                    router.refresh();
                  }}
                  className="text-[13px] text-negative disabled:opacity-60"
                >
                  Remove {routine.name}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
