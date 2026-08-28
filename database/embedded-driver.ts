import '@/lib/server-guard';
import fs from 'node:fs';
import path from 'node:path';
import type { DbClient, Driver, QueryResult } from './driver';

/**
 * PGlite is a single-process database. Two processes opening the same data
 * directory do not get an error from the engine — they get a WASM abort with
 * no explanation, usually much later and in an unrelated request. A lock file
 * turns that into a sentence someone can act on.
 */
function acquireLock(dataDir: string): () => void {
  const lockPath = path.join(dataDir, '.kroner.lock');

  try {
    const existing = Number(fs.readFileSync(lockPath, 'utf8').trim());
    if (Number.isInteger(existing) && existing !== process.pid && isAlive(existing)) {
      throw new Error(
        `Another process (pid ${existing}) is already using the embedded database at ` +
          `${dataDir}. PGlite allows one process at a time — stop that process, or set ` +
          `DATABASE_URL to run against a real PostgreSQL server.`,
      );
    }
  } catch (err) {
    // A missing or unreadable lock file is fine; a live lock is not.
    if (err instanceof Error && err.message.includes('already using')) throw err;
  }

  fs.writeFileSync(lockPath, String(process.pid), 'utf8');
  const release = () => {
    try {
      if (fs.readFileSync(lockPath, 'utf8').trim() === String(process.pid)) fs.unlinkSync(lockPath);
    } catch {
      /* already gone */
    }
  };
  process.once('exit', release);
  return release;
}

function isAlive(pid: number): boolean {
  try {
    // Signal 0 checks for existence without touching the process.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Embedded Postgres (PGlite) so the product runs with zero infrastructure —
 * demo mode, local development, CI. It is genuinely Postgres, so the exact
 * same migrations, RLS policies and SQL run against it.
 *
 * Not intended for multi-instance production; set DATABASE_URL for that.
 */
export function createEmbeddedDriver(dataDir: string): Driver {
  let instance: Promise<import('@electric-sql/pglite').PGlite> | null = null;
  let releaseLock: (() => void) | null = null;

  async function db() {
    if (!instance) {
      fs.mkdirSync(dataDir, { recursive: true });
      releaseLock = acquireLock(dataDir);
      instance = import('@electric-sql/pglite').then(
        ({ PGlite, types }) =>
          new PGlite(dataDir, {
            // BIGINT (oid 20) carries minor units — hand it back as a number,
            // matching the pg driver's configured behaviour.
            parsers: { [types.INT8]: (value: string) => Number(value) },
          }),
      );
    }
    return instance;
  }

  // PGlite is single-connection, so transactions must not interleave.
  let queue: Promise<unknown> = Promise.resolve();

  return {
    kind: 'embedded',
    transaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
      const run = queue.then(async () => {
        const pg = await db();
        await pg.exec('BEGIN');
        const client: DbClient = {
          async query<R>(sql: string, params: unknown[] = []) {
            const res = await pg.query(sql, params as unknown[]).catch(rethrowEngineAbort);
            return {
              rows: (res.rows ?? []) as R[],
              rowCount: res.affectedRows ?? (res.rows?.length ?? 0),
            } satisfies QueryResult<R>;
          },
          async exec(sql: string) {
            await pg.exec(sql).catch(rethrowEngineAbort);
          },
        };
        try {
          const out = await fn(client);
          await pg.exec('COMMIT');
          return out;
        } catch (err) {
          try {
            await pg.exec('ROLLBACK');
          } catch {
            /* already rolled back */
          }
          throw err;
        }
      });
      // Keep the queue alive even when a transaction rejects.
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run as Promise<T>;
    },
    async close() {
      if (instance) await (await instance).close();
      instance = null;
      releaseLock?.();
      releaseLock = null;
    },
  };
}

/**
 * PGlite reports engine-level failures as a bare WASM abort. The most common
 * cause by far is a second process on the same data directory, so say so.
 */
function rethrowEngineAbort(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (/Aborted\(|RuntimeError/.test(message)) {
    throw new Error(
      'The embedded database aborted. This usually means another process opened the same ' +
        'data directory. Stop the other instance, or set DATABASE_URL to use a real ' +
        `PostgreSQL server. (${message})`,
    );
  }
  throw err;
}
