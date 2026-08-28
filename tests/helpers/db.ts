import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Each test file gets its own throwaway embedded Postgres. Must run before any
 * module imports the driver, since the data directory is read once at startup —
 * which is why the service modules in these tests are imported dynamically.
 */
export function useTemporaryDatabase(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kroner-test-'));
  process.env.EMBEDDED_DB_DIR = path.join(dir, 'pgdata');
  delete process.env.DATABASE_URL;
  process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
  return dir;
}

export async function createTestUser(email = `${randomUUID()}@test.local`): Promise<string> {
  const { withSystem } = await import('@/database');
  const id = randomUUID();
  await withSystem(async (db) => {
    await db.query('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)', [
      id,
      email,
      'scrypt$1$1$1$AA==$AA==',
    ]);
  });
  return id;
}

export async function createTestAccount(userId: string, providerAccountId = 'acct-1'): Promise<{
  accountId: string;
  map: Map<string, string>;
}> {
  const { upsertAccounts } = await import('@/services/accounts');
  const map = await upsertAccounts(userId, 'demo', null, [
    {
      providerAccountId,
      name: 'Test account',
      institution: 'Test Bank',
      maskedReference: '••0000',
      type: 'checking',
      currency: 'DKK',
      balanceMinor: 0,
    },
  ]);
  return { accountId: [...map.values()][0]!, map };
}
