import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTemporaryDatabase, createTestUser } from './helpers/db';
import { weekStart } from '@/services/routines';
import { scoreRound } from '@/services/games';

useTemporaryDatabase();

const NOW = '2026-08-26'; // a Wednesday

beforeAll(async () => {
  const { ensureMigrated } = await import('@/database/migrate');
  await ensureMigrated();
});

afterAll(async () => {
  const { closeDatabase } = await import('@/database');
  await closeDatabase();
});

describe('the week', () => {
  it('starts on Monday, the way Denmark counts', () => {
    expect(weekStart('2026-08-26')).toBe('2026-08-24');
    expect(weekStart('2026-08-24')).toBe('2026-08-24');
    // Sunday belongs to the week that just ended, not the one starting.
    expect(weekStart('2026-08-30')).toBe('2026-08-24');
    expect(weekStart('2026-08-31')).toBe('2026-08-31');
  });
});

describe('routines', () => {
  it('counts towards a weekly target, never a daily one', async () => {
    const { createRoutine, tickRoutine, listRoutines } = await import('@/services/routines');
    const userId = await createTestUser();
    const id = await createRoutine(userId, { name: 'Løbetur', targetPerWeek: 3 });

    await tickRoutine(userId, id, '2026-08-24');
    await tickRoutine(userId, id, '2026-08-25');
    const [routine] = await listRoutines(userId, NOW);
    expect(routine!.doneThisWeek).toBe(2);
    expect(routine!.hitTarget).toBe(false);
    expect(routine!.progress).toBeCloseTo(2 / 3);
  });

  it('pays the target bonus once, on the session that reaches it', async () => {
    const { createRoutine, tickRoutine } = await import('@/services/routines');
    const userId = await createTestUser();
    const id = await createRoutine(userId, { name: 'Skincare', targetPerWeek: 2 });

    expect((await tickRoutine(userId, id, '2026-08-24')).targetBonus).toBeNull();
    expect((await tickRoutine(userId, id, '2026-08-25')).targetBonus).not.toBeNull();
    // Doing more than the target is a bonus, not another achievement.
    expect((await tickRoutine(userId, id, '2026-08-26')).targetBonus).toBeNull();
  });

  it('is idempotent for a day, so the button is safe to hammer', async () => {
    const { createRoutine, tickRoutine, listRoutines } = await import('@/services/routines');
    const userId = await createTestUser();
    const id = await createRoutine(userId, { name: 'Styrke', targetPerWeek: 4 });

    const first = await tickRoutine(userId, id, NOW);
    const again = await tickRoutine(userId, id, NOW);
    expect(first.grant).not.toBeNull();
    expect(again.grant).toBeNull();
    expect((await listRoutines(userId, NOW))[0]!.doneThisWeek).toBe(1);
  });

  it('starts a new week clean without wiping the total', async () => {
    const { createRoutine, tickRoutine, listRoutines } = await import('@/services/routines');
    const userId = await createTestUser();
    const id = await createRoutine(userId, { name: 'Yoga', targetPerWeek: 2 });
    await tickRoutine(userId, id, '2026-08-17');
    await tickRoutine(userId, id, '2026-08-18');

    const [routine] = await listRoutines(userId, NOW);
    expect(routine!.doneThisWeek).toBe(0);
    expect(routine!.doneEver).toBe(2);
  });

  it('undoes a mistaken tap', async () => {
    const { createRoutine, tickRoutine, untickRoutine, listRoutines } = await import(
      '@/services/routines'
    );
    const userId = await createTestUser();
    const id = await createRoutine(userId, { name: 'Gåtur', targetPerWeek: 5 });
    await tickRoutine(userId, id, NOW);
    await untickRoutine(userId, id, NOW);
    expect((await listRoutines(userId, NOW))[0]!.doneToday).toBe(false);
  });

  it("cannot tick another user's routine", async () => {
    const { createRoutine, tickRoutine } = await import('@/services/routines');
    const a = await createTestUser();
    const b = await createTestUser();
    const id = await createRoutine(a, { name: 'Privat', targetPerWeek: 3 });
    expect((await tickRoutine(b, id, NOW)).grant).toBeNull();
  });

  it('hides an archived routine without losing its history', async () => {
    const { createRoutine, tickRoutine, archiveRoutine, listRoutines, routineHistory } =
      await import('@/services/routines');
    const userId = await createTestUser();
    const id = await createRoutine(userId, { name: 'Gammel vane', targetPerWeek: 3 });
    await tickRoutine(userId, id, NOW);
    await archiveRoutine(userId, id);
    expect(await listRoutines(userId, NOW)).toHaveLength(0);
    expect((await routineHistory(userId, id, NOW)).filter((d) => d.done)).toHaveLength(1);
  });
});

