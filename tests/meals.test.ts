import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTemporaryDatabase, createTestUser } from './helpers/db';
import { RECIPES } from '@/lib/recipes';

useTemporaryDatabase();

const NOW = '2026-08-25';

beforeAll(async () => {
  const { ensureMigrated } = await import('@/database/migrate');
  await ensureMigrated();
});

afterAll(async () => {
  const { closeDatabase } = await import('@/database');
  await closeDatabase();
});

async function stock(userId: string, items: Array<[string, string | null]>) {
  const { addPantryItem } = await import('@/services/pantry');
  for (const [name, expiresOn] of items) {
    await addPantryItem(userId, { name, expiresOn }, NOW);
  }
}

describe('the recipe collection', () => {
  it('is all weeknight food', () => {
    for (const r of RECIPES) {
      expect(r.minutes, r.key).toBeLessThanOrEqual(35);
      expect(r.steps.length, r.key).toBeGreaterThanOrEqual(3);
      expect(r.steps.length, r.key).toBeLessThanOrEqual(6);
      expect(r.ingredients.length, r.key).toBeGreaterThan(0);
    }
  });

  it('has unique keys and at least one essential ingredient each', () => {
    const keys = RECIPES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of RECIPES) {
      expect(r.ingredients.some((i) => i.essential), r.key).toBe(true);
    }
  });
});

describe('deciding what to cook', () => {
  it('ranks what you can nearly make above what you cannot', async () => {
    const { suggestDinners } = await import('@/services/meals');
    const userId = await createTestUser();
    await stock(userId, [
      ['Pasta Penne', '2026-12-01'],
      ['Hakkede tomater', '2027-01-01'],
      ['Hvidløg', '2026-10-01'],
      ['Parmesan', '2026-09-20'],
    ]);

    const [best] = await suggestDinners(userId, 6, NOW);
    expect(best!.recipe.key).toBe('pasta-tomat');
    expect(best!.missing.length).toBeLessThan(best!.have.length);
    expect(best!.coverage).toBeGreaterThan(0.5);
  });

  it('pulls a recipe to the top because something is about to go off', async () => {
    const { suggestDinners } = await import('@/services/meals');
    const userId = await createTestUser();
    // A well-stocked cupboard for pasta, plus one salmon with a day left.
    await stock(userId, [
      ['Pasta', '2026-12-01'],
      ['Hakkede tomater', '2027-01-01'],
      ['Hvidløg', '2026-11-01'],
      ['Laksefilet', '2026-08-26'],
      ['Spinat', '2026-09-10'],
      ['Fløde', '2026-09-05'],
    ]);

    const suggestions = await suggestDinners(userId, 6, NOW);
    expect(suggestions[0]!.recipe.key).toBe('pasta-laks');
    expect(suggestions[0]!.rescues.map((i) => i.name)).toContain('Laksefilet');
  });

  it('knows garlic is not an onion, however the word is spelled', async () => {
    const { dinnerFor } = await import('@/services/meals');
    const userId = await createTestUser();
    // "hvidløg" ends in "løg", so plain substring matching would say yes.
    await stock(userId, [['Hvidløg', '2026-10-01'], ['Hakket svinekød', '2026-08-27']]);
    const meatballs = await dinnerFor(userId, 'frikadeller', NOW);
    expect(meatballs!.missing.map((i) => i.name)).toContain('Løg');
    expect(meatballs!.have.map((i) => i.name)).toContain('Hakket svinekød');

    // And a red onion still is one.
    const other = await createTestUser();
    await stock(other, [['Rødløg', '2026-10-01']]);
    const withOnion = await dinnerFor(other, 'frikadeller', NOW);
    expect(withOnion!.have.map((i) => i.name)).toContain('Løg');
  });

  it('does not claim you have something you do not', async () => {
    const { suggestDinners } = await import('@/services/meals');
    const userId = await createTestUser();
    await stock(userId, [['Sukker', '2027-01-01']]);
    for (const suggestion of await suggestDinners(userId, 18, NOW)) {
      expect(suggestion.have, suggestion.recipe.key).toEqual([]);
    }
  });

  it('will not substitute across groups that are not interchangeable', async () => {
    const { dinnerFor } = await import('@/services/meals');
    const userId = await createTestUser();
    // A carrot is produce, and so is a lettuce. It is not a salad.
    await stock(userId, [['Gulerødder', '2026-09-10']]);
    const salad = await dinnerFor(userId, 'grov-salat', NOW);
    expect(salad!.missing.map((i) => i.name)).toContain('Salat');
  });

  it('does substitute where a group genuinely is interchangeable', async () => {
    const { dinnerFor } = await import('@/services/meals');
    const userId = await createTestUser();
    // "Ost" in the soup recipe is any cheese.
    await stock(userId, [['Revet mozzarella', '2026-09-10']]);
    const soup = await dinnerFor(userId, 'tomatsuppe', NOW);
    expect(soup!.have.map((i) => i.name)).toContain('Ost');
  });

  it('matches Danish compounds and spelling variants', async () => {
    const { dinnerFor } = await import('@/services/meals');
    const userId = await createTestUser();
    await stock(userId, [['Letmælk 1,5%', '2026-09-01'], ['Æggebakke 10 stk.', '2026-09-15']]);
    const cake = await dinnerFor(userId, 'aeggekage', NOW);
    const haveNames = cake!.have.map((i) => i.name);
    expect(haveNames).toContain('Mælk');
    expect(haveNames).toContain('Æg');
  });

  it('returns nothing surprising for an empty kitchen', async () => {
    const { suggestDinners } = await import('@/services/meals');
    const userId = await createTestUser();
    const suggestions = await suggestDinners(userId, 3, NOW);
    expect(suggestions).toHaveLength(3);
    for (const s of suggestions) {
      expect(s.have).toEqual([]);
      expect(s.coverage).toBe(0);
    }
  });
});

