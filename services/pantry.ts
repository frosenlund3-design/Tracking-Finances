import '@/lib/server-guard';
import { randomUUID } from 'node:crypto';
import { withUser } from '@/database';
import { today } from '@/lib/dates';
import { isoDate } from '@/lib/normalize';
import {
  foodGroup,
  freshness,
  guessFoodGroup,
  isFoodGroup,
  suggestExpiry,
  type FoodGroup,
  type Freshness,
} from '@/lib/food';
import { grantXp } from '@/services/player';
import { isNewBarcode, lookupProduct, writeCache } from '@/services/products';
import type { GrantResult } from '@/services/player';

/**
 * What is in the kitchen.
 *
 * The only design decision here that matters: an item is never deleted. It is
 * settled — eaten, frozen, or binned — and the row stays. That is what makes
 * "you used 14 things before their date this month" a true sentence rather
 * than a guess, and it is the difference between an app that congratulates you
 * for something you did and one that congratulates you for nothing.
 */

export type Settlement = 'eaten' | 'frozen' | 'binned';
export type PantryLocation = 'fridge' | 'freezer' | 'pantry';

export interface PantryItem {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  group: FoodGroup;
  glyph: string;
  location: PantryLocation;
  quantity: number;
  expiresOn: string | null;
  openedOn: string | null;
  status: 'in' | Settlement;
  freshness: Freshness;
  addedAt: string;
}

interface Row {
  id: string;
  barcode: string | null;
  name: string;
  location: string;
  quantity: number;
  expires_on: string | Date | null;
  opened_on: string | Date | null;
  status: string;
  added_at: string | Date;
  brand: string | null;
  category: string | null;
}

const SELECT = `
  SELECT p.id, p.barcode, p.name, p.location, p.quantity, p.expires_on, p.opened_on,
         p.status, p.added_at, pr.brand, pr.category
    FROM pantry_items p
    LEFT JOIN products pr ON pr.barcode = p.barcode`;

function mapRow(row: Row, now: string): PantryItem {
  const group: FoodGroup =
    row.category && isFoodGroup(row.category)
      ? (row.category as FoodGroup)
      : guessFoodGroup(row.name);
  const expiresOn = row.expires_on ? isoDate(row.expires_on) : null;
  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    group,
    glyph: foodGroup(group).glyph,
    location: (row.location as PantryLocation) ?? 'fridge',
    quantity: Number(row.quantity),
    expiresOn,
    openedOn: row.opened_on ? isoDate(row.opened_on) : null,
    status: row.status as PantryItem['status'],
    freshness: freshness(expiresOn, now),
    addedAt: row.added_at instanceof Date ? row.added_at.toISOString() : String(row.added_at),
  };
}

export interface AddPantryInput {
  barcode?: string | null;
  name: string;
  group?: FoodGroup;
  location?: PantryLocation;
  quantity?: number;
  expiresOn?: string | null;
}

export interface AddResult {
  item: PantryItem;
  grant: GrantResult;
  /** True when nobody had ever scanned this barcode before. */
  firstEver: boolean;
}

/** Adds something, and pays for it. */
export async function addPantryItem(
  userId: string,
  input: AddPantryInput,
  now: string = today(),
): Promise<AddResult> {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error('An item needs a name');

  const group = input.group ?? guessFoodGroup(name);
  const def = foodGroup(group);
  const location = input.location ?? def.location;
  const expiresOn = input.expiresOn ?? suggestExpiry(group, now);
  const barcode = input.barcode?.trim() || null;

  // Only counts as new the first time anyone anywhere scanned it, which is
  // checked before the cache write below turns it into a known product.
  const firstEver = barcode ? await isNewBarcode(barcode) : false;
  if (barcode) {
    await writeCache({
      barcode,
      name,
      brand: null,
      group,
      quantityText: null,
      packagingFraction: def.fraction,
      source: 'manual',
    });
  }

  const id = randomUUID();
  const item = await withUser(userId, async (db) => {
    await db.query(
      `INSERT INTO pantry_items (id, user_id, barcode, name, location, quantity, expires_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date)`,
      [id, userId, barcode, name, location, Math.max(1, input.quantity ?? 1), expiresOn],
    );
    const { rows } = await db.query<Row>(`${SELECT} WHERE p.id = $1 AND p.user_id = $2`, [id, userId]);
    return mapRow(rows[0]!, now);
  });

  const grant = await grantXp(userId, firstEver ? 'scan_first_time' : 'scan_product', {
    name,
    barcode: barcode ?? '',
  });

  return { item, grant, firstEver };
}

export interface PantryFilter {
  status?: 'in' | Settlement;
  location?: PantryLocation;
  limit?: number;
}

