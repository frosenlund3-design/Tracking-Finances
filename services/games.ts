import '@/lib/server-guard';
import { randomUUID } from 'node:crypto';
import { withUser } from '@/database';
import { grantXp, type GrantResult } from '@/services/player';

/**
 * Results of a round.
 *
 * Points are granted here rather than by the game screens, so a browser that
 * replays the same request cannot mint XP: everything the client sends is
 * clamped to what a real round could possibly have produced.
 */

export type GameId = 'sort' | 'expiry' | 'sprint';

export interface RunInput {
  game: GameId;
  correct: number;
  total: number;
  durationMs: number;
}

export interface RunResult {
  score: number;
  best: number;
  isBest: boolean;
  flawless: boolean;
  grants: GrantResult[];
}

/** The most rounds worth counting in one sitting. */
const MAX_ROUND = 40;

/**
 * Score.
 *
 * Correct answers are the whole of it, with a bonus for a clean round. Speed
 * is deliberately not scored: rewarding speed would punish the person who
 * stopped to read why a receipt is not paper, which is the only reason the
 * game exists.
 */
export function scoreRound(correct: number, total: number): number {
  const clean = correct >= total && total > 0;
  return correct * 20 + (clean ? 60 : 0);
}

export async function recordRun(userId: string, input: RunInput): Promise<RunResult> {
  const total = Math.min(Math.max(Math.trunc(input.total), 0), MAX_ROUND);
  const correct = Math.min(Math.max(Math.trunc(input.correct), 0), total);
  const durationMs = Math.min(Math.max(Math.trunc(input.durationMs), 0), 60 * 60 * 1000);
  const score = scoreRound(correct, total);
  const flawless = total > 0 && correct === total;

  const { best, isBest } = await withUser(userId, async (db) => {
    const { rows: previous } = await db.query<{ best: number | null }>(
      `SELECT max(score) AS best FROM game_runs WHERE user_id = $1 AND game = $2`,
      [userId, input.game],
    );
    const before = Number(previous[0]?.best ?? 0);
    await db.query(
      `INSERT INTO game_runs (id, user_id, game, score, correct, total, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), userId, input.game, score, correct, total, durationMs],
    );
    return { best: Math.max(before, score), isBest: score > before && score > 0 };
  });

  const grants: GrantResult[] = [];
  if (input.game === 'sort' && correct > 0) {
    // One event worth the whole round, not one per answer.
    grants.push(await grantXp(userId, 'sort_correct', { game: input.game }, correct));
    if (flawless) grants.push(await grantXp(userId, 'sort_flawless', { total }));
  } else if (input.game === 'sprint') {
    grants.push(await grantXp(userId, 'sprint_finished', { total }));
  }

  return { score, best, isBest, flawless, grants };
}

export interface GameBest {
  game: GameId;
  best: number;
  runs: number;
}

export async function bestScores(userId: string): Promise<GameBest[]> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<{ game: string; best: number; runs: number }>(
      `SELECT game, max(score)::int AS best, count(*)::int AS runs
         FROM game_runs WHERE user_id = $1 GROUP BY game`,
      [userId],
    );
    return rows.map((r) => ({ game: r.game as GameId, best: Number(r.best), runs: Number(r.runs) }));
  });
}
