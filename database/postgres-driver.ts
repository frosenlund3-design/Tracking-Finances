import '@/lib/server-guard';
import { Pool } from 'pg';
import type { DbClient, Driver, QueryResult } from './driver';

/**
 * Real Postgres (Supabase, RDS, local). Amounts come back as BIGINT; the pg
 * driver hands those over as strings by default, so we parse int8 to a JS
 * number. Safe here: minor units stay far below Number.MAX_SAFE_INTEGER
 * (9e15 øre is ~90 trillion DKK).
 */
import pgTypes from 'pg';
pgTypes.types.setTypeParser(20, (value: string) => Number(value));

export function createPostgresDriver(connectionString: string): Driver {
  const pool = new Pool({
    connectionString,
    max: Number(process.env.PGPOOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: /sslmode=disable/.test(connectionString)
      ? undefined
      : { rejectUnauthorized: process.env.PGSSL_NO_VERIFY !== 'true' },
  });

  return {
    kind: 'postgres',
    async transaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
      const conn = await pool.connect();
      try {
        await conn.query('BEGIN');
        const client: DbClient = {
          async query<R>(sql: string, params: unknown[] = []) {
            const res = await conn.query(sql, params as never[]);
            return { rows: res.rows as R[], rowCount: res.rowCount ?? 0 } satisfies QueryResult<R>;
          },
          async exec(sql: string) {
            await conn.query(sql);
          },
        };
        const out = await fn(client);
        await conn.query('COMMIT');
        return out;
      } catch (err) {
        try {
          await conn.query('ROLLBACK');
        } catch {
          /* connection already gone */
        }
        throw err;
      } finally {
        conn.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
