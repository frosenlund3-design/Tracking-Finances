import '@/lib/server-guard';
import { z } from 'zod';
import { ProviderError } from '@/integrations/types';
import { redact } from '@/security/redact';

/**
 * Stripe Connect OAuth, requested with `scope=read_only`.
 *
 * This is what makes Stripe a single button rather than a "paste your API key"
 * form. The scope matters: a read-only Connect grant cannot create a charge,
 * issue a refund, or move a payout, and Stripe enforces that server-side —
 * the restriction does not depend on this application behaving well.
 *
 * Falls back to the manual key flow when Connect is not configured, so a
 * single-user deployment does not need a Connect platform at all.
 */

const CLIENT_ID = process.env.STRIPE_CONNECT_CLIENT_ID;
const SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_API_KEY;

const AUTHORIZE_URL = 'https://connect.stripe.com/oauth/authorize';
const TOKEN_URL = 'https://connect.stripe.com/oauth/token';

export function stripeConnectConfigured(): boolean {
  return Boolean(CLIENT_ID && SECRET_KEY);
}

/**
 * Builds the consent URL. `state` is an opaque, single-use value we mint and
 * verify on the way back — without it, a callback could be replayed against
 * another user's session.
 */
export function stripeAuthorizationUrl(input: { state: string; redirectUri: string }): string {
  if (!CLIENT_ID) throw new ProviderError('Stripe Connect is not configured.', 'not_configured');
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CLIENT_ID);
  // The whole point: read access, nothing else.
  url.searchParams.set('scope', 'read_only');
  url.searchParams.set('state', input.state);
  url.searchParams.set('redirect_uri', input.redirectUri);
  return url.toString();
}

const tokenSchema = z.object({
  access_token: z.string(),
  stripe_user_id: z.string(),
  scope: z.string().optional(),
  livemode: z.boolean().optional(),
  refresh_token: z.string().optional(),
});

export interface StripeGrant {
  accessToken: string;
  accountId: string;
  scope: string;
  livemode: boolean;
}

export async function exchangeStripeCode(code: string): Promise<StripeGrant> {
  if (!SECRET_KEY) throw new ProviderError('Stripe Connect is not configured.', 'not_configured');

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${SECRET_KEY}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ProviderError('Could not reach Stripe.', 'provider_down', true);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ProviderError(
      `Stripe rejected the authorization: ${redact(body).slice(0, 160)}`,
      response.status === 400 ? 'unauthorized' : 'invalid_response',
    );
  }

  const parsed = tokenSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new ProviderError('Unexpected Stripe response.', 'invalid_response');

  const scope = parsed.data.scope ?? 'read_only';
  // Refuse anything wider than we asked for. If Stripe ever returned a
  // read-write grant, storing it would quietly give this app abilities it
  // promises never to have.
  if (scope !== 'read_only') {
    throw new ProviderError(
      `Stripe returned a "${scope}" grant. Kroner only accepts read-only access.`,
      'unauthorized',
    );
  }

  return {
    accessToken: parsed.data.access_token,
    accountId: parsed.data.stripe_user_id,
    scope,
    livemode: parsed.data.livemode ?? true,
  };
}

/** Revokes the grant at Stripe so disconnecting is real, not just local. */
export async function revokeStripeGrant(accountId: string): Promise<void> {
  if (!CLIENT_ID || !SECRET_KEY) return;
  await fetch('https://connect.stripe.com/oauth/deauthorize', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ client_id: CLIENT_ID, stripe_user_id: accountId }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    // Already revoked, or Stripe is down. Local removal proceeds either way.
  });
}
