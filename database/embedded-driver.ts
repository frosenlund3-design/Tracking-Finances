import '@/lib/server-guard';
import fs from 'node:fs';
import type { DbClient, Driver, QueryResult } from './driver';

/**
 * Embedded Postgres (PGlite) so the product runs with zero infrastructure —
 * demo mode, local development, CI. It is genuinely Postgres, so the exact
 * same migrations, RLS policies and SQL run against it.
 *
 * Not intended for multi-instance production; set DATABASE_URL for that.
 */
export function createEmbeddedDriver(dataDir: string): Driver {
  let instance: Promise<import('@electric-sql/pglite').PGlite> | null = null;

  async function db() {
    if (!instance) {
      fs.mkdirSync(dataDir, { recursive: true });
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
            const res = await pg.query(sql, params as unknown[]);
            return {
              rows: (res.rows ?? []) as R[],
              rowCount: res.affectedRows ?? (res.rows?.length ?? 0),
            } satisfies QueryResult<R>;
          },
          async exec(sql: string) {
            await pg.exec(sql);
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
    },
  };
}
