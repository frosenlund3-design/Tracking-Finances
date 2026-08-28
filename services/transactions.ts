import '@/lib/server-guard';
import { randomUUID } from 'node:crypto';
import { withUser, type DbClient } from '@/database';
import { dedupeHash, isoDate, merchantKey, normalizeMerchant } from '@/lib/normalize';
import { classify, ruleFromCorrection } from '@/services/categorization/rules';
import { redact } from '@/security/redact';
import type { NormalizedTransaction } from '@/integrations/types';
import type {
  MerchantRule,
  Ownership,
  ProviderId,
  TaxRelevance,
  Transaction,
  TransactionType,
} from '@/types/finance';

interface TransactionRow {
  id: string;
  user_id: string;
  transaction_id: string;
  provider: ProviderId;
  account_id: string;
  amount_minor: number;
  currency: string;
  transaction_date: string | Date;
  booking_date: string | Date | null;
  merchant: string | null;
  merchant_key: string | null;
  description: string;
  category: string;
  subcategory: string | null;
  transaction_type: TransactionType;
  ownership: Ownership;
  recurring_status: Transaction['recurringStatus'];
  subscription_id: string | null;
  tax_relevant: TaxRelevance;
  confidence_score: number;
  category_locked: boolean;
  dedupe_hash: string;
  notes: string | null;
  original_provider_metadata: Record<string, unknown> | string;
  created_at: string | Date;
  updated_at: string | Date;
}

function d(value: string | Date | null): string | null {
  return value === null ? null : isoDate(value);
}

export function mapTransactionRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    userId: row.user_id,
    transactionId: row.transaction_id,
    provider: row.provider,
    accountId: row.account_id,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    transactionDate: d(row.transaction_date)!,
    bookingDate: d(row.booking_date),
    merchant: row.merchant,
    merchantKey: row.merchant_key,
    description: row.description,
    category: row.category,
    subcategory: row.subcategory,
    transactionType: row.transaction_type,
    ownership: row.ownership,
    recurringStatus: row.recurring_status,
    subscriptionId: row.subscription_id,
    taxRelevant: row.tax_relevant,
    confidenceScore: Number(row.confidence_score),
    categoryLocked: row.category_locked,
    dedupeHash: row.dedupe_hash,
    notes: row.notes,
    originalProviderMetadata:
      typeof row.original_provider_metadata === 'string'
        ? (JSON.parse(row.original_provider_metadata) as Record<string, unknown>)
        : row.original_provider_metadata,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const COLUMNS = `id, user_id, transaction_id, provider, account_id, amount_minor, currency,
  transaction_date, booking_date, merchant, merchant_key, description, category, subcategory,
  transaction_type, ownership, recurring_status, subscription_id, tax_relevant, confidence_score,
  category_locked, dedupe_hash, notes, original_provider_metadata, created_at, updated_at`;

