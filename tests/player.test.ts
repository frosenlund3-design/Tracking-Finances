import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTemporaryDatabase, createTestUser } from './helpers/db';

useTemporaryDatabase();

let userId: string;

beforeAll(async () => {
  const { ensureMigrated } = await import('@/database/migrate');
  await ensureMigrated();
  userId = await createTestUser();
});

afterAll(async () => {
  const { closeDatabase } = await import('@/database');
  await closeDatabase();
});

describe('the player', () => {
  it('starts at level 1 with nothing collected', async () => {
    const { getPlayer } = await import('@/services/player');
    const player = await getPlayer(userId);
    expect(player.xp).toBe(0);
    expect(player.progress.level).toBe(1);
    expect(player.momentum).toBe(0);
    expect(player.collection).toEqual([]);
  });

  it('credits an action and records why', async () => {
    const { grantXp } = await import('@/services/player');
    const { XP } = await import('@/lib/game');
    const result = await grantXp(userId, 'scan_product', { barcode: '5701234' });
    expect(result.gained).toBe(XP.scan_product);
    expect(result.xp).toBe(XP.scan_product);
    expect(result.momentum).toBeGreaterThan(0);
  });

  it('hands over the starter creature on the first look', async () => {
    const { refreshUnlocks, getPlayer } = await import('@/services/player');
    const fresh = await createTestUser();
    const unlocked = await refreshUnlocks(fresh);
    expect(unlocked.map((c) => c.key)).toContain('prik');
    expect((await getPlayer(fresh)).collection).toContain('prik');
  });

  it('never hands the same creature over twice', async () => {
    const { refreshUnlocks } = await import('@/services/player');
    const fresh = await createTestUser();
    await refreshUnlocks(fresh);
    expect(await refreshUnlocks(fresh)).toEqual([]);
  });

  it('unlocks on the condition being met, not on chance', async () => {
    const { grantXp, getPlayer } = await import('@/services/player');
    const fresh = await createTestUser();
    // Two scans is not enough; the third earns it.
    await grantXp(fresh, 'scan_product');
    await grantXp(fresh, 'scan_product');
    expect((await getPlayer(fresh)).collection).not.toContain('streg');
    const third = await grantXp(fresh, 'scan_product');
    expect(third.unlocked.map((c) => c.key)).toContain('streg');
  });

  it('reports the level it crossed, and only when it crossed one', async () => {
    const { grantXp } = await import('@/services/player');
    const fresh = await createTestUser();
    let levelUps = 0;
    let last = null as number | null;
    for (let i = 0; i < 12; i += 1) {
      const result = await grantXp(fresh, 'meal_cooked');
      if (result.leveledUp) {
        levelUps += 1;
        expect(result.leveledUp).toBe(result.progress.level);
        expect(result.leveledUp).not.toBe(last);
        last = result.leveledUp;
      }
    }
    expect(levelUps).toBeGreaterThan(0);
  });

  it('tapers momentum within a day so one heroic session is not a week', async () => {
    const { grantXp } = await import('@/services/player');
    const fresh = await createTestUser();
    const first = await grantXp(fresh, 'sort_correct');
    let latest = first.momentum;
    for (let i = 0; i < 10; i += 1) latest = (await grantXp(fresh, 'sort_correct')).momentum;
    expect(latest).toBeGreaterThan(first.momentum);
    expect(latest).toBeLessThan(first.momentum * 6);
  });

  it('counts points earned today', async () => {
    const { grantXp, xpToday } = await import('@/services/player');
    const { XP } = await import('@/lib/game');
    const fresh = await createTestUser();
    await grantXp(fresh, 'routine_done');
    await grantXp(fresh, 'bin_confirmed');
    expect(await xpToday(fresh)).toBe(XP.routine_done + XP.bin_confirmed);
  });

  it("keeps one player's points away from another's", async () => {
    const { grantXp, getPlayer } = await import('@/services/player');
    const a = await createTestUser();
    const b = await createTestUser();
    await grantXp(a, 'meal_cooked');
    expect((await getPlayer(b)).xp).toBe(0);
  });
});
