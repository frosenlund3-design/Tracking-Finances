'use server';

import { z } from 'zod';
import { assertSameOrigin, requireApiUser } from '@/lib/auth';
import { recordRun } from '@/services/games';
import { LIMITS, rateLimit } from '@/security/rate-limit';

export interface RoundOutcome {
  error?: string;
  score?: number;
  best?: number;
  isBest?: boolean;
  xp?: number;
  levelUp?: number | null;
  unlocked?: string[];
}

const schema = z.object({
  correct: z.number().int().min(0).max(40),
  total: z.number().int().min(1).max(40),
  durationMs: z.number().int().min(0).max(3_600_000),
});

/**
 * Records a finished round.
 *
 * Everything the client reports is treated as a claim: the service clamps
 * correct to total and total to a plausible round length before any points are
 * granted. A tampered request can therefore be wrong but never profitable.
 */
export async function finishSortRound(input: {
  correct: number;
  total: number;
  durationMs: number;
}): Promise<RoundOutcome> {
  await assertSameOrigin();
  const user = await requireApiUser();

  if (!rateLimit(`sort:${user.id}`, LIMITS.write.limit, LIMITS.write.windowMs).allowed) {
    return { error: 'Give it a moment.' };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: 'That round did not add up.' };

  const result = await recordRun(user.id, { game: 'sort', ...parsed.data });
  const xp = result.grants.reduce((sum, g) => sum + g.gained, 0);
  const levelUp = result.grants.reduce<number | null>((found, g) => g.leveledUp ?? found, null);
  const unlocked = result.grants.flatMap((g) => g.unlocked.map((c) => c.key));

  return { score: result.score, best: result.best, isBest: result.isBest, xp, levelUp, unlocked };
}
