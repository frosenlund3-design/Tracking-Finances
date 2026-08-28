import '@/lib/server-guard';
import fs from 'node:fs/promises';
import path from 'node:path';
import { withSystem } from './index';

const MIGRATIONS_DIR = path.join(process.cwd(), 'database', 'migrations');

let ran: Promise<void> | null = null;

async function applyMigrations(): Promise<void> {
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  await withSystem(async (db) => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    const { rows } = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      await db.exec(sql);
      await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      // eslint-disable-next-line no-console
      console.log(`[migrate] applied ${file}`);
    }
  });
}

/** Idempotent, and safe to call on every cold start. */
export function ensureMigrated(): Promise<void> {
  if (!ran) {
    ran = applyMigrations().catch((err) => {
      ran = null;
      throw err;
    });
  }
  return ran;
}
