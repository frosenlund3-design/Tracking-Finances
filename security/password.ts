import '@/lib/server-guard';
import crypto from 'node:crypto';

/**
 * scrypt password hashing. Node's built-in, memory-hard, no native deps.
 * Format: scrypt$N$r$p$<salt-b64>$<hash-b64>
 */

const N = 2 ** 15; // CPU/memory cost
const R = 8;
const P = 1;
const KEY_LEN = 64;
const MAX_MEM = 128 * N * R * 2;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LEN,
      { N, r: R, p: P, maxmem: MAX_MEM },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts as [
    string, string, string, string, string, string,
  ];
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  const salt = Buffer.from(saltRaw, 'base64');
  const expected = Buffer.from(hashRaw, 'base64');
  const actual = await new Promise<Buffer | null>((resolve) => {
    crypto.scrypt(
      password.normalize('NFKC'),
      salt,
      expected.length,
      { N: n, r, p, maxmem: 128 * n * r * 2 },
      (err, key) => resolve(err ? null : key),
    );
  });
  if (!actual || actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export interface PasswordCheck {
  ok: boolean;
  problems: string[];
}

/**
 * Length-first policy (NIST SP 800-63B): long passphrases beat character-class
 * gymnastics. We block the handful of passwords that are guessed first.
 */
const COMMON = new Set([
  'password', 'password1', '12345678', '123456789', 'qwertyui', 'letmein1',
  'iloveyou', 'admin123', 'welcome1', 'passw0rd', 'kodeord1', '87654321',
]);

export function checkPasswordStrength(password: string): PasswordCheck {
  const problems: string[] = [];
  if (password.length < 12) problems.push('Use at least 12 characters.');
  if (password.length > 200) problems.push('Keep it under 200 characters.');
  if (COMMON.has(password.toLowerCase())) problems.push('This password is too common.');
  if (/^(.)\1+$/.test(password)) problems.push('Use more than one repeated character.');
  return { ok: problems.length === 0, problems };
}
