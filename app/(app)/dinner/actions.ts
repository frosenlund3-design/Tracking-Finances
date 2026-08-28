'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSameOrigin, requireApiUser } from '@/lib/auth';
import { clearMeal, markCooked, planMeal } from '@/services/meals';
import { rewardOf, type Reward } from '@/lib/reward';
import { LIMITS, rateLimit } from '@/security/rate-limit';

export interface MealOutcome {
  error?: string;
  reward?: Reward;
  recipeName?: string;
}

const planSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recipeKey: z.string().min(1).max(60),
});

export async function planMealAction(input: unknown): Promise<MealOutcome> {
  await assertSameOrigin();
  const user = await requireApiUser();

  if (!rateLimit(`dinner:${user.id}`, LIMITS.write.limit, LIMITS.write.windowMs).allowed) {
    return { error: 'Give it a moment.' };
  }
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { error: 'That date or recipe did not make sense.' };

  try {
    const { meal, grant } = await planMeal(user.id, parsed.data.date, parsed.data.recipeKey);
    revalidatePath('/dinner');
    revalidatePath('/play');
    return { reward: rewardOf(grant), recipeName: meal.recipe.name };
  } catch {
    return { error: 'Could not save that one.' };
  }
}

const dateSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function markCookedAction(input: unknown): Promise<MealOutcome> {
  await assertSameOrigin();
  const user = await requireApiUser();
  const parsed = dateSchema.safeParse(input);
  if (!parsed.success) return { error: 'Unknown day.' };

  const { meal, grant } = await markCooked(user.id, parsed.data.date);
  revalidatePath('/dinner');
  revalidatePath('/play');
  return { reward: rewardOf(grant), recipeName: meal?.recipe.name };
}

export async function clearMealAction(input: unknown): Promise<MealOutcome> {
  await assertSameOrigin();
  const user = await requireApiUser();
  const parsed = dateSchema.safeParse(input);
  if (!parsed.success) return { error: 'Unknown day.' };

  await clearMeal(user.id, parsed.data.date);
  revalidatePath('/dinner');
  revalidatePath('/play');
  return {};
}