export async function listPantry(
  userId: string,
  filter: PantryFilter = {},
  now: string = today(),
): Promise<PantryItem[]> {
  return withUser(userId, async (db) => {
    const params: unknown[] = [userId];
    let sql = `${SELECT} WHERE p.user_id = $1`;

    params.push(filter.status ?? 'in');
    sql += ` AND p.status = $${params.length}`;

    if (filter.location) {
      params.push(filter.location);
      sql += ` AND p.location = $${params.length}`;
    }

    // Undated things last: a date is the reason to act, so rows that have one
    // belong at the top whichever way the list is read.
    sql += ` ORDER BY p.expires_on ASC NULLS LAST, p.added_at DESC`;
    params.push(Math.min(filter.limit ?? 200, 500));
    sql += ` LIMIT $${params.length}`;

    const { rows } = await db.query<Row>(sql, params);
    return rows.map((row) => mapRow(row, now));
  });
}

export interface SettleResult {
  item: PantryItem;
  grant: GrantResult;
  /** A second grant when something was used before its date. */
  rescue: GrantResult | null;
}

/**
 * Eaten, frozen or binned.
 *
 * Binning still pays. Deciding is the behaviour worth reinforcing, and an app
 * that withholds points for an honest "this went off" teaches people to leave
 * it in the list instead — which is how a pantry app becomes a second, worse
 * fridge full of things nobody will look at.
 */
export async function settlePantryItem(
  userId: string,
  id: string,
  outcome: Settlement,
  now: string = today(),
): Promise<SettleResult> {
  const item = await withUser(userId, async (db) => {
    const { rows: before } = await db.query<Row>(
      `${SELECT} WHERE p.id = $1 AND p.user_id = $2 AND p.status = 'in'`,
      [id, userId],
    );
    if (!before[0]) throw new Error('Item not found');

    await db.query(
      `UPDATE pantry_items SET status = $3, settled_at = now()
        WHERE id = $1 AND user_id = $2`,
      [id, userId, outcome],
    );
    return mapRow(before[0], now);
  });

  const grant = await grantXp(userId, 'pantry_decision', { outcome, name: item.name });

  // Rescued: used or preserved while it was still good.
  const saved =
    (outcome === 'eaten' || outcome === 'frozen') &&
    (item.expiresOn === null || item.expiresOn >= now);
  const rescue = saved ? await grantXp(userId, 'expiry_rescue', { name: item.name }) : null;

  return { item: { ...item, status: outcome }, grant, rescue };
}

export interface PantrySummary {
  total: number;
  expired: number;
  /** Due today or within three days. */
  urgent: number;
  thisWeek: number;
  /** Settled as eaten or frozen while still good, over the last 30 days. */
  rescuedLast30: number;
  binnedLast30: number;
}

export async function pantrySummary(
  userId: string,
  now: string = today(),
): Promise<PantrySummary> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<{
      total: number;
      expired: number;
      urgent: number;
      this_week: number;
    }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE expires_on < $2::date)::int AS expired,
              count(*) FILTER (WHERE expires_on >= $2::date
                                AND expires_on <= $2::date + 3)::int AS urgent,
              count(*) FILTER (WHERE expires_on > $2::date + 3
                                AND expires_on <= $2::date + 7)::int AS this_week
         FROM pantry_items WHERE user_id = $1 AND status = 'in'`,
      [userId, now],
    );

    const { rows: settled } = await db.query<{ rescued: number; binned: number }>(
      `SELECT count(*) FILTER (WHERE status IN ('eaten','frozen'))::int AS rescued,
              count(*) FILTER (WHERE status = 'binned')::int AS binned
         FROM pantry_items
        WHERE user_id = $1 AND settled_at >= now() - INTERVAL '30 days'`,
      [userId],
    );

    return {
      total: Number(rows[0]?.total ?? 0),
      expired: Number(rows[0]?.expired ?? 0),
      urgent: Number(rows[0]?.urgent ?? 0),
      thisWeek: Number(rows[0]?.this_week ?? 0),
      rescuedLast30: Number(settled[0]?.rescued ?? 0),
      binnedLast30: Number(settled[0]?.binned ?? 0),
    };
  });
}

/** The queue for the expiry game: what needs deciding, most urgent first. */
export async function expiringSoon(
  userId: string,
  limit = 12,
  now: string = today(),
): Promise<PantryItem[]> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<Row>(
      `${SELECT}
        WHERE p.user_id = $1 AND p.status = 'in'
          AND p.expires_on IS NOT NULL AND p.expires_on <= $2::date + 5
        ORDER BY p.expires_on ASC
        LIMIT $3`,
      [userId, now, limit],
    );
    return rows.map((row) => mapRow(row, now));
  });
}