export async function loadMerchantRules(db: DbClient, userId: string): Promise<MerchantRule[]> {
  const { rows } = await db.query<{
    id: string; user_id: string; match_type: MerchantRule['matchType']; pattern: string;
    category: string; subcategory: string | null; ownership: Ownership | null;
    tax_relevant: TaxRelevance | null; source: MerchantRule['source']; hit_count: number;
    created_at: string | Date;
  }>('SELECT * FROM merchant_rules WHERE user_id = $1', [userId]);
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    matchType: r.match_type,
    pattern: r.pattern,
    category: r.category,
    subcategory: r.subcategory,
    ownership: r.ownership,
    taxRelevant: r.tax_relevant,
    source: r.source,
    hitCount: r.hit_count,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export interface IngestResult {
  inserted: number;
  duplicatesSkipped: number;
  nearDuplicatesSkipped: number;
  total: number;
}

/**
 * Idempotent ingestion.
 *
 * Two independent defences against duplicates:
 *   1. UNIQUE (user_id, provider, transaction_id) — re-running a sync is a no-op.
 *   2. A content fingerprint (amount + date + merchant), which catches the same
 *      purchase arriving from two providers, or a pending entry re-issued under
 *      a new id once it books.
 *
 * The fingerprint is scoped per provider-pair deliberately: a transfer between
 * two of your own accounts produces two legitimate rows with different signs,
 * and a genuine repeat purchase on the same day is distinguished by having the
 * same provider *and* a different provider id, which we allow through.
 */
export async function ingestTransactions(
  userId: string,
  accountIdByProviderAccount: Map<string, string>,
  incoming: NormalizedTransaction[],
  provider: ProviderId,
): Promise<IngestResult> {
  if (incoming.length === 0) {
    return { inserted: 0, duplicatesSkipped: 0, nearDuplicatesSkipped: 0, total: 0 };
  }

  return withUser(userId, async (db) => {
    const rules = await loadMerchantRules(db, userId);

    const { rows: existingRows } = await db.query<{ provider: string; transaction_id: string; dedupe_hash: string }>(
      'SELECT provider, transaction_id, dedupe_hash FROM transactions WHERE user_id = $1',
      [userId],
    );
    const seenIds = new Set(existingRows.map((r) => `${r.provider}|${r.transaction_id}`));
    const seenHashes = new Map<string, string>();
    for (const r of existingRows) seenHashes.set(r.dedupe_hash, r.provider);

    let duplicatesSkipped = 0;
    let nearDuplicatesSkipped = 0;
    const pending: unknown[][] = [];

    for (const tx of incoming) {
      const accountId = accountIdByProviderAccount.get(tx.providerAccountId);
      if (!accountId) continue;

      const idKey = `${provider}|${tx.transactionId}`;
      if (seenIds.has(idKey)) {
        duplicatesSkipped++;
        continue;
      }

      const merchantLabel = tx.merchant ? normalizeMerchant(tx.merchant) : null;
      const key = merchantKey(tx.merchant ?? tx.description);
      const hash = dedupeHash({
        amountMinor: tx.amountMinor,
        currency: tx.currency,
        transactionDate: tx.transactionDate,
        merchantKey: key,
      });

      // Same content already recorded by a *different* provider: the same real
      // payment seen twice (bank feed + Stripe). Keep the first one.
      const owner = seenHashes.get(hash);
      if (owner && owner !== provider) {
        nearDuplicatesSkipped++;
        continue;
      }

      const classification = classify(
        {
          merchant: merchantLabel,
          description: tx.description,
          amountMinor: tx.amountMinor,
          transactionType: tx.transactionType,
          provider,
        },
        rules,
      );

      const ownership = tx.ownershipHint ?? classification.ownership;
      const transactionType: TransactionType =
        tx.transactionType ?? (tx.amountMinor >= 0 ? 'income' : 'expense');

      pending.push([
        randomUUID(), userId, tx.transactionId, provider, accountId, tx.amountMinor,
        tx.currency.toUpperCase(), tx.transactionDate, tx.bookingDate, merchantLabel, key,
        redact(tx.description).slice(0, 500), classification.category, classification.subcategory,
        transactionType, ownership, classification.taxRelevant, classification.confidence,
        hash, JSON.stringify(sanitizeMetadata(tx.metadata ?? {})),
      ]);

      seenIds.add(idKey);
      seenHashes.set(hash, provider);
    }

    const inserted = await insertBatched(db, pending);

    return { inserted, duplicatesSkipped, nearDuplicatesSkipped, total: incoming.length };
  });
}

/** Number of columns `insertBatched` writes per row, in fixed order. */
const INSERT_COLUMNS = 20;
/**
 * Postgres caps a statement at 65535 bind parameters, and one round-trip per
 * row makes a two-year bank sync take minutes. 250 rows per statement stays
 * well inside the cap while cutting round-trips by two orders of magnitude.
 */
const INSERT_CHUNK = 250;

async function insertBatched(db: DbClient, rows: unknown[][]): Promise<number> {
  let inserted = 0;
  for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
    const chunk = rows.slice(start, start + INSERT_CHUNK);
    const params: unknown[] = [];
    const tuples = chunk.map((row, i) => {
      const base = i * INSERT_COLUMNS;
      params.push(...row);
      const holders = Array.from({ length: INSERT_COLUMNS }, (_, j) => `$${base + j + 1}`);
      // The metadata column is last and needs an explicit jsonb cast.
      holders[INSERT_COLUMNS - 1] = `${holders[INSERT_COLUMNS - 1]}::jsonb`;
      return `(${holders.join(',')})`;
    });

    const { rowCount } = await db.query(
      `INSERT INTO transactions (
         id, user_id, transaction_id, provider, account_id, amount_minor, currency,
         transaction_date, booking_date, merchant, merchant_key, description, category,
         subcategory, transaction_type, ownership, tax_relevant, confidence_score,
         dedupe_hash, original_provider_metadata)
       VALUES ${tuples.join(',')}
       ON CONFLICT (user_id, provider, transaction_id) DO NOTHING`,
      params,
    );
    inserted += rowCount;
  }
  return inserted;
}

