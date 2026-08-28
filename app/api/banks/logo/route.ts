import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth';
import { getBankProvider } from '@/integrations/registry';
import { errorResponse } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Streams a bank's logo through our own origin.
 *
 * Two reasons not to point an <img> straight at the aggregator's CDN: the
 * Content Security Policy allows images from 'self' only, and a direct load
 * would tell a third party which bank each visitor is looking at, from their
 * own IP, before they have consented to anything.
 */
const querySchema = z.object({
  institution: z.string().trim().min(1).max(120),
  country: z.string().regex(/^[A-Z]{2}$/).default('DK'),
});

const ALLOWED_HOSTS = new Set(['cdn.gocardless.com', 'cdn-logos.gocardless.com', 'ob.nordigen.com']);
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']);

export async function GET(request: NextRequest) {
  try {
    await requireApiUser();

    const parsed = querySchema.safeParse({
      institution: request.nextUrl.searchParams.get('institution') ?? '',
      country: (request.nextUrl.searchParams.get('country') ?? 'DK').toUpperCase(),
    });
    if (!parsed.success) return new Response('Bad request', { status: 400 });

    const provider = getBankProvider();
    if (!provider.isConfigured()) return new Response('Not configured', { status: 404 });

    const institutions = await provider.listInstitutions(parsed.data.country);
    const match = institutions.find((i) => i.id === parsed.data.institution);
    if (!match?.logoUrl) return new Response('No logo', { status: 404 });

    // The URL comes from the provider, but it is still an outbound fetch built
    // from remote input, so the destination is checked before we follow it.
    let target: URL;
    try {
      target = new URL(match.logoUrl);
    } catch {
      return new Response('Bad logo url', { status: 502 });
    }
    if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
      return new Response('Logo host not allowed', { status: 502 });
    }

    const upstream = await fetch(target, {
      signal: AbortSignal.timeout(8_000),
      redirect: 'error',
    });
    if (!upstream.ok) return new Response('Logo unavailable', { status: 502 });

    const contentType = upstream.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (!ALLOWED_TYPES.has(contentType)) return new Response('Unexpected logo type', { status: 502 });

    return new Response(upstream.body, {
      headers: {
        'content-type': contentType,
        'content-security-policy': "default-src 'none'; sandbox",
        // A bank logo is not user data and changes about never.
        'cache-control': 'private, max-age=86400',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
