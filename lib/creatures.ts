import type { Area } from '@/lib/game';

/**
 * The cast.
 *
 * Every creature is unlocked by doing something real — never by chance and
 * never by paying. Which one arrives next is a surprise; whether one arrives
 * is not. That is the whole difference between a collection worth having and
 * a slot machine.
 *
 * Rarity is a description of how much work a creature took, so that the rare
 * ones genuinely mean something when they turn up.
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Creature {
  key: string;
  name: string;
  /** One line, in the creature's own register. */
  blurb: string;
  /** What earns it, written as the user will read it. */
  unlock: string;
  area: Area | 'any';
  rarity: Rarity;
  /** Body hue in degrees. The art derives every colour from this. */
  hue: number;
}

export const RARITY_ORDER: Record<Rarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

export const CREATURES: Creature[] = [
  {
    key: 'prik',
    name: 'Prik',
    blurb: 'Turned up the moment you did. Has no other skills.',
    unlock: 'Open the board for the first time',
    area: 'any',
    rarity: 'common',
    hue: 250,
  },
  {
    key: 'streg',
    name: 'Streg',
    blurb: 'Reads barcodes at a glance. Cannot read anything else.',
    unlock: 'Scan 3 things into the kitchen',
    area: 'kitchen',
    rarity: 'common',
    hue: 205,
  },
  {
    key: 'frost',
    name: 'Frost',
    blurb: 'Believes almost everything would be better frozen.',
    unlock: 'Freeze something before it goes off',
    area: 'kitchen',
    rarity: 'common',
    hue: 190,
  },
  {
    key: 'krumme',
    name: 'Krumme',
    blurb: 'Lives at the back of the cupboard. Knows what is back there.',
    unlock: 'Keep 10 things in the kitchen at once',
    area: 'kitchen',
    rarity: 'rare',
    hue: 35,
  },
  {
    key: 'panden',
    name: 'Panden',
    blurb: 'Hot, flat, deeply reliable.',
    unlock: 'Cook a planned dinner',
    area: 'kitchen',
    rarity: 'rare',
    hue: 20,
  },
  {
    key: 'gulerod',
    name: 'Gulerod',
    blurb: 'Rescued from the drawer. Still a little cold about it.',
    unlock: 'Use 5 things before their date',
    area: 'kitchen',
    rarity: 'epic',
    hue: 28,
  },
  {
    key: 'skrald',
    name: 'Skrald',
    blurb: 'Has opinions about which bin. Is usually right.',
    unlock: 'Finish a sorting round',
    area: 'home',
    rarity: 'common',
    hue: 145,
  },
  {
    key: 'pap',
    name: 'Pap',
    blurb: 'Flattens itself before anyone has to ask.',
    unlock: 'Get a whole sorting round right',
    area: 'home',
    rarity: 'rare',
    hue: 30,
  },
  {
    key: 'glasse',
    name: 'Glasse',
    blurb: 'Rinsed, sorted, faintly smug.',
    unlock: 'Score 200 in one sorting round',
    area: 'home',
    rarity: 'epic',
    hue: 165,
  },
  {
    key: 'ur',
    name: 'Ur',
    blurb: 'Two minutes. Always two minutes.',
    unlock: 'Finish a two-minute sprint',
    area: 'home',
    rarity: 'common',
    hue: 300,
  },
  {
    key: 'boble',
    name: 'Boble',
    blurb: 'Does the whole routine. Even the last step.',
    unlock: 'Tick off a routine 5 times',
    area: 'body',
    rarity: 'rare',
    hue: 320,
  },
  {
    key: 'vaegt',
    name: 'Vægt',
    blurb: 'Small, dense, extremely pleased with itself.',
    unlock: 'Hit a weekly routine target',
    area: 'body',
    rarity: 'epic',
    hue: 265,
  },
  {
    key: 'moent',
    name: 'Mønt',
    blurb: 'Knows exactly where it went. Will tell you.',
    unlock: 'Sort 10 transactions',
    area: 'money',
    rarity: 'rare',
    hue: 90,
  },
  {
    key: 'stjerne',
    name: 'Stjerne',
    blurb: 'Only turns up for people who kept going.',
    unlock: 'Reach level 10',
    area: 'any',
    rarity: 'legendary',
    hue: 50,
  },
];

const BY_KEY = new Map(CREATURES.map((c) => [c.key, c]));

export function creature(key: string): Creature | undefined {
  return BY_KEY.get(key);
}

export function isCreature(key: string): boolean {
  return BY_KEY.has(key);
}