/** Provider metadata is stored for traceability, never for secrets. */
const METADATA_DENYLIST = new Set([
  'access_token', 'refresh_token', 'token', 'secret', 'client_secret', 'authorization',
  'card', 'card_number', 'pan', 'cvv', 'cvc', 'iban', 'password', 'pin', 'cpr', 'ssn',
]);

export function sanitizeMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (METADATA_DENYLIST.has(k.toLowerCase())) continue;
    if (typeof v === 'string') out[k] = redact(v).slice(0, 500);
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 20).map((x) => (typeof x === 'string' ? redact(x) : x));
    else if (typeof v === 'object') out[k] = sanitizeMetadata(v as Record<string, unknown>);
  }
  return out;
}

export interface TransactionFilters {
  from?: string;
  to?: string;
  accountIds?: string[];
  ownership?: Ownership | 'all';
  categories?: string[];
  merchantKey?: string;
  direction?: 'income' | 'expense' | 'all';
  minAmountMinor?: number;
  maxAmountMinor?: number;
  subscriptionsOnly?: boolean;
  providers?: ProviderId[];
  taxRelevant?: TaxRelevance;
  search?: string;
  needsReview?: boolean;
}

interface WhereClause {
  sql: string;
  params: unknown[];
}

/** Builds a parameterized WHERE clause. No value is ever interpolated. */
export function buildWhere(userId: string, f: TransactionFilters): WhereClause {
  const parts = ['t.user_id = $1'];
  const params: unknown[] = [userId];
  const add = (fragment: string, value: unknown) => {
    params.push(value);
    parts.push(fragment.replace('?', `$${params.length}`));
  };

  if (f.from) add('t.transaction_date >= ?', f.from);
  if (f.to) add('t.transaction_date <= ?', f.to);
  if (f.accountIds?.length) add('t.account_id = ANY(?)', f.accountIds);
  if (f.ownership && f.ownership !== 'all') add('t.ownership = ?', f.ownership);
  if (f.categories?.length) add('t.category = ANY(?)', f.categories);
  if (f.merchantKey) add('t.merchant_key = ?', f.merchantKey);
  if (f.direction === 'income') parts.push('t.amount_minor > 0');
  if (f.direction === 'expense') parts.push('t.amount_minor < 0');
  if (typeof f.minAmountMinor === 'number') add('abs(t.amount_minor) >= ?', f.minAmountMinor);
  if (typeof f.maxAmountMinor === 'number') add('abs(t.amount_minor) <= ?', f.maxAmountMinor);
  if (f.subscriptionsOnly) parts.push("t.recurring_status = 'recurring'");
  if (f.providers?.length) add('t.provider = ANY(?)', f.providers);
  if (f.taxRelevant) add('t.tax_relevant = ?', f.taxRelevant);
  if (f.needsReview) parts.push("(t.confidence_score < 0.5 AND t.category_locked = FALSE)");
  if (f.search?.trim()) {
    const term = `%${f.search.trim().toLowerCase()}%`;
    params.push(term);
    parts.push(
      `(lower(t.merchant) LIKE $${params.length} OR lower(t.description) LIKE $${params.length}
        OR lower(t.merchant_key) LIKE $${params.length} OR lower(t.notes) LIKE $${params.length})`,
    );
  }
  return { sql: parts.join(' AND '), params };
}

export interface TransactionPage {
  transactions: Transaction[];
  total: number;
  hasMore: boolean;
}

