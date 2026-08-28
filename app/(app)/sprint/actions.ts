'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSameOrigin, requireApiUser } from '@/lib/auth';
import { recordRun } from '@/services/games';
import { rewardOf, type Reward } from '@/lib/reward';
import { LIMITS, rateLimit } from '@/security/rate-limit';

const schema = z.object({
  done: z.number().int().min(1).max(6),
  total: z.number().int().min(1).max(6),
  durationMs: z.number().int().min(0).max(600_000),
});

export async function finishSprintAction(
  input: unknown,
): Promise<{ error?: string; reward?: Reward }> {
  await assertSameOrigin();
  const user = await requireApiUser();

  if (!rateLimit(`sprint:${user.id}`, LIMITS.write.limit, LIMITS.write.windowMs).allowed) {
    return { error: 'Give it a moment.' };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: 'That sprint did not add up.' };

  const result = await recordRun(user.id, {
    game: 'sprint',
    correct: parsed.data.done,
    total: parsed.data.total,
    durationMs: parsed.data.durationMs,
  });
  revalidatePath('/play');
  return { reward: rewardOf(...result.grants) };
}
