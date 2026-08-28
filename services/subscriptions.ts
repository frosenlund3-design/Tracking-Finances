import '@/lib/server-guard';
import { randomUUID } from 'node:crypto';
import { withUser } from '@/database';
import { addDays, addMonths, daysBetween, isoDate } from '@/lib/normalize';
import { today } from '@/lib/dates';
import type {
  Ownership,
  RecurrenceInterval,
  Subscription,
} from '@/types/finance';

export interface RecurrenceCandidate {
  merchantKey: string;
  merchantLabel: string;
  category: string;
  ownership: Ownership;
  currency: string;
  /** Charge dates, ascending. */
  dates: string[];
  /** Positive magnitudes in minor units, aligned with `dates`. */
  amounts: number[];
}

export interface DetectedRecurrence {
  merchantKey: string;
  merchantLabel: string;
  category: string;
  ownership: Ownership;
  currency: string;
  interval: RecurrenceInterval;
  amountMinor: number;
  monthlyEquivalentMinor: number;
  annualEquivalentMinor: number;
  firstSeen: string;
  lastPaymentDate: string;
  nextPredictedDate: string;
  occurrences: number;
  confidence: number;
  status: Subscription['status'];
  priceChangedAt: string | null;
  previousAmountMinor: number | null;
}

interface IntervalSpec {
  interval: RecurrenceInterval;
  days: number;
  tolerance: number;
  monthsPerCharge: number;
}

/** Cadences we recognise, with how much drift each tolerates. */
const INTERVALS: IntervalSpec[] = [
  { interval: 'weekly', days: 7, tolerance: 2, monthsPerCharge: 7 / 30.44 },
  { interval: 'biweekly', days: 14, tolerance: 3, monthsPerCharge: 14 / 30.44 },
  { interval: 'monthly', days: 30.44, tolerance: 6, monthsPerCharge: 1 },
  { interval: 'quarterly', days: 91.3, tolerance: 12, monthsPerCharge: 3 },
  { interval: 'semiannual', days: 182.6, tolerance: 20, monthsPerCharge: 6 },
  { interval: 'annual', days: 365.25, tolerance: 30, monthsPerCharge: 12 },
];

const MIN_OCCURRENCES = 3;
/**
 * How much a charge may move and still count as the same subscription. Loose,
 * because usage-based bills and FX wobble.
 */
const AMOUNT_TOLERANCE = 0.15;
/**
 * How much a charge must move to count as a *price change*. Much tighter than
 * the identity tolerance above: a 14% rise on a fixed monthly bill is exactly
 * the kind of thing the user wants told, and it sits well inside the 15% band
 * that still counts as the same subscription.
 */
const PRICE_CHANGE_TOLERANCE = 0.03;

/** True when every value sits within `tolerance` of `level`. */
function isStableAround(values: number[], level: number, tolerance: number): boolean {
  if (level <= 0) return false;
  return values.every((v) => Math.abs(v - level) / level <= tolerance);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Decides whether a merchant's charge history is a subscription.
 *
 * Pure and synchronous so it can be exercised directly in tests: give it
 * dates and amounts, get a verdict. No model involved — a subscription is a
 * statistical property of the dates, not something to guess at.
 */
export function detectRecurrence(
  candidate: RecurrenceCandidate,
  now: string = today(),
): DetectedRecurrence | null {
  const { dates, amounts } = candidate;
  if (dates.length < MIN_OCCURRENCES) return null;

  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) gaps.push(daysBetween(dates[i - 1]!, dates[i]!));
  if (gaps.some((g) => g <= 0)) return null;

  const medianGap = median(gaps);
  const spec = INTERVALS.find((s) => Math.abs(medianGap - s.days) <= s.tolerance);
  if (!spec) return null;

  // How many gaps actually land on the cadence.
  const onCadence = gaps.filter((g) => Math.abs(g - spec.days) <= spec.tolerance).length;
  const cadenceRatio = onCadence / gaps.length;
  if (cadenceRatio < 0.6) return null;

  const typical = median(amounts);
  if (typical <= 0) return null;
  const stableAmounts = amounts.filter(
    (a) => Math.abs(a - typical) / typical <= AMOUNT_TOLERANCE,
  ).length;
  const amountRatio = stableAmounts / amounts.length;
  if (amountRatio < 0.5) return null;

  const lastPaymentDate = dates[dates.length - 1]!;

  // Find the most recent step change in the charged amount.
  //
  // Comparing only the final charge against the running median misses a price
  // rise from three months ago that is now the norm — by then the new price
  // dominates the median and the change is invisible. Walking backwards for a
  // step between consecutive charges finds it whenever it happened.
  let priceChangedAt: string | null = null;
  let previousAmountMinor: number | null = null;
  for (let i = amounts.length - 1; i >= 1; i--) {
    const earlier = amounts.slice(0, i);
    const since = amounts.slice(i);
    const beforeLevel = median(earlier);
    const afterLevel = median(since);
    if (beforeLevel <= 0 || afterLevel <= 0) continue;
    if (Math.abs(afterLevel - beforeLevel) / beforeLevel <= PRICE_CHANGE_TOLERANCE) continue;
    // Both sides must be steady. A single spike back and forth is a blip, not
    // a new price, and reporting it as one would be worse than saying nothing.
    if (!isStableAround(earlier, beforeLevel, PRICE_CHANGE_TOLERANCE)) continue;
    if (!isStableAround(since, afterLevel, PRICE_CHANGE_TOLERANCE)) continue;
    priceChangedAt = dates[i]!;
    previousAmountMinor = Math.round(beforeLevel);
    break;
  }

  // The current price is what is being charged now, not the historical median.
  const recent = amounts.slice(-3);
  const amountMinor = Math.round(priceChangedAt ? median(recent) : typical);
  const nextPredictedDate =
    spec.interval === 'weekly' || spec.interval === 'biweekly'
      ? addDays(lastPaymentDate, spec.days)
      : addMonths(lastPaymentDate, Math.round(spec.monthsPerCharge));

  // Missing more than two expected charges means it has probably stopped.
  const daysSinceLast = daysBetween(lastPaymentDate, now);
  const status: Subscription['status'] =
    daysSinceLast > spec.days * 2 + spec.tolerance ? 'lapsed' : 'active';

  const occurrenceBonus = Math.min(dates.length / 12, 1) * 0.15;
  const confidence = Math.min(
    0.99,
    cadenceRatio * 0.5 + amountRatio * 0.35 + occurrenceBonus,
  );

  const monthlyEquivalentMinor = Math.round(amountMinor / spec.monthsPerCharge);

  return {
    merchantKey: candidate.merchantKey,
    merchantLabel: candidate.merchantLabel,
    category: candidate.category,
    ownership: candidate.ownership,
    currency: candidate.currency,
    interval: spec.interval,
    amountMinor,
    monthlyEquivalentMinor,
    annualEquivalentMinor: monthlyEquivalentMinor * 12,
    firstSeen: dates[0]!,
    lastPaymentDate,
    nextPredictedDate,
    occurrences: dates.length,
    confidence: Number(confidence.toFixed(3)),
    status,
    priceChangedAt,
    previousAmountMinor,
  };
}

