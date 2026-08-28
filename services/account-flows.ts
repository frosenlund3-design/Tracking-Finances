import '@/lib/server-guard';
import { withUser } from '@/database';
import { buildWhere, type TransactionFilters } from '@/services/transactions';
import { isoDate } from '@/lib/normalize';
import { categoryLabel } from '@/lib/categories';
import type { AccountType, Ownership } from '@/types/finance';

/**
 * Per-account cash flow: exactly what went in and out of each account, where
 * it came from, where it went, and how much of it was just moving between
 * accounts you already own.
 *
 * That last part is the one people get wrong. A dashboard that adds up "money
 * in" across accounts double-counts every internal transfer, so this
 * separates external flow from internal flow and reports both.
 */

export interface AccountFlow {
  accountId: string;
  name: string;
  institution: string | null;
  maskedReference: string | null;
  type: AccountType;
  ownership: Ownership;
  currency: string;
  balanceMinor: number | null;
  isActive: boolean;
  /** Money arriving from outside your accounts. */
  externalInMinor: number;
  /** Money leaving to outside your accounts. */
  externalOutMinor: number;
  /** Arriving from another account of yours. */
  internalInMinor: number;
  /** Leaving to another account of yours. */
  internalOutMinor: number;
  netMinor: number;
  transactionCount: number;
  /** Daily closing balance, oldest first, for the chart. */
  series: Array<{ date: string; balanceMinor: number }>;
}

interface AccountRow {
  id: string; name: string; institution: string | null; masked_reference: string | null;
  type: AccountType; ownership: Ownership; currency: string;
  balance_minor: number | null; is_active: boolean;
}

/**
 * A movement is a *candidate* for being internal when it is categorized as a
 * transfer or is a processor payout. Whether it actually is internal depends on
 * finding its other leg, which is what `pairTransfers` decides.
 */
const INTERNAL_SQL = `(t.category = 'transfers' OR t.transaction_type = 'payout')`;

/** Guard rail: an "all time" query on a long history should not pull forever. */
const MAX_MOVEMENTS = 20_000;

interface MovementRow {
  id: string;
  account_id: string;
  amount_minor: number;
  transaction_date: string | Date;
  merchant: string | null;
  description: string;
  is_internal: boolean;
}

interface Movement {
  id: string;
  accountId: string;
  amountMinor: number;
  date: string;
  label: string;
  /** Categorized as a transfer or payout — a candidate, not a conclusion. */
  internalCandidate: boolean;
}

async function loadMovements(
  db: DbClientLike,
  userId: string,
  filters: TransactionFilters,
): Promise<Movement[]> {
  const where = buildWhere(userId, filters);
  const { rows } = await db.query<MovementRow>(
    `SELECT t.id, t.account_id, t.amount_minor, t.transaction_date, t.merchant,
            t.description, ${INTERNAL_SQL} AS is_internal
       FROM transactions t
      WHERE ${where.sql}
      ORDER BY t.transaction_date
      LIMIT ${MAX_MOVEMENTS}`,
    where.params,
  );
  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    amountMinor: Number(r.amount_minor),
    date: isoDate(r.transaction_date),
    label: r.merchant ?? r.description,
    internalCandidate: r.is_internal,
  }));
}

interface DbClientLike {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
}

export interface PairedTransfer {
  outLegId: string | null;
  inLegId: string | null;
  date: string;
  amountMinor: number;
  fromAccountId: string | null;
  toAccountId: string | null;
  label: string;
  inferred: boolean;
}

/**
 * Finds movements that are two sides of the same krone.
 *
 * The two legs frequently disagree about what they are: an owner's draw leaves
 * the business account labelled a transfer and arrives labelled salary, and a
 * Stripe payout leaves on the 27th and lands on the 29th. Pairing on amount and
 * proximity is what catches those. Where two candidates could match, neither is
 * chosen — an ambiguous guess about someone's money is worse than none.
 */
