/**
 * What food is, how long it keeps, and where the packaging goes.
 *
 * This is the part of a pantry app that has to be knowledge rather than a
 * lookup, because no barcode database will tell you that an opened carton of
 * milk has about five days left. The numbers below are conservative fridge
 * figures for an unopened item stored properly; `openedDays` is what is left
 * once it has been opened, which is almost always the number that matters.
 *
 * They are a starting suggestion the user can always change — never a claim
 * about safety. Trust your nose over this file.
 */

export type FoodGroup =
  | 'dairy'
  | 'meat'
  | 'fish'
  | 'produce'
  | 'bakery'
  | 'leftovers'
  | 'frozen'
  | 'dry'
  | 'condiment'
  | 'drink'
  | 'household'
  | 'other';

export interface FoodGroupDef {
  key: FoodGroup;
  label: string;
  /** One emoji, used as a fallback tile when there is no product image. */
  glyph: string;
  /** Days from purchase, unopened, stored as intended. */
  keepsDays: number;
  /** Days left once opened. Null where opening changes nothing. */
  openedDays: number | null;
  /** Where the empty packaging usually belongs, in the Danish scheme. */
  fraction: WasteFraction;
  /** Where this normally lives. */
  location: 'fridge' | 'freezer' | 'pantry';
}

export type WasteFraction =
  | 'food'
  | 'paper'
  | 'cardboard'
  | 'metal'
  | 'glass'
  | 'plastic'
  | 'cartons'
  | 'residual'
  | 'textile'
  | 'hazardous';

export const FOOD_GROUPS: FoodGroupDef[] = [
  { key: 'dairy', label: 'Dairy', glyph: '🥛', keepsDays: 10, openedDays: 5, fraction: 'cartons', location: 'fridge' },
  { key: 'meat', label: 'Meat', glyph: '🥩', keepsDays: 3, openedDays: 2, fraction: 'plastic', location: 'fridge' },
  { key: 'fish', label: 'Fish', glyph: '🐟', keepsDays: 2, openedDays: 1, fraction: 'plastic', location: 'fridge' },
  { key: 'produce', label: 'Fruit & veg', glyph: '🥕', keepsDays: 7, openedDays: null, fraction: 'food', location: 'fridge' },
  { key: 'bakery', label: 'Bread & baking', glyph: '🍞', keepsDays: 4, openedDays: 3, fraction: 'paper', location: 'pantry' },
  { key: 'leftovers', label: 'Leftovers', glyph: '🍲', keepsDays: 3, openedDays: null, fraction: 'food', location: 'fridge' },
  { key: 'frozen', label: 'Frozen', glyph: '🧊', keepsDays: 120, openedDays: 30, fraction: 'plastic', location: 'freezer' },
  { key: 'dry', label: 'Dry goods', glyph: '🍝', keepsDays: 365, openedDays: 120, fraction: 'cardboard', location: 'pantry' },
  { key: 'condiment', label: 'Jars & sauces', glyph: '🫙', keepsDays: 540, openedDays: 60, fraction: 'glass', location: 'pantry' },
  { key: 'drink', label: 'Drinks', glyph: '🧃', keepsDays: 180, openedDays: 4, fraction: 'cartons', location: 'fridge' },
  { key: 'household', label: 'Household', glyph: '🧻', keepsDays: 3650, openedDays: null, fraction: 'plastic', location: 'pantry' },
  { key: 'other', label: 'Other', glyph: '📦', keepsDays: 30, openedDays: 14, fraction: 'residual', location: 'pantry' },
];

const GROUPS_BY_KEY = new Map(FOOD_GROUPS.map((g) => [g.key, g]));

export function foodGroup(key: string): FoodGroupDef {
  return GROUPS_BY_KEY.get(key as FoodGroup) ?? GROUPS_BY_KEY.get('other')!;
}

export function isFoodGroup(key: string): key is FoodGroup {
  return GROUPS_BY_KEY.has(key as FoodGroup);
}

/**
 * Guesses the group from a product name.
 *
 * Danish and English words both, because a barcode database answers in
 * whatever language the manufacturer registered in and a person types in
 * whichever comes to mind.
 */
