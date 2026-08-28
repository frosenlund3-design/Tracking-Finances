/**
 * Applies pending migrations. Safe to run repeatedly and on every deploy.
 *   npm run db:migrate
 */
import { ensureMigrated } from '../database/migrate';
import { closeDatabase, databaseKind } from '../database';

async function main() {
  console.log(`[migrate] target: ${await databaseKind()}`);
  await ensureMigrated();
  console.log('[migrate] up to date');
  await closeDatabase();
}

main().catch((err) => {
  console.error('[migrate] failed', err);
  process.exit(1);
});