describe('the home', () => {
  it('lists all ten Danish fractions, unknown until answered', async () => {
    const { listBins } = await import('@/services/home');
    const userId = await createTestUser();
    const bins = await listBins(userId);
    expect(bins).toHaveLength(10);
    expect(bins.every((b) => b.status === 'unknown')).toBe(true);
  });

  it('pays for answering, once', async () => {
    const { setBin, binSummary } = await import('@/services/home');
    const userId = await createTestUser();
    expect(await setBin(userId, 'cartons', 'missing')).not.toBeNull();
    expect(await setBin(userId, 'cartons', 'have')).toBeNull();
    const summary = await binSummary(userId);
    expect(summary.answered).toBe(1);
    expect(summary.missing).toHaveLength(0);
  });

  it('refuses a fraction that is not part of the scheme', async () => {
    const { setBin } = await import('@/services/home');
    const userId = await createTestUser();
    await expect(setBin(userId, 'unicorns', 'have')).rejects.toThrow();
  });

  it('warns about a supply in proportion to how long it lasts', async () => {
    const { createSupply, listSupplies } = await import('@/services/home');
    const userId = await createTestUser();
    // The warning is a fifth of the cycle, so the notice is proportional: a
    // 30-day item warns six days out, a 5-day item one day out.
    await createSupply(userId, { name: 'Toiletpapir', typicalDays: 30, lastBoughtOn: '2026-08-01' });
    await createSupply(userId, { name: 'Mælk', typicalDays: 5, lastBoughtOn: '2026-08-22' });
    await createSupply(userId, { name: 'Vaskepulver', typicalDays: 60, lastBoughtOn: '2026-08-20' });
    // A 5-day item bought yesterday is not "soon" just because five is small.
    await createSupply(userId, { name: 'Fløde', typicalDays: 5, lastBoughtOn: '2026-08-25' });

    const supplies = await listSupplies(userId, NOW);
    const byName = new Map(supplies.map((s) => [s.name, s]));
    expect(byName.get('Toiletpapir')!.state).toBe('soon');
    expect(byName.get('Mælk')!.state).toBe('soon');
    expect(byName.get('Vaskepulver')!.state).toBe('plenty');
    expect(byName.get('Fløde')!.state).toBe('plenty');
  });

  it('says nothing it cannot know about a supply never bought', async () => {
    const { createSupply, listSupplies } = await import('@/services/home');
    const userId = await createTestUser();
    await createSupply(userId, { name: 'Opvasketabs', typicalDays: 45 });
    const [supply] = await listSupplies(userId, NOW);
    expect(supply!.state).toBe('unknown');
    expect(supply!.daysLeft).toBeNull();
  });

  it('restocks and resets the estimate', async () => {
    const { createSupply, restockSupply, listSupplies } = await import('@/services/home');
    const userId = await createTestUser();
    await createSupply(userId, { name: 'Bin bags', typicalDays: 40, lastBoughtOn: '2026-06-01' });
    expect((await listSupplies(userId, NOW))[0]!.state).toBe('out');

    expect(await restockSupply(userId, (await listSupplies(userId, NOW))[0]!.id, NOW)).not.toBeNull();
    expect((await listSupplies(userId, NOW))[0]!.state).toBe('plenty');
  });
});

describe('game rounds', () => {
  it('scores correct answers and a clean round, never speed', () => {
    expect(scoreRound(0, 10)).toBe(0);
    expect(scoreRound(7, 10)).toBe(140);
    expect(scoreRound(10, 10)).toBe(260);
    expect(scoreRound(0, 0)).toBe(0);
  });

  it('cannot be told a round went better than it could have', async () => {
    const { recordRun } = await import('@/services/games');
    const userId = await createTestUser();
    // A client claiming 900 correct out of 5.
    const result = await recordRun(userId, { game: 'sort', correct: 900, total: 5, durationMs: 10 });
    expect(result.score).toBe(scoreRound(5, 5));
  });

  it('clamps a claimed round to a plausible length', async () => {
    const { recordRun } = await import('@/services/games');
    const userId = await createTestUser();
    const result = await recordRun(userId, {
      game: 'sort',
      correct: 10_000,
      total: 10_000,
      durationMs: 5,
    });
    expect(result.score).toBe(scoreRound(40, 40));
  });

  it('remembers a personal best and knows when it was beaten', async () => {
    const { recordRun } = await import('@/services/games');
    const userId = await createTestUser();
    const first = await recordRun(userId, { game: 'sort', correct: 4, total: 10, durationMs: 9000 });
    expect(first.isBest).toBe(true);

    const worse = await recordRun(userId, { game: 'sort', correct: 2, total: 10, durationMs: 9000 });
    expect(worse.isBest).toBe(false);
    expect(worse.best).toBe(first.score);

    const better = await recordRun(userId, { game: 'sort', correct: 9, total: 10, durationMs: 9000 });
    expect(better.isBest).toBe(true);
  });

  it('grants a round as one event, not one per answer', async () => {
    const { recordRun } = await import('@/services/games');
    const { getPlayer } = await import('@/services/player');
    const { XP } = await import('@/lib/game');
    const userId = await createTestUser();
    await recordRun(userId, { game: 'sort', correct: 8, total: 10, durationMs: 12_000 });
    expect((await getPlayer(userId)).xp).toBe(XP.sort_correct * 8);
  });
});