describe('the plan', () => {
  it('plans a night and pays once for it', async () => {
    const { planMeal } = await import('@/services/meals');
    const userId = await createTestUser();
    const first = await planMeal(userId, '2026-08-26', 'chili');
    expect(first.meal.recipe.key).toBe('chili');
    expect(first.grant).not.toBeNull();

    // Changing your mind about Wednesday is not a second achievement.
    const second = await planMeal(userId, '2026-08-26', 'nudler');
    expect(second.meal.recipe.key).toBe('nudler');
    expect(second.grant).toBeNull();
  });

  it('pays properly for actually cooking it', async () => {
    const { planMeal, markCooked } = await import('@/services/meals');
    const { XP } = await import('@/lib/game');
    const userId = await createTestUser();
    await planMeal(userId, '2026-08-27', 'linsesuppe');
    const cooked = await markCooked(userId, '2026-08-27');
    expect(cooked.grant!.gained).toBe(XP.meal_cooked);
    // And not twice for the same dinner.
    expect((await markCooked(userId, '2026-08-27')).grant).toBeNull();
  });

  it('refuses a recipe that does not exist', async () => {
    const { planMeal } = await import('@/services/meals');
    const userId = await createTestUser();
    await expect(planMeal(userId, '2026-08-28', 'not-a-recipe')).rejects.toThrow();
  });

  it('shows a week whether or not anything is planned', async () => {
    const { planMeal, weekPlan } = await import('@/services/meals');
    const userId = await createTestUser();
    await planMeal(userId, '2026-08-27', 'wraps');
    const week = await weekPlan(userId, '2026-08-25');
    expect(week).toHaveLength(7);
    expect(week[0]!.date).toBe('2026-08-25');
    expect(week[2]!.meal!.recipe.key).toBe('wraps');
    expect(week[3]!.meal).toBeNull();
  });

  it("keeps one kitchen out of another's", async () => {
    const { planMeal, weekPlan } = await import('@/services/meals');
    const a = await createTestUser();
    const b = await createTestUser();
    await planMeal(a, '2026-08-26', 'chili');
    expect((await weekPlan(b, '2026-08-25')).every((d) => d.meal === null)).toBe(true);
  });
});
