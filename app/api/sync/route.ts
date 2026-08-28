import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin, requireApiUser } from '@/lib/auth';
import { loadDemoData, refreshAnalysis, syncBankConnection, syncStripe } from '@/services/sync';
import { LIMITS, rateLimit } from '@/security/rate-limit';
import { badRequest, errorResponse, tooManyRequests, NO_STORE_HEADERS } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('bank'), connectionId: z.string().uuid() }),
  z.object({ target: z.literal('stripe') }),
  z.object({ target: z.literal('demo') }),
  z.object({ target: z.literal('analysis') }),
]);

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    const user = await requireApiUser();

    const limit = rateLimit(`sync:${user.id}`, LIMITS.sync.limit, LIMITS.sync.windowMs);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest('Unknown sync target.');

    switch (parsed.data.target) {
      case 'bank': {
        const outcome = await syncBankConnection(user.id, parsed.data.connectionId);
        return NextResponse.json(outcome, { headers: NO_STORE_HEADERS });
      }
      case 'stripe': {
        const outcome = await syncStripe(user.id);
        return NextResponse.json(outcome, { headers: NO_STORE_HEADERS });
      }
      case 'demo': {
        const outcome = await loadDemoData(user.id);
        return NextResponse.json(outcome, { headers: NO_STORE_HEADERS });
      }
      case 'analysis': {
        const result = await refreshAnalysis(user.id);
        return NextResponse.json(result, { headers: NO_STORE_HEADERS });
      }
    }
  } catch (err) {
    return errorResponse(err);
  }
}
