import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireApiUser, requestContext } from '@/lib/auth';
import { withUser } from '@/database';
import { exchangeStripeCode } from '@/integrations/stripe/oauth';
import { consumeOAuthState } from '@/services/oauth-state';
import { storeToken } from '@/services/token-vault';
import { syncStripe } from '@/services/sync';
import { AUDIT_ACTIONS, recordAudit } from '@/security/audit';
import { errorResponse } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Where Stripe returns the user after they approve read-only access. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/integrations?stripe=${reason}`, origin));

  try {
    const user = await requireApiUser();
    const params = request.nextUrl.searchParams;

    if (params.get('error')) return fail('declined');

    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) return fail('incomplete');

    // Single-use, user-scoped, time-limited.
    const consumed = await consumeOAuthState(user.id, 'stripe', state);
    if (!consumed) return fail('expired');

    const grant = await exchangeStripeCode(code);

    await storeToken({
      userId: user.id,
      provider: 'stripe',
      connectionId: null,
      token: grant.accessToken,
      scopes: [grant.scope],
    });

    await withUser(user.id, async (db) => {
      await db.query(
        `INSERT INTO stripe_connections (id, user_id, stripe_account_id, account_name, livemode, status)
         VALUES ($1, $2, $3, NULL, $4, 'never')
         ON CONFLICT (user_id, stripe_account_id) DO UPDATE SET
           livemode = EXCLUDED.livemode, status = 'never', sync_error = NULL`,
        [randomUUID(), user.id, grant.accountId, grant.livemode],
      );
    });

    await recordAudit(
      user.id,
      AUDIT_ACTIONS.STRIPE_CONNECTED,
      { livemode: grant.livemode, scope: grant.scope, method: 'connect_oauth' },
      await requestContext(),
    );

    // Pull the history straight away so the dashboard is populated on return.
    await syncStripe(user.id);

    return NextResponse.redirect(new URL('/dashboard?stripe=connected', origin));
  } catch (err) {
    console.error('[stripe] callback failed', err);
    return errorResponse(err);
  }
}
