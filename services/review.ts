import '@/lib/server-guard';
import { withUser } from '@/database';
import { mapTransactionRow, loadMerchantRules } from '@/services/transactions';
import { classify } from '@/services/categorization/rules';
import { ALL_CATEGORIES, categoryLabel, isKnownCategory } from '@/lib/categories';
import type { Transaction } from '@/types/finance';

/**
 * The review queue.
 *
 * Automatic categorization is right most of the time and wrong some of the
 * time, and the wrong ones quietly distort every total in the product. This
 * gathers them into one place and, crucially, arrives with an answer already
 * proposed — the work should be confirming, not choosing from a list of
 * twenty-nine.
 *
 * Ordering is by how much the answer matters: a 4,000 kr mystery is worth a
 * tap before a 12 kr one.
 */

export interface ReviewSuggestion {
  category: string;
  label: string;
  /** Why this is being suggested, shown to the user. */
  reason: string;
}

export interface ReviewItem {
  transaction: Transaction;
  suggestions: ReviewSuggestion[];
  /** How many other unreviewed transactions share this merchant. */
  siblingCount: number;
}

export interface ReviewQueue {
  items: ReviewItem[];
  remaining: number;
  /** Total value sitting in the queue, so the effort has a visible payoff. */
  unreviewedMinor: number;
}

const CONFIDENCE_FLOOR = 0.5;

/**
 * Proposals, best first:
 *   1. what the user chose for this merchant before
 *   2. what similar users of this app would call it — the classifier's own
 *      answer, when it had one worth showing
 *   3. the most common category for transactions of this size and direction
 */
export async function reviewQueue(userId: string, limit = 20): Promise<ReviewQueue> {
  return withUser(userId, async (db) => {
    const rules = await loadMerchantRules(db, userId);

    const { rows: summary } = await db.query<{ n: number; total: number | null }>(
      `SELECT count(*)::int AS n, COALESCE(sum(abs(amount_minor)), 0) AS total
         FROM transactions
        WHERE user_id = $1 AND category_locked = FALSE AND confidence_score < $2`,
      [userId, CONFIDENCE_FLOOR],
    );

    const { rows } = await db.query(
      `SELECT t.*,
              (SELECT count(*)::int FROM transactions s
                WHERE s.user_id = t.user_id AND s.merchant_key = t.merchant_key
                  AND s.category_locked = FALSE AND s.confidence_score < $2
                  AND s.id <> t.id) AS sibling_count
         FROM transactions t
        WHERE t.user_id = $1 AND t.category_locked = FALSE AND t.confidence_score < $2
        ORDER BY abs(t.amount_minor) DESC, t.transaction_date DESC
        LIMIT $3`,
      [userId, CONFIDENCE_FLOOR, limit],
    );

    // What this user's money usually gets called. Confirmed choices carry more
    // weight than automatic ones, but a new account has no confirmed choices
    // at all — so both are counted, and confirmations count for more.
    //
    // Split by ownership, because a personal card payment should never be
    // offered "Payment processing fees" just because the business account
    // generates more rows than the private one does.
    const { rows: habitRows } = await db.query<{
      ownership: string;
      category: string;
      score: number;
    }>(
      `SELECT ownership, category,
              sum(CASE WHEN category_locked THEN 4 ELSE 1 END)::int AS score
         FROM transactions
        WHERE user_id = $1 AND amount_minor < 0
          AND category NOT IN ('miscellaneous', 'transfers')
        GROUP BY ownership, category ORDER BY score DESC`,
      [userId],
    );
    const habitsByOwnership = new Map<string, string[]>();
    for (const row of habitRows) {
      const list = habitsByOwnership.get(row.ownership) ?? [];
      if (list.length < 6) list.push(row.category);
      habitsByOwnership.set(row.ownership, list);
    }

    const items: ReviewItem[] = rows.map((raw) => {
      const row = raw as Record<string, unknown>;
      const transaction = mapTransactionRow(row as never);
      const suggestions: ReviewSuggestion[] = [];
      const seen = new Set<string>();

      const push = (category: string, reason: string) => {
        if (!isKnownCategory(category) || seen.has(category)) return;
        if (category === transaction.category) return;
        seen.add(category);
        suggestions.push({ category, label: categoryLabel(category), reason });
      };

      // 1. A rule the user already made for this merchant.
      const rule = rules.find(
        (r) => r.matchType === 'merchant_key' && r.pattern === transaction.merchantKey,
      );
      if (rule) push(rule.category, 'You chose this for this merchant before');

      // 2. The classifier's own reading, when it had one.
      const guess = classify(
        {
          merchant: transaction.merchant,
          description: transaction.description,
          amountMinor: transaction.amountMinor,
          transactionType: transaction.transactionType,
          paymentChannel: transaction.paymentChannel,
          counterparty: transaction.counterparty,
        },
        rules,
      );
      if (guess.confidence >= CONFIDENCE_FLOOR) push(guess.category, 'Best match on the description');

      // 3. What the payment rail implies, when it implies anything.
      const hints = channelHints(transaction);
      for (const [category, reason] of hints) {
        if (suggestions.length >= 4) break;
        push(category, reason);
      }

      // 4. What this user usually picks, so the common case is one tap.
      //    Two at most: four rows all reading "You use this often" tells the
      //    person nothing about the transaction in front of them, and crowds
      //    out the everyday categories below.
      const habitLimit = Math.min(suggestions.length + 2, 4);
      for (const category of habitsByOwnership.get(transaction.ownership) ?? []) {
        if (suggestions.length >= habitLimit) break;
        push(category, 'You use this often');
      }

      // 5. Backstop, so the screen is never a dead end.
      //
      //    Only up to three when the rail already said something: offering
      //    Groceries alongside three transfer categories for a bank transfer
      //    with a reference number is noise, and noise is what makes people
      //    stop trusting the suggestions.
      const fallbackLimit = hints.length > 0 ? 3 : 4;
      for (const [category, reason] of genericFallbacks(transaction)) {
        if (suggestions.length >= fallbackLimit) break;
        push(category, reason);
      }

      return {
        transaction,
        suggestions: suggestions.slice(0, 4),
        siblingCount: Number(row.sibling_count ?? 0),
      };
    });

    return {
      items,
      remaining: Number(summary[0]?.n ?? 0),
      unreviewedMinor: Number(summary[0]?.total ?? 0),
    };
  });
}

