import '@/lib/server-guard';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { withSystem } from '@/database';
import { randomToken, sha256 } from './crypto';
import type { User } from '@/types/finance';

/**
 * The __Host- prefix pins the cookie to this exact origin and requires Secure,
 * which a plain-http dev server cannot satisfy — so the prefix is production-only.
 */
export const SESSION_COOKIE =
  process.env.NODE_ENV === 'production' ? '__Host-kroner_session' : 'kroner_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ROLLING_REFRESH_MS = 24 * 60 * 60 * 1000;

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  tracking_mode: User['trackingMode'];
  base_currency: string;
  demo_mode: boolean;
  onboarding_completed_at: string | Date | null;
  created_at: string | Date;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    trackingMode: row.tracking_mode,
    baseCurrency: row.base_currency,
    demoMode: row.demo_mode,
    onboardingCompletedAt: row.onboarding_completed_at
      ? new Date(row.onboarding_completed_at).toISOString()
      : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * Issues an opaque 256-bit session token. Only its SHA-256 is stored, so a
 * database read cannot be replayed as a login.
 */
export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await withSystem(async (db) => {
    await db.query(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), userId, sha256(token), expiresAt, meta.userAgent?.slice(0, 300) ?? null, meta.ip ?? null],
    );
  });
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function destroySession(token: string): Promise<void> {
  await withSystem(async (db) => {
    await db.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  });
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await withSystem(async (db) => {
    await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  });
}

/** Resolves the signed-in user, or null. Expired sessions are deleted on sight. */
export async function resolveSessionUser(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const hash = sha256(token);
  return withSystem(async (db) => {
    const { rows } = await db.query<UserRow & { session_id: string; last_seen_at: Date }>(
      `SELECT u.*, s.id AS session_id, s.last_seen_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()
        LIMIT 1`,
      [hash],
    );
    const row = rows[0];
    if (!row) {
      await db.query('DELETE FROM sessions WHERE token_hash = $1 AND expires_at <= now()', [hash]);
      return null;
    }
    if (Date.now() - new Date(row.last_seen_at).getTime() > ROLLING_REFRESH_MS) {
      await db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [row.session_id]);
    }
    return toUser(row);
  });
}

export async function pruneExpiredSessions(): Promise<void> {
  await withSystem(async (db) => {
    await db.query('DELETE FROM sessions WHERE expires_at < now()');
    await db.query("DELETE FROM password_resets WHERE expires_at < now() - interval '7 days'");
  });
}

export { toUser as mapUserRow };
export type { UserRow };
