import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTemporaryDatabase, createTestUser } from './helpers/db';
import { suggestExpiry, freshness, guessFoodGroup } from '@/lib/food';

useTemporaryDatabase();

let userId: string;
const NOW = '2026-08-25';

beforeAll(async () => {
  const { ensureMigrated } = await import('@/database/migrate');
  await ensureMigrated();
  userId = await createTestUser();
});

afterAll(async () => {
  const { closeDatabase } = await import('@/database');
  await closeDatabase();
});

describe('food knowledge', () => {
  it('reads Danish and English names alike', () => {
    expect(guessFoodGroup('Letmælk 1,5%')).toBe('dairy');
    expect(guessFoodGroup('Semi-skimmed milk')).toBe('dairy');
    expect(guessFoodGroup('Hakket oksekød')).toBe('meat');
    expect(guessFoodGroup('Rugbrød')).toBe('bakery');
    expect(guessFoodGroup('Gulerødder')).toBe('produce');
    expect(guessFoodGroup('Toiletpapir')).toBe('household');
    expect(guessFoodGroup('Something nobody named')).toBe('other');
  });

  it('handles Danish compounds, which is most of the vocabulary', () => {
    // Danish glues words together, so a stem is almost never at a word
    // boundary. Every one of these is a single word in the shop.
    expect(guessFoodGroup('Kærnemælk')).toBe('dairy');
    expect(guessFoodGroup('Kaffefløde')).toBe('dairy');
    expect(guessFoodGroup('Franskbrød')).toBe('bakery');
    expect(guessFoodGroup('Knækbrød')).toBe('bakery');
    expect(guessFoodGroup('Svinekød')).toBe('meat');
    expect(guessFoodGroup('Kyllingebryst')).toBe('meat');
    expect(guessFoodGroup('Laksefilet')).toBe('fish');
    expect(guessFoodGroup('Kartoffelsalat')).toBe('produce');
    expect(guessFoodGroup('Køkkenrulle')).toBe('household');
  });

  it('does not mistake a longer word for a short stem', () => {
    // "vin" inside "provins", "is" inside "ris", "te" inside "tomat".
    expect(guessFoodGroup('Provinsavis')).toBe('other');
    expect(guessFoodGroup('Basmati ris')).toBe('dry');
    expect(guessFoodGroup('Tomatpuré')).toBe('produce');
  });

  it('proposes a shorter date once something is opened', () => {
    const sealed = suggestExpiry('dairy', NOW, false);
    const opened = suggestExpiry('dairy', NOW, true);
    expect(opened < sealed).toBe(true);
    expect(opened > NOW).toBe(true);
  });

  it('grades urgency the way a person would', () => {
    expect(freshness('2026-08-24', NOW)).toBe('expired');
    expect(freshness('2026-08-25', NOW)).toBe('today');
    expect(freshness('2026-08-27', NOW)).toBe('soon');
    expect(freshness('2026-08-31', NOW)).toBe('week');
    expect(freshness('2026-12-01', NOW)).toBe('fine');
    expect(freshness(null, NOW)).toBe('undated');
  });
});

