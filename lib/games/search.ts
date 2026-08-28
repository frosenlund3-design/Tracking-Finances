import { CATEGORIES, GAMES, category, type Game } from './catalog';

/**
 * Søgningen.
 *
 * Folder danske bogstaver, så "toej", "tøj" og "TØJ" finder det samme — og
 * matcher på hele kataloget, ikke bare navnet: den der søger "vaskemaskine"
 * skal finde vasketøj, og den der søger "morgen" skal finde sengen og
 * tandbørsten.
 */

export function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Alt der er værd at søge i, pr. spil, foldet én gang. */
const HAYSTACK = new Map<string, string>(
  GAMES.map((g) => [
    g.id,
    fold(
      [
        g.name,
        g.tagline,
        category(g.category)?.label ?? '',
        ...(g.tags ?? []),
        ...(g.steps ?? []).map((s) => s.text),
      ].join(' '),
    ),
  ]),
);

export interface SearchHit {
  game: Game;
  score: number;
}

export function searchGames(query: string, limit = 24): SearchHit[] {
  const q = fold(query);
  if (q.length < 2) return [];
  const words = q.split(' ').filter(Boolean);

  const hits: SearchHit[] = [];
  for (const game of GAMES) {
    const haystack = HAYSTACK.get(game.id)!;
    const name = fold(game.name);

    let score = 0;
    for (const word of words) {
      if (!haystack.includes(word)) {
        // Hvert ord skal findes et sted. Ellers er det ikke et hit.
        score = -1;
        break;
      }
      // Navnet vejer tungest, og et navn der begynder med ordet vejer mest.
      if (name.startsWith(word)) score += 12;
      else if (name.includes(word)) score += 8;
      else score += 2;
    }
    if (score > 0) hits.push({ game, score });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.game.name.localeCompare(b.game.name, 'da'))
    .slice(0, limit);
}

/** Kategorier der matcher, så en søgning på "køkken" åbner rækken. */
export function searchCategories(query: string) {
  const q = fold(query);
  if (q.length < 2) return [];
  return CATEGORIES.filter((c) => fold(`${c.label} ${c.blurb}`).includes(q));
}
