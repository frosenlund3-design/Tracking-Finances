import '@/lib/server-guard';
import { randomUUID } from 'node:crypto';
import { withUser } from '@/database';
import { today } from '@/lib/dates';
import { addDays, daysBetween, isoDate } from '@/lib/normalize';
import { FRACTIONS, type FractionDef } from '@/lib/waste';
import { grantXp, type GrantResult } from '@/services/player';

/**
 * The home: which bins are actually in the yard, and what is about to run out.
 *
 * The bins half exists because sorting advice is useless without somewhere to
 * put the result. Knowing that a milk carton has its own fraction does not
 * help if there is no carton bin, and "you are missing two of the ten" is a
 * concrete errand rather than a vague sense of doing it wrong.
 */

export type BinStatus = 'have' | 'missing' | 'unknown';

export interface BinState {
  fraction: FractionDef;
  status: BinStatus;
}

export async function listBins(userId: string): Promise<BinState[]> {
  const stored = await withUser(userId, async (db) => {
    const { rows } = await db.query<{ fraction: string; status: string }>(
      `SELECT fraction, status FROM home_bins WHERE user_id = $1`,
      [userId],
    );
    return new Map(rows.map((r) => [r.fraction, r.status as BinStatus]));
  });

  return FRACTIONS.map((fraction) => ({
    fraction,
    status: stored.get(fraction.key) ?? 'unknown',
  }));
}

export async function setBin(
  userId: string,
  fraction: string,
  status: BinStatus,
): Promise<GrantResult | null> {
  if (!FRACTIONS.some((f) => f.key === fraction)) throw new Error('Unknown fraction');

  const firstAnswer = await withUser(userId, async (db) => {
    const { rows } = await db.query<{ status: string }>(
      `SELECT status FROM home_bins WHERE user_id = $1 AND fraction = $2`,
      [userId, fraction],
    );
    const previous = rows[0]?.status ?? 'unknown';
    await db.query(
      `INSERT INTO home_bins (user_id, fraction, status) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, fraction) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
      [userId, fraction, status],
    );
    return previous === 'unknown' && status !== 'unknown';
  });

  // Points for answering the question, once. Changing the answer later is
  // maintenance, not an achievement.
  return firstAnswer ? grantXp(userId, 'bin_confirmed', { fraction, status }) : null;
}

export interface BinSummary {
  answered: number;
  total: number;
  missing: FractionDef[];
}

export async function binSummary(userId: string): Promise<BinSummary> {
  const bins = await listBins(userId);
  return {
    answered: bins.filter((b) => b.status !== 'unknown').length,
    total: bins.length,
    missing: bins.filter((b) => b.status === 'missing').map((b) => b.fraction),
  };
}

/* --------------------------------------------------------------- supplies */

export interface Supply {
  id: string;
  name: string;
  icon: string;
  typicalDays: number;
  lastBoughtOn: string | null;
  /** Estimated days until it runs out. Null when never bought. */
  daysLeft: number | null;
  /** Estimated date it runs out. */
  runsOutOn: string | null;
  state: 'unknown' | 'plenty' | 'soon' | 'out';
}

interface SupplyRow {
  id: string;
  name: string;
  icon: string;
  typical_days: number;
  last_bought_on: string | Date | null;
}

function mapSupply(row: SupplyRow, now: string): Supply {
  const lastBoughtOn = row.last_bought_on ? isoDate(row.last_bought_on) : null;
  const typicalDays = Math.max(1, Number(row.typical_days));

  if (!lastBoughtOn) {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      typicalDays,
      lastBoughtOn: null,
      daysLeft: null,
      runsOutOn: null,
      state: 'unknown',
    };
  }

  const runsOutOn = addDays(lastBoughtOn, typicalDays);
  const daysLeft = daysBetween(now, runsOutOn);
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    typicalDays,
    lastBoughtOn,
    daysLeft,
    runsOutOn,
    // "Soon" is a fifth of the cycle, so a 30-day item warns at six days and a
    // 7-day item warns at one — the same amount of notice in proportion.
    state: daysLeft <= 0 ? 'out' : daysLeft <= Math.ceil(typicalDays / 5) ? 'soon' : 'plenty',
  };
}

export async function listSupplies(userId: string, now: string = today()): Promise<Supply[]> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<SupplyRow>(
      `SELECT id, name, icon, typical_days, last_bought_on
         FROM supplies WHERE user_id = $1 AND archived_at IS NULL
        ORDER BY last_bought_on NULLS FIRST, created_at`,
      [userId],
    );
    return rows
      .map((row) => mapSupply(row, now))
      .sort((a, b) => (a.daysLeft ?? 1e6) - (b.daysLeft ?? 1e6));
  });
}

export async function createSupply(
  userId: string,
  input: { name: string; icon?: string; typicalDays?: number; lastBoughtOn?: string | null },
): Promise<string> {
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error('A supply needs a name');
  const id = randomUUID();
  await withUser(userId, async (db) => {
    await db.query(
      `INSERT INTO supplies (id, user_id, name, icon, typical_days, last_bought_on)
       VALUES ($1, $2, $3, $4, $5, $6::date)`,
      [id, userId, name, input.icon ?? 'box', Math.min(Math.max(input.typicalDays ?? 30, 1), 3650),
       input.lastBoughtOn ?? null],
    );
  });
  return id;
}

export async function restockSupply(
  userId: string,
  supplyId: string,
  now: string = today(),
): Promise<GrantResult | null> {
  const updated = await withUser(userId, async (db) => {
    const { rowCount } = await db.query(
      `UPDATE supplies SET last_bought_on = $3::date
        WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
          AND (last_bought_on IS NULL OR last_bought_on < $3::date)`,
      [supplyId, userId, now],
    );
    return rowCount > 0;
  });
  return updated ? grantXp(userId, 'supply_restocked', { supplyId }) : null;
}

export async function archiveSupply(userId: string, supplyId: string): Promise<void> {
  await withUser(userId, async (db) => {
    await db.query(`UPDATE supplies SET archived_at = now() WHERE id = $1 AND user_id = $2`, [
      supplyId,
      userId,
    ]);
  });
}

/** What a person starting from nothing almost certainly needs to track. */
export const STARTER_SUPPLIES: Array<{ name: string; icon: string; typicalDays: number }> = [
  { name: 'Toilet paper', icon: 'roll', typicalDays: 21 },
  { name: 'Dishwasher tabs', icon: 'box', typicalDays: 45 },
  { name: 'Laundry detergent', icon: 'bottle', typicalDays: 60 },
  { name: 'Bin bags', icon: 'bag', typicalDays: 40 },
  { name: 'Kitchen roll', icon: 'roll', typicalDays: 30 },
  { name: 'Toothpaste', icon: 'tube', typicalDays: 45 },
];
