'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSameOrigin, requireApiUser } from '@/lib/auth';
import { addPantryItem, settlePantryItem } from '@/services/pantry';
import { lookupProduct, isValidBarcode } from '@/services/products';
import { isFoodGroup, suggestExpiry } from '@/lib/food';
import { today } from '@/lib/dates';
import { LIMITS, rateLimit } from '@/security/rate-limit';
import { rewardOf, type Reward } from '@/lib/reward';

export interface LookupResult {
  error?: string;
  /** Present when something recognised the barcode. */
  name?: string;
  brand?: string | null;
  group?: string;
  quantityText?: string | null;
  suggestedExpiry?: string;
  /** True when the code is well-formed but nobody knows it. */
  unknown?: boolean;
}

export async function lookupBarcodeAction(barcode: string): Promise<LookupResult> {
  await assertSameOrigin();
  const user = await requireApiUser();

  if (!rateLimit(`scan:${user.id}`, LIMITS.write.limit, LIMITS.write.windowMs).allowed) {
    return { error: 'Scanning a little fast. Give it a second.' };
  }
  if (!isValidBarcode(barcode)) return { error: 'That is not a product barcode.' };

  const { product, unknown } = await lookupProduct(barcode);
  if (!product) {
    return {
      unknown,
      // Even for an unknown code the shelf-life table still has something to
      // say, so the manual form arrives with a date already filled in.
      suggestedExpiry: suggestExpiry('other', today()),
    };
  }

  return {
    name: product.name,
    brand: product.brand,
    group: product.group,
    quantityText: product.quantityText,
    suggestedExpiry: suggestExpiry(product.group, today()),
  };
}

const addSchema = z.object({
  name: z.string().trim().min(1).max(120),
  barcode: z.string().trim().max(20).nullable(),
  group: z.string().refine(isFoodGroup, 'Unknown kind'),
  location: z.enum(['fridge', 'freezer', 'pantry']),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  quantity: z.number().int().min(1).max(99),
});

export interface AddOutcome {
  error?: string;
  added?: { id: string; name: string };
  reward?: Reward;
  firstEver?: boolean;
}

export async function addItemAction(input: unknown): Promise<AddOutcome> {
  await assertSameOrigin();
  const user = await requireApiUser();

  if (!rateLimit(`pantry:${user.id}`, LIMITS.write.limit, LIMITS.write.windowMs).allowed) {
    return { error: 'Give it a moment.' };
  }

  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Could not add that.' };
  }

  try {
    const result = await addPantryItem(user.id, {
      name: parsed.data.name,
      barcode: parsed.data.barcode,
      group: parsed.data.group as never,
      location: parsed.data.location,
      expiresOn: parsed.data.expiresOn,
      quantity: parsed.data.quantity,
    });
    revalidatePath('/kitchen');
    revalidatePath('/play');
    return {
      added: { id: result.item.id, name: result.item.name },
      reward: rewardOf(result.grant),
      firstEver: result.firstEver,
    };
  } catch (err) {
    console.error('[kitchen] add failed', err);
    return { error: 'Could not add that.' };
  }
}

const settleSchema = z.object({
  id: z.uuid(),
  outcome: z.enum(['eaten', 'frozen', 'binned']),
});

export interface SettleOutcome {
  error?: string;
  reward?: Reward;
  rescued?: boolean;
}

export async function settleItemAction(input: unknown): Promise<SettleOutcome> {
  await assertSameOrigin();
  const user = await requireApiUser();

  const parsed = settleSchema.safeParse(input);
  if (!parsed.success) return { error: 'Unknown item.' };

  try {
    const result = await settlePantryItem(user.id, parsed.data.id, parsed.data.outcome);
    revalidatePath('/kitchen');
    revalidatePath('/play');
    return { reward: rewardOf(result.grant, result.rescue), rescued: result.rescue !== null };
  } catch {
    return { error: 'That item is not in your kitchen any more.' };
  }
}