export function pairTransfers(movements: Movement[], toleranceDays = 4): PairedTransfer[] {
  const outgoing = movements.filter((m) => m.amountMinor < 0 && m.internalCandidate);
  const incoming = movements.filter((m) => m.amountMinor > 0);
  const claimed = new Set<string>();
  const paired: PairedTransfer[] = [];

  const dayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();

  for (const out of outgoing) {
    const magnitude = Math.abs(out.amountMinor);
    const candidates = incoming.filter(
      (candidate) =>
        !claimed.has(candidate.id) &&
        candidate.accountId !== out.accountId &&
        candidate.amountMinor === magnitude &&
        Math.abs(dayOf(candidate.date) - dayOf(out.date)) / 86_400_000 <= toleranceDays,
    );

    const confirmed = candidates.find((c) => c.internalCandidate);
    const inferred = confirmed ? null : candidates.length === 1 ? candidates[0]! : null;
    const match = confirmed ?? inferred;
    if (match) claimed.add(match.id);

    paired.push({
      outLegId: out.id,
      inLegId: match?.id ?? null,
      date: out.date,
      amountMinor: magnitude,
      fromAccountId: out.accountId,
      toAccountId: match?.accountId ?? null,
      label: out.label,
      inferred: Boolean(inferred),
    });
  }

  // Internal arrivals whose counterpart falls outside the window.
  for (const arrival of incoming) {
    if (claimed.has(arrival.id) || !arrival.internalCandidate) continue;
    paired.push({
      outLegId: null,
      inLegId: arrival.id,
      date: arrival.date,
      amountMinor: arrival.amountMinor,
      fromAccountId: null,
      toAccountId: arrival.accountId,
      label: arrival.label,
      inferred: false,
    });
  }

  return paired;
}

export async function accountFlows(
  userId: string,
  filters: TransactionFilters = {},
): Promise<AccountFlow[]> {
  return withUser(userId, async (db) => {
    const { rows: accounts } = await db.query<AccountRow>(
      `SELECT id, name, institution, masked_reference, type, ownership, currency,
              balance_minor, is_active
         FROM financial_accounts WHERE user_id = $1
        ORDER BY is_active DESC, ownership, created_at`,
      [userId],
    );

    const movements = await loadMovements(db, userId, filters);
    const paired = pairTransfers(movements);

    // A leg is internal only when its counterpart was actually found. Deciding
    // this once, here, is what keeps "money in" on one account and "money out"
    // on the other from telling different stories about the same krone.
    const internalLegs = new Set<string>();
    for (const transfer of paired) {
      if (transfer.outLegId && transfer.inLegId) {
        internalLegs.add(transfer.outLegId);
        internalLegs.add(transfer.inLegId);
      } else if (transfer.outLegId) {
        internalLegs.add(transfer.outLegId);
      } else if (transfer.inLegId) {
        internalLegs.add(transfer.inLegId);
      }
    }

    const totals = new Map<
      string,
      { extIn: number; extOut: number; intIn: number; intOut: number; count: number }
    >();
    const daily = new Map<string, Map<string, number>>();

    for (const movement of movements) {
      const bucket =
        totals.get(movement.accountId) ??
        { extIn: 0, extOut: 0, intIn: 0, intOut: 0, count: 0 };
      const internal = internalLegs.has(movement.id);
      if (movement.amountMinor > 0) {
        if (internal) bucket.intIn += movement.amountMinor;
        else bucket.extIn += movement.amountMinor;
      } else {
        if (internal) bucket.intOut += -movement.amountMinor;
        else bucket.extOut += -movement.amountMinor;
      }
      bucket.count += 1;
      totals.set(movement.accountId, bucket);

      const days = daily.get(movement.accountId) ?? new Map<string, number>();
      days.set(movement.date, (days.get(movement.date) ?? 0) + movement.amountMinor);
      daily.set(movement.accountId, days);
    }

    return accounts.map((account) => {
      const t = totals.get(account.id) ?? { extIn: 0, extOut: 0, intIn: 0, intOut: 0, count: 0 };
      const closing = account.balance_minor === null ? null : Number(account.balance_minor);

      // Walk the period backwards from the known closing balance, so the line
      // ends where the account actually stands rather than at an invented zero.
      const days = [...(daily.get(account.id) ?? new Map())].sort(([a], [b]) => a.localeCompare(b));
      const series: AccountFlow['series'] = [];
      if (closing !== null && days.length > 0) {
        let running = closing;
        const reversed: AccountFlow['series'] = [];
        for (let i = days.length - 1; i >= 0; i--) {
          reversed.push({ date: days[i]![0], balanceMinor: running });
          running -= days[i]![1];
        }
        series.push(...reversed.reverse());
      }

      return {
        accountId: account.id,
        name: account.name,
        institution: account.institution,
        maskedReference: account.masked_reference,
        type: account.type,
        ownership: account.ownership,
        currency: account.currency,
        balanceMinor: closing,
        isActive: account.is_active,
        externalInMinor: t.extIn,
        externalOutMinor: t.extOut,
        internalInMinor: t.intIn,
        internalOutMinor: t.intOut,
        netMinor: t.extIn + t.intIn - t.extOut - t.intOut,
        transactionCount: t.count,
        series,
      };
    });
  });
}

