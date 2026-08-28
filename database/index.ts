import '@/lib/server-guard';
import path from 'node:path';
import type { DbClient, Driver } from './driver';

export type { DbClient, QueryResult } from './driver';

let driverPromise: Promise<Driver> | null = null;

async function buildDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const { createPostgresDriver } = await import('./postgres-driver');
    return createPostgresDriver(url);
  }
  const { createEmbeddedDriver } = await import('./embedded-driver');
  const dir = process.env.EMBEDDED_DB_DIR?.trim() || path.join(process.cwd(), '.data', 'pgdata');
  return createEmbeddedDriver(dir);
}

export function getDriver(): Promise<Driver> {
  if (!driverPromise) driverPromise = buildDriver();
  return driverPromise;
}

export async function databaseKind(): Promise<'postgres' | 'embedded'> {
  return (await getDriver()).kind;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` in a transaction pinned to one user. Row-level security is active,
 * so any query that forgets to filter by user_id simply returns nothing.
 * This is the ONLY entry point request handlers may use.
 */
export async function withUser<T>(userId: string, fn: (db: DbClient) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(userId)) throw new Error('withUser: invalid user id');
  const driver = await getDriver();
  return driver.transaction(async (db) => {
    // set_config with a literal parameter — never string-interpolated.
    await db.query('SELECT set_config($1, $2, true)', ['app.user_id', userId]);
    // Drop to the unprivileged role so RLS is actually enforced: owners and
    // superusers are exempt from policies unless they give up that privilege.
    await db.exec('SET LOCAL ROLE kroner_app');
    return fn(db);
  });
}

/**
 * Trusted, user-agnostic access: migrations, login lookups, session creation,
 * the demo seeder. Bypasses RLS, so it must never be reachable from a route
 * handler with user-supplied table filters.
 */
export async function withSystem<T>(fn: (db: DbClient) => Promise<T>): Promise<T> {
  const driver = await getDriver();
  return driver.transaction(async (db) => {
    await db.query('SELECT set_config($1, $2, true)', ['app.bypass_rls', 'on']);
    return fn(db);
  });
}

export async function closeDatabase(): Promise<void> {
  if (driverPromise) {
    await (await driverPromise).close();
    driverPromise = null;
  }
}
