import { describe, expect, it } from 'vitest';
import { WASTE_ITEMS, FRACTIONS, buildSortRound, findItem, fraction } from '@/lib/waste';
import { ROOMS, pickTasks, SPRINT_SECONDS } from '@/lib/sprint';
import { CREATURES, RARITY_LABEL } from '@/lib/creatures';
import { nearDayLabel } from '@/lib/dates';

/** A deterministic generator, so a shuffle can be asserted about. */
function seeded(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

describe('the waste data', () => {
  it('covers all ten Danish fractions', () => {
    expect(FRACTIONS).toHaveLength(10);
    const keys = FRACTIONS.map((f) => f.key);
    expect(new Set(keys).size).toBe(10);
    for (const key of ['food', 'paper', 'cardboard', 'metal', 'glass', 'plastic', 'cartons', 'residual', 'textile', 'hazardous']) {
      expect(keys, key).toContain(key);
    }
  });

  it('gives every item a real fraction and a reason', () => {
    for (const item of WASTE_ITEMS) {
      expect(fraction(item.answer), item.name).toBeDefined();
      expect(item.why.length, item.name).toBeGreaterThan(10);
      expect(item.danish.length, item.name).toBeGreaterThan(1);
    }
  });

  it('has no duplicate items', () => {
    const names = WASTE_ITEMS.map((i) => i.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('gets the ones people argue about right', () => {
    const answer = (name: string) =>
      WASTE_ITEMS.find((i) => i.name.toLowerCase() === name.toLowerCase())?.answer;
    // Thermal paper, plastic-lined board, and coated glass are the three
    // families of mistake this whole file exists to fix.
    expect(answer('Receipt')).toBe('residual');
    expect(answer('Paper coffee cup')).toBe('residual');
    expect(answer('Baking paper')).toBe('residual');
    expect(answer('Drinking glass')).toBe('residual');
    expect(answer('Mirror')).toBe('residual');
    expect(answer('Milk carton')).toBe('cartons');
    expect(answer('Toilet roll tube')).toBe('cardboard');
    expect(answer('Egg carton')).toBe('cardboard');
    expect(answer('LED bulb')).toBe('hazardous');
  });

  it('finds items in Danish and in English', () => {
    expect(findItem('kvittering').map((i) => i.name)).toContain('Receipt');
    expect(findItem('receipt').map((i) => i.name)).toContain('Receipt');
    expect(findItem('mælkekarton').map((i) => i.name)).toContain('Milk carton');
    expect(findItem('x')).toEqual([]);
    expect(findItem('   ')).toEqual([]);
  });
});

describe('a sorting round', () => {
  it('is the length asked for, with no repeats', () => {
    for (const size of [5, 10, 12]) {
      const round = buildSortRound(size, seeded(size));
      expect(round).toHaveLength(size);
      expect(new Set(round.map((i) => i.name)).size).toBe(size);
    }
  });

  it('spans at least five different bins, so it is never the same answer', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const round = buildSortRound(10, seeded(seed));
      expect(new Set(round.map((i) => i.answer)).size, `seed ${seed}`).toBeGreaterThanOrEqual(5);
    }
  });

  it('includes the ones people get wrong', () => {
    let withTricky = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      if (buildSortRound(10, seeded(seed)).some((i) => i.tricky)) withTricky += 1;
    }
    expect(withTricky).toBe(20);
  });

  it('varies between rounds', () => {
    const a = buildSortRound(10, seeded(1)).map((i) => i.name).join();
    const b = buildSortRound(10, seeded(2)).map((i) => i.name).join();
    expect(a).not.toBe(b);
  });
});

describe('sprints', () => {
  it('is two minutes, and every task fits in it', () => {
    expect(SPRINT_SECONDS).toBe(120);
    for (const room of ROOMS) {
      expect(room.tasks.length, room.key).toBeGreaterThanOrEqual(3);
      for (const task of room.tasks) {
        // A task longer than a sentence is a project in disguise.
        expect(task.length, task).toBeLessThan(70);
      }
    }
  });

  it('picks three distinct tasks, and nothing for an unknown room', () => {
    const tasks = pickTasks('kitchen', 3, seeded(7));
    expect(tasks).toHaveLength(3);
    expect(new Set(tasks).size).toBe(3);
    expect(pickTasks('nowhere', 3, seeded(7))).toEqual([]);
  });

  it('never asks for more tasks than a room has', () => {
    for (const room of ROOMS) {
      expect(pickTasks(room.key, 99, seeded(3))).toHaveLength(room.tasks.length);
    }
  });
});

describe('the cast', () => {
  it('has unique keys and a way to earn each one', () => {
    const keys = CREATURES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const creature of CREATURES) {
      expect(creature.unlock.length, creature.key).toBeGreaterThan(5);
      expect(creature.blurb.length, creature.key).toBeGreaterThan(5);
      expect(RARITY_LABEL[creature.rarity], creature.key).toBeTruthy();
      expect(creature.hue, creature.key).toBeGreaterThanOrEqual(0);
      expect(creature.hue, creature.key).toBeLessThan(360);
    }
  });

  it('keeps the rare ones rare', () => {
    const legendary = CREATURES.filter((c) => c.rarity === 'legendary');
    expect(legendary).toHaveLength(1);
    expect(CREATURES.filter((c) => c.rarity === 'common').length).toBeGreaterThan(legendary.length);
  });
});

describe('near-day labels', () => {
  const now = new Date('2026-08-26T09:00:00.000Z');

  it('names the days a deadline actually falls on', () => {
    expect(nearDayLabel('2026-08-26', now)).toBe('Today');
    expect(nearDayLabel('2026-08-27', now)).toBe('Tomorrow');
    expect(nearDayLabel('2026-08-25', now)).toBe('Yesterday');
    expect(nearDayLabel('2026-08-29', now)).toBe('In 3 days');
    expect(nearDayLabel('2026-08-23', now)).toBe('3 days ago');
  });

  it('falls back to a date once the relative form stops helping', () => {
    expect(nearDayLabel('2026-09-15', now)).toBe('15 Sep');
    expect(nearDayLabel('2026-07-04', now)).toBe('4 Jul');
  });
});