interface ChargeRow {
  merchant_key: string;
  merchant: string | null;
  category: string;
  ownership: Ownership;
  currency: string;
  transaction_date: string | Date;
  amount_minor: number;
  id: string;
}

/**
 * Rebuilds every subscription for a user from their transaction history.
 *
 * `now` is injectable because "has this lapsed?" is a question about a date,
 * and a function that can only ever be asked about the wall clock cannot be
 * tested — or backfilled over historical data.
 */
export async function detectAndStoreSubscriptions(
  userId: string,
  now: string = today(),
): Promise<{
  detected: number;
  linkedTransactions: number;
}> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<ChargeRow>(
      `SELECT id, merchant_key, merchant, category, ownership, currency, transaction_date, amount_minor
         FROM transactions
        WHERE user_id = $1 AND amount_minor < 0 AND merchant_key IS NOT NULL
          AND category <> 'transfers'
        ORDER BY merchant_key, transaction_date`,
      [userId],
    );

    const groups = new Map<string, ChargeRow[]>();
    for (const row of rows) {
      const list = groups.get(row.merchant_key);
      if (list) list.push(row);
      else groups.set(row.merchant_key, [row]);
    }

    const detectedKeys = new Set<string>();
    let detected = 0;
    let linkedTransactions = 0;

    for (const [key, charges] of groups) {
      // Collapse same-day duplicates: two coffees on one day are not a cadence.
      const byDate = new Map<string, ChargeRow>();
      for (const c of charges) {
        const date = isoDate(c.transaction_date);
        if (!byDate.has(date)) byDate.set(date, c);
      }
      const unique = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
      if (unique.length < MIN_OCCURRENCES) continue;

      const first = unique[0]![1];
      const result = detectRecurrence(
        {
          merchantKey: key,
          merchantLabel: first.merchant ?? key,
          category: charges[charges.length - 1]!.category,
          ownership: charges[charges.length - 1]!.ownership,
          currency: first.currency,
          dates: unique.map(([date]) => date),
          amounts: unique.map(([, c]) => Math.abs(Number(c.amount_minor))),
        },
        now,
      );
      if (!result) continue;

      const { rows: saved } = await db.query<{ id: string }>(
        `INSERT INTO subscriptions (
           id, user_id, merchant_key, merchant_label, category, ownership, interval,
           amount_minor, currency, monthly_equivalent_minor, annual_equivalent_minor,
           first_seen, last_payment_date, next_predicted_date, occurrences, confidence,
           status, price_changed_at, previous_amount_minor, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, now())
         ON CONFLICT (user_id, merchant_key, interval) DO UPDATE SET
           merchant_label = EXCLUDED.merchant_label,
           category = EXCLUDED.category,
           ownership = EXCLUDED.ownership,
           amount_minor = EXCLUDED.amount_minor,
           monthly_equivalent_minor = EXCLUDED.monthly_equivalent_minor,
           annual_equivalent_minor = EXCLUDED.annual_equivalent_minor,
           last_payment_date = EXCLUDED.last_payment_date,
           next_predicted_date = EXCLUDED.next_predicted_date,
           occurrences = EXCLUDED.occurrences,
           confidence = EXCLUDED.confidence,
           status = CASE WHEN subscriptions.status = 'cancelled' THEN 'cancelled'
                         ELSE EXCLUDED.status END,
           price_changed_at = EXCLUDED.price_changed_at,
           previous_amount_minor = EXCLUDED.previous_amount_minor,
           updated_at = now()
         RETURNING id`,
        [
          randomUUID(), userId, result.merchantKey, result.merchantLabel, result.category,
          result.ownership, result.interval, result.amountMinor, result.currency,
          result.monthlyEquivalentMinor, result.annualEquivalentMinor, result.firstSeen,
          result.lastPaymentDate, result.nextPredictedDate, result.occurrences,
          result.confidence, result.status, result.priceChangedAt, result.previousAmountMinor,
        ],
      );

      const subscriptionId = saved[0]!.id;
      detectedKeys.add(key);
      detected++;

      const { rowCount } = await db.query(
        `UPDATE transactions SET recurring_status = 'recurring', subscription_id = $3
          WHERE user_id = $1 AND merchant_key = $2 AND amount_minor < 0`,
        [userId, key, subscriptionId],
      );
      linkedTransactions += rowCount;
    }

    // Merchants that no longer qualify must not keep a stale subscription row.
    const { rows: stale } = await db.query<{ id: string; merchant_key: string }>(
      'SELECT id, merchant_key FROM subscriptions WHERE user_id = $1',
      [userId],
    );
    for (const row of stale) {
      if (detectedKeys.has(row.merchant_key)) continue;
      await db.query(
        `UPDATE transactions SET recurring_status = 'one_off', subscription_id = NULL
          WHERE user_id = $1 AND subscription_id = $2`,
        [userId, row.id],
      );
      await db.query('DELETE FROM subscriptions WHERE id = $1 AND user_id = $2', [row.id, userId]);
    }

    return { detected, linkedTransactions };
  });
}