export async function listTransactions(
  userId: string,
  filters: TransactionFilters = {},
  page: { limit?: number; offset?: number } = {},
): Promise<TransactionPage> {
  const limit = Math.min(Math.max(page.limit ?? 50, 1), 200);
  const offset = Math.max(page.offset ?? 0, 0);
  const where = buildWhere(userId, filters);

  return withUser(userId, async (db) => {
    const { rows } = await db.query<TransactionRow>(
      `SELECT ${COLUMNS} FROM transactions t WHERE ${where.sql}
       ORDER BY t.transaction_date DESC, t.created_at DESC, t.id
       LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}`,
      [...where.params, limit + 1, offset],
    );
    const { rows: countRows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM transactions t WHERE ${where.sql}`,
      where.params,
    );
    const hasMore = rows.length > limit;
    return {
      transactions: rows.slice(0, limit).map(mapTransactionRow),
      total: Number(countRows[0]?.n ?? 0),
      hasMore,
    };
  });
}

export async function getTransaction(userId: string, id: string): Promise<Transaction | null> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<TransactionRow>(
      `SELECT ${COLUMNS} FROM transactions t WHERE t.id = $1 AND t.user_id = $2`,
      [id, userId],
    );
    return rows[0] ? mapTransactionRow(rows[0]) : null;
  });
}

export interface TransactionPatch {
  category?: string;
  subcategory?: string | null;
  ownership?: Ownership;
  taxRelevant?: TaxRelevance;
  notes?: string | null;
  /** Persist the change as a rule so future transactions follow suit. */
  applyToFutureMerchant?: boolean;
  /** Re-apply the new category to existing transactions from this merchant. */
  applyToPastMerchant?: boolean;
}

export interface UpdateOutcome {
  transaction: Transaction;
  ruleCreated: boolean;
  pastUpdated: number;
}

/**
 * Applies a user correction and, when asked, remembers it. This is what makes
 * "OPENAI is Software, not Miscellaneous" stick for every future OpenAI charge.
 */
export async function updateTransaction(
  userId: string,
  id: string,
  patch: TransactionPatch,
): Promise<UpdateOutcome> {
  return withUser(userId, async (db) => {
    const { rows: current } = await db.query<TransactionRow>(
      `SELECT ${COLUMNS} FROM transactions t WHERE t.id = $1 AND t.user_id = $2`,
      [id, userId],
    );
    const existing = current[0];
    if (!existing) throw new Error('Transaction not found');

    const categoryChanged = patch.category !== undefined && patch.category !== existing.category;

    const { rows: updated } = await db.query<TransactionRow>(
      `UPDATE transactions SET
         category        = COALESCE($3, category),
         subcategory     = CASE WHEN $4::boolean THEN $5 ELSE subcategory END,
         ownership       = COALESCE($6, ownership),
         tax_relevant    = COALESCE($7, tax_relevant),
         notes           = CASE WHEN $8::boolean THEN $9 ELSE notes END,
         category_locked = CASE WHEN $10::boolean THEN TRUE ELSE category_locked END,
         confidence_score= CASE WHEN $10::boolean THEN 1 ELSE confidence_score END,
         updated_at      = now()
       WHERE id = $1 AND user_id = $2
       RETURNING ${COLUMNS}`,
      [
        id, userId,
        patch.category ?? null,
        patch.subcategory !== undefined, patch.subcategory ?? null,
        patch.ownership ?? null,
        patch.taxRelevant ?? null,
        patch.notes !== undefined, patch.notes ? redact(patch.notes).slice(0, 1000) : null,
        categoryChanged,
      ],
    );

    let ruleCreated = false;
    let pastUpdated = 0;

    if (categoryChanged && patch.applyToFutureMerchant !== false) {
      const rule = ruleFromCorrection({
        merchant: existing.merchant,
        description: existing.description,
        category: patch.category!,
        subcategory: patch.subcategory ?? null,
        ownership: patch.ownership ?? null,
        taxRelevant: patch.taxRelevant ?? null,
      });
      if (rule) {
        await db.query(
          `INSERT INTO merchant_rules
             (id, user_id, match_type, pattern, category, subcategory, ownership, tax_relevant, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'user_correction')
           ON CONFLICT (user_id, match_type, pattern) DO UPDATE SET
             category = EXCLUDED.category,
             subcategory = EXCLUDED.subcategory,
             ownership = EXCLUDED.ownership,
             tax_relevant = EXCLUDED.tax_relevant,
             hit_count = merchant_rules.hit_count + 1`,
          [
            randomUUID(), userId, rule.matchType, rule.pattern, rule.category,
            rule.subcategory, rule.ownership, rule.taxRelevant,
          ],
        );
        ruleCreated = true;

        if (patch.applyToPastMerchant && existing.merchant_key) {
          const { rowCount } = await db.query(
            `UPDATE transactions SET category = $3,
                    ownership = COALESCE($4, ownership),
                    tax_relevant = COALESCE($5, tax_relevant),
                    confidence_score = 1, category_locked = TRUE, updated_at = now()
              WHERE user_id = $1 AND merchant_key = $2 AND id <> $6`,
            [userId, existing.merchant_key, patch.category, patch.ownership ?? null, patch.taxRelevant ?? null, id],
          );
          pastUpdated = rowCount;
        }
      }
    }

    return { transaction: mapTransactionRow(updated[0]!), ruleCreated, pastUpdated };
  });
}

export interface ManualTransactionInput {
  accountId: string;
  amountMinor: number;
  currency: string;
  transactionDate: string;
  merchant: string;
  description: string;
  category: string;
  subcategory?: string | null;
  ownership: Ownership;
  transactionType: TransactionType;
  taxRelevant?: TaxRelevance;
  notes?: string | null;
}

export async function createManualTransaction(
  userId: string,
  input: ManualTransactionInput,
): Promise<Transaction> {
  return withUser(userId, async (db) => {
    const { rows: accounts } = await db.query<{ id: string; currency: string }>(
      'SELECT id, currency FROM financial_accounts WHERE id = $1 AND user_id = $2',
      [input.accountId, userId],
    );
    if (!accounts[0]) throw new Error('Account not found');

    const key = merchantKey(input.merchant);
    const id = randomUUID();
    const hash = dedupeHash({
      amountMinor: input.amountMinor,
      currency: input.currency,
      transactionDate: input.transactionDate,
      merchantKey: key,
    });

    const { rows } = await db.query<TransactionRow>(
      `INSERT INTO transactions (
         id, user_id, transaction_id, provider, account_id, amount_minor, currency,
         transaction_date, booking_date, merchant, merchant_key, description, category,
         subcategory, transaction_type, ownership, tax_relevant, confidence_score,
         category_locked, dedupe_hash, notes)
       VALUES ($1,$2,$3,'manual',$4,$5,$6,$7,$7,$8,$9,$10,$11,$12,$13,$14,$15,1,TRUE,$16,$17)
       RETURNING ${COLUMNS}`,
      [
        id, userId, `manual_${id}`, input.accountId, input.amountMinor,
        input.currency.toUpperCase(), input.transactionDate,
        normalizeMerchant(input.merchant), key, redact(input.description).slice(0, 500),
        input.category, input.subcategory ?? null, input.transactionType, input.ownership,
        input.taxRelevant ?? 'needs_review', hash,
        input.notes ? redact(input.notes).slice(0, 1000) : null,
      ],
    );
    return mapTransactionRow(rows[0]!);
  });
}

export async function deleteTransaction(userId: string, id: string): Promise<boolean> {
  return withUser(userId, async (db) => {
    const { rowCount } = await db.query(
      "DELETE FROM transactions WHERE id = $1 AND user_id = $2 AND provider = 'manual'",
      [id, userId],
    );
    return rowCount > 0;
  });
}

/** Re-runs classification over anything the user has not locked. */
export async function recategorizeAll(userId: string): Promise<number> {
  return withUser(userId, async (db) => {
    const rules = await loadMerchantRules(db, userId);
    const { rows } = await db.query<TransactionRow>(
      `SELECT ${COLUMNS} FROM transactions t WHERE t.user_id = $1 AND t.category_locked = FALSE`,
      [userId],
    );
    let changed = 0;
    for (const row of rows) {
      const result = classify(
        {
          merchant: row.merchant,
          description: row.description,
          amountMinor: Number(row.amount_minor),
          transactionType: row.transaction_type,
          provider: row.provider,
        },
        rules,
      );
      if (result.category === row.category && result.ownership === row.ownership) continue;
      await db.query(
        `UPDATE transactions SET category = $2, subcategory = $3, ownership = $4,
                tax_relevant = $5, confidence_score = $6, updated_at = now()
          WHERE id = $1`,
        [row.id, result.category, result.subcategory, result.ownership, result.taxRelevant, result.confidence],
      );
      changed++;
    }
    return changed;
  });
}
