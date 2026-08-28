import { NextResponse, type NextRequest } from 'next/server';
import { requireApiUser, requestContext } from '@/lib/auth';
import { exchangeGmailCode } from '@/integrations/messages/gmail';
import { consumeOAuthState } from '@/services/oauth-state';
import { storeToken } from '@/services/token-vault';
import { AUDIT_ACTIONS, recordAudit } from '@/security/audit';
import { errorResponse } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Where Google returns the user after they approve read-only mailbox access. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const fail = (reason: string) => NextResponse.redirect(new URL(`/inbox?gmail=${reason}`, origin));

  try {
    const user = await requireApiUser();
    const params = request.nextUrl.searchParams;

    if (params.get('error')) return fail('declined');

    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) return fail('incomplete');

    // Single-use, user-scoped, time-limited.
    const consumed = await consumeOAuthState(user.id, 'gmail', state);
    if (!consumed) return fail('expired');

    const redirectUri = `${process.env.APP_URL?.replace(/\/$/, '') ?? origin}/api/gmail/callback`;
    const grant = await exchangeGmailCode({ code, redirectUri });

    await storeToken({
      userId: user.id,
      provider: 'gmail',
      connectionId: null,
      token: grant.accessToken,
      scopes: grant.scopes,
      expiresAt: grant.expiresAt,
    });

    // Stored separately so the access token can be replaced without losing
    // the grant, and so a compromised access token is not also a refresh one.
    if (grant.refreshToken) {
      await storeToken({
        userId: user.id,
        provider: 'gmail',
        connectionId: null,
        purpose: 'refresh',
        token: grant.refreshToken,
        scopes: grant.scopes,
      });
    }

    await recordAudit(
      user.id,
      AUDIT_ACTIONS.MAILBOX_CONNECTED,
      { provider: 'gmail', scopes: grant.scopes.join(' ') },
      await requestContext(),
    );

    return NextResponse.redirect(new URL('/inbox?gmail=connected', origin));
  } catch (err) {
    console.error('[gmail] callback failed', err);
    return errorResponse(err);
  }
}
