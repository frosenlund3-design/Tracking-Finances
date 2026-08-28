import type { GrantResult } from '@/services/player';

/** What the celebration layer needs, flattened from one or more grants. */
export interface Reward {
  xp: number;
  levelUp: number | null;
  unlocked: string[];
}

export function rewardOf(...grants: Array<GrantResult | null | undefined>): Reward {
  const real = grants.filter((g): g is GrantResult => Boolean(g));
  return {
    xp: real.reduce((sum, g) => sum + g.gained, 0),
    levelUp: real.reduce<number | null>((found, g) => g.leveledUp ?? found, null),
    unlocked: real.flatMap((g) => g.unlocked.map((c) => c.key)),
  };
}

export const NO_REWARD: Reward = { xp: 0, levelUp: null, unlocked: [] };
