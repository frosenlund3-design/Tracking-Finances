'use server';

import { revalidatePath } from 'next/cache';
import { requireApiUser, requestContext, assertSameOrigin } from '@/lib/auth';
import { deleteTokens } from '@/services/token-vault';
import { AUDIT_ACTIONS, recordAudit } from '@/security/audit';

/** Removes the mailbox grant. The stored tokens go with it. */
export async function disconnectMailboxAction(): Promise<{ ok: boolean }> {
  await assertSameOrigin();
  const user = await requireApiUser();

  await deleteTokens(user.id, 'gmail', null);
  await recordAudit(
    user.id,
    AUDIT_ACTIONS.MAILBOX_DISCONNECTED,
    { provider: 'gmail' },
    await requestContext(),
  );
  revalidatePath('/inbox');
  return { ok: true };
}
