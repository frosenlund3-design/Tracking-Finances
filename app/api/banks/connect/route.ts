import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assertSameOrigin, requireApiUser } from '@/lib/auth';
import { withUser } from '@/database';
import { getBankProvider } from '@/integrations/registry';
import { ProviderError } from '@/integrations/types';
import { LIMITS, rateLimit } from '@/security/rate-limit';
import { badRequest, errorResponse, tooManyRequests, NO_STORE_HEADERS } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  institutionId: z.string().trim().min(1).max(120),
  institutionName: z.string().trim().min(1).max(160),
});

/**
 * Starts the bank authorization.
 *
 * All this endpoint does is ask the provider for a consent URL and record a
 * pending connection. The user then authenticates at their own bank — Kroner
 * is not part of that exchange and never sees a credential from it.
 */
export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    const user = await requireApiUser();

    const limit = rateLimit(`connect:${user.id}`, LIMITS.sync.limit, LIMITS.sync.windowMs);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest('Choose a bank to connect.');

    const provider = getBankProvider();
    if (!provider.isConfigured()) {
      throw new ProviderError('Open Banking is not configured on this deployment.', 'not_configured');
    }

    const origin = process.env.APP_URL?.replace(/\/$/, '') ?? request.nextUrl.origin;
    const authorization = await provider.createAuthorization({
      userId: user.id,
      institutionId: parsed.data.institutionId,
      redirectUrl: `${origin}/api/banks/callback`,
    });

    await withUser(user.id, async (db) => {
      await db.query(
        `INSERT INTO bank_connections
           (id, user_id, provider, institution_id, institution_name, external_reference, status, consent_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'never', $7)`,
        [
          randomUUID(), user.id, provider.id, parsed.data.institutionId,
          parsed.data.institutionName, authorization.externalReference, authorization.expiresAt,
        ],
      );
    });

    return NextResponse.json(
      { authorizationUrl: authorization.authorizationUrl },
      { headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
