import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin, requireApiUser } from '@/lib/auth';
import { streamAssistant } from '@/ai/assistant';
import { LIMITS, rateLimit } from '@/security/rate-limit';
import { containsForbiddenSecret } from '@/security/redact';
import { badRequest, errorResponse, tooManyRequests } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  question: z.string().trim().min(1).max(1000),
  conversationId: z.uuid().optional(),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(20)
    .default([]),
});

/**
 * Server-sent events, one JSON object per line.
 *
 * The same read-only tools and the same computed numbers as the non-streaming
 * endpoint — this only changes when the person sees them.
 */
export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    const user = await requireApiUser();

    const limit = rateLimit(`assistant:${user.id}`, LIMITS.assistant.limit, LIMITS.assistant.windowMs);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest('Ask a question between 1 and 1000 characters.');

    if (containsForbiddenSecret(parsed.data.question)) {
      return badRequest(
        'That message looks like it contains card or credential details. Kroner never handles those — please rephrase.',
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        try {
          for await (const event of streamAssistant(
            user,
            parsed.data.question,
            parsed.data.history,
            parsed.data.conversationId,
          )) {
            send(event);
          }
        } catch (err) {
          console.error('[assistant] stream aborted', err);
          send({ type: 'error', text: 'The assistant stopped unexpectedly.' });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store, no-transform',
        connection: 'keep-alive',
        // Stops intermediaries from buffering the stream into one lump.
        'x-accel-buffering': 'no',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
