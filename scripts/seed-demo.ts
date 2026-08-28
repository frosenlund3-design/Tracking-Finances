/**
 * Creates a demo account with nine months of realistic Danish transactions.
 *   npm run db:seed -- demo@example.com 'a-long-enough-passphrase'
 *
 * Useful for evaluating the product without clicking through signup.
 */
import { ensureMigrated } from '../database/migrate';
import { closeDatabase } from '../database';
import { createUser, completeOnboarding } from '../services/users';
import { loadDemoData } from '../services/sync';

async function main() {
  const [email = 'demo@kroner.local', password = 'demo-passphrase-2026'] = process.argv.slice(2);

  await ensureMigrated();

  let userId: string;
  try {
    const user = await createUser({ email, password, displayName: 'Demo' });
    userId = user.id;
    console.log(`[seed] created ${email}`);
  } catch (err) {
    console.error(`[seed] could not create ${email}:`, err instanceof Error ? err.message : err);
    await closeDatabase();
    process.exit(1);
  }

  const outcome = await loadDemoData(userId);
  await completeOnboarding(userId, 'both');

  console.log(`[seed] ${outcome.ingest.inserted} transactions across ${outcome.accountsSynced} accounts`);
  console.log(`[seed] ${outcome.subscriptionsDetected} subscriptions, ${outcome.insightsGenerated} insights`);
  console.log(`[seed] sign in with ${email}`);
  await closeDatabase();
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
