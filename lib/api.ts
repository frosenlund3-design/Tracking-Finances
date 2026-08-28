import { NextResponse } from 'next/server';
import { UnauthorizedError } from '@/lib/auth';
import { ProviderError, describeProviderError } from '@/integrations/types';
import { redact } from '@/security/redact';

/**
 * One place that turns a thrown error into a response. Nothing internal ever
 * reaches the client: stack traces stay in the server log, and the body is a
 * short message the UI can show as-is.
 */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  if (err instanceof ProviderError) {
    const described = describeProviderError(err);
    const status =
      err.code === 'rate_limited' ? 429 : err.code === 'unauthorized' ? 403 : err.retryable ? 503 : 400;
    return NextResponse.json(
      { error: `${described.title}. ${described.detail}`, action: described.action },
      {
        status,
        headers: err.retryAfterSeconds ? { 'retry-after': String(err.retryAfterSeconds) } : undefined,
      },
    );
  }
  console.error('[api] unhandled error', err);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: redact(message) }, { status: 400 });
}

export function tooManyRequests(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Try again shortly.' },
    { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } },
  );
}

/** Financial responses must never be stored by a cache, anywhere. */
export const NO_STORE_HEADERS = {
  'cache-control': 'no-store, no-cache, must-revalidate, private',
  pragma: 'no-cache',
} as const;
