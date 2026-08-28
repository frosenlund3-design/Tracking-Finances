import '@/lib/server-guard';
import { withUser } from '@/database';
import { addDays, daysBetween } from '@/lib/normalize';
import { today } from '@/lib/dates';
import { totalBalanceMinor } from '@/services/accounts';
import { listSubscriptions } from '@/services/subscriptions';
import { spendingRate } from '@/services/analytics';

/**
 * A deliberately simple forecast. It composes four observable quantities:
 *
 *   current balance
 *   + recurring income that has actually repeated before
 *   − scheduled subscription charges we can name
 *   − the non-recurring burn rate observed over the last 60 days
 *
 * No model, no trend fitting, no confidence theatre. Everything it outputs is
 * labelled an estimate, because that is what it is.
 */

export interface ForecastPoint {
  horizonDays: number;
  date: string;
  balanceMinor: number;
  /** Widening band from the variability of the recent daily spend. */
  lowMinor: number;
  highMinor: number;
}

export interface CashFlowForecast {
  currency: string;
  startingBalanceMinor: number;
  balanceKnown: boolean;
  recurringIncomeMonthlyMinor: number;
  recurringExpenseMonthlyMinor: number;
  discretionaryDailyMinor: number;
  points: ForecastPoint[];
  /** Amount that could be spent this month while staying above zero. */
  safeToSpendMinor: number;
  assumptions: string[];
}

interface RecurringIncomeRow {
  merchant_key: string;
  monthly: number;
  months: number;
}

export async function cashFlowForecast(
  userId: string,
  currency = 'DKK',
  now: Date = new Date(),
): Promise<CashFlowForecast> {
  const start = today(now);

  const [{ totalMinor, excludedAccounts }, subscriptions, rate] = await Promise.all([
    totalBalanceMinor(userId, currency),
    listSubscriptions(userId, { status: 'active' }),
    spendingRate(userId, 60, 'all', now),
  ]);

  const recurringIncome = await withUser(userId, async (db) => {
    const { rows } = await db.query<RecurringIncomeRow>(
      `SELECT merchant_key,
              avg(monthly_total) AS monthly,
              count(*)::int AS months
         FROM (
           SELECT merchant_key, to_char(transaction_date, 'YYYY-MM') AS ym,
                  sum(amount_minor) AS monthly_total
             FROM transactions
            WHERE user_id = $1 AND amount_minor > 0 AND category <> 'transfers'
              AND transaction_date >= $2::date - interval '120 days'
            GROUP BY merchant_key, ym
         ) monthly_income
        GROUP BY merchant_key
       HAVING count(*) >= 3`,
      [userId, start],
    );
    return rows;
  });

  const recurringIncomeMonthlyMinor = Math.round(
    recurringIncome.reduce((sum, r) => sum + Number(r.monthly), 0),
  );
  const recurringExpenseMonthlyMinor = subscriptions.reduce(
    (sum, s) => sum + s.monthlyEquivalentMinor,
    0,
  );

  // Avoid double-counting: subscriptions are already inside the observed burn.
  const discretionaryDailyMinor = Math.max(
    0,
    rate.dailyRateMinor - Math.round(recurringExpenseMonthlyMinor / 30.44),
  );
  const dailyIncomeMinor = Math.round(recurringIncomeMonthlyMinor / 30.44);

  const points: ForecastPoint[] = [];
  for (const horizon of [7, 30, 90]) {
    const date = addDays(start, horizon);
    const subscriptionCost = subscriptions
      .filter((s) => daysBetween(start, s.nextPredictedDate) <= horizon)
      .reduce((sum, s) => {
        const occurrences = Math.max(
          1,
          Math.floor(horizon / (s.annualEquivalentMinor > 0 ? monthsToDays(s.interval) : 30)),
        );
        return sum + s.amountMinor * occurrences;
      }, 0);

    const projected =
      totalMinor + dailyIncomeMinor * horizon - discretionaryDailyMinor * horizon - subscriptionCost;

    // Uncertainty grows with the square root of time, not linearly.
    const band = Math.round(discretionaryDailyMinor * Math.sqrt(horizon) * 1.5);
    points.push({
      horizonDays: horizon,
      date,
      balanceMinor: Math.round(projected),
      lowMinor: Math.round(projected - band),
      highMinor: Math.round(projected + band),
    });
  }

  const thirtyDay = points.find((p) => p.horizonDays === 30);
  const committedThisMonth = recurringExpenseMonthlyMinor;
  const safeToSpendMinor = Math.max(
    0,
    totalMinor + recurringIncomeMonthlyMinor - committedThisMonth - Math.round(totalMinor * 0.1),
  );

  const assumptions = [
    `Recent spending measured over the last ${rate.sampleDays} days.`,
    `${subscriptions.length} active recurring payment${subscriptions.length === 1 ? '' : 's'} included.`,
    recurringIncome.length > 0
      ? `${recurringIncome.length} repeating income source${recurringIncome.length === 1 ? '' : 's'} included.`
      : 'No repeating income detected yet, so none is assumed.',
    'A 10% buffer is held back from the safe-to-spend figure.',
  ];
  if (excludedAccounts > 0) {
    assumptions.push(
      `${excludedAccounts} account${excludedAccounts === 1 ? '' : 's'} in another currency are excluded rather than converted.`,
    );
  }
  if (thirtyDay && !Number.isFinite(thirtyDay.balanceMinor)) {
    assumptions.push('Not enough history for a reliable projection.');
  }

  return {
    currency,
    startingBalanceMinor: totalMinor,
    balanceKnown: totalMinor !== 0,
    recurringIncomeMonthlyMinor,
    recurringExpenseMonthlyMinor,
    discretionaryDailyMinor,
    points,
    safeToSpendMinor,
    assumptions,
  };
}

function monthsToDays(interval: string): number {
  switch (interval) {
    case 'weekly': return 7;
    case 'biweekly': return 14;
    case 'quarterly': return 91;
    case 'semiannual': return 183;
    case 'annual': return 365;
    default: return 30;
  }
}
