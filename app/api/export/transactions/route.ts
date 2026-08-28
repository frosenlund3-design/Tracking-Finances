import { type NextRequest } from 'next/server';
import { requireApiUser } from '@/lib/auth';
import { listTransactions } from '@/services/transactions';
import { listAccounts } from '@/services/accounts';
import { toMajor } from '@/lib/money';
import { categoryLabel } from '@/lib/categories';
import { AUDIT_ACTIONS, recordAudit } from '@/security/audit';
import { errorResponse } from '@/lib/api';
import { parseSearchParams, toFilters } from '@/app/(app)/transactions/search-params';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNS = [
  'date', 'booking_date', 'merchant', 'description', 'amount', 'currency',
  'category', 'subcategory', 'type', 'personal_or_business', 'recurring',
  'bookkeeping', 'account', 'source', 'reference', 'note',
];

/** RFC 4180 escaping, plus a guard against spreadsheet formula injection. */
function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  // A cell starting with = + - @ is executed as a formula by Excel and Sheets.
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const params = parseSearchParams(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    const filters = toFilters(params);

    const [accounts, page] = await Promise.all([
      listAccounts(user.id),
      // A single generous page; an export is a one-off, not a feed.
      listTransactions(user.id, filters, { limit: 200, offset: 0 }),
    ]);
    const accountName = new Map(accounts.map((a) => [a.id, a.name]));

    const rows: string[] = [COLUMNS.join(',')];
    let offset = 0;
    let batch = page;

    while (batch.transactions.length > 0) {
      for (const t of batch.transactions) {
        rows.push(
          [
            t.transactionDate,
            t.bookingDate ?? '',
            t.merchant ?? '',
            t.description,
            toMajor(t.amountMinor).toFixed(2),
            t.currency,
            categoryLabel(t.category),
            t.subcategory ?? '',
            t.transactionType,
            t.ownership,
            t.recurringStatus === 'recurring' ? 'yes' : 'no',
            t.taxRelevant,
            accountName.get(t.accountId) ?? '',
            t.provider,
            t.transactionId,
            t.notes ?? '',
          ].map(csvCell).join(','),
        );
      }
      if (!batch.hasMore || offset > 20_000) break;
      offset += 200;
      batch = await listTransactions(user.id, filters, { limit: 200, offset });
    }

    await recordAudit(user.id, AUDIT_ACTIONS.EXPORT_REQUESTED, { rows: rows.length - 1 });

    const filename = `kroner-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(`﻿${rows.join('\r\n')}\r\n`, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
