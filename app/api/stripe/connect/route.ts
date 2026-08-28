import { NextResponse, type NextRequest } from 'next/server';
import { assertSameOrigin, requireApiUser } from '@/lib/auth';
import { stripeAuthorizationUrl, stripeConnectConfigured } from '@/integrations/stripe/oauth';
import { createOAuthState } from '@/services/oauth-state';
import { hasEncryptionKey } from '@/security/crypto';
import { LIMITS, rateLimit } from '@/security/rate-limit';
import { badRequest, errorResponse, tooManyRequests, NO_STORE_HEADERS } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Starts the one-tap Stripe connection. Read-only scope, always. */
export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    const user = await requireApiUser();

    const limit = rateLimit(`stripe-connect:${user.id}`, LIMITS.sync.limit, LIMITS.sync.windowMs);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    if (!hasEncryptionKey()) {
      return badRequest(
        'TOKEN_ENCRYPTION_KEY is not set. Kroner will not store a provider grant it cannot encrypt.',
      );
    }
    if (!stripeConnectConfigured()) {
      return badRequest('Stripe Connect is not configured on this deployment.');
    }

    const origin = process.env.APP_URL?.replace(/\/$/, '') ?? request.nextUrl.origin;
    const state = await createOAuthState(user.id, 'stripe', '/dashboard');

    return NextResponse.json(
      {
        authorizationUrl: stripeAuthorizationUrl({
          state,
          redirectUri: `${origin}/api/stripe/callback`,
        }),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
