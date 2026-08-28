import { describe, expect, it } from 'vitest';
import {
  DWELL_MS,
  SECTOR_COUNT,
  angleDelta,
  coverage,
  emptySectors,
  nextHint,
  normaliseAngle,
  sectorAt,
  tasksFor,
  tickSweep,
} from '@/lib/games/sweep';

describe('vinkler', () => {
  it('folder alt ind i en hel omgang', () => {
    expect(normaliseAngle(0)).toBe(0);
    expect(normaliseAngle(360)).toBe(0);
    expect(normaliseAngle(-90)).toBe(270);
    expect(normaliseAngle(725)).toBe(5);
  });

  it('måler den korteste vej rundt, ikke den lange', () => {
    expect(angleDelta(10, 350)).toBe(20);
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(0, 180)).toBe(180);
    expect(angleDelta(90, 90)).toBe(0);
  });

  it('lægger sektoren midt om sin retning, ikke i kanten', () => {
    // Sektor 0 dækker −15° til +15° når der er tolv.
    expect(sectorAt(0)).toBe(0);
    expect(sectorAt(14)).toBe(0);
    expect(sectorAt(-14)).toBe(0);
    expect(sectorAt(16)).toBe(1);
    expect(sectorAt(359)).toBe(0);
  });

  it('dækker hele omgangen uden huller og uden overlap', () => {
    const seen = new Set<number>();
    for (let degree = 0; degree < 360; degree += 1) seen.add(sectorAt(degree));
    expect(seen.size).toBe(SECTOR_COUNT);
  });
});

describe('scanningen', () => {
  it('tager ikke en sektor før kameraet har holdt stille længe nok', () => {
    let sectors = emptySectors();
    const half = tickSweep(sectors, 0, DWELL_MS / 2);
    expect(half.captured).toEqual([]);
    expect(half.sectors[0]!.covered).toBe(false);

    const rest = tickSweep(half.sectors, 0, DWELL_MS / 2);
    expect(rest.captured).toEqual([0]);
    expect(rest.sectors[0]!.covered).toBe(true);
  });

  it('tager kun en sektor én gang', () => {
    let state = emptySectors();
    for (let i = 0; i < 6; i += 1) state = tickSweep(state, 0, DWELL_MS).sectors;
    const again = tickSweep(state, 0, DWELL_MS);
    expect(again.captured).toEqual([]);
  });

  it('samler ikke tid op i en sektor kameraet er svirpet forbi', () => {
    // Et svirp: lidt tid i hver retning, aldrig nok i nogen af dem.
    let state = emptySectors();
    for (let degree = 0; degree < 360; degree += 30) {
      state = tickSweep(state, degree, DWELL_MS / 3).sectors;
    }
    expect(coverage(state)).toBe(0);
  });

  it('dækker hele rummet når kameraet føres hele vejen rundt', () => {
    let state = emptySectors();
    for (let degree = 0; degree < 360; degree += 5) {
      state = tickSweep(state, degree, DWELL_MS).sectors;
    }
    expect(coverage(state)).toBe(1);
  });

  it('tåler et tik uden tid og et med negativ tid', () => {
    const state = emptySectors();
    expect(tickSweep(state, 0, 0).captured).toEqual([]);
    expect(tickSweep(state, 0, -500).sectors[0]!.dwell).toBe(0);
  });

  it('tåler en retning der løber over eller under nul', () => {
    expect(() => tickSweep(emptySectors(), 100_000, 10)).not.toThrow();
    expect(() => tickSweep(emptySectors(), -100_000, 10)).not.toThrow();
    expect(tickSweep(emptySectors(), -30, DWELL_MS).captured).toEqual([sectorAt(-30)]);
  });
});

describe('vejledningen', () => {
  it('siger hvilken vej man skal dreje, ikke hvilken sektor der mangler', () => {
    const state = emptySectors();
    // Alt mangler; nærmeste er lige foran.
    expect(nextHint(state, 0)).toBe('Hold den lige her');

    const covered = state.map((s) => (s.index === 0 ? { ...s, covered: true } : s));
    expect(nextHint(covered, 0)).toBe('Drej til højre');

    const onlyLeft = state.map((s) => ({ ...s, covered: s.index !== 9 }));
    expect(nextHint(onlyLeft, 0)).toBe('Drej til venstre');
  });

  it('holder op med at vejlede når der ikke er mere at dække', () => {
    const done = emptySectors().map((s) => ({ ...s, covered: true }));
    expect(nextHint(done, 0)).toBeNull();
    expect(coverage(done)).toBe(1);
  });
});

describe('opgaverne bagefter', () => {
  it('giver flere opgaver jo grundigere der blev scannet', () => {
    const random = () => 0.5;
    expect(tasksFor(1, random).length).toBe(4);
    expect(tasksFor(0.7, random).length).toBe(3);
    expect(tasksFor(0.2, random).length).toBe(2);
  });

  it('gentager ikke den samme opgave', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const tasks = tasksFor(1, () => (seed * 0.137 + 0.1) % 1);
      expect(new Set(tasks).size).toBe(tasks.length);
    }
  });
});