/** Count only, for the badge in the navigation. */
export async function reviewCount(userId: string): Promise<number> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM transactions
        WHERE user_id = $1 AND category_locked = FALSE AND confidence_score < $2`,
      [userId, CONFIDENCE_FLOOR],
    );
    return Number(rows[0]?.n ?? 0);
  });
}

/** What the rail suggests, where it narrows things down at all. */
function channelHints(transaction: Transaction): Array<[string, string]> {
  switch (transaction.paymentChannel) {
    case 'cash':
      return [['cash_withdrawal', 'Cash taken out of an account']];
    case 'mobilepay':
      return [
        ['peer_transfer', 'Paid to a person'],
        ['restaurants', 'Often a shared bill'],
      ];
    case 'direct_debit':
      return [
        ['utilities', 'Usually a bill on direct debit'],
        ['insurance', 'Or an insurance premium'],
        ['transfers', 'Or a standing transfer'],
      ];
    case 'processor':
      return [['business_revenue', 'Money through a payment processor']];
    case 'transfer':
      // A bank transfer with only a reference number. It went somewhere the
      // card rails cannot see: another account, a person, a landlord.
      return transaction.amountMinor < 0
        ? [
            ['transfers', 'Moved between your own accounts'],
            ['peer_transfer', 'Or sent to a person'],
            ['rent', 'Or a rent payment'],
          ]
        : [
            ['transfers', 'Moved between your own accounts'],
            ['peer_transfer', 'Or received from a person'],
            ['salary', 'Or pay coming in'],
          ];
    default:
      return [];
  }
}

/** Sensible last resorts, so there are always options worth tapping. */
function genericFallbacks(transaction: Transaction): Array<[string, string]> {
  if (transaction.amountMinor > 0) {
    return [
      ['salary', 'Money coming in'],
      ['business_revenue', 'Or business income'],
      ['peer_transfer', 'Or from a person'],
      ['transfers', 'Or moved between your accounts'],
      ['business_refunds', 'Or money coming back'],
    ];
  }
  return [
    ['groceries', 'A common everyday cost'],
    ['restaurants', 'Or eating out'],
    ['shopping', 'Or a one-off purchase'],
    ['transport', 'Or getting around'],
    ['miscellaneous', 'Leave it unsorted'],
  ];
}

export const REVIEW_CATEGORIES = ALL_CATEGORIES;