describe('the pantry', () => {
  it('adds something and pays for it', async () => {
    const { addPantryItem } = await import('@/services/pantry');
    const result = await addPantryItem(userId, { name: 'Letmælk', barcode: '2900000000017' }, NOW);
    expect(result.item.name).toBe('Letmælk');
    expect(result.item.group).toBe('dairy');
    expect(result.item.location).toBe('fridge');
    expect(result.item.expiresOn).not.toBeNull();
    expect(result.grant.gained).toBeGreaterThan(0);
  });

  it('pays the first-time bonus only once for a barcode', async () => {
    const { addPantryItem } = await import('@/services/pantry');
    const other = await createTestUser();
    const first = await addPantryItem(other, { name: 'Ny vare', barcode: '2900000999999' }, NOW);
    expect(first.firstEver).toBe(true);
    const second = await addPantryItem(other, { name: 'Ny vare', barcode: '2900000999999' }, NOW);
    expect(second.firstEver).toBe(false);
    expect(second.grant.gained).toBeLessThan(first.grant.gained);
  });

  it('puts what needs deciding at the top, undated things last', async () => {
    const { addPantryItem, listPantry } = await import('@/services/pantry');
    const fresh = await createTestUser();
    await addPantryItem(fresh, { name: 'Ingen dato', expiresOn: null }, NOW);
    await addPantryItem(fresh, { name: 'Om en uge', expiresOn: '2026-09-01' }, NOW);
    await addPantryItem(fresh, { name: 'I morgen', expiresOn: '2026-08-26' }, NOW);

    const items = await listPantry(fresh, {}, NOW);
    expect(items.map((i) => i.name)).toEqual(['I morgen', 'Om en uge', 'Ingen dato']);
  });

  it('never deletes an item, so the history stays true', async () => {
    const { addPantryItem, settlePantryItem, listPantry } = await import('@/services/pantry');
    const fresh = await createTestUser();
    const added = await addPantryItem(fresh, { name: 'Skyr', expiresOn: '2026-08-30' }, NOW);
    await settlePantryItem(fresh, added.item.id, 'eaten', NOW);

    expect(await listPantry(fresh, {}, NOW)).toHaveLength(0);
    const eaten = await listPantry(fresh, { status: 'eaten' }, NOW);
    expect(eaten).toHaveLength(1);
    expect(eaten[0]!.name).toBe('Skyr');
  });

  it('pays a rescue bonus for using something before its date', async () => {
    const { addPantryItem, settlePantryItem } = await import('@/services/pantry');
    const fresh = await createTestUser();
    const inTime = await addPantryItem(fresh, { name: 'Laks', expiresOn: '2026-08-28' }, NOW);
    const rescued = await settlePantryItem(fresh, inTime.item.id, 'eaten', NOW);
    expect(rescued.rescue).not.toBeNull();

    const late = await addPantryItem(fresh, { name: 'Gammel laks', expiresOn: '2026-08-20' }, NOW);
    const binned = await settlePantryItem(fresh, late.item.id, 'binned', NOW);
    expect(binned.rescue).toBeNull();
    // Binning still pays: deciding is the behaviour worth reinforcing.
    expect(binned.grant.gained).toBeGreaterThan(0);
  });

  it('counts freezing as a rescue, because it is one', async () => {
    const { addPantryItem, settlePantryItem } = await import('@/services/pantry');
    const fresh = await createTestUser();
    const added = await addPantryItem(fresh, { name: 'Hakkebøf', expiresOn: '2026-08-27' }, NOW);
    expect((await settlePantryItem(fresh, added.item.id, 'frozen', NOW)).rescue).not.toBeNull();
  });

  it('refuses to settle the same item twice', async () => {
    const { addPantryItem, settlePantryItem } = await import('@/services/pantry');
    const fresh = await createTestUser();
    const added = await addPantryItem(fresh, { name: 'Ost' }, NOW);
    await settlePantryItem(fresh, added.item.id, 'eaten', NOW);
    await expect(settlePantryItem(fresh, added.item.id, 'binned', NOW)).rejects.toThrow();
  });

  it("cannot settle another user's item", async () => {
    const { addPantryItem, settlePantryItem } = await import('@/services/pantry');
    const a = await createTestUser();
    const b = await createTestUser();
    const added = await addPantryItem(a, { name: 'Privat ost' }, NOW);
    await expect(settlePantryItem(b, added.item.id, 'eaten', NOW)).rejects.toThrow();
  });

  it('summarises what needs attention', async () => {
    const { addPantryItem, pantrySummary } = await import('@/services/pantry');
    const fresh = await createTestUser();
    await addPantryItem(fresh, { name: 'For sent', expiresOn: '2026-08-20' }, NOW);
    await addPantryItem(fresh, { name: 'I dag', expiresOn: '2026-08-25' }, NOW);
    await addPantryItem(fresh, { name: 'Om 2 dage', expiresOn: '2026-08-27' }, NOW);
    await addPantryItem(fresh, { name: 'Om 6 dage', expiresOn: '2026-08-31' }, NOW);
    await addPantryItem(fresh, { name: 'Til jul', expiresOn: '2026-12-24' }, NOW);

    const summary = await pantrySummary(fresh, NOW);
    expect(summary.total).toBe(5);
    expect(summary.expired).toBe(1);
    expect(summary.urgent).toBe(2);
    expect(summary.thisWeek).toBe(1);
  });

  it('queues only what is actually near its date', async () => {
    const { addPantryItem, expiringSoon } = await import('@/services/pantry');
    const fresh = await createTestUser();
    await addPantryItem(fresh, { name: 'Snart', expiresOn: '2026-08-26' }, NOW);
    await addPantryItem(fresh, { name: 'Senere', expiresOn: '2026-11-01' }, NOW);
    await addPantryItem(fresh, { name: 'Udateret', expiresOn: null }, NOW);

    const queue = await expiringSoon(fresh, 12, NOW);
    expect(queue.map((i) => i.name)).toEqual(['Snart']);
  });
});
