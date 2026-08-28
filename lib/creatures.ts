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
  common: 'Almindelig',
  rare: 'Sjælden',
  epic: 'Episk',
  legendary: 'Legendarisk',
};

export const CREATURES: Creature[] = [
  {
    key: 'prik',
    name: 'Prik',
    blurb: 'Dukkede op i samme øjeblik som du gjorde. Kan ikke andet.',
    unlock: 'Åbn brættet første gang',
    area: 'any',
    rarity: 'common',
    hue: 250,
  },
  {
    key: 'streg',
    name: 'Streg',
    blurb: 'Læser stregkoder på et øjeblik. Kan ikke læse andet.',
    unlock: 'Scan 3 ting ind i køkkenet',
    area: 'kitchen',
    rarity: 'common',
    hue: 205,
  },
  {
    key: 'frost',
    name: 'Frost',
    blurb: 'Mener at næsten alt ville have godt af at blive frosset.',
    unlock: 'Frys noget ned før det bliver dårligt',
    area: 'kitchen',
    rarity: 'common',
    hue: 190,
  },
  {
    key: 'krumme',
    name: 'Krumme',
    blurb: 'Bor bagerst i skabet. Ved hvad der står derinde.',
    unlock: 'Hav 10 ting i køkkenet på én gang',
    area: 'kitchen',
    rarity: 'rare',
    hue: 35,
  },
  {
    key: 'panden',
    name: 'Panden',
    blurb: 'Varm, flad, dybt pålidelig.',
    unlock: 'Lav en planlagt aftensmad',
    area: 'kitchen',
    rarity: 'rare',
    hue: 20,
  },
  {
    key: 'gulerod',
    name: 'Gulerod',
    blurb: 'Reddet ud af skuffen. Stadig lidt kølig over det.',
    unlock: 'Brug 5 ting før deres dato',
    area: 'kitchen',
    rarity: 'epic',
    hue: 28,
  },
  {
    key: 'skrald',
    name: 'Skrald',
    blurb: 'Har meninger om hvilken spand. Har som regel ret.',
    unlock: 'Gennemfør en runde Sorter!',
    area: 'home',
    rarity: 'common',
    hue: 145,
  },
  {
    key: 'pap',
    name: 'Pap',
    blurb: 'Folder sig sammen før nogen når at bede om det.',
    unlock: 'Få en hel runde Sorter! rigtig',
    area: 'home',
    rarity: 'rare',
    hue: 30,
  },
  {
    key: 'glasse',
    name: 'Glasse',
    blurb: 'Skyllet, sorteret, en anelse selvtilfreds.',
    unlock: 'Få 200 point i én runde Sorter!',
    area: 'home',
    rarity: 'epic',
    hue: 165,
  },
  {
    key: 'ur',
    name: 'Ur',
    blurb: 'To minutter. Altid to minutter.',
    unlock: 'Gennemfør en to-minutters sprint',
    area: 'home',
    rarity: 'common',
    hue: 300,
  },
  {
    key: 'boble',
    name: 'Boble',
    blurb: 'Tager hele rutinen. Også det sidste trin.',
    unlock: 'Kryds en rutine af 5 gange',
    area: 'body',
    rarity: 'rare',
    hue: 320,
  },
  {
    key: 'vaegt',
    name: 'Vægt',
    blurb: 'Lille, tung, overordentlig tilfreds med sig selv.',
    unlock: 'Ram et ugentligt rutinemål',
    area: 'body',
    rarity: 'epic',
    hue: 265,
  },
  {
    key: 'moent',
    name: 'Mønt',
    blurb: 'Ved præcis hvor den blev af. Fortæller dig det.',
    unlock: 'Sortér 10 posteringer',
    area: 'money',
    rarity: 'rare',
    hue: 90,
  },
  {
    key: 'stjerne',
    name: 'Stjerne',
    blurb: 'Dukker kun op hos dem der blev ved.',
    unlock: 'Nå niveau 10',
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
