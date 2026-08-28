'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSameOrigin, requireApiUser } from '@/lib/auth';
import { archiveSupply, createSupply, restockSupply } from '@/services/home';
import { rewardOf, type Reward } from '@/lib/reward';
import { LIMITS, rateLimit } from '@/security/rate-limit';

export interface SupplyOutcome {
  error?: string;
  reward?: Reward;
}

const idSchema = z.object({ id: z.uuid() });

export async function restockAction(input: unknown): Promise<SupplyOutcome> {
  await assertSameOrigin();
  const user = await requireApiUser();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: 'Unknown item.' };

  const grant = await restockSupply(user.id, parsed.data.id);
  revalidatePath('/supplies');
  revalidatePath('/play');
  return { reward: rewardOf(grant) };
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().min(1).max(12),
  typicalDays: z.number().int().min(1).max(3650),
});

export async function createSupplyAction(input: unknown): Promise<SupplyOutcome> {
  await assertSameOrigin();
  const user = await requireApiUser();

  if (!rateLimit(`supply:${user.id}`, LIMITS.write.limit, LIMITS.write.windowMs).allowed) {
    return { error: 'Give it a moment.' };
  }
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: 'Give it a name and how long one lasts.' };

  await createSupply(user.id, parsed.data);
  revalidatePath('/supplies');
  revalidatePath('/play');
  return {};
}

export async function archiveSupplyAction(input: unknown): Promise<SupplyOutcome> {
  await assertSameOrigin();
  const user = await requireApiUser();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: 'Unknown item.' };

  await archiveSupply(user.id, parsed.data.id);
  revalidatePath('/supplies');
  revalidatePath('/play');
  return {};
}
