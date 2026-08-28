import '@/lib/server-guard';
import { withUser } from '@/database';
import { isoDate, daysBetween } from '@/lib/normalize';
import { today } from '@/lib/dates';
import { serviceKindFor, SERVICE_KIND_LABELS } from '@/services/categorization/merchant-seeds';
import { listSubscriptions } from '@/services/subscriptions';
import type { Subscription } from '@/types/finance';

/**
 * Things worth noticing.
 *
 * Every detector here answers a question the user cannot easily answer by
 * scrolling: is this charge unusual *for this merchant*, did something get
 * charged twice, is a large annual renewal about to land, am I paying three
 * companies for the same thing.
 *
 * Two rules throughout:
 *   - Statistics that survive outliers. A merchant's "normal" is its median
 *     and median absolute deviation, never a mean and standard deviation —
 *     one 8,000 kr purchase would otherwise redefine normal and hide the next.
 *   - Nothing alarming. These are observations, not warnings. A large charge
 *     is usually a large charge the person meant to make.
 */

export type FindingKind =
  | 'unusual_charge'
  | 'possible_double_charge'
  | 'large_renewal_due'
  | 'new_recurring'
  | 'overlapping_services';

export interface Finding {
  kind: FindingKind;
  title: string;
  body: string;
  /** Where tapping it should go. */
  href: string;
  /** The numbers behind the sentence, so it can be checked. */
  facts: Record<string, string | number>;
  /** Sorting weight: how much money the finding is about, in minor units. */
  weightMinor: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Median absolute deviation: spread that a single outlier cannot inflate. */
function medianAbsoluteDeviation(values: number[], centre: number): number {
  return median(values.map((v) => Math.abs(v - centre)));
}

interface ChargeRow {
  id: string;
  merchant_key: string;
  merchant: string | null;
  amount_minor: number;
  transaction_date: string | Date;
  currency: string;
}

const LOOKBACK_DAYS = 400;
/** A merchant needs this much history before "normal" means anything. */
const MIN_HISTORY = 6;
/** How many MADs above the median counts as unusual. */
const OUTLIER_THRESHOLD = 4;
/** Below this, a spike is not worth anyone's attention. */
const MIN_NOTABLE_MINOR = 30_000; // 300 kr

export async function detectFindings(
  userId: string,
  currency = 'DKK',
  now: string = today(),
): Promise<Finding[]> {
  const [charges, subscriptions] = await Promise.all([
    withUser(userId, async (db) => {
      const { rows } = await db.query<ChargeRow>(
        `SELECT id, merchant_key, merchant, amount_minor, transaction_date, currency
           FROM transactions
          WHERE user_id = $1 AND amount_minor < 0 AND merchant_key IS NOT NULL
            AND category <> 'transfers' AND transaction_date >= $2::date - $3::int
          ORDER BY transaction_date`,
        [userId, now, LOOKBACK_DAYS],
      );
      return rows;
    }),
    listSubscriptions(userId, { status: 'active' }),
  ]);

  const findings: Finding[] = [
    ...unusualCharges(charges, currency, now),
    ...possibleDoubleCharges(charges, currency, now),
    ...largeRenewalsDue(subscriptions, now),
    ...newRecurring(subscriptions, now),
    ...overlappingServices(subscriptions),
  ];

  return findings.sort((a, b) => b.weightMinor - a.weightMinor);
}

/** A charge well outside what this merchant normally costs. */
function unusualCharges(charges: ChargeRow[], currency: string, now: string): Finding[] {
  const byMerchant = new Map<string, ChargeRow[]>();
  for (const charge of charges) {
    const list = byMerchant.get(charge.merchant_key) ?? [];
    list.push(charge);
    byMerchant.set(charge.merchant_key, list);
  }

  const findings: Finding[] = [];

  for (const [key, list] of byMerchant) {
    if (list.length < MIN_HISTORY + 1) continue;

    // Only look at the most recent charge, and only if it is recent.
    const latest = list[list.length - 1]!;
    const latestDate = isoDate(latest.transaction_date);
    if (daysBetween(latestDate, now) > 45) continue;

    const history = list.slice(0, -1).map((c) => Math.abs(Number(c.amount_minor)));
    const amount = Math.abs(Number(latest.amount_minor));
    const centre = median(history);
    if (centre <= 0) continue;

    const spread = medianAbsoluteDeviation(history, centre);
    // A perfectly regular merchant has zero spread; require a real jump
    // rather than dividing by zero and calling every wobble an anomaly.
    const ceiling = spread > 0 ? centre + OUTLIER_THRESHOLD * spread : centre * 1.6;
    if (amount <= ceiling) continue;
    if (amount - centre < MIN_NOTABLE_MINOR) continue;

    const times = centre > 0 ? amount / centre : 0;
    findings.push({
      kind: 'unusual_charge',
      title: `${latest.merchant ?? key} charged more than usual`,
      body: `${format(amount, currency)} on ${latestDate}, against a usual ${format(
        Math.round(centre),
        currency,
      )} across ${history.length} previous charges.`,
      href: `/transactions/${latest.id}`,
      facts: {
        merchant: latest.merchant ?? key,
        amountMinor: amount,
        usualMinor: Math.round(centre),
        historyCount: history.length,
        timesUsual: Math.round(times * 10) / 10,
      },
      weightMinor: amount - Math.round(centre),
    });
  }

  return findings;
}

/**
 * The same merchant charging the same amount twice on one day.
 *
 * Provider-level duplicates are already prevented at ingest, so anything left
 * here is the merchant genuinely charging twice — which is sometimes right
 * (two coffees) and sometimes a mistake worth checking.
 */
function possibleDoubleCharges(charges: ChargeRow[], currency: string, now: string): Finding[] {
  const seen = new Map<string, ChargeRow[]>();
  for (const charge of charges) {
    const date = isoDate(charge.transaction_date);
    if (daysBetween(date, now) > 30) continue;
    const key = `${charge.merchant_key}|${date}|${charge.amount_minor}`;
    const list = seen.get(key) ?? [];
    list.push(charge);
    seen.set(key, list);
  }

  const findings: Finding[] = [];
  for (const [, list] of seen) {
    if (list.length < 2) continue;
    const amount = Math.abs(Number(list[0]!.amount_minor));
    // Two small identical charges in a day is ordinary; two large ones is not.
    if (amount < MIN_NOTABLE_MINOR) continue;
    const date = isoDate(list[0]!.transaction_date);
    findings.push({
      kind: 'possible_double_charge',
      title: `${list[0]!.merchant ?? 'A merchant'} charged ${list.length} times on one day`,
      body: `${list.length} × ${format(amount, currency)} on ${date}. Worth a look if you only meant to pay once.`,
      href: `/transactions?merchant=${encodeURIComponent(list[0]!.merchant_key)}&range=last_30`,
      facts: { merchant: list[0]!.merchant ?? '', amountMinor: amount, count: list.length, date },
      weightMinor: amount * (list.length - 1),
    });
  }
  return findings;
}

/** A yearly bill about to land, which is the kind people forget. */
function largeRenewalsDue(subscriptions: Subscription[], now: string): Finding[] {
  return subscriptions
    .filter((s) => s.interval === 'annual' || s.interval === 'semiannual' || s.interval === 'quarterly')
    .filter((s) => {
      const days = daysBetween(now, s.nextPredictedDate);
      return days >= 0 && days <= 30;
    })
    .filter((s) => s.amountMinor >= 50_000)
    .map((s) => {
      const days = daysBetween(now, s.nextPredictedDate);
      return {
        kind: 'large_renewal_due' as const,
        title: `${s.merchantLabel} renews ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`,
        body: `${format(s.amountMinor, s.currency)}, charged ${s.interval === 'annual' ? 'yearly' : s.interval}. Predicted from previous charges.`,
        href: '/subscriptions',
        facts: {
          merchant: s.merchantLabel,
          amountMinor: s.amountMinor,
          dueOn: s.nextPredictedDate,
          daysAway: days,
        },
        weightMinor: s.amountMinor,
      };
    });
}

/** Something new started charging on a schedule. */
function newRecurring(subscriptions: Subscription[], now: string): Finding[] {
  return subscriptions
    .filter((s) => daysBetween(s.firstSeen, now) <= 75 && s.occurrences >= 3)
    .map((s) => ({
      kind: 'new_recurring' as const,
      title: `New recurring payment: ${s.merchantLabel}`,
      body: `${format(s.monthlyEquivalentMinor, s.currency)} a month since ${s.firstSeen}, or ${format(
        s.annualEquivalentMinor,
        s.currency,
      )} a year.`,
      href: '/subscriptions',
      facts: {
        merchant: s.merchantLabel,
        monthlyMinor: s.monthlyEquivalentMinor,
        since: s.firstSeen,
      },
      weightMinor: s.annualEquivalentMinor,
    }));
}

/** Paying several companies for the same kind of thing. */
function overlappingServices(subscriptions: Subscription[]): Finding[] {
  const byKind = new Map<string, Subscription[]>();
  for (const subscription of subscriptions) {
    const kind = serviceKindFor(subscription.merchantKey);
    if (!kind) continue;
    const list = byKind.get(kind) ?? [];
    list.push(subscription);
    byKind.set(kind, list);
  }

  const findings: Finding[] = [];
  for (const [kind, list] of byKind) {
    if (list.length < 2) continue;
    const monthly = list.reduce((sum, s) => sum + s.monthlyEquivalentMinor, 0);
    const names = list.map((s) => s.merchantLabel).join(', ');
    findings.push({
      kind: 'overlapping_services',
      title: `${list.length} ${SERVICE_KIND_LABELS[kind as keyof typeof SERVICE_KIND_LABELS]} subscriptions`,
      body: `${names} — ${format(monthly, list[0]!.currency)} a month together. Only worth acting on if you use fewer than you pay for.`,
      href: '/subscriptions',
      facts: { kind, count: list.length, monthlyMinor: monthly, merchants: names },
      weightMinor: monthly,
    });
  }
  return findings;
}

function format(minor: number, currency: string): string {
  return new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}
