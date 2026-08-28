import '@/lib/server-guard';
import { randomUUID } from 'node:crypto';
import { withUser } from '@/database';
import type { NormalizedAccount } from '@/integrations/types';
import type { FinancialAccount, Ownership, ProviderId } from '@/types/finance';

interface AccountRow {
  id: string; user_id: string; provider: ProviderId; provider_account_id: string;
  connection_id: string | null; name: string; institution: string | null;
  masked_reference: string | null; type: FinancialAccount['type']; currency: string;
  balance_minor: number | null; balance_updated_at: string | Date | null;
  ownership: Ownership; is_active: boolean; created_at: string | Date;
}

function mapAccount(row: AccountRow): FinancialAccount {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    connectionId: row.connection_id,
    name: row.name,
    institution: row.institution,
    maskedReference: row.masked_reference,
    type: row.type,
    currency: row.currency,
    balanceMinor: row.balance_minor === null ? null : Number(row.balance_minor),
    balanceUpdatedAt: row.balance_updated_at ? new Date(row.balance_updated_at).toISOString() : null,
    ownership: row.ownership,
    isActive: row.is_active,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listAccounts(userId: string): Promise<FinancialAccount[]> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<AccountRow>(
      'SELECT * FROM financial_accounts WHERE user_id = $1 ORDER BY is_active DESC, created_at',
      [userId],
    );
    return rows.map(mapAccount);
  });
}

/**
 * Upserts provider accounts and returns providerAccountId -> internal id,
 * which the ingest step uses to attach transactions.
 */
export async function upsertAccounts(
  userId: string,
  provider: ProviderId,
  connectionId: string | null,
  accounts: NormalizedAccount[],
): Promise<Map<string, string>> {
  return withUser(userId, async (db) => {
    const map = new Map<string, string>();
    for (const account of accounts) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO financial_accounts (
           id, user_id, provider, provider_account_id, connection_id, name, institution,
           masked_reference, type, currency, balance_minor, balance_updated_at, ownership)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
                 CASE WHEN $11::bigint IS NULL THEN NULL ELSE now() END, $12)
         ON CONFLICT (user_id, provider, provider_account_id) DO UPDATE SET
           name = EXCLUDED.name,
           institution = EXCLUDED.institution,
           masked_reference = EXCLUDED.masked_reference,
           currency = EXCLUDED.currency,
           balance_minor = COALESCE(EXCLUDED.balance_minor, financial_accounts.balance_minor),
           balance_updated_at = CASE WHEN EXCLUDED.balance_minor IS NULL
                                     THEN financial_accounts.balance_updated_at ELSE now() END,
           connection_id = COALESCE(EXCLUDED.connection_id, financial_accounts.connection_id),
           is_active = TRUE
         RETURNING id`,
        [
          randomUUID(), userId, provider, account.providerAccountId, connectionId,
          account.name, account.institution, account.maskedReference, account.type,
          account.currency.toUpperCase(), account.balanceMinor,
          account.ownership ?? 'personal',
        ],
      );
      map.set(account.providerAccountId, rows[0]!.id);
    }
    return map;
  });
}

export async function setAccountOwnership(
  userId: string,
  accountId: string,
  ownership: Ownership,
): Promise<void> {
  await withUser(userId, async (db) => {
    await db.query(
      'UPDATE financial_accounts SET ownership = $3 WHERE id = $1 AND user_id = $2',
      [accountId, userId, ownership],
    );
  });
}

/**
 * Total across active accounts. Only sums accounts sharing the base currency —
 * inventing an FX rate would produce a confidently wrong number.
 */
export async function totalBalanceMinor(
  userId: string,
  currency: string,
): Promise<{ totalMinor: number; excludedAccounts: number }> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<{ total: number | null; excluded: number }>(
      `SELECT
         COALESCE(sum(balance_minor) FILTER (WHERE currency = $2), 0) AS total,
         count(*) FILTER (WHERE currency <> $2 AND balance_minor IS NOT NULL)::int AS excluded
       FROM financial_accounts
       WHERE user_id = $1 AND is_active = TRUE AND type <> 'credit_card'`,
      [userId, currency.toUpperCase()],
    );
    return {
      totalMinor: Number(rows[0]?.total ?? 0),
      excludedAccounts: Number(rows[0]?.excluded ?? 0),
    };
  });
}

export { mapAccount };