export interface InternalTransfer {
  date: string;
  amountMinor: number;
  fromAccountId: string | null;
  toAccountId: string | null;
  label: string;
  /**
   * True when the pair was found by matching amount and date rather than by
   * both legs being labelled a transfer. Surfaced so the UI never presents an
   * inference as a fact.
   */
  inferred: boolean;
}

export async function internalTransfers(
  userId: string,
  filters: TransactionFilters = {},
  toleranceDays = 4,
): Promise<InternalTransfer[]> {
  return withUser(userId, async (db) => {
    const movements = await loadMovements(db, userId, filters);
    return pairTransfers(movements, toleranceDays)
      .map(({ outLegId: _out, inLegId: _in, ...transfer }) => transfer)
      .sort((a, b) => b.date.localeCompare(a.date));
  });
}

export interface AccountDetail extends AccountFlow {
  topOutgoing: Array<{ label: string; amountMinor: number; count: number }>;
  topIncoming: Array<{ label: string; amountMinor: number; count: number }>;
  byCategory: Array<{ category: string; label: string; amountMinor: number; count: number }>;
}

export async function accountDetail(
  userId: string,
  accountId: string,
  filters: TransactionFilters = {},
): Promise<AccountDetail | null> {
  const flows = await accountFlows(userId, { ...filters, accountIds: [accountId] });
  const flow = flows.find((f) => f.accountId === accountId);
  if (!flow) return null;

  const where = buildWhere(userId, { ...filters, accountIds: [accountId] });

  return withUser(userId, async (db) => {
    // Who actually paid, and who was actually paid. Moving money to your own
    // savings is not "one of your biggest expenses".
    const externalWhere = buildWhere(userId, {
      ...filters,
      accountIds: [accountId],
      excludeInternal: true,
    });

    const counterparties = async (direction: 'in' | 'out') => {
      const { rows } = await db.query<{ label: string; amount: number; n: number }>(
        `SELECT COALESCE(t.counterparty, t.merchant, t.description) AS label,
                sum(abs(t.amount_minor)) AS amount, count(*)::int AS n
           FROM transactions t
          WHERE ${externalWhere.sql} AND t.amount_minor ${direction === 'in' ? '>' : '<'} 0
          GROUP BY label ORDER BY amount DESC LIMIT 8`,
        externalWhere.params,
      );
      return rows.map((r) => ({
        label: r.label,
        amountMinor: Number(r.amount),
        count: Number(r.n),
      }));
    };

    const { rows: categories } = await db.query<{ category: string; amount: number; n: number }>(
      `SELECT t.category, sum(abs(t.amount_minor)) AS amount, count(*)::int AS n
         FROM transactions t
        WHERE ${where.sql} AND t.amount_minor < 0 AND NOT ${INTERNAL_SQL}
        GROUP BY t.category ORDER BY amount DESC LIMIT 10`,
      where.params,
    );

    return {
      ...flow,
      topOutgoing: await counterparties('out'),
      topIncoming: await counterparties('in'),
      byCategory: categories.map((c) => ({
        category: c.category,
        label: categoryLabel(c.category),
        amountMinor: Number(c.amount),
        count: Number(c.n),
      })),
    };
  });
}
