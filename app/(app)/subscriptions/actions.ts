'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSameOrigin, requireApiUser } from '@/lib/auth';
import { setSubscriptionStatus } from '@/services/subscriptions';

const schema = z.object({
  id: z.string().uuid(),
  status: z.enum(['active', 'lapsed', 'cancelled']),
});

/**
 * Marks a subscription cancelled locally. This does not cancel anything with
 * the merchant — Kroner has no write access to any provider, and saying
 * otherwise would be a dangerous thing for a finance app to imply.
 */
export async function setSubscriptionStatusAction(
  formData: FormData,
): Promise<{ error?: string }> {
  await assertSameOrigin();
  const user = await requireApiUser();
  const parsed = schema.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
  });
  if (!parsed.success) return { error: 'Could not update that subscription.' };

  await setSubscriptionStatus(user.id, parsed.data.id, parsed.data.status);
  revalidatePath('/subscriptions');
  revalidatePath('/dashboard');
  return {};
}
