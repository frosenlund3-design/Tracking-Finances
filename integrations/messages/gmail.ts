import '@/lib/server-guard';
import { hasToken, storeToken, useToken } from '@/services/token-vault';
import type { MessageSource, UnifiedMessage } from './types';

/**
 * Gmail, read-only.
 *
 * The scope requested is gmail.readonly and nothing else, so the grant cannot
 * send, delete or label even if this code were changed to try. The access
 * token is decrypted inside useToken for the duration of the call and never
 * leaves the server.
 *
 * Only headers and the snippet Gmail already computes are read — never a
 * message body. A unified inbox needs to know that something arrived and from
 * whom; it does not need to hold the contents of anyone's correspondence, and
 * an app that stores less is an app with less to lose.
 */

export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TIMEOUT_MS = 6_000;

export function gmailConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function gmailAuthorizationUrl(options: { state: string; redirectUri: string }): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    access_type: 'offline',
    // Forces a refresh token on a re-grant, which Google otherwise issues once.
    prompt: 'consent',
    include_granted_scopes: 'false',
    state: options.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface GmailTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
}

/** Exchanges an authorization code. Called only from the callback route. */
export async function exchangeGmailCode(options: {
  code: string;
  redirectUri: string;
}): Promise<GmailTokens> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: options.code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: options.redirectUri,
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  });

  if (!response.ok) throw new Error(`Google refused the code exchange (${response.status})`);
  const body = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!body.access_token) throw new Error('Google returned no access token');

  const granted = (body.scope ?? '').split(' ').filter(Boolean);
  // Refuse a grant wider than asked for rather than storing it quietly.
  const unexpected = granted.filter((scope) => !GMAIL_SCOPES.includes(scope));
  if (unexpected.length > 0) {
    throw new Error(`Google granted scopes that were not requested: ${unexpected.join(', ')}`);
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: body.expires_in
      ? new Date(Date.now() + body.expires_in * 1000).toISOString()
      : null,
    scopes: granted.length > 0 ? granted : GMAIL_SCOPES,
  };
}

/** Trades a refresh token for a fresh access token. */
export async function refreshGmailToken(refreshToken: string): Promise<GmailTokens> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Google refused the refresh (${response.status})`);
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('Google returned no access token');

  return {
    accessToken: body.access_token,
    refreshToken: null,
    expiresAt: body.expires_in
      ? new Date(Date.now() + body.expires_in * 1000).toISOString()
      : null,
    scopes: GMAIL_SCOPES,
  };
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
}

interface GmailMessage {
  id: string;
  snippet?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: { headers?: Array<{ name: string; value: string }> };
}

function header(message: GmailMessage, name: string): string {
  const found = message.payload?.headers?.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return found?.value ?? '';
}

async function get<T>(path: string, token: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const gmailSource: MessageSource = {
  id: 'gmail',
  displayName: 'Gmail',
  isConfigured: gmailConfigured,

  async listRecent(userId: string, limit: number): Promise<UnifiedMessage[]> {
    const fetchWith = (accessToken: string) => readInbox(accessToken, limit);

    const first = await useToken(userId, 'gmail', null, fetchWith);
    if (first !== null) return first;

    // A null means the API refused the token, which after an hour it will.
    // One refresh, then one retry, then give up and let the screen say the
    // connection needs renewing rather than showing a stale inbox.
    if (!(await hasToken(userId, 'gmail', null, 'refresh'))) return [];

    const refreshed = await useToken(
      userId,
      'gmail',
      null,
      (refreshToken) => refreshGmailToken(refreshToken),
      'refresh',
    );
    await storeToken({
      userId,
      provider: 'gmail',
      connectionId: null,
      token: refreshed.accessToken,
      scopes: refreshed.scopes,
      expiresAt: refreshed.expiresAt,
    });

    return (await readInbox(refreshed.accessToken, limit)) ?? [];
  },
};

/** Null when the API refused the token; an array otherwise, empty included. */
async function readInbox(accessToken: string, limit: number): Promise<UnifiedMessage[] | null> {
  const list = await get<GmailListResponse>(
    `/messages?maxResults=${Math.min(limit, 25)}&labelIds=INBOX`,
    accessToken,
  );
  if (list === null) return null;
  if (!list.messages?.length) return [];

  // Metadata format only: headers and the snippet Gmail already computed,
  // never the body.
  const details = await Promise.all(
    list.messages.map((m) =>
      get<GmailMessage>(
        `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        accessToken,
      ),
    ),
  );

  return details
    .filter((m): m is GmailMessage => m !== null)
    .map((message) => ({
      id: message.id,
      source: 'gmail' as const,
      from: header(message, 'From').replace(/\s*<[^>]+>$/, '').trim() || 'Unknown sender',
      subject: header(message, 'Subject') || '(no subject)',
      preview: (message.snippet ?? '').slice(0, 180),
      receivedAt: message.internalDate
        ? new Date(Number(message.internalDate)).toISOString()
        : new Date().toISOString(),
      unread: message.labelIds?.includes('UNREAD') ?? false,
      url: `https://mail.google.com/mail/u/0/#inbox/${message.id}`,
    }));
}
