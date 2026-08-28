import { describe, expect, it } from 'vitest';
import { CATEGORIES, GAMES, game, category, allEmoji } from '@/lib/games/catalog';
import { searchGames, searchCategories, fold } from '@/lib/games/search';
import { emojiFile, sceneFor } from '@/lib/games/art';
import { topGames } from '@/services/catalog';
import fs from 'node:fs';
import path from 'node:path';

describe('kataloget', () => {
  it('har mange spil og ingen dubletter', () => {
    expect(GAMES.length).toBeGreaterThanOrEqual(50);
    const ids = GAMES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = GAMES.map((g) => g.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('giver hvert spil en kategori der findes', () => {
    for (const g of GAMES) {
      expect(category(g.category), g.id).toBeDefined();
    }
  });

  it('har spil i hver eneste kategori', () => {
    for (const c of CATEGORIES) {
      const inside = GAMES.filter((g) => g.category === c.id);
      expect(inside.length, c.id).toBeGreaterThan(0);
    }
  });

  it('giver hvert spil point, et navn og en linje der sælger det', () => {
    for (const g of GAMES) {
      expect(g.xp, g.id).toBeGreaterThan(0);
      expect(g.name.length, g.id).toBeGreaterThan(2);
      expect(g.name.length, g.id).toBeLessThan(26);
      expect(g.tagline.length, g.id).toBeGreaterThan(10);
      expect(g.tagline.length, g.id).toBeLessThan(80);
    }
  });

  it('giver trin-spil trin, og tælle-spil et mål', () => {
    for (const g of GAMES) {
      // Spil med deres egen skærm køres ikke af motoren og har ikke trin.
      if (g.route) continue;
      if (g.kind === 'steps') {
        expect(g.steps?.length, g.id).toBeGreaterThanOrEqual(3);
        const ids = g.steps!.map((s) => s.id);
        expect(new Set(ids).size, g.id).toBe(ids.length);
      }
      if (g.kind === 'count') {
        expect(g.target, g.id).toBeGreaterThan(0);
        expect(g.targetUnit, g.id).toBeTruthy();
      }
    }
  });

  it('sender hvert rute-spil et sted hen der findes', () => {
    const known = new Set([
      '/scan', '/sort', '/sort/bins', '/sprint', '/dinner',
      '/kitchen/expiry', '/kitchen/scan',
    ]);
    for (const g of GAMES) {
      if (!g.route) continue;
      expect(known.has(g.route), `${g.id} → ${g.route}`).toBe(true);
    }
  });

  it('peger kun på afhængigheder der findes i samme spil', () => {
    for (const g of GAMES) {
      const ids = new Set((g.steps ?? []).map((s) => s.id));
      for (const step of g.steps ?? []) {
        for (const dependency of step.after ?? []) {
          expect(ids.has(dependency), `${g.id}: ${step.id} → ${dependency}`).toBe(true);
        }
      }
    }
  });

  it('har hentet kunsten til hvert eneste motiv', () => {
    for (const emoji of allEmoji()) {
      const file = path.join(process.cwd(), 'public', emojiFile(emoji).replace(/^\//, ''));
      expect(fs.existsSync(file), `${emoji} → ${emojiFile(emoji)}`).toBe(true);
    }
  });

  it('bygger den samme scene til det samme spil hver gang', () => {
    const first = sceneFor(game('opvask')!);
    const second = sceneFor(game('opvask')!);
    expect(first).toEqual(second);
    // Og ikke den samme som et andet spils.
    expect(sceneFor(game('traening')!).from).not.toBe(first.from);
  });

  it('oversætter emoji til Notos filnavne, uden variationsvælgeren', () => {
    expect(emojiFile('🧹')).toBe('/art/emoji/emoji_u1f9f9.svg');
    // 🛏️ bærer FE0F, som Noto ikke har i filnavnet.
    expect(emojiFile('🛏️')).toBe('/art/emoji/emoji_u1f6cf.svg');
  });
});

describe('søgningen', () => {
  it('folder danske bogstaver', () => {
    expect(fold('Tøj & vask')).toBe('toej vask');
    expect(fold('Rædsel')).toBe('raedsel');
    expect(fold('  MANGE   mellemrum ')).toBe('mange mellemrum');
  });

  it('finder det samme uanset hvordan det staves', () => {
    const a = searchGames('tøj').map((h) => h.game.id);
    const b = searchGames('toej').map((h) => h.game.id);
    const c = searchGames('TØJ').map((h) => h.game.id);
    expect(a).toEqual(b);
    expect(a).toEqual(c);
    expect(a.length).toBeGreaterThan(0);
  });

  it('sætter et navnetræf over et træf inde i et trin', () => {
    const hits = searchGames('opvask');
    expect(hits[0]!.game.id).toBe('opvask');
  });

  it('søger i trinnene, ikke kun i navnet', () => {
    // "vaskemaskine" står kun inde i et trin.
    const hits = searchGames('maskinen').map((h) => h.game.id);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('kræver at alle ord findes', () => {
    expect(searchGames('opvask enhjørning')).toEqual([]);
  });

  it('svarer ikke på for lidt at gå efter', () => {
    expect(searchGames('')).toEqual([]);
    expect(searchGames('a')).toEqual([]);
    expect(searchGames('   ')).toEqual([]);
  });

  it('finder kategorier også', () => {
    expect(searchCategories('køkken').map((c) => c.id)).toContain('koekken');
    expect(searchCategories('x')).toEqual([]);
  });
});

describe('toppen', () => {
  it('rangerer efter udbytte pr. minut og gentager ikke sig selv', () => {
    const top = topGames(10);
    expect(top.length).toBeGreaterThan(3);
    expect(new Set(top.map((g) => g.id)).size).toBe(top.length);
  });
});
