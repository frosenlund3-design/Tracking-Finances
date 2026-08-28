import { describe, expect, it } from 'vitest';
import {
  decayMomentum,
  floorFor,
  gainMomentum,
  levelFor,
  levelProgress,
  momentumTier,
  xpForLevel,
  MOMENTUM_MAX,
  XP,
  AREA_OF,
} from '@/lib/game';

describe('levels', () => {
  it('starts at level 1 with nothing', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(-50)).toBe(1);
    expect(xpForLevel(1)).toBe(0);
  });

  it('is the exact inverse of its own curve', () => {
    for (let level = 1; level <= 40; level += 1) {
      const need = xpForLevel(level);
      expect(levelFor(need)).toBe(level);
      // One point short is still the level below.
      if (level > 1) expect(levelFor(need - 1)).toBe(level - 1);
    }
  });

  it('reaches the early levels within a handful of actions', () => {
    // Scanning five things and cooking one dinner should not leave you at 1.
    const xp = XP.scan_product * 5 + XP.meal_cooked;
    expect(levelFor(xp)).toBeGreaterThanOrEqual(2);
  });

  it('reports progress that adds up', () => {
    const progress = levelProgress(300);
    expect(progress.level).toBe(levelFor(300));
    expect(progress.into + progress.toNext).toBe(progress.span);
    expect(progress.fraction).toBeGreaterThanOrEqual(0);
    expect(progress.fraction).toBeLessThanOrEqual(1);
    expect(progress.title.length).toBeGreaterThan(0);
  });

  it('never divides by zero or runs out of titles', () => {
    for (const xp of [0, 1, 49, 50, 10_000, 1_000_000]) {
      const p = levelProgress(xp);
      expect(Number.isFinite(p.fraction)).toBe(true);
      expect(p.title).toBeTruthy();
    }
  });
});

describe('momentum', () => {
  it('never decays below a floor already earned', () => {
    const earned = { momentum: 80, floor: floorFor(80) };
    expect(earned.floor).toBe(40);
    // A month away.
    const after = decayMomentum(earned, 30);
    expect(after.momentum).toBe(40);
    expect(after.momentum).toBeGreaterThanOrEqual(after.floor);
  });

  it('costs a tier for a fortnight away, not the year', () => {
    const before = { momentum: 100, floor: floorFor(100) };
    const after = decayMomentum(before, 14);
    expect(after.momentum).toBe(60);
    expect(momentumTier(after.momentum).label).toBe('I flow');
  });

  it('is unchanged when no days have passed', () => {
    const state = { momentum: 42, floor: 25 };
    expect(decayMomentum(state, 0)).toEqual(state);
    expect(decayMomentum(state, -3)).toEqual(state);
  });

  it('tapers a single frantic day so absence is never owed back', () => {
    let state = { momentum: 0, floor: 0 };
    const firstGain = gainMomentum(state, 0).momentum;
    for (let i = 0; i < 12; i += 1) state = gainMomentum(state, i);
    // Twelve actions in one day cannot buy twelve days of momentum.
    expect(state.momentum).toBeLessThan(firstGain * 6);
    expect(state.momentum).toBeGreaterThan(firstGain);
  });

  it('locks in a higher floor the moment a tier is reached', () => {
    let state = { momentum: 48, floor: 10 };
    state = gainMomentum(state, 0);
    expect(state.momentum).toBeGreaterThanOrEqual(50);
    expect(state.floor).toBe(25);
    // And the floor never goes back down.
    expect(gainMomentum({ momentum: 26, floor: 25 }, 5).floor).toBe(25);
  });

  it('caps at the maximum', () => {
    let state = { momentum: 98, floor: 40 };
    for (let i = 0; i < 5; i += 1) state = gainMomentum(state, 0);
    expect(state.momentum).toBe(MOMENTUM_MAX);
  });

  it('names every tier boundary', () => {
    expect(momentumTier(0).label).toBe('Varmer op');
    expect(momentumTier(24).label).toBe('Varmer op');
    expect(momentumTier(25).label).toBe('Ruller');
    expect(momentumTier(100).label).toBe('Ustoppelig');
  });
});

describe('xp table', () => {
  it('gives every action an area', () => {
    for (const action of Object.keys(XP)) {
      expect(AREA_OF[action as keyof typeof XP], action).toBeTruthy();
    }
  });

  it('is worth more to finish something than to start it', () => {
    expect(XP.meal_cooked).toBeGreaterThan(XP.meal_planned);
    expect(XP.sort_flawless).toBeGreaterThan(XP.sort_correct);
    expect(XP.scan_first_time).toBeGreaterThan(XP.scan_product);
  });

  it('has no action worth nothing', () => {
    for (const [action, amount] of Object.entries(XP)) {
      expect(amount, action).toBeGreaterThan(0);
    }
  });
});
