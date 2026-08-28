import '@/lib/server-guard';
import { randomUUID } from 'node:crypto';
import { withUser } from '@/database';
import type { DbClient } from '@/database/driver';
import { today } from '@/lib/dates';
import { daysBetween } from '@/lib/normalize';
import {
  AREA_OF,
  XP,
  decayMomentum,
  gainMomentum,
  levelProgress,
  momentumTier,
  type LevelProgress,
  type MomentumTier,
  type XpAction,
} from '@/lib/game';
import { CREATURES, type Creature } from '@/lib/creatures';

/**
 * The player, and everything that happens when they do something.
 *
 * One entry point — grantXp — so that points, momentum and unlocks can never
 * disagree with each other. Every grant is written to xp_events, which makes
 * the total explainable and, usefully, makes almost every unlock condition a
 * count over one table instead of a bespoke query per creature.
 */

export interface Player {
  xp: number;
  progress: LevelProgress;
  momentum: number;
  floor: number;
  tier: MomentumTier;
  collection: string[];
}

export interface GrantResult {
  gained: number;
  xp: number;
  progress: LevelProgress;
  /** Set when this grant crossed a level boundary. */
  leveledUp: number | null;
  momentum: number;
  unlocked: Creature[];
}

async function ensurePlayer(db: DbClient, userId: string): Promise<void> {
  await db.query(
    `INSERT INTO life_player (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

interface PlayerRow {
  xp: number;
  momentum: number;
  momentum_floor: number;
  last_active_on: string | Date | null;
}

export async function getPlayer(userId: string): Promise<Player> {
  return withUser(userId, async (db) => {
    await ensurePlayer(db, userId);
    const { rows } = await db.query<PlayerRow>(
      `SELECT xp, momentum, momentum_floor, last_active_on FROM life_player WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0] ?? { xp: 0, momentum: 0, momentum_floor: 0, last_active_on: null };
    const { rows: owned } = await db.query<{ key: string }>(
      `SELECT key FROM collectibles WHERE user_id = $1 ORDER BY unlocked_at`,
      [userId],
    );

    // Decay is applied on read as well as on write, so the number a person
    // sees after a fortnight away is the real one rather than a stale high.
    const state = applyDecay(row);
    return {
      xp: Number(row.xp),
      progress: levelProgress(Number(row.xp)),
      momentum: state.momentum,
      floor: state.floor,
      tier: momentumTier(state.momentum),
      collection: owned.map((o) => o.key),
    };
  });
}

function applyDecay(row: PlayerRow): { momentum: number; floor: number } {
  const state = { momentum: Number(row.momentum), floor: Number(row.momentum_floor) };
  if (!row.last_active_on) return state;
  const last = isoOf(row.last_active_on);
  const idle = daysBetween(last, today());
  return decayMomentum(state, Math.max(0, idle));
}

