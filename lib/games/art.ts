import { CATEGORIES, category, type Game } from './catalog';

/**
 * Kunsten på fliserne.
 *
 * Hvert spil får en scene bygget ud fra sin kategori: en farvet baggrund med
 * dybde, nogle rekvisitter der ligger og roterer bagved, og motivet stort
 * forrest. Alt er beregnet ud fra spillets eget id, så den samme flise ser
 * ens ud hver gang uden at der skal gemmes noget.
 *
 * Selve motiverne er Noto Emoji (OFL 1.1) hentet ned i public/art/emoji.
 */

/** Noto navngiver efter kodepunkter, uden variationsvælgeren FE0F. */
export function emojiFile(emoji: string): string {
  const points = [...emoji]
    .map((c) => c.codePointAt(0)!.toString(16))
    .filter((hex) => hex !== 'fe0f');
  return `/art/emoji/emoji_u${points.join('_')}.svg`;
}

/** En lille deterministisk generator, så en flise ikke flytter sig. */
function hash(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Scene {
  /** Baggrundens to yderpunkter. */
  from: string;
  to: string;
  /** Farven på den lyse plet øverst. */
  glow: string;
  /** Rekvisitter der ligger bagved motivet. */
  props: Array<{ src: string; x: number; y: number; size: number; rotate: number; opacity: number }>;
  hero: string;
}

export function sceneFor(game: Game): Scene {
  const hue = category(game.category)?.hue ?? 250;
  const random = hash(game.id);

  // Kategorien giver grundfarven; spillet flytter den nogle grader, så to
  // fliser i samme række ikke er identiske.
  const shift = Math.round((random() - 0.5) * 26);
  const base = (hue + shift + 360) % 360;

  const props = (game.props ?? []).slice(0, 3).map((emoji, i) => ({
    src: emojiFile(emoji),
    // Fordelt i hjørnerne, aldrig bag motivets ansigt.
    x: [8, 68, 24][i] ?? 10,
    y: [10, 18, 62][i] ?? 60,
    size: 22 + Math.round(random() * 10),
    rotate: Math.round((random() - 0.5) * 44),
    opacity: 0.26 + random() * 0.14,
  }));

  return {
    from: `oklch(0.62 0.19 ${base})`,
    to: `oklch(0.42 0.16 ${(base + 24) % 360})`,
    glow: `oklch(0.86 0.14 ${(base + 40) % 360})`,
    props,
    hero: emojiFile(game.emoji),
  };
}

/** Rækkens farve, til overskrifter og chips. */
export function categoryColor(id: string): string {
  const found = CATEGORIES.find((c) => c.id === id);
  return `oklch(0.62 0.18 ${found?.hue ?? 250})`;
}
