import type { FoodGroup } from '@/lib/food';

/**
 * Dinner.
 *
 * Recipes live in the repository rather than the database on purpose: fixing a
 * typo in a method should be a deploy, not a migration, and nothing here is
 * personal. What is personal is which night you chose which one, and that is
 * the only part that gets a table.
 *
 * Every recipe is a weeknight recipe. Thirty-five minutes is the ceiling, the
 * step count is capped at six, and nothing needs equipment beyond a pan and an
 * oven — because the recipe that gets cooked is the one that did not need
 * planning yesterday.
 */

export interface Ingredient {
  name: string;
  group: FoodGroup;
  /** Without this, it is a different dish. Drives the pantry match. */
  essential?: boolean;
}

export interface Recipe {
  key: string;
  name: string;
  blurb: string;
  minutes: number;
  serves: number;
  /** How much attention it needs, not how hard it is. */
  effort: 'hands-off' | 'easy' | 'a bit of chopping';
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
}

export const RECIPES: Recipe[] = [
  {
    key: 'pasta-tomat',
    name: 'Pasta with tomato and garlic',
    blurb: 'The one that is always possible.',
    minutes: 20,
    serves: 2,
    effort: 'easy',
    ingredients: [
      { name: 'Pasta', group: 'dry', essential: true },
      { name: 'Hakkede tomater', group: 'condiment', essential: true },
      { name: 'Hvidløg', group: 'produce' },
      { name: 'Olivenolie', group: 'condiment' },
      { name: 'Parmesan', group: 'dairy' },
    ],
    steps: [
      'Put the pasta water on. Salt it more than feels right.',
      'Slice the garlic thin, warm it in oil until it smells like something.',
      'Add the tomatoes, simmer while the pasta cooks.',
      'Drain the pasta, keeping a cup of the water. Toss it through the sauce with a splash of it.',
      'Cheese on top.',
    ],
    tags: ['vegetarian', 'store cupboard'],
  },
  {
    key: 'kylling-ovn',
    name: 'Tray-bake chicken and root veg',
    blurb: 'One tray, one wash-up, forty minutes of doing nothing.',
    minutes: 35,
    serves: 3,
    effort: 'hands-off',
    ingredients: [
      { name: 'Kyllingelår', group: 'meat', essential: true },
      { name: 'Kartofler', group: 'produce', essential: true },
      { name: 'Gulerødder', group: 'produce' },
      { name: 'Løg', group: 'produce' },
      { name: 'Olie', group: 'condiment' },
    ],
    steps: [
      'Oven to 200°C.',
      'Chop everything into pieces roughly the same size. Oil, salt, pepper.',
      'Chicken on top, skin up, so it crisps while the veg cooks underneath.',
      '35 minutes. Do something else.',
    ],
    tags: ['one tray', 'leftovers'],
  },
  {
    key: 'frikadeller',
    name: 'Frikadeller with potatoes',
    blurb: 'Mince, an onion, an egg. Nothing else required.',
    minutes: 30,
    serves: 3,
    effort: 'easy',
    ingredients: [
      { name: 'Hakket svinekød', group: 'meat', essential: true },
      { name: 'Løg', group: 'produce', essential: true },
      { name: 'Æg', group: 'dairy' },
      { name: 'Mel', group: 'dry' },
      { name: 'Kartofler', group: 'produce' },
    ],
    steps: [
      'Grate the onion into the mince. Egg, a spoon of flour, salt, pepper.',
      'Mix hard for a minute — it should stiffen.',
      'Rest it while the potatoes boil.',
      'Shape with a wet spoon, fry in butter, 4 minutes a side.',
    ],
    tags: ['danish', 'leftovers'],
  },
  {
    key: 'laks-ovn',
    name: 'Baked salmon with lemon',
    blurb: 'Fifteen minutes, and it is hard to get wrong.',
    minutes: 20,
    serves: 2,
    effort: 'hands-off',
    ingredients: [
      { name: 'Laksefilet', group: 'fish', essential: true },
      { name: 'Citron', group: 'produce' },
      { name: 'Ris', group: 'dry' },
      { name: 'Broccoli', group: 'produce' },
    ],
    steps: [
      'Oven to 180°C. Rice on.',
      'Salmon on paper, salt, lemon slices on top.',
      '15 minutes — it is done when it flakes but still looks slightly wet.',
      'Steam the broccoli over the rice for the last 6 minutes.',
    ],
    tags: ['quick', 'fish'],
  },
  {
    key: 'aeggekage',
    name: 'Æggekage with whatever is left',
    blurb: 'Built for the end of the week, when the fridge is odds and ends.',
    minutes: 20,
    serves: 2,
    effort: 'easy',
    ingredients: [
      { name: 'Æg', group: 'dairy', essential: true },
      { name: 'Mælk', group: 'dairy' },
      { name: 'Bacon', group: 'meat' },
      { name: 'Tomat', group: 'produce' },
      { name: 'Rugbrød', group: 'bakery' },
    ],
    steps: [
      'Fry the bacon in a wide pan, leave the fat.',
      'Whisk eggs with a splash of milk and salt. Pour in, low heat.',
      'Lid on, 10 minutes. Do not stir it.',
      'Tomatoes and chives on top, eat straight from the pan with rye bread.',
    ],
    tags: ['danish', 'clear the fridge'],
  },
  {
    key: 'linsesuppe',
    name: 'Red lentil soup',
    blurb: 'Cheap, filling, and better the next day.',
    minutes: 30,
    serves: 4,
    effort: 'easy',
    ingredients: [
      { name: 'Røde linser', group: 'dry', essential: true },
      { name: 'Løg', group: 'produce', essential: true },
      { name: 'Gulerødder', group: 'produce' },
      { name: 'Hakkede tomater', group: 'condiment' },
      { name: 'Bouillon', group: 'condiment' },
    ],
    steps: [
      'Soften onion and carrot in oil, 8 minutes.',
      'Lentils, tomatoes, stock. Simmer 20 minutes.',
      'Blend or do not. Both are correct.',
      'Lemon at the end — it is what makes it taste finished.',
    ],
    tags: ['vegetarian', 'batch', 'freezes'],
  },
  {
    key: 'stegt-ris',
    name: 'Fried rice, fridge edition',
    blurb: 'Yesterday’s rice is the point, not a compromise.',
    minutes: 15,
    serves: 2,
    effort: 'a bit of chopping',
    ingredients: [
      { name: 'Kogte ris', group: 'dry', essential: true },
      { name: 'Æg', group: 'dairy', essential: true },
      { name: 'Ærter', group: 'frozen' },
      { name: 'Soja', group: 'condiment' },
      { name: 'Forårsløg', group: 'produce' },
    ],
    steps: [
      'Pan as hot as it goes.',
      'Scramble the eggs, take them out.',
      'Rice in, spread flat, leave it alone for two minutes so it catches.',
      'Peas, egg back in, soy, spring onion. Off the heat.',
    ],
    tags: ['leftovers', 'quick', 'clear the fridge'],
  },
  {
    key: 'grov-salat',
    name: 'Big salad with something warm on it',
    blurb: 'A salad that is actually dinner.',
    minutes: 20,
    serves: 2,
    effort: 'a bit of chopping',
    ingredients: [
      { name: 'Salat', group: 'produce', essential: true },
      { name: 'Kikærter', group: 'dry' },
      { name: 'Feta', group: 'dairy' },
      { name: 'Agurk', group: 'produce' },
      { name: 'Olivenolie', group: 'condiment' },
    ],
    steps: [
      'Roast the chickpeas dry in a pan until they rattle, 8 minutes.',
      'Everything else in a big bowl, torn not chopped.',
      'Oil, lemon, salt, more salt.',
      'Warm chickpeas on top so the leaves wilt slightly.',
    ],
    tags: ['vegetarian', 'quick'],
  },
  {
    key: 'tomatsuppe',
    name: 'Tomato soup and grilled cheese',
    blurb: 'For the evening that has already been enough.',
    minutes: 20,
    serves: 2,
    effort: 'easy',
    ingredients: [
      { name: 'Hakkede tomater', group: 'condiment', essential: true },
      { name: 'Fløde', group: 'dairy' },
      { name: 'Brød', group: 'bakery' },
      { name: 'Ost', group: 'dairy' },
    ],
    steps: [
      'Tomatoes, a little water, simmer 10 minutes with a pinch of sugar.',
      'Cream in, blend smooth.',
      'Butter the outside of the bread, cheese inside, fry both sides.',
      'Cut it diagonally. It matters.',
    ],
    tags: ['comfort', 'quick', 'vegetarian'],
  },
  {
    key: 'pasta-laks',
    name: 'Pasta with salmon and spinach',
    blurb: 'Feels like more effort than it was.',
    minutes: 20,
    serves: 2,
    effort: 'easy',
    ingredients: [
      { name: 'Pasta', group: 'dry', essential: true },
      { name: 'Laks', group: 'fish', essential: true },
      { name: 'Spinat', group: 'produce' },
      { name: 'Fløde', group: 'dairy' },
      { name: 'Citron', group: 'produce' },
    ],
    steps: [
      'Pasta on.',
      'Cube the salmon, fry 3 minutes, take it out.',
      'Cream in the same pan, spinach until it collapses.',
      'Pasta, salmon, lemon zest. Gentle from here.',
    ],
    tags: ['fish', 'quick'],
  },
  {
    key: 'chili',
    name: 'Chili with beans',
    blurb: 'Makes four, feeds two twice.',
    minutes: 35,
    serves: 4,
    effort: 'easy',
    ingredients: [
      { name: 'Hakket oksekød', group: 'meat' },
      { name: 'Kidneybønner', group: 'dry', essential: true },
      { name: 'Hakkede tomater', group: 'condiment', essential: true },
      { name: 'Løg', group: 'produce' },
      { name: 'Ris', group: 'dry' },
    ],
    steps: [
      'Brown the mince hard, do not stir it too early.',
      'Onion, spices, one minute.',
      'Tomatoes and beans, simmer 20 minutes.',
      'Taste it twice. It needs more salt than you think.',
    ],
    tags: ['batch', 'freezes', 'leftovers'],
  },
  {
    key: 'kartoffelsuppe',
    name: 'Potato and leek soup',
    blurb: 'Four ingredients, and one of them is water.',
    minutes: 30,
    serves: 4,
    effort: 'hands-off',
    ingredients: [
      { name: 'Kartofler', group: 'produce', essential: true },
      { name: 'Porrer', group: 'produce', essential: true },
      { name: 'Smør', group: 'dairy' },
      { name: 'Fløde', group: 'dairy' },
    ],
    steps: [
      'Sweat the sliced leeks in butter without colouring them, 10 minutes.',
      'Potatoes, water to cover, simmer until soft.',
      'Blend. Cream at the end, off the heat.',
      'Black pepper, and bread if there is any.',
    ],
    tags: ['vegetarian', 'batch', 'comfort'],
  },
  {
    key: 'wraps',
    name: 'Whatever wraps',
    blurb: 'Assembly, not cooking.',
    minutes: 12,
    serves: 2,
    effort: 'a bit of chopping',
    ingredients: [
      { name: 'Tortilla', group: 'bakery', essential: true },
      { name: 'Kylling', group: 'meat' },
      { name: 'Salat', group: 'produce' },
      { name: 'Yoghurt', group: 'dairy' },
      { name: 'Agurk', group: 'produce' },
    ],
    steps: [
      'Warm the wraps dry in a pan, 20 seconds a side.',
      'Yoghurt with lemon, salt and whatever herb is around.',
      'Everything in a line down the middle, not spread out.',
      'Fold the bottom first, then the sides.',
    ],
    tags: ['quick', 'clear the fridge'],
  },
  {
    key: 'ovnpasta',
    name: 'Baked pasta with cheese on top',
    blurb: 'The oven does the last fifteen minutes.',
    minutes: 35,
    serves: 4,
    effort: 'hands-off',
    ingredients: [
      { name: 'Pasta', group: 'dry', essential: true },
      { name: 'Hakkede tomater', group: 'condiment', essential: true },
      { name: 'Mozzarella', group: 'dairy' },
      { name: 'Løg', group: 'produce' },
    ],
    steps: [
      'Boil the pasta two minutes short of done.',
      'Quick tomato sauce while it cooks.',
      'Everything in a dish, cheese over the top.',
      '15 minutes at 220°C until the top has dark spots.',
    ],
    tags: ['vegetarian', 'batch', 'comfort'],
  },
  {
    key: 'stegt-flaesk',
    name: 'Stegt flæsk with parsley sauce',
    blurb: 'The national dish, and a Wednesday one.',
    minutes: 30,
    serves: 2,
    effort: 'easy',
    ingredients: [
      { name: 'Flæsk', group: 'meat', essential: true },
      { name: 'Kartofler', group: 'produce', essential: true },
      { name: 'Mælk', group: 'dairy' },
      { name: 'Persille', group: 'produce' },
      { name: 'Smør', group: 'dairy' },
    ],
    steps: [
      'Potatoes on.',
      'Pork in a cold pan, medium heat, turn once. It takes the time it takes.',
      'Butter and flour in a pot, milk in slowly, whisk.',
      'Parsley in at the very end so it stays green.',
    ],
    tags: ['danish', 'comfort'],
  },
  {
    key: 'shakshuka',
    name: 'Shakshuka',
    blurb: 'Eggs poached in tomato. Dinner or breakfast.',
    minutes: 25,
    serves: 2,
    effort: 'easy',
    ingredients: [
      { name: 'Æg', group: 'dairy', essential: true },
      { name: 'Hakkede tomater', group: 'condiment', essential: true },
      { name: 'Peberfrugt', group: 'produce' },
      { name: 'Løg', group: 'produce' },
      { name: 'Brød', group: 'bakery' },
    ],
    steps: [
      'Soften onion and pepper, 10 minutes, no rush.',
      'Tomatoes, cumin, paprika. Simmer until it thickens.',
      'Make wells, crack the eggs in, lid on, 6 minutes.',
      'Bread, straight from the pan.',
    ],
    tags: ['vegetarian', 'clear the fridge'],
  },
  {
    key: 'grateng',
    name: 'Fish gratin',
    blurb: 'Frozen fish is completely fine here.',
    minutes: 35,
    serves: 3,
    effort: 'hands-off',
    ingredients: [
      { name: 'Hvid fisk', group: 'fish', essential: true },
      { name: 'Kartofler', group: 'produce', essential: true },
      { name: 'Fløde', group: 'dairy' },
      { name: 'Ost', group: 'dairy' },
      { name: 'Porrer', group: 'produce' },
    ],
    steps: [
      'Slice potatoes thin, layer in a dish with the leek.',
      'Fish on top, cream over, cheese over that.',
      '30 minutes at 200°C.',
      'Let it sit five minutes before serving or it will run.',
    ],
    tags: ['fish', 'comfort'],
  },
  {
    key: 'nudler',
    name: 'Noodles with peanut sauce',
    blurb: 'Store cupboard, twelve minutes.',
    minutes: 15,
    serves: 2,
    effort: 'easy',
    ingredients: [
      { name: 'Nudler', group: 'dry', essential: true },
      { name: 'Peanutbutter', group: 'condiment', essential: true },
      { name: 'Soja', group: 'condiment' },
      { name: 'Gulerødder', group: 'produce' },
      { name: 'Forårsløg', group: 'produce' },
    ],
    steps: [
      'Noodles on.',
      'Peanut butter, soy, a little vinegar, hot water until it pours.',
      'Grate the carrot raw.',
      'Toss everything together while the noodles are still hot.',
    ],
    tags: ['vegetarian', 'quick', 'store cupboard'],
  },
];

const BY_KEY = new Map(RECIPES.map((r) => [r.key, r]));

export function recipe(key: string): Recipe | undefined {
  return BY_KEY.get(key);
}

export function isRecipe(key: string): boolean {
  return BY_KEY.has(key);
}
