import '@/lib/server-guard';
import { randomUUID } from 'node:crypto';
import { withUser } from '@/database';
import { randomToken, sha256 } from '@/security/crypto';
import type { ProviderId } from '@/types/finance';

/**
 * Single-use state for outbound OAuth redirects.
 *
 * Only the hash is stored, so a database read cannot be used to complete
 * someone else's pending authorization, and consumption is atomic — the same
 * state can never be redeemed twice even if the callback is replayed.
 */

const TTL_MINUTES = 15;

export async function createOAuthState(
  userId: string,
  provider: ProviderId,
  redirectTo?: string,
): Promise<string> {
  const state = randomToken(24);
  await withUser(userId, async (db) => {
    await db.query(
      `INSERT INTO oauth_states (id, user_id, provider, state_hash, redirect_to, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' minutes')::interval)`,
      [randomUUID(), userId, provider, sha256(state), redirectTo ?? null, String(TTL_MINUTES)],
    );
  });
  return state;
}

export interface ConsumedState {
  provider: ProviderId;
  redirectTo: string | null;
}

/** Returns null when the state is unknown, expired, or already used. */
export async function consumeOAuthState(
  userId: string,
  provider: ProviderId,
  state: string,
): Promise<ConsumedState | null> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<{ provider: ProviderId; redirect_to: string | null }>(
      `UPDATE oauth_states SET used_at = now()
        WHERE state_hash = $1 AND user_id = $2 AND provider = $3
          AND used_at IS NULL AND expires_at > now()
        RETURNING provider, redirect_to`,
      [sha256(state), userId, provider],
    );
    const row = rows[0];
    if (!row) return null;

    await db.query(
      "DELETE FROM oauth_states WHERE user_id = $1 AND (expires_at < now() - interval '1 day')",
      [userId],
    );
    return { provider: row.provider, redirectTo: row.redirect_to };
  });
}
