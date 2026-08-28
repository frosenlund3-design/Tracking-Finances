'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { assertSameOrigin, requireApiUser } from '@/lib/auth';
import {
  createManualTransaction,
  deleteTransaction,
  updateTransaction,
} from '@/services/transactions';
import { detectAndStoreSubscriptions } from '@/services/subscriptions';
import { isKnownCategory } from '@/lib/categories';
import { parseAmountToMinor } from '@/lib/money';
import { LIMITS, rateLimit } from '@/security/rate-limit';
import { containsForbiddenSecret } from '@/security/redact';

const ownershipSchema = z.enum(['personal', 'business', 'mixed']);
const taxSchema = z.enum(['deductible', 'potentially_deductible', 'non_deductible', 'needs_review']);

const updateSchema = z.object({
  id: z.string().uuid(),
  category: z.string().refine(isKnownCategory, 'Unknown category.').optional(),
  subcategory: z.string().trim().max(60).nullable().optional(),
  ownership: ownershipSchema.optional(),
  taxRelevant: taxSchema.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  applyToPastMerchant: z.boolean().optional(),
});

export interface ActionResult {
  ok?: boolean;
  error?: string;
  message?: string;
}

async function guard(userId: string): Promise<string | null> {
  if (!rateLimit(`write:${userId}`, LIMITS.write.limit, LIMITS.write.windowMs).allowed) {
    return 'Too many changes at once. Give it a second.';
  }
  return null;
}

export async function updateTransactionAction(formData: FormData): Promise<ActionResult> {
  await assertSameOrigin();
  const user = await requireApiUser();
  const limited = await guard(user.id);
  if (limited) return { error: limited };

  const parsed = updateSchema.safeParse({
    id: formData.get('id'),
    category: formData.get('category') || undefined,
    ownership: formData.get('ownership') || undefined,
    taxRelevant: formData.get('taxRelevant') || undefined,
    notes: formData.has('notes') ? String(formData.get('notes') ?? '') : undefined,
    applyToPastMerchant: formData.get('applyToPast') === 'on',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Could not save that change.' };
  }

  // A note is free text the user types. It must never become a place where
  // card details end up stored.
  if (parsed.data.notes && containsForbiddenSecret(parsed.data.notes)) {
    return {
      error: 'That note looks like it contains card or credential details. Kroner does not store those.',
    };
  }

  const { id, ...patch } = parsed.data;
  try {
    const outcome = await updateTransaction(user.id, id, patch);
    // A recategorization can change what counts as a subscription.
    if (patch.category) await detectAndStoreSubscriptions(user.id);

    revalidatePath('/transactions');
    revalidatePath(`/transactions/${id}`);
    revalidatePath('/dashboard');

    const bits: string[] = [];
    if (outcome.ruleCreated) bits.push('Future charges from this merchant will follow suit.');
    if (outcome.pastUpdated > 0) bits.push(`${outcome.pastUpdated} past transaction${outcome.pastUpdated === 1 ? '' : 's'} updated.`);
    return { ok: true, message: bits.join(' ') || 'Saved.' };
  } catch (err) {
    console.error('[transactions] update failed', err);
    return { error: 'Could not save that change.' };
  }
}

const manualSchema = z.object({
  accountId: z.string().uuid('Choose an account.'),
  amount: z.string().min(1, 'Enter an amount.'),
  kind: z.enum(['income', 'expense']),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.'),
  merchant: z.string().trim().min(1, 'Enter who it was with.').max(120),
  description: z.string().trim().max(300).optional(),
  category: z.string().refine(isKnownCategory, 'Choose a category.'),
  ownership: ownershipSchema,
  taxRelevant: taxSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function createManualTransactionAction(formData: FormData): Promise<ActionResult> {
  await assertSameOrigin();
  const user = await requireApiUser();
  const limited = await guard(user.id);
  if (limited) return { error: limited };

  const parsed = manualSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the details and try again.' };
  }

  const magnitude = parseAmountToMinor(parsed.data.amount);
  if (magnitude === null || magnitude === 0) return { error: 'Enter a valid amount.' };

  const free = `${parsed.data.merchant} ${parsed.data.description ?? ''} ${parsed.data.notes ?? ''}`;
  if (containsForbiddenSecret(free)) {
    return { error: 'That looks like it contains card or credential details. Kroner does not store those.' };
  }

  const amountMinor = parsed.data.kind === 'expense' ? -Math.abs(magnitude) : Math.abs(magnitude);

  try {
    await createManualTransaction(user.id, {
      accountId: parsed.data.accountId,
      amountMinor,
      currency: user.baseCurrency,
      transactionDate: parsed.data.transactionDate,
      merchant: parsed.data.merchant,
      description: parsed.data.description || parsed.data.merchant,
      category: parsed.data.category,
      ownership: parsed.data.ownership,
      transactionType: parsed.data.kind,
      taxRelevant: parsed.data.taxRelevant,
      notes: parsed.data.notes || null,
    });
  } catch (err) {
    console.error('[transactions] manual create failed', err);
    return { error: 'Could not add that transaction.' };
  }

  revalidatePath('/transactions');
  revalidatePath('/dashboard');
  redirect('/transactions');
}

export async function deleteTransactionAction(formData: FormData): Promise<ActionResult> {
  await assertSameOrigin();
  const user = await requireApiUser();
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return { error: 'Unknown transaction.' };

  // Only manually added rows can be deleted — provider data is a record of what
  // happened, and deleting it would just be re-imported on the next sync.
  const deleted = await deleteTransaction(user.id, id.data);
  if (!deleted) {
    return { error: 'Only manually added transactions can be deleted.' };
  }
  revalidatePath('/transactions');
  revalidatePath('/dashboard');
  redirect('/transactions');
}
