import '@/lib/server-guard';
import { randomUUID } from 'node:crypto';
import { withUser } from '@/database';
import { today } from '@/lib/dates';
import { isoDate, addDays } from '@/lib/normalize';
import { RECIPES, isRecipe, recipe as findRecipe, type Ingredient, type Recipe } from '@/lib/recipes';
import { listPantry, type PantryItem } from '@/services/pantry';
import { grantXp, type GrantResult } from '@/services/player';

/**
 * What to cook, decided from what is already in the kitchen.
 *
 * The ranking exists to answer one question better than a recipe app can:
 * not "what could I cook" but "what should I cook tonight so that the
 * cucumber does not become compost on Thursday". An ingredient about to go
 * off is worth more than an ingredient merely present, which is why the
 * salmon that expires tomorrow pulls its recipe to the top of the list.
 */

/** Folds Danish letters so "kød", "koed" and "KØD" all compare equal. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words worth matching on: short ones carry no information. */
function tokens(value: string): string[] {
  return normalise(value)
    .split(' ')
    .filter((word) => word.length >= 4);
}

/**
 * Groups where "some of this" is a fair substitution.
 *
 * Any cheese satisfies "cheese" and any white fish satisfies "white fish", so
 * those groups may match on group alone. Produce and dry goods may not — a
 * carrot does not stand in for a lettuce, and sugar is not pasta.
 */
const SUBSTITUTABLE = new Set(['dairy', 'meat', 'fish']);

/**
 * Compounds whose head word lies.
 *
 * Danish builds words by gluing, and the last element is the head — so
 * grammatically "hvidløg" is a kind of "løg". In a kitchen it is not, and a
 * recipe asking for an onion is not satisfied by a clove of garlic. These are
 * the pairs where plain substring matching would be confidently wrong.
 */
const NOT_THE_SAME: Array<[string, string]> = [
  ['hvidloeg', 'loeg'],
  ['purloeg', 'loeg'],
  ['foraarsloeg', 'loeg'],
  ['peberfrugt', 'peber'],
  ['peberrod', 'peber'],
  ['jordnoeddesmoer', 'smoer'],
  ['peanutbutter', 'smoer'],
  ['flormelis', 'mel'],
  ['kartoffelmel', 'mel'],
  ['rasp', 'ris'],
];

function confusable(a: string, b: string): boolean {
  return NOT_THE_SAME.some(
    ([long, short]) =>
      (a.includes(long) && b.includes(short) && !b.includes(long)) ||
      (b.includes(long) && a.includes(short) && !a.includes(long)),
  );
}

function satisfies(item: PantryItem, ingredient: Ingredient): boolean {
  const pantryName = normalise(item.name);
  const wanted = normalise(ingredient.name);
  if (confusable(pantryName, wanted)) return false;

  if (pantryName.includes(wanted) || wanted.includes(pantryName)) return true;
  for (const token of tokens(ingredient.name)) if (pantryName.includes(token)) return true;
  for (const token of tokens(item.name)) if (wanted.includes(token)) return true;

  // A group match is evidence only where the group is specific enough, and
  // never for an ingredient the dish is named after.
  return !ingredient.essential && item.group === ingredient.group && SUBSTITUTABLE.has(item.group);
}

export interface DinnerSuggestion {
  recipe: Recipe;
  have: Ingredient[];
  missing: Ingredient[];
  /** Items already in the kitchen this would use up, soonest first. */
  uses: PantryItem[];
  /** Of the items used, the ones that are running out of time. */
  rescues: PantryItem[];
  score: number;
  /** 0–1, for the "you have most of this" bar. */
  coverage: number;
}

const URGENT = new Set(['expired', 'today', 'soon']);

function scoreRecipe(recipe: Recipe, pantry: PantryItem[]): DinnerSuggestion {
  const have: Ingredient[] = [];
  const missing: Ingredient[] = [];
  const used = new Map<string, PantryItem>();

  for (const ingredient of recipe.ingredients) {
    const match = pantry.find((item) => satisfies(item, ingredient));
    if (match) {
      have.push(ingredient);
      used.set(match.id, match);
    } else {
      missing.push(ingredient);
    }
  }

  const uses = [...used.values()].sort((a, b) =>
    (a.expiresOn ?? '9999').localeCompare(b.expiresOn ?? '9999'),
  );
  const rescues = uses.filter((item) => URGENT.has(item.freshness));

  let score = 0;
  for (const ingredient of have) score += ingredient.essential ? 3 : 1;
  for (const ingredient of missing) score -= ingredient.essential ? 4 : 1;
  // The reason this ranking exists at all.
  score += rescues.length * 5;

  return {
    recipe,
    have,
    missing,
    uses,
    rescues,
    score,
    coverage: recipe.ingredients.length === 0 ? 0 : have.length / recipe.ingredients.length,
  };
}

