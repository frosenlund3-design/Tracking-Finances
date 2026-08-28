'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSameOrigin, requestContext, requireApiUser } from '@/lib/auth';
import {
  AuthError,
  changePassword,
  deleteAccount,
  deleteFinancialData,
  updateProfile,
} from '@/services/users';
import { setAccountOwnership } from '@/services/accounts';
import { recategorizeAll } from '@/services/transactions';
import { refreshAnalysis } from '@/services/sync';
import { withUser } from '@/database';
import { clearSessionCookie, destroyAllSessions } from '@/security/session';
import { AUDIT_ACTIONS, recordAudit } from '@/security/audit';

export interface SettingsResult {
  ok?: boolean;
  error?: string;
  message?: string;
}

const profileSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  trackingMode: z.enum(['personal', 'business', 'both']),
  baseCurrency: z.string().trim().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code.'),
});

export async function updateProfileAction(formData: FormData): Promise<SettingsResult> {
  await assertSameOrigin();
  const user = await requireApiUser();

  const parsed = profileSchema.safeParse({
    displayName: formData.get('displayName') || undefined,
    trackingMode: formData.get('trackingMode'),
    baseCurrency: String(formData.get('baseCurrency') ?? '').toUpperCase(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the details.' };

  await updateProfile(user.id, {
    displayName: parsed.data.displayName ?? null,
    trackingMode: parsed.data.trackingMode,
    baseCurrency: parsed.data.baseCurrency,
  });
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Saved.' };
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: z.string().min(12, 'Use at least 12 characters.').max(200),
});

export async function changePasswordAction(formData: FormData): Promise<SettingsResult> {
  await assertSameOrigin();
  const user = await requireApiUser();

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the details.' };

  try {
    await changePassword(user.id, parsed.data.currentPassword, parsed.data.newPassword);
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    console.error('[settings] password change failed', err);
    return { error: 'Could not change the password.' };
  }

  await recordAudit(user.id, AUDIT_ACTIONS.PASSWORD_CHANGED, {}, await requestContext());
  return { ok: true, message: 'Password updated. Other sessions stay signed in — sign them out below if you want.' };
}

export async function signOutEverywhereAction(): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiUser();
  await destroyAllSessions(user.id);
  await clearSessionCookie();
  redirect('/login');
}

const accountOwnershipSchema = z.object({
  accountId: z.string().uuid(),
  ownership: z.enum(['personal', 'business', 'mixed']),
});

export async function setAccountOwnershipAction(formData: FormData): Promise<SettingsResult> {
  await assertSameOrigin();
  const user = await requireApiUser();

  const parsed = accountOwnershipSchema.safeParse({
    accountId: formData.get('accountId'),
    ownership: formData.get('ownership'),
  });
  if (!parsed.success) return { error: 'Could not update that account.' };

  await setAccountOwnership(user.id, parsed.data.accountId, parsed.data.ownership);
  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { ok: true, message: 'Account updated.' };
}

export async function recategorizeAction(): Promise<SettingsResult> {
  await assertSameOrigin();
  const user = await requireApiUser();
  const changed = await recategorizeAll(user.id);
  await refreshAnalysis(user.id);
  revalidatePath('/', 'layout');
  return {
    ok: true,
    message:
      changed === 0
        ? 'Everything already matches your rules.'
        : `${changed} transaction${changed === 1 ? '' : 's'} recategorized. Anything you confirmed by hand was left alone.`,
  };
}

const ruleIdSchema = z.string().uuid();

export async function deleteRuleAction(formData: FormData): Promise<SettingsResult> {
  await assertSameOrigin();
  const user = await requireApiUser();
  const parsed = ruleIdSchema.safeParse(formData.get('ruleId'));
  if (!parsed.success) return { error: 'Unknown rule.' };

  await withUser(user.id, async (db) => {
    await db.query('DELETE FROM merchant_rules WHERE id = $1 AND user_id = $2', [
      parsed.data,
      user.id,
    ]);
  });
  revalidatePath('/settings');
  return { ok: true, message: 'Rule removed. It stops applying to new transactions.' };
}

/** Destructive. Requires the user to type the confirmation phrase. */
export async function deleteFinancialDataAction(formData: FormData): Promise<SettingsResult> {
  await assertSameOrigin();
  const user = await requireApiUser();

  if (String(formData.get('confirm') ?? '').trim().toLowerCase() !== 'delete my data') {
    return { error: 'Type “delete my data” exactly to confirm.' };
  }

  await deleteFinancialData(user.id);
  await recordAudit(user.id, AUDIT_ACTIONS.FINANCIAL_DATA_DELETED, {}, await requestContext());
  revalidatePath('/', 'layout');
  return { ok: true, message: 'All financial data deleted. Your account remains.' };
}

export async function deleteAccountAction(formData: FormData): Promise<SettingsResult> {
  await assertSameOrigin();
  const user = await requireApiUser();

  if (String(formData.get('confirm') ?? '').trim().toLowerCase() !== 'delete my account') {
    return { error: 'Type “delete my account” exactly to confirm.' };
  }

  // Audited before the row disappears — cascade removes the log with the user.
  await recordAudit(user.id, AUDIT_ACTIONS.ACCOUNT_DELETED, {}, await requestContext());
  await deleteAccount(user.id);
  await clearSessionCookie();
  redirect('/?deleted=1');
}
