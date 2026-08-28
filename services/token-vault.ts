import '@/lib/server-guard';
import { randomUUID } from 'node:crypto';
import { withUser } from '@/database';
import { open, seal } from '@/security/crypto';
import type { ProviderId } from '@/types/finance';

/**
 * Provider tokens live here and nowhere else.
 *
 * They are AES-256-GCM sealed with a key held only in the environment, are
 * never returned to a route handler that could serialize them to the client,
 * and are decrypted only inside `useToken`, whose callback receives the
 * plaintext for the duration of a single provider call.
 *
 * The user id is bound in as additional authenticated data, so a row copied
 * between users fails to decrypt rather than leaking.
 */

export interface StoredTokenMeta {
  provider: ProviderId;
  connectionId: string | null;
  purpose: string;
  scopes: string[];
  expiresAt: string | null;
}

function aad(userId: string, provider: string, purpose: string): string {
  return `${userId}|${provider}|${purpose}`;
}

export async function storeToken(input: {
  userId: string;
  provider: ProviderId;
  connectionId: string | null;
  purpose?: string;
  token: string;
  scopes?: string[];
  expiresAt?: string | null;
}): Promise<void> {
  const purpose = input.purpose ?? 'access';
  const sealed = seal(input.token, aad(input.userId, input.provider, purpose));
  await withUser(input.userId, async (db) => {
    await db.query(
      `INSERT INTO integration_tokens
         (id, user_id, provider, connection_id, purpose, ciphertext, iv, auth_tag, key_version, scopes, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (user_id, provider, connection_id, purpose) DO UPDATE SET
         ciphertext = EXCLUDED.ciphertext,
         iv = EXCLUDED.iv,
         auth_tag = EXCLUDED.auth_tag,
         key_version = EXCLUDED.key_version,
         scopes = EXCLUDED.scopes,
         expires_at = EXCLUDED.expires_at,
         created_at = now()`,
      [
        randomUUID(), input.userId, input.provider, input.connectionId, purpose,
        sealed.ciphertext, sealed.iv, sealed.authTag, sealed.keyVersion,
        input.scopes ?? ['read'], input.expiresAt ?? null,
      ],
    );
  });
}

/**
 * Runs `fn` with the decrypted token. The plaintext is scoped to this call and
 * is never returned, logged, or attached to a response.
 */
export async function useToken<T>(
  userId: string,
  provider: ProviderId,
  connectionId: string | null,
  fn: (token: string) => Promise<T>,
  purpose = 'access',
): Promise<T> {
  const row = await withUser(userId, async (db) => {
    const { rows } = await db.query<{
      ciphertext: string; iv: string; auth_tag: string; key_version: number;
      expires_at: string | Date | null;
    }>(
      `SELECT ciphertext, iv, auth_tag, key_version, expires_at
         FROM integration_tokens
        WHERE user_id = $1 AND provider = $2 AND purpose = $3
          AND connection_id IS NOT DISTINCT FROM $4
        LIMIT 1`,
      [userId, provider, purpose, connectionId],
    );
    return rows[0] ?? null;
  });
  if (!row) throw new Error(`No stored ${provider} token for this connection.`);

  const plaintext = open(
    {
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.auth_tag,
      keyVersion: row.key_version,
    },
    aad(userId, provider, purpose),
  );
  return fn(plaintext);
}

export async function hasToken(
  userId: string,
  provider: ProviderId,
  connectionId: string | null = null,
  // Tokens are stored per purpose, so asking "is there a token" without one
  // would answer yes for an access token when the question was about refresh.
  purpose = 'access',
): Promise<boolean> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `SELECT 1 FROM integration_tokens
        WHERE user_id = $1 AND provider = $2 AND connection_id IS NOT DISTINCT FROM $3
          AND purpose = $4 LIMIT 1`,
      [userId, provider, connectionId, purpose],
    );
    return rows.length > 0;
  });
}

export async function deleteTokens(
  userId: string,
  provider: ProviderId,
  connectionId: string | null = null,
): Promise<void> {
  await withUser(userId, async (db) => {
    if (connectionId) {
      await db.query(
        'DELETE FROM integration_tokens WHERE user_id = $1 AND provider = $2 AND connection_id = $3',
        [userId, provider, connectionId],
      );
    } else {
      await db.query('DELETE FROM integration_tokens WHERE user_id = $1 AND provider = $2', [
        userId,
        provider,
      ]);
    }
  });
}
