import '@/lib/server-guard';
import { randomUUID } from 'node:crypto';
import { withSystem, withUser } from '@/database';
import { hashPassword, verifyPassword, checkPasswordStrength } from '@/security/password';
import { randomToken, sha256 } from '@/security/crypto';
import { mapUserRow, type UserRow } from '@/security/session';
import type { User } from '@/types/finance';

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid_credentials' | 'email_taken' | 'weak_password' | 'invalid_token',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

const SELECT_USER = `id, email, display_name, tracking_mode, base_currency, demo_mode,
                     onboarding_completed_at, created_at`;

export async function createUser(input: {
  email: string;
  password: string;
  displayName?: string | null;
}): Promise<User> {
  const strength = checkPasswordStrength(input.password);
  if (!strength.ok) throw new AuthError(strength.problems.join(' '), 'weak_password');

  const email = input.email.trim();
  const passwordHash = await hashPassword(input.password);
  const id = randomUUID();

  return withSystem(async (db) => {
    const existing = await db.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email]);
    if (existing.rows.length > 0) throw new AuthError('That email is already registered.', 'email_taken');

    const { rows } = await db.query<UserRow>(
      `INSERT INTO users (id, email, display_name, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING ${SELECT_USER}`,
      [id, email, input.displayName?.trim() || null, passwordHash],
    );
    return mapUserRow(rows[0]!);
  });
}

/**
 * Verifies credentials. Runs the hash comparison even when the email is
 * unknown, so response timing does not reveal which accounts exist.
 */
const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

export async function verifyCredentials(email: string, password: string): Promise<User> {
  const row = await withSystem(async (db) => {
    const { rows } = await db.query<UserRow & { password_hash: string }>(
      `SELECT ${SELECT_USER}, password_hash FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email.trim()],
    );
    return rows[0] ?? null;
  });

  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) throw new AuthError('Email or password is incorrect.', 'invalid_credentials');
  return mapUserRow(row);
}

export async function updateProfile(
  userId: string,
  patch: { displayName?: string | null; trackingMode?: User['trackingMode']; baseCurrency?: string },
): Promise<User> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<UserRow>(
      `UPDATE users SET
         display_name  = COALESCE($2, display_name),
         tracking_mode = COALESCE($3, tracking_mode),
         base_currency = COALESCE($4, base_currency),
         updated_at    = now()
       WHERE id = $1 RETURNING ${SELECT_USER}`,
      [userId, patch.displayName ?? null, patch.trackingMode ?? null, patch.baseCurrency ?? null],
    );
    return mapUserRow(rows[0]!);
  });
}

export async function completeOnboarding(
  userId: string,
  trackingMode: User['trackingMode'],
): Promise<void> {
  await withUser(userId, async (db) => {
    await db.query(
      `UPDATE users SET tracking_mode = $2, onboarding_completed_at = now(), updated_at = now()
       WHERE id = $1`,
      [userId, trackingMode],
    );
  });
}

export async function setDemoMode(userId: string, demoMode: boolean): Promise<void> {
  await withUser(userId, async (db) => {
    await db.query('UPDATE users SET demo_mode = $2, updated_at = now() WHERE id = $1', [
      userId,
      demoMode,
    ]);
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const strength = checkPasswordStrength(newPassword);
  if (!strength.ok) throw new AuthError(strength.problems.join(' '), 'weak_password');

  const hash = await withSystem(async (db) => {
    const { rows } = await db.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId],
    );
    return rows[0]?.password_hash ?? null;
  });
  if (!hash || !(await verifyPassword(currentPassword, hash))) {
    throw new AuthError('Current password is incorrect.', 'invalid_credentials');
  }
  const next = await hashPassword(newPassword);
  await withSystem(async (db) => {
    await db.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
      userId,
      next,
    ]);
  });
}

/**
 * Creates a single-use reset token. Returns null when the email is unknown so
 * callers can respond identically either way and avoid account enumeration.
 */
export async function createPasswordReset(email: string): Promise<{ token: string; userId: string } | null> {
  return withSystem(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      'SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1',
      [email.trim()],
    );
    const user = rows[0];
    if (!user) return null;
    const token = randomToken(32);
    await db.query(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [randomUUID(), user.id, sha256(token)],
    );
    return { token, userId: user.id };
  });
}

export async function consumePasswordReset(token: string, newPassword: string): Promise<string> {
  const strength = checkPasswordStrength(newPassword);
  if (!strength.ok) throw new AuthError(strength.problems.join(' '), 'weak_password');
  const hash = await hashPassword(newPassword);

  return withSystem(async (db) => {
    const { rows } = await db.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM password_resets
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() LIMIT 1`,
      [sha256(token)],
    );
    const reset = rows[0];
    if (!reset) throw new AuthError('This reset link is invalid or has expired.', 'invalid_token');
    await db.query('UPDATE password_resets SET used_at = now() WHERE id = $1', [reset.id]);
    await db.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
      reset.user_id,
      hash,
    ]);
    // A password change invalidates every existing session.
    await db.query('DELETE FROM sessions WHERE user_id = $1', [reset.user_id]);
    return reset.user_id;
  });
}

export async function deleteFinancialData(userId: string): Promise<void> {
  await withUser(userId, async (db) => {
    // Ordered so foreign keys stay satisfied without relying on cascade order.
    await db.query('UPDATE transactions SET subscription_id = NULL WHERE user_id = $1', [userId]);
    for (const table of [
      'transactions',
      'subscriptions',
      'financial_insights',
      'merchant_rules',
      'financial_accounts',
      'integration_tokens',
      'stripe_connections',
      'bank_connections',
      'ai_queries',
    ]) {
      await db.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    }
    await db.query('UPDATE users SET demo_mode = TRUE WHERE id = $1', [userId]);
  });
}

export async function deleteAccount(userId: string): Promise<void> {
  await withSystem(async (db) => {
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
  });
}
