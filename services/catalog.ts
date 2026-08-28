import '@/lib/server-guard';
import { randomUUID } from 'node:crypto';
import { withUser } from '@/database';
import { GAMES, game as findGame, type Difficulty, type Game } from '@/lib/games/catalog';
import { DIFFICULTY_BONUS } from '@/lib/games/catalog';
import { grantXp, type GrantResult } from '@/services/player';
import { rewardOf, type Reward } from '@/lib/reward';

/**
 * Hvad der er blevet spillet.
 *
 * Historik, mest spillede og personlige rekorder — det der gør et katalog til
 * noget man kommer tilbage til frem for noget man bladrer i én gang.
 *
 * Point beregnes her og aldrig i browseren: klienten fortæller hvor mange
 * trin der blev krydset af, og serveren afgør hvad det er værd.
 */

export interface RunInput {
  gameId: string;
  difficulty: Difficulty;
  /** Hvor mange trin eller enheder der blev nået. */
  done: number;
  /** Hvor mange der var i alt. */
  total: number;
  seconds: number;
}

export interface RunOutcome {
  reward: Reward;
  score: number;
  best: number;
  isBest: boolean;
  completed: boolean;
}

/**
 * Bogfører en runde.
 *
 * Halvfærdigt tæller. Et spil der kun betaler for fuldt hus lærer folk at
 * lade være med at begynde på det store, og det store er præcis det der har
 * ligget længst.
 */
export async function recordCatalogRun(userId: string, input: RunInput): Promise<RunOutcome> {
  const game = findGame(input.gameId);
  if (!game) throw new Error('Ukendt spil');

  const total = Math.min(Math.max(Math.trunc(input.total), 1), 200);
  const done = Math.min(Math.max(Math.trunc(input.done), 0), total);
  const seconds = Math.min(Math.max(Math.trunc(input.seconds), 0), 6 * 3600);
  const completed = done >= total;

  // Andelen der blev nået, ganget med sværhedsgraden. Et helt gennemført spil
  // giver en tiendedel oveni, så det sidste trin er værd at tage.
  const share = done / total;
  const score = Math.round(game.xp * share * DIFFICULTY_BONUS[input.difficulty] * (completed ? 1.1 : 1));

  const { best, isBest } = await withUser(userId, async (db) => {
    const { rows } = await db.query<{ best: number | null }>(
      `SELECT max(score) AS best FROM game_runs WHERE user_id = $1 AND game = $2`,
      [userId, game.id],
    );
    const before = Number(rows[0]?.best ?? 0);
    await db.query(
      `INSERT INTO game_runs
         (id, user_id, game, score, correct, total, duration_ms, difficulty, completed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [randomUUID(), userId, game.id, score, done, total, seconds * 1000, input.difficulty, completed],
    );
    return { best: Math.max(before, score), isBest: score > before && score > 0 };
  });

  const grants: GrantResult[] = [];
  if (score > 0) {
    // Ét arrangement pr. runde. En runde med tolv trin skal ikke skrive tolv
    // rækker i pointloggen.
    grants.push(
      await grantXp(
        userId,
        'sprint_finished',
        { game: game.id, difficulty: input.difficulty, done, total },
        Math.max(1, Math.round(score / 18)),
      ),
    );
  }

  return { reward: rewardOf(...grants), score, best, isBest, completed };
}

export interface PlayedGame {
  game: Game;
  playedAt: string;
  score: number;
  done: number;
  total: number;
  completed: boolean;
  difficulty: Difficulty;
}

interface RunRow {
  game: string;
  score: number;
  correct: number;
  total: number;
  difficulty: string;
  completed: boolean;
  created_at: string | Date;
}

function mapRun(row: RunRow): PlayedGame | null {
  const game = findGame(row.game);
  if (!game) return null;
  return {
    game,
    playedAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    score: Number(row.score),
    done: Number(row.correct),
    total: Number(row.total),
    completed: Boolean(row.completed),
    difficulty: (row.difficulty as Difficulty) ?? 'mellem',
  };
}

/** 🕞 Historik: senest spillede, ét indslag pr. spil. */
export async function recentGames(userId: string, limit = 10): Promise<PlayedGame[]> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<RunRow>(
      `SELECT DISTINCT ON (game) game, score, correct, total, difficulty, completed, created_at
         FROM game_runs WHERE user_id = $1
        ORDER BY game, created_at DESC`,
      [userId],
    );
    return rows
      .map(mapRun)
      .filter((r): r is PlayedGame => r !== null)
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
      .slice(0, limit);
  });
}

export interface FavouriteGame {
  game: Game;
  plays: number;
  best: number;
}

/** 🔁 Spil igen: det der er spillet flest gange. */
export async function mostPlayed(userId: string, limit = 10): Promise<FavouriteGame[]> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<{ game: string; plays: number; best: number }>(
      `SELECT game, count(*)::int AS plays, max(score)::int AS best
         FROM game_runs WHERE user_id = $1
        GROUP BY game HAVING count(*) > 1
        ORDER BY plays DESC, max(created_at) DESC
        LIMIT $2`,
      [userId, limit],
    );
    return rows
      .map((row) => {
        const game = findGame(row.game);
        return game ? { game, plays: Number(row.plays), best: Number(row.best) } : null;
      })
      .filter((r): r is FavouriteGame => r !== null);
  });
}

/**
 * ⭐ Top.
 *
 * En enkeltbrugerapp har ingen andres tal at rangere efter, så toppen er
 * redaktionel: de spil der er markeret som værd at prøve, sorteret efter hvor
 * mange point de giver pr. minut. Det er en ærlig rangering af "mest udbytte
 * for tiden", ikke en påstand om hvad andre spiller.
 */
export function topGames(limit = 10): Game[] {
  return [...GAMES]
    .filter((g) => g.featured || g.xp >= 35)
    .sort((a, b) => {
      const rate = (g: Game) => g.xp / Math.max(60, g.seconds || 300);
      return rate(b) - rate(a);
    })
    .slice(0, limit);
}

/** Bedste resultat i ét spil. */
export async function bestScore(userId: string, gameId: string): Promise<number> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<{ best: number | null }>(
      `SELECT max(score) AS best FROM game_runs WHERE user_id = $1 AND game = $2`,
      [userId, gameId],
    );
    return Number(rows[0]?.best ?? 0);
  });
}

/** Antal runder pr. spil, til mærkaterne på fliserne. */
export async function playCounts(userId: string): Promise<Map<string, number>> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<{ game: string; plays: number }>(
      `SELECT game, count(*)::int AS plays FROM game_runs WHERE user_id = $1 GROUP BY game`,
      [userId],
    );
    return new Map(rows.map((r) => [r.game, Number(r.plays)]));
  });
}