interface SubscriptionRow {
  id: string; user_id: string; merchant_key: string; merchant_label: string; category: string;
  ownership: Ownership; interval: RecurrenceInterval; amount_minor: number; currency: string;
  monthly_equivalent_minor: number; annual_equivalent_minor: number;
  first_seen: string | Date; last_payment_date: string | Date; next_predicted_date: string | Date;
  occurrences: number; confidence: number; status: Subscription['status'];
  price_changed_at: string | Date | null; previous_amount_minor: number | null;
}

function mapSubscription(row: SubscriptionRow): Subscription {
  const iso = isoDate;
  return {
    id: row.id,
    userId: row.user_id,
    merchantKey: row.merchant_key,
    merchantLabel: row.merchant_label,
    category: row.category,
    ownership: row.ownership,
    interval: row.interval,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    monthlyEquivalentMinor: Number(row.monthly_equivalent_minor),
    annualEquivalentMinor: Number(row.annual_equivalent_minor),
    firstSeen: iso(row.first_seen),
    lastPaymentDate: iso(row.last_payment_date),
    nextPredictedDate: iso(row.next_predicted_date),
    occurrences: row.occurrences,
    confidence: Number(row.confidence),
    status: row.status,
    priceChangedAt: row.price_changed_at ? iso(row.price_changed_at) : null,
    previousAmountMinor: row.previous_amount_minor === null ? null : Number(row.previous_amount_minor),
  };
}

export async function listSubscriptions(
  userId: string,
  options: { ownership?: Ownership | 'all'; status?: Subscription['status'] } = {},
): Promise<Subscription[]> {
  return withUser(userId, async (db) => {
    const params: unknown[] = [userId];
    let sql = 'SELECT * FROM subscriptions WHERE user_id = $1';
    if (options.ownership && options.ownership !== 'all') {
      params.push(options.ownership);
      sql += ` AND ownership = $${params.length}`;
    }
    if (options.status) {
      params.push(options.status);
      sql += ` AND status = $${params.length}`;
    }
    sql += ' ORDER BY monthly_equivalent_minor DESC';
    const { rows } = await db.query<SubscriptionRow>(sql, params);
    return rows.map(mapSubscription);
  });
}

export async function setSubscriptionStatus(
  userId: string,
  id: string,
  status: Subscription['status'],
): Promise<void> {
  await withUser(userId, async (db) => {
    await db.query(
      'UPDATE subscriptions SET status = $3, updated_at = now() WHERE id = $1 AND user_id = $2',
      [id, userId, status],
    );
  });
}

/** Charges predicted inside the next `days`, ascending. */
export async function upcomingCharges(
  userId: string,
  days = 30,
  now: string = today(),
): Promise<Subscription[]> {
  const horizon = addDays(now, days);
  return withUser(userId, async (db) => {
    const { rows } = await db.query<SubscriptionRow>(
      `SELECT * FROM subscriptions
        WHERE user_id = $1 AND status = 'active' AND next_predicted_date <= $2
        ORDER BY next_predicted_date`,
      [userId, horizon],
    );
    return rows.map(mapSubscription);
  });
}

export { mapSubscription };
