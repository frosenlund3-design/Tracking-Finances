'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSameOrigin, requireApiUser } from '@/lib/auth';
import { withUser } from '@/database';
import { updateTransaction } from '@/services/transactions';
import { detectAndStoreSubscriptions } from '@/services/subscriptions';
import { isKnownCategory } from '@/lib/categories';
import { LIMITS, rateLimit } from '@/security/rate-limit';
import { grantXp } from '@/services/player';
import { rewardOf, type Reward } from '@/lib/reward';

export interface ReviewResult {
  ok?: boolean;
  error?: string;
  /** How many other transactions the same decision was applied to. */
  alsoUpdated?: number;
  /** Points, and anything the decision unlocked. Money is an area like any other. */
  reward?: Reward;
}

const decideSchema = z.object({
  id: z.uuid(),
  category: z.string().refine(isKnownCategory, 'Unknown category.'),
  applyToMerchant: z.boolean().default(true),
});

/**
 * One decision, applied everywhere it belongs.
 *
 * The point of the review queue is that a tap has to be worth making: saying
 * "this is Groceries" should settle every other unreviewed charge from the
 * same merchant at the same time, not just this one row.
 */
export async function decideCategoryAction(formData: FormData): Promise<ReviewResult> {
  await assertSameOrigin();
  const user = await requireApiUser();

  if (!rateLimit(`review:${user.id}`, LIMITS.write.limit, LIMITS.write.windowMs).allowed) {
    return { error: 'Slow down a moment.' };
  }

  const parsed = decideSchema.safeParse({
    id: formData.get('id'),
    category: formData.get('category'),
    applyToMerchant: formData.get('applyToMerchant') !== 'false',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Could not save that.' };

  try {
    const outcome = await updateTransaction(user.id, parsed.data.id, {
      category: parsed.data.category,
      applyToFutureMerchant: parsed.data.applyToMerchant,
      applyToPastMerchant: parsed.data.applyToMerchant,
    });
    // Deliberately no revalidatePath here. The deck holds the queue it was
    // given and walks it client-side; re-rendering the page mid-flow would
    // swap in a shorter queue under the user's thumb, and once the last row
    // is decided it would replace the summary with the empty state — losing
    // the one moment that shows the work paid off. finishReviewAction does
    // the revalidating, on the way out.
    // Sorting money counts towards the same level as sorting a fridge — one
    // decision per transaction settled, so clearing nine siblings pays nine.
    const grant = await grantXp(
      user.id,
      'transaction_sorted',
      { category: parsed.data.category },
      1 + outcome.pastUpdated,
    );
    return { ok: true, alsoUpdated: outcome.pastUpdated, reward: rewardOf(grant) };
  } catch (err) {
    console.error('[review] decide failed', err);
    return { error: 'Could not save that.' };
  }
}

const skipSchema = z.object({ id: z.uuid() });

/**
 * "It is what it says it is."
 *
 * Confirms the existing category so the row leaves the queue for good rather
 * than reappearing at the next sync — skipping without recording anything
 * would make the queue impossible to finish.
 */
export async function confirmAsIsAction(formData: FormData): Promise<ReviewResult> {
  await assertSameOrigin();
  const user = await requireApiUser();

  const parsed = skipSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return { error: 'Unknown transaction.' };

  await withUser(user.id, async (db) => {
    await db.query(
      `UPDATE transactions
          SET category_locked = TRUE, confidence_score = 1, updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [parsed.data.id, user.id],
    );
  });
  return { ok: true };
}

/** Re-runs recurring detection once a batch of decisions is done. */
export async function finishReviewAction(): Promise<ReviewResult> {
  await assertSameOrigin();
  const user = await requireApiUser();
  await detectAndStoreSubscriptions(user.id);
  revalidatePath('/', 'layout');
  return { ok: true };
}
