'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSameOrigin, requireApiUser } from '@/lib/auth';
import { recordCatalogRun } from '@/services/catalog';
import { isGame } from '@/lib/games/catalog';
import { LIMITS, rateLimit } from '@/security/rate-limit';
import type { Reward } from '@/lib/reward';

export interface FinishOutcome {
  error?: string;
  reward?: Reward;
  score?: number;
  best?: number;
  isBest?: boolean;
  completed?: boolean;
}

const schema = z.object({
  gameId: z.string().min(1).max(60).refine(isGame, 'Ukendt spil'),
  difficulty: z.enum(['let', 'mellem', 'svaer']),
  done: z.number().int().min(0).max(200),
  total: z.number().int().min(1).max(200),
  seconds: z.number().int().min(0).max(6 * 3600),
});

/**
 * Bogfører en runde.
 *
 * Alt klienten sender er en påstand: serveren klipper `done` til `total` og
 * `total` til noget en runde overhovedet kan bestå af, før der udbetales et
 * eneste point. En manipuleret forespørgsel kan altså være forkert, men
 * aldrig indbringende.
 */
export async function finishGameAction(input: unknown): Promise<FinishOutcome> {
  await assertSameOrigin();
  const user = await requireApiUser();

  if (!rateLimit(`spil:${user.id}`, LIMITS.write.limit, LIMITS.write.windowMs).allowed) {
    return { error: 'Lige et øjeblik.' };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: 'Den runde gik ikke op.' };

  try {
    const result = await recordCatalogRun(user.id, parsed.data);
    revalidatePath('/play');
    return {
      reward: result.reward,
      score: result.score,
      best: result.best,
      isBest: result.isBest,
      completed: result.completed,
    };
  } catch (err) {
    console.error('[spil] kunne ikke gemme runden', err);
    return { error: 'Kunne ikke gemme runden.' };
  }
}
