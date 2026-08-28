import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin, requireApiUser } from '@/lib/auth';
import { askAssistant } from '@/ai/assistant';
import { LIMITS, rateLimit } from '@/security/rate-limit';
import { badRequest, errorResponse, tooManyRequests, NO_STORE_HEADERS } from '@/lib/api';
import { containsForbiddenSecret } from '@/security/redact';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  question: z.string().trim().min(1).max(1000),
  conversationId: z.string().uuid().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      }),
    )
    .max(20)
    .default([]),
});

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    const user = await requireApiUser();

    const limit = rateLimit(`assistant:${user.id}`, LIMITS.assistant.limit, LIMITS.assistant.windowMs);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest('Ask a question between 1 and 1000 characters.');

    // A question is user input that gets forwarded to a third party. If it
    // contains something we refuse to handle, stop before it leaves the server.
    if (containsForbiddenSecret(parsed.data.question)) {
      return badRequest(
        'That message looks like it contains card or credential details. Kroner never handles those — please rephrase.',
      );
    }

    const result = await askAssistant(
      user,
      parsed.data.question,
      parsed.data.history,
      parsed.data.conversationId,
    );

    return NextResponse.json(
      {
        answer: result.answer,
        toolsUsed: result.toolsUsed,
        evidence: result.evidence,
        mode: result.mode,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