export async function suggestDinners(
  userId: string,
  count = 6,
  now: string = today(),
): Promise<DinnerSuggestion[]> {
  const pantry = await listPantry(userId, { status: 'in' }, now);
  return RECIPES.map((recipe) => scoreRecipe(recipe, pantry))
    .sort((a, b) => b.score - a.score || a.recipe.minutes - b.recipe.minutes)
    .slice(0, count);
}

/** One suggestion for one recipe, for the detail screen. */
export async function dinnerFor(
  userId: string,
  recipeKey: string,
  now: string = today(),
): Promise<DinnerSuggestion | null> {
  const recipe = findRecipe(recipeKey);
  if (!recipe) return null;
  const pantry = await listPantry(userId, { status: 'in' }, now);
  return scoreRecipe(recipe, pantry);
}

/* ------------------------------------------------------------------- plan */

export interface PlannedMeal {
  id: string;
  date: string;
  recipe: Recipe;
  status: 'planned' | 'cooked' | 'skipped';
}

interface PlanRow {
  id: string;
  plan_date: string | Date;
  recipe_key: string;
  status: string;
}

function mapPlan(row: PlanRow): PlannedMeal | null {
  const found = findRecipe(row.recipe_key);
  if (!found) return null;
  return {
    id: row.id,
    date: isoDate(row.plan_date),
    recipe: found,
    status: row.status as PlannedMeal['status'],
  };
}

export async function planMeal(
  userId: string,
  date: string,
  recipeKey: string,
): Promise<{ meal: PlannedMeal; grant: GrantResult | null }> {
  if (!isRecipe(recipeKey)) throw new Error('Unknown recipe');

  const { meal, replaced } = await withUser(userId, async (db) => {
    const { rows: existing } = await db.query<{ recipe_key: string }>(
      `SELECT recipe_key FROM meal_plan WHERE user_id = $1 AND plan_date = $2::date`,
      [userId, date],
    );
    await db.query(
      `INSERT INTO meal_plan (id, user_id, plan_date, recipe_key)
       VALUES ($1, $2, $3::date, $4)
       ON CONFLICT (user_id, plan_date)
       DO UPDATE SET recipe_key = EXCLUDED.recipe_key, status = 'planned'`,
      [randomUUID(), userId, date, recipeKey],
    );
    const { rows } = await db.query<PlanRow>(
      `SELECT id, plan_date, recipe_key, status FROM meal_plan
        WHERE user_id = $1 AND plan_date = $2::date`,
      [userId, date],
    );
    return { meal: mapPlan(rows[0]!)!, replaced: existing.length > 0 };
  });

  // Changing your mind about Thursday is not a second achievement.
  const grant = replaced ? null : await grantXp(userId, 'meal_planned', { recipeKey, date });
  return { meal, grant };
}

export async function markCooked(
  userId: string,
  date: string,
): Promise<{ meal: PlannedMeal | null; grant: GrantResult | null }> {
  const meal = await withUser(userId, async (db) => {
    const { rows } = await db.query<PlanRow>(
      `UPDATE meal_plan SET status = 'cooked'
        WHERE user_id = $1 AND plan_date = $2::date AND status <> 'cooked'
        RETURNING id, plan_date, recipe_key, status`,
      [userId, date],
    );
    return rows[0] ? mapPlan(rows[0]) : null;
  });

  if (!meal) return { meal: null, grant: null };
  return { meal, grant: await grantXp(userId, 'meal_cooked', { recipeKey: meal.recipe.key, date }) };
}

export async function clearMeal(userId: string, date: string): Promise<void> {
  await withUser(userId, async (db) => {
    await db.query(`DELETE FROM meal_plan WHERE user_id = $1 AND plan_date = $2::date`, [
      userId,
      date,
    ]);
  });
}

/** The next seven days, whether or not anything is planned for them. */
export async function weekPlan(
  userId: string,
  from: string = today(),
): Promise<Array<{ date: string; meal: PlannedMeal | null }>> {
  const to = addDays(from, 6);
  const planned = await withUser(userId, async (db) => {
    const { rows } = await db.query<PlanRow>(
      `SELECT id, plan_date, recipe_key, status FROM meal_plan
        WHERE user_id = $1 AND plan_date BETWEEN $2::date AND $3::date
        ORDER BY plan_date`,
      [userId, from, to],
    );
    return rows.map(mapPlan).filter((m): m is PlannedMeal => m !== null);
  });

  const byDate = new Map(planned.map((m) => [m.date, m]));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(from, i);
    return { date, meal: byDate.get(date) ?? null };
  });
}
