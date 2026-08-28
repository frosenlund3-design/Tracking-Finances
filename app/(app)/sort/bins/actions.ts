'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSameOrigin, requireApiUser } from '@/lib/auth';
import { setBin } from '@/services/home';
import { rewardOf, type Reward } from '@/lib/reward';

const schema = z.object({
  fraction: z.string().min(1).max(30),
  status: z.enum(['have', 'missing', 'unknown']),
});

export async function setBinAction(input: unknown): Promise<{ error?: string; reward?: Reward }> {
  await assertSameOrigin();
  const user = await requireApiUser();

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: 'Unknown bin.' };

  try {
    const grant = await setBin(user.id, parsed.data.fraction, parsed.data.status);
    revalidatePath('/sort/bins');
    revalidatePath('/play');
    return { reward: rewardOf(grant) };
  } catch {
    return { error: 'That is not one of the ten fractions.' };
  }
}