/*
 * Danish compounds words, so these match as substrings rather than whole
 * words: "letmælk", "rugbrød" and "oksekød" are one word each, and a \b
 * before the stem would miss every one of them. The short stems that could
 * appear inside an unrelated word — øl, vin, te, is — keep their boundaries.
 */
const NAME_HINTS: Array<{ group: FoodGroup; re: RegExp }> = [
  { group: 'dairy', re: /m(æ|ae)lk|milk|yoghurt|yogurt|\bost\b|ostem|cheese|sm(ø|oe)r\b|butter|fl(ø|oe)de|cream|skyr|kefir|kvark|mozzarella|parmesan|cr(e|è)me fraiche/i },
  { group: 'meat', re: /k(ø|oe)d|kylling|chicken|okse|beef|svin|pork|bacon|p(ø|oe)lse|sausage|hakke|mince|skinke|\bham\b|\blam\b|lamb|frikadelle|b(ø|oe)f\b/i },
  { group: 'fish', re: /\bfisk|fish|laks|salmon|torsk|\bcod\b|rejer|shrimp|\btun\b|tuna|sild\b|makrel/i },
  { group: 'produce', re: /gulerod|gulerødder|carrot|(æ|ae)ble|apple|banan|salat|lettuce|tomat|agurk|cucumber|l(ø|oe)g\b|onion|kartof|potato|spinat|broccoli|peberfrugt|citron|lemon|frugt|fruit|gr(ø|oe)nt|drue|avocado|champignon/i },
  { group: 'bakery', re: /br(ø|oe)d|bread|\bbolle|\bbun\b|kage\b|cake|toast|wrap|tortilla|kn(æ|ae)k|crispbread|croissant/i },
  { group: 'frozen', re: /frost|frozen|frosne|\bice cream\b|\bis\b/i },
  { group: 'dry', re: /pasta|spaghetti|penne|\bris\b|\brice\b|\bmel\b|flour|sukker|sugar|havregryn|\boats\b|m(ü|y)sli|cereal|linser|lentil|b(ø|oe)nner|beans|n(ø|oe)dder|\bnuts\b|couscous|bulgur/i },
  { group: 'condiment', re: /ketchup|sennep|mustard|mayonnaise|remoulade|dressing|sauce|\bsovs|\bolie\b|\boil\b|eddike|vinegar|marmelade|\bjam\b|honning|honey|pesto|salsa|hakkede tomater|past(a|e)l/i },
  { group: 'drink', re: /juice|\bsaft\b|sodavand|\bsoda\b|\bcola\b|\bvand\b|\bwater\b|\b(ø|oe)l\b|\bbeer\b|\bvin\b|\bwine\b|kaffe|coffee|\bte\b|\btea\b|smoothie|kakao/i },
  { group: 'household', re: /toiletpapir|toilet paper|k(ø|oe)kkenrulle|paper towel|opvask|dishwash|vaskemiddel|detergent|s(æ|ae)be|\bsoap\b|shampoo|tandpasta|toothpaste|reng(ø|oe)ring|cleaner|servietter/i },
];

export function guessFoodGroup(name: string, categoryHint?: string | null): FoodGroup {
  const haystack = `${name} ${categoryHint ?? ''}`;
  for (const hint of NAME_HINTS) if (hint.re.test(haystack)) return hint.group;
  return 'other';
}

/**
 * A suggested date for something bought today.
 *
 * Deliberately returns a date rather than a range: a field pre-filled with one
 * sensible date gets corrected in two taps, and a range gets abandoned.
 */
export function suggestExpiry(group: FoodGroup, from: string, opened = false): string {
  const def = foodGroup(group);
  const days = opened && def.openedDays !== null ? def.openedDays : def.keepsDays;
  const date = new Date(`${from}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** How urgent something is, for sorting and for colour. */
export type Freshness = 'expired' | 'today' | 'soon' | 'week' | 'fine' | 'undated';

export function freshness(expiresOn: string | null, today: string): Freshness {
  if (!expiresOn) return 'undated';
  if (expiresOn < today) return 'expired';
  if (expiresOn === today) return 'today';
  const days = Math.round(
    (Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (days <= 3) return 'soon';
  if (days <= 7) return 'week';
  return 'fine';
}

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  expired: 'Past its date',
  today: 'Today',
  soon: 'Very soon',
  week: 'This week',
  fine: 'Plenty of time',
  undated: 'No date',
};
