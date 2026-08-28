'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSameOrigin, requireApiUser } from '@/lib/auth';
import { archiveRoutine, createRoutine, tickRoutine, untickRoutine } from '@/services/routines';
import { rewardOf, type Reward } from '@/lib/reward';
import { LIMITS, rateLimit } from '@/security/rate-limit';

export interface RoutineOutcome {
  error?: string;
  reward?: Reward;
  hitTarget?: boolean;
}

const idSchema = z.object({ id: z.uuid() });

export async function tickRoutineAction(input: unknown): Promise<RoutineOutcome> {
  await assertSameOrigin();
  const user = await requireApiUser();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: 'Unknown routine.' };

  const result = await tickRoutine(user.id, parsed.data.id);
  revalidatePath('/routines');
  revalidatePath('/play');
  return {
    reward: rewardOf(result.grant, result.targetBonus),
    hitTarget: result.targetBonus !== null,
  };
}

export async function untickRoutineAction(input: unknown): Promise<RoutineOutcome> {
  await assertSameOrigin();
  const user = await requireApiUser();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: 'Unknown routine.' };

  await untickRoutine(user.id, parsed.data.id);
  revalidatePath('/routines');
  revalidatePath('/play');
  return {};
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  area: z.enum(['body', 'home', 'mind']),
  icon: z.string().min(1).max(12),
  targetPerWeek: z.number().int().min(1).max(7),
});

export async function createRoutineAction(input: unknown): Promise<RoutineOutcome> {
  await assertSameOrigin();
  const user = await requireApiUser();

  if (!rateLimit(`routine:${user.id}`, LIMITS.write.limit, LIMITS.write.windowMs).allowed) {
    return { error: 'Give it a moment.' };
  }
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: 'Give it a name and a weekly target.' };

  await createRoutine(user.id, parsed.data);
  revalidatePath('/routines');
  revalidatePath('/play');
  return {};
}

export async function archiveRoutineAction(input: unknown): Promise<RoutineOutcome> {
  await assertSameOrigin();
  const user = await requireApiUser();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: 'Unknown routine.' };

  await archiveRoutine(user.id, parsed.data.id);
  revalidatePath('/routines');
  revalidatePath('/play');
  return {};
}
