import { NextResponse, type NextRequest } from 'next/server';
import { requireApiUser } from '@/lib/auth';
import { withUser } from '@/database';
import { getBankProvider } from '@/integrations/registry';
import { syncBankConnection } from '@/services/sync';
import { AUDIT_ACTIONS, recordAudit } from '@/security/audit';
import { errorResponse } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Where the bank sends the user back after they have consented.
 *
 * The reference is verified against a connection row belonging to *this*
 * signed-in user before anything is done with it, so a callback URL cannot be
 * replayed against someone else's account.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const reference = request.nextUrl.searchParams.get('ref');
    const errorParam = request.nextUrl.searchParams.get('error');

    if (errorParam) {
      return NextResponse.redirect(new URL('/integrations?bank=declined', request.nextUrl.origin));
    }

    const connection = await withUser(user.id, async (db) => {
      const { rows } = await db.query<{ id: string; external_reference: string | null }>(
        reference
          ? `SELECT id, external_reference FROM bank_connections
              WHERE user_id = $1 AND external_reference = $2 LIMIT 1`
          : `SELECT id, external_reference FROM bank_connections
              WHERE user_id = $1 AND status = 'never' ORDER BY created_at DESC LIMIT 1`,
        reference ? [user.id, reference] : [user.id],
      );
      return rows[0] ?? null;
    });

    if (!connection?.external_reference) {
      return NextResponse.redirect(new URL('/integrations?bank=unknown', request.nextUrl.origin));
    }

    const provider = getBankProvider();
    const result = await provider.completeAuthorization({
      externalReference: connection.external_reference,
    });

    if (result.status !== 'ok') {
      await withUser(user.id, async (db) => {
        await db.query(
          `UPDATE bank_connections SET status = $3, sync_error = $4 WHERE id = $1 AND user_id = $2`,
          [
            connection.id, user.id,
            result.status === 'pending' ? 'never' : 'error',
            result.status === 'pending' ? null : 'Authorization was not completed.',
          ],
        );
      });
      return NextResponse.redirect(
        new URL(`/integrations?bank=${result.status}`, request.nextUrl.origin),
      );
    }

    await withUser(user.id, async (db) => {
      await db.query(
        `UPDATE bank_connections SET status = 'ok', institution_name = COALESCE(NULLIF($3,''), institution_name),
                consent_expires_at = COALESCE($4, consent_expires_at), sync_error = NULL
          WHERE id = $1 AND user_id = $2`,
        [connection.id, user.id, result.institutionName, result.consentExpiresAt],
      );
    });

    await recordAudit(user.id, AUDIT_ACTIONS.BANK_CONNECTED, { provider: provider.id });

    // First sync happens right away so the dashboard is populated on return.
    await syncBankConnection(user.id, connection.id);

    return NextResponse.redirect(new URL('/dashboard?bank=connected', request.nextUrl.origin));
  } catch (err) {
    return errorResponse(err);
  }
}
