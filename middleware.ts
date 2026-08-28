import { NextResponse, type NextRequest } from 'next/server';

/**
 * Content Security Policy.
 *
 * A finance dashboard is a high-value target for script injection, so the
 * policy is allowlist-free: no third-party origins at all. A per-request nonce
 * covers the framework's own inline bootstrap; anything else injected into the
 * page has no way to execute.
 *
 * `style-src` keeps 'unsafe-inline' because React writes computed values —
 * chart bar widths, for instance — as style attributes. That is a far smaller
 * surface than inline script, and CSP has no nonce mechanism for attributes.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV !== 'production';

  const csp = [
    `default-src 'self'`,
    // 'strict-dynamic' lets the nonced bootstrap load the rest of the bundle.
    // Dev needs eval for React Refresh; production does not.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self' data:`,
    // The app talks to its own origin only. Provider APIs are called
    // server-side, never from the browser.
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    ...(isDev ? [] : [`upgrade-insecure-requests`]),
  ].join('; ');

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the image optimizer, which are
     * served as bytes and gain nothing from a policy header.
     */
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
