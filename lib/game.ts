/**
 * The game layer, as arithmetic.
 *
 * Two rules shaped every number below.
 *
 * 1. Nothing here can punish. There is no streak, because a streak is a number
 *    whose only purpose is to break, and an app that makes you feel bad about
 *    a missed Tuesday is an app you delete on Wednesday. Momentum rises fast,
 *    decays slowly, and never drops below a floor you have already earned.
 *
 * 2. Rewards are earned, not gambled. Which creature you unlock is a surprise;
 *    whether you unlock one is not. Variable-ratio reward — the slot machine
 *    schedule — is the most addictive pattern known and also the one that
 *    leaves people feeling used. Surprise without a lottery gets the delight
 *    and skips that.
 */

/** Every action worth points, and what it is worth. */
export const XP = {
  /** A product barcode read into the pantry. */
  scan_product: 12,
  /** A barcode nobody in this account had scanned before. */
  scan_first_time: 20,
  /** Any eat/freeze/bin decision on something in the kitchen. */
  pantry_decision: 6,
  /** Something used up before its date rather than after. */
  expiry_rescue: 15,
  /** A dinner chosen for a day. */
  meal_planned: 10,
  /** A dinner actually cooked. */
  meal_cooked: 20,
  /** One correct answer in the sorting game. */
  sort_correct: 4,
  /** A sorting round with nothing wrong in it. */
  sort_flawless: 30,
  /** A routine ticked off. */
  routine_done: 12,
  /** A weekly routine target reached. */
  routine_target: 25,
  /** A supply marked restocked. */
  supply_restocked: 8,
  /** A bin confirmed present or missing at home. */
  bin_confirmed: 6,
  /** One transaction given a category. Money is an area like any other. */
  transaction_sorted: 5,
  /** A two-minute tidy sprint finished. */
  sprint_finished: 18,
} as const;

export type XpAction = keyof typeof XP;

/** Which part of life an action belongs to. Drives colour and grouping. */
export const AREA_OF: Record<XpAction, Area> = {
  scan_product: 'kitchen',
  scan_first_time: 'kitchen',
  pantry_decision: 'kitchen',
  expiry_rescue: 'kitchen',
  meal_planned: 'kitchen',
  meal_cooked: 'kitchen',
  sort_correct: 'home',
  sort_flawless: 'home',
  routine_done: 'body',
  routine_target: 'body',
  supply_restocked: 'home',
  bin_confirmed: 'home',
  transaction_sorted: 'money',
  sprint_finished: 'home',
};

export type Area = 'kitchen' | 'home' | 'body' | 'money';

export const AREAS: Array<{ key: Area; label: string; blurb: string }> = [
  { key: 'kitchen', label: 'Kitchen', blurb: 'What you have, and what to cook' },
  { key: 'home', label: 'Home', blurb: 'Sorting, supplies, two-minute tidying' },
  { key: 'body', label: 'Body', blurb: 'Training, skincare, anything repeated' },
  { key: 'money', label: 'Money', blurb: 'In, out, and what changed' },
];

/* ------------------------------------------------------------------ levels */

/**
 * Cumulative XP needed to reach a level: 25 · L · (L−1).
 *
 * Level 2 at 50, level 5 at 500, level 10 at 2 250. With ordinary actions
 * worth 4–30 points, the first few levels arrive within minutes and the
 * later ones stay reachable without turning into a grind.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return 25 * level * (level - 1);
}

export function levelFor(xp: number): number {
  if (xp <= 0) return 1;
  // Inverse of 25L(L−1), rounded down: L = (1 + sqrt(1 + 4·xp/25)) / 2
  const level = Math.floor((1 + Math.sqrt(1 + (4 * xp) / 25)) / 2);
  return Math.max(1, level);
}

export interface LevelProgress {
  level: number;
  title: string;
  /** XP earned since the current level began. */
  into: number;
  /** XP the current level spans. */
  span: number;
  /** 0–1, for a progress bar. */
  fraction: number;
  /** XP still needed for the next level. */
  toNext: number;
}

const TITLES = [
  'Getting started',
  'Finding the drawer',
  'Labelled',
  'Colour-coded',
  'Sorted',
  'In order',
  'Running smoothly',
  'Frighteningly tidy',
  'Systems person',
  'Legendary',
];

export function levelTitle(level: number): string {
  return TITLES[Math.min(level - 1, TITLES.length - 1)] ?? TITLES[0]!;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFor(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const span = next - base;
  const into = Math.max(0, xp - base);
  return {
    level,
    title: levelTitle(level),
    into,
    span,
    fraction: span === 0 ? 1 : Math.min(into / span, 1),
    toNext: Math.max(next - xp, 0),
  };
}

/* ---------------------------------------------------------------- momentum */

export const MOMENTUM_MAX = 100;
/** What one day of activity is worth, before the same-day taper. */
const MOMENTUM_PER_ACTION = 9;
/** Lost per fully idle day. Three idle days cost 18 points, not everything. */
const MOMENTUM_DECAY_PER_DAY = 6;

/**
 * Tiers, and the floor each one locks in.
 *
 * The floor is the whole design. Reaching 50 once means momentum can never
 * again fall below 25, so a fortnight away costs a tier, not the year.
 */
export interface MomentumTier {
  at: number;
  label: string;
  floor: number;
}

export const MOMENTUM_TIERS: MomentumTier[] = [
  { at: 0, label: 'Warming up', floor: 0 },
  { at: 25, label: 'Rolling', floor: 10 },
  { at: 50, label: 'Flowing', floor: 25 },
  { at: 75, label: 'On a roll', floor: 40 },
  { at: 100, label: 'Unstoppable', floor: 60 },
];

export function momentumTier(momentum: number): MomentumTier {
  let tier = MOMENTUM_TIERS[0]!;
  for (const candidate of MOMENTUM_TIERS) if (momentum >= candidate.at) tier = candidate;
  return tier;
}

/** The floor earned by ever having reached this much momentum. */
export function floorFor(momentum: number): number {
  return momentumTier(momentum).floor;
}

export interface MomentumState {
  momentum: number;
  floor: number;
}

/**
 * Decay for time passed. Idempotent for a given day, so calling it on every
 * page load is safe.
 */
export function decayMomentum(state: MomentumState, daysIdle: number): MomentumState {
  if (daysIdle <= 0) return state;
  const decayed = state.momentum - daysIdle * MOMENTUM_DECAY_PER_DAY;
  return { momentum: Math.max(decayed, state.floor), floor: state.floor };
}

/**
 * Credit activity.
 *
 * `actionsToday` tapers the same day's gains: the first action is worth full
 * value, the fifth barely anything. Momentum should reward coming back, not
 * reward one heroic Sunday — and a taper means a day of frantic catching-up
 * cannot be followed by a week of guilt-free absence.
 */
export function gainMomentum(state: MomentumState, actionsToday: number): MomentumState {
  const taper = 1 / (1 + Math.max(0, actionsToday) * 0.8);
  const gained = Math.min(state.momentum + Math.round(MOMENTUM_PER_ACTION * taper), MOMENTUM_MAX);
  return { momentum: gained, floor: Math.max(state.floor, floorFor(gained)) };
}
