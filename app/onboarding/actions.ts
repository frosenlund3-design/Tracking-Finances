'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSameOrigin, requireApiUser } from '@/lib/auth';
import { completeOnboarding, setDemoMode } from '@/services/users';
import { loadDemoData } from '@/services/sync';
import { LIMITS, rateLimit } from '@/security/rate-limit';

const trackingModeSchema = z.enum(['personal', 'business', 'both']);

export async function loadDemoDataAction(): Promise<{ error?: string; inserted?: number }> {
  await assertSameOrigin();
  const user = await requireApiUser();

  if (!rateLimit(`demo:${user.id}`, LIMITS.sync.limit, LIMITS.sync.windowMs).allowed) {
    return { error: 'Please wait a moment before loading demo data again.' };
  }

  const outcome = await loadDemoData(user.id);
  await setDemoMode(user.id, true);
  revalidatePath('/', 'layout');
  return { inserted: outcome.ingest.inserted };
}

export async function completeOnboardingAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiUser();

  const parsed = trackingModeSchema.safeParse(formData.get('trackingMode'));
  await completeOnboarding(user.id, parsed.success ? parsed.data : 'both');
  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
