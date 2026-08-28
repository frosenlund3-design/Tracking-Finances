import { NextResponse, type NextRequest } from 'next/server';
import { assertSameOrigin, requireApiUser } from '@/lib/auth';
import { gmailAuthorizationUrl, gmailConfigured } from '@/integrations/messages/gmail';
import { createOAuthState } from '@/services/oauth-state';
import { hasEncryptionKey } from '@/security/crypto';
import { LIMITS, rateLimit } from '@/security/rate-limit';
import { badRequest, errorResponse, tooManyRequests, NO_STORE_HEADERS } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Starts the mailbox connection.
 *
 * The scope is gmail.readonly and nothing else, so the grant Google shows the
 * user says "read your email" and cannot be widened later without them going
 * through this screen again.
 */
export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    const user = await requireApiUser();

    const limit = rateLimit(`gmail-connect:${user.id}`, LIMITS.sync.limit, LIMITS.sync.windowMs);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    if (!hasEncryptionKey()) {
      return badRequest(
        'TOKEN_ENCRYPTION_KEY is not set. Kroner will not store a mailbox grant it cannot encrypt.',
      );
    }
    if (!gmailConfigured()) {
      return badRequest(
        'Gmail is not configured on this deployment. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      );
    }

    const origin = process.env.APP_URL?.replace(/\/$/, '') ?? request.nextUrl.origin;
    const state = await createOAuthState(user.id, 'gmail', '/inbox');

    return NextResponse.json(
      {
        authorizationUrl: gmailAuthorizationUrl({
          state,
          redirectUri: `${origin}/api/gmail/callback`,
        }),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
