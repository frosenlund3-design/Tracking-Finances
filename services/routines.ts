import '@/lib/server-guard';
import { randomUUID } from 'node:crypto';
import { withUser } from '@/database';
import { today } from '@/lib/dates';
import { addDays, isoDate } from '@/lib/normalize';
import { grantXp, type GrantResult } from '@/services/player';

/**
 * Training, skincare, medication — anything repeated.
 *
 * Targets are weekly, never daily, and that is the entire design. "Four times
 * this week" gives you seven chances to hit four and no way to fail on a
 * Tuesday; "every day" gives you one chance to fail every day, and a person
 * who has failed twice stops opening the app. The week resets on its own, so
 * a bad week is followed by a clean one rather than by a broken counter.
 */

export type RoutineArea = 'body' | 'home' | 'mind';

export interface Routine {
  id: string;
  name: string;
  area: RoutineArea;
  icon: string;
  targetPerWeek: number;
  /** Times done in the current week. */
  doneThisWeek: number;
  doneToday: boolean;
  /** Times done ever, because progress should never reset to zero. */
  doneEver: number;
  /** 0–1 towards this week's target. */
  progress: number;
  /** True once the target is reached. Extra sessions are a bonus, not a debt. */
  hitTarget: boolean;
}

/** Monday, because that is the week Denmark uses. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return addDays(date, -offset);
}

interface RoutineRow {
  id: string;
  name: string;
  area: string;
  icon: string;
  target_per_week: number;
  done_week: number;
  done_ever: number;
  done_today: boolean;
}

export async function listRoutines(
  userId: string,
  now: string = today(),
): Promise<Routine[]> {
  const from = weekStart(now);
  return withUser(userId, async (db) => {
    const { rows } = await db.query<RoutineRow>(
      `SELECT r.id, r.name, r.area, r.icon, r.target_per_week,
              count(e.id) FILTER (WHERE e.done_on >= $2::date)::int AS done_week,
              count(e.id)::int AS done_ever,
              bool_or(e.done_on = $3::date) AS done_today
         FROM routines r
         LEFT JOIN routine_events e ON e.routine_id = r.id AND e.user_id = r.user_id
        WHERE r.user_id = $1 AND r.archived_at IS NULL
        GROUP BY r.id, r.name, r.area, r.icon, r.target_per_week, r.created_at
        ORDER BY r.created_at`,
      [userId, from, now],
    );

    return rows.map((row) => {
      const target = Math.max(1, Number(row.target_per_week));
      const done = Number(row.done_week);
      return {
        id: row.id,
        name: row.name,
        area: (row.area as RoutineArea) ?? 'body',
        // Older rows stored a name rather than a glyph; anything that is not
        // a short glyph falls back rather than rendering the word "spark".
        icon: row.icon.length <= 12 && !/^[a-z_]+$/.test(row.icon) ? row.icon : '✨',
        targetPerWeek: target,
        doneThisWeek: done,
        doneToday: Boolean(row.done_today),
        doneEver: Number(row.done_ever),
        progress: Math.min(done / target, 1),
        hitTarget: done >= target,
      };
    });
  });
}

export interface NewRoutine {
  name: string;
  area?: RoutineArea;
  icon?: string;
  targetPerWeek?: number;
}

export async function createRoutine(userId: string, input: NewRoutine): Promise<string> {
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error('A routine needs a name');
  const id = randomUUID();
  await withUser(userId, async (db) => {
    await db.query(
      `INSERT INTO routines (id, user_id, name, area, icon, target_per_week)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        userId,
        name,
        input.area ?? 'body',
        input.icon ?? 'spark',
        Math.min(Math.max(input.targetPerWeek ?? 3, 1), 7),
      ],
    );
  });
  return id;
}

export interface TickResult {
  /** Null when it was already ticked for that day. */
  grant: GrantResult | null;
  /** Set when this tick reached the weekly target. */
  targetBonus: GrantResult | null;
  routine: Routine | null;
}

/**
 * Marks a routine done for a day.
 *
 * Idempotent per day: tapping twice is a no-op rather than double points,
 * which keeps the number honest and makes the button safe to hammer.
 */
export async function tickRoutine(
  userId: string,
  routineId: string,
  now: string = today(),
): Promise<TickResult> {
  const inserted = await withUser(userId, async (db) => {
    const { rowCount } = await db.query(
      `INSERT INTO routine_events (id, user_id, routine_id, done_on)
       SELECT $1, $2, $3, $4::date
        WHERE EXISTS (SELECT 1 FROM routines WHERE id = $3 AND user_id = $2 AND archived_at IS NULL)
       ON CONFLICT (user_id, routine_id, done_on) DO NOTHING`,
      [randomUUID(), userId, routineId, now],
    );
    return rowCount > 0;
  });

  if (!inserted) {
    const routine = (await listRoutines(userId, now)).find((r) => r.id === routineId) ?? null;
    return { grant: null, targetBonus: null, routine };
  }

  const grant = await grantXp(userId, 'routine_done', { routineId });
  const routine = (await listRoutines(userId, now)).find((r) => r.id === routineId) ?? null;

  // The bonus lands exactly once per week, on the session that reaches the
  // target — not on every session after it.
  const justHit = routine !== null && routine.doneThisWeek === routine.targetPerWeek;
  const targetBonus = justHit ? await grantXp(userId, 'routine_target', { routineId }) : null;

  return { grant, targetBonus, routine };
}

/** Undo, for the tap that was not meant. Takes no points back. */
export async function untickRoutine(
  userId: string,
  routineId: string,
  now: string = today(),
): Promise<void> {
  await withUser(userId, async (db) => {
    await db.query(
      `DELETE FROM routine_events WHERE user_id = $1 AND routine_id = $2 AND done_on = $3::date`,
      [userId, routineId, now],
    );
  });
}

export async function archiveRoutine(userId: string, routineId: string): Promise<void> {
  await withUser(userId, async (db) => {
    await db.query(
      `UPDATE routines SET archived_at = now() WHERE id = $1 AND user_id = $2`,
      [routineId, userId],
    );
  });
}

/** The last 28 days as a grid, for a heat strip that shows shape not shame. */
export async function routineHistory(
  userId: string,
  routineId: string,
  now: string = today(),
): Promise<Array<{ date: string; done: boolean }>> {
  const from = addDays(now, -27);
  const done = await withUser(userId, async (db) => {
    const { rows } = await db.query<{ done_on: string | Date }>(
      `SELECT done_on FROM routine_events
        WHERE user_id = $1 AND routine_id = $2 AND done_on >= $3::date`,
      [userId, routineId, from],
    );
    return new Set(rows.map((r) => isoDate(r.done_on)));
  });

  return Array.from({ length: 28 }, (_, i) => {
    const date = addDays(from, i);
    return { date, done: done.has(date) };
  });
}
