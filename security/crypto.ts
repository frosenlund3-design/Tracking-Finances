import '@/lib/server-guard';
import crypto from 'node:crypto';

/**
 * Envelope encryption for provider tokens at rest (AES-256-GCM).
 *
 * The key comes from TOKEN_ENCRYPTION_KEY and never touches the database, so a
 * database dump alone cannot yield a usable OAuth token.
 */

const ALGORITHM = 'aes-256-gcm';
export const KEY_VERSION = 1;

export interface SealedValue {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is not set. Generate one with: ' +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 of 32 raw bytes).');
  }
  cachedKey = key;
  return key;
}

export function hasEncryptionKey(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function seal(plaintext: string, aad?: string): SealedValue {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyVersion: KEY_VERSION,
  };
}

export function open(sealed: SealedValue, aad?: string): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(sealed.iv, 'base64'),
  );
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Constant-time comparison for opaque tokens. */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}