function isoOf(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

/**
 * Credits an action.
 *
 * Safe to call from any server action; it creates the player row on demand and
 * never throws for an unknown creature or a repeated unlock.
 */
export async function grantXp(
  userId: string,
  action: XpAction,
  detail: Record<string, string | number | boolean> = {},
  times = 1,
): Promise<GrantResult> {
  // `times` exists so a round of twelve correct answers is one event worth
  // twelve, rather than twelve events and twelve momentum updates.
  const count = Math.min(Math.max(Math.trunc(times), 1), 100);
  const amount = XP[action] * count;

  return withUser(userId, async (db) => {
    await ensurePlayer(db, userId);

    const { rows } = await db.query<PlayerRow>(
      `SELECT xp, momentum, momentum_floor, last_active_on FROM life_player WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0]!;
    const levelBefore = levelProgress(Number(row.xp)).level;

    await db.query(
      `INSERT INTO xp_events (id, user_id, area, action, amount, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        userId,
        AREA_OF[action],
        action,
        amount,
        JSON.stringify(count > 1 ? { ...detail, times: count } : detail),
      ],
    );

    const { rows: todayRows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM xp_events
        WHERE user_id = $1 AND created_at::date = $2::date`,
      [userId, today()],
    );
    // This grant is already in the table, so the taper counts the ones before it.
    const actionsToday = Math.max(0, Number(todayRows[0]?.n ?? 1) - 1);

    const decayed = applyDecay(row);
    const next = gainMomentum(decayed, actionsToday);
    const xp = Number(row.xp) + amount;

    await db.query(
      `UPDATE life_player
          SET xp = $2, momentum = $3, momentum_floor = $4,
              last_active_on = $5::date, updated_at = now()
        WHERE user_id = $1`,
      [userId, xp, next.momentum, next.floor, today()],
    );

    const progress = levelProgress(xp);
    const unlocked = await evaluateUnlocks(db, userId, progress.level);

    return {
      gained: amount,
      xp,
      progress,
      leveledUp: progress.level > levelBefore ? progress.level : null,
      momentum: next.momentum,
      unlocked,
    };
  });
}

/* ---------------------------------------------------------------- unlocks */

interface UnlockStats {
  level: number;
  /** Counts of each xp action ever recorded. */
  actions: Record<string, number>;
  /** Things currently in the kitchen. */
  pantryInCount: number;
  /** Best score in the sorting game. */
  bestSortScore: number;
  frozenCount: number;
}

/** What earns each creature, as a predicate over the stats. */
const CONDITIONS: Record<string, (s: UnlockStats) => boolean> = {
  prik: () => true,
  streg: (s) => (s.actions.scan_product ?? 0) >= 3,
  frost: (s) => s.frozenCount >= 1,
  krumme: (s) => s.pantryInCount >= 10,
  panden: (s) => (s.actions.meal_cooked ?? 0) >= 1,
  gulerod: (s) => (s.actions.expiry_rescue ?? 0) >= 5,
  skrald: (s) => (s.actions.sort_correct ?? 0) >= 1,
  pap: (s) => (s.actions.sort_flawless ?? 0) >= 1,
  glasse: (s) => s.bestSortScore >= 200,
  ur: (s) => (s.actions.sprint_finished ?? 0) >= 1,
  boble: (s) => (s.actions.routine_done ?? 0) >= 5,
  vaegt: (s) => (s.actions.routine_target ?? 0) >= 1,
  moent: (s) => (s.actions.transaction_sorted ?? 0) >= 10,
  stjerne: (s) => s.level >= 10,
};

async function evaluateUnlocks(
  db: DbClient,
  userId: string,
  level: number,
): Promise<Creature[]> {
  const { rows: have } = await db.query<{ key: string }>(
    `SELECT key FROM collectibles WHERE user_id = $1`,
    [userId],
  );
  const owned = new Set(have.map((h) => h.key));
  const pending = CREATURES.filter((c) => !owned.has(c.key));
  if (pending.length === 0) return [];

  const stats = await unlockStats(db, userId, level);
  const earned = pending.filter((c) => CONDITIONS[c.key]?.(stats) ?? false);
  if (earned.length === 0) return [];

  for (const c of earned) {
    await db.query(
      `INSERT INTO collectibles (user_id, key) VALUES ($1, $2)
       ON CONFLICT (user_id, key) DO NOTHING`,
      [userId, c.key],
    );
  }
  return earned;
}

async function unlockStats(db: DbClient, userId: string, level: number): Promise<UnlockStats> {
  const [counts, pantry, best, frozen] = await Promise.all([
    db.query<{ action: string; n: number }>(
      `SELECT action, count(*)::int AS n FROM xp_events WHERE user_id = $1 GROUP BY action`,
      [userId],
    ),
    db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pantry_items WHERE user_id = $1 AND status = 'in'`,
      [userId],
    ),
    db.query<{ best: number | null }>(
      `SELECT max(score) AS best FROM game_runs WHERE user_id = $1 AND game = 'sort'`,
      [userId],
    ),
    db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pantry_items WHERE user_id = $1 AND status = 'frozen'`,
      [userId],
    ),
  ]);

  const actions: Record<string, number> = {};
  for (const row of counts.rows) actions[row.action] = Number(row.n);

  return {
    level,
    actions,
    pantryInCount: Number(pantry.rows[0]?.n ?? 0),
    bestSortScore: Number(best.rows[0]?.best ?? 0),
    frozenCount: Number(frozen.rows[0]?.n ?? 0),
  };
}

/**
 * Runs the unlock check without granting points.
 *
 * Wanted for the very first visit, where turning up is itself the condition
 * for the starter creature but nothing has been earned yet.
 */
export async function refreshUnlocks(userId: string): Promise<Creature[]> {
  return withUser(userId, async (db) => {
    await ensurePlayer(db, userId);
    const { rows } = await db.query<{ xp: number }>(
      `SELECT xp FROM life_player WHERE user_id = $1`,
      [userId],
    );
    return evaluateUnlocks(db, userId, levelProgress(Number(rows[0]?.xp ?? 0)).level);
  });
}

/** Points earned today, for the board's "so far today" line. */
export async function xpToday(userId: string): Promise<number> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<{ total: number | null }>(
      `SELECT COALESCE(sum(amount), 0) AS total FROM xp_events
        WHERE user_id = $1 AND created_at::date = $2::date`,
      [userId, today()],
    );
    return Number(rows[0]?.total ?? 0);
  });
}
