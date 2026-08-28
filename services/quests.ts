import '@/lib/server-guard';
import { today } from '@/lib/dates';
import { daysBetween } from '@/lib/normalize';
import type { Area } from '@/lib/game';
import { pantrySummary, listPantry } from '@/services/pantry';
import { weekPlan } from '@/services/meals';
import { listRoutines } from '@/services/routines';
import { binSummary, listSupplies } from '@/services/home';
import { reviewCount } from '@/services/review';

/**
 * What to do right now.
 *
 * The one rule this list obeys: it is never empty. An organiser that greets
 * you with "nothing to do" on a quiet Tuesday has no reason to be opened on
 * Wednesday, so when there is genuinely nothing pressing it offers a round of
 * a game instead — thirty seconds, a few points, and a reason to have come.
 *
 * Everything on it is finishable in about two minutes. Anything longer is a
 * project, and projects belong on their own screen where they cannot make a
 * person feel behind.
 */

export interface Quest {
  key: string;
  title: string;
  detail: string;
  href: string;
  area: Area;
  glyph: string;
  /** Roughly what it pays, for the chip on the right. */
  reward: string;
  /** Higher sorts first. */
  urgency: number;
}

export async function rightNow(userId: string, now: string = today()): Promise<Quest[]> {
  const [pantry, week, routines, bins, supplies, toReview, expiring] = await Promise.all([
    pantrySummary(userId, now),
    weekPlan(userId, now),
    listRoutines(userId, now),
    binSummary(userId),
    listSupplies(userId, now),
    reviewCount(userId),
    listPantry(userId, { status: 'in', limit: 1 }, now),
  ]);

  const quests: Quest[] = [];

  // --- kitchen ---
  const needsDeciding = pantry.expired + pantry.urgent;
  if (needsDeciding > 0) {
    quests.push({
      key: 'expiry',
      title: `${needsDeciding} thing${needsDeciding === 1 ? '' : 's'} to decide on`,
      detail: 'Eat it, freeze it, or let it go. One swipe each.',
      href: '/kitchen/expiry',
      area: 'kitchen',
      glyph: '⏳',
      reward: `+${needsDeciding * 6} XP`,
      urgency: 90 + Math.min(needsDeciding, 9),
    });
  }

  if (expiring.length === 0) {
    quests.push({
      key: 'first-scan',
      title: 'Scan the first thing into your kitchen',
      detail: 'Point the camera at a barcode. Takes about four seconds.',
      href: '/kitchen/scan',
      area: 'kitchen',
      glyph: '📷',
      reward: '+20 XP',
      urgency: 70,
    });
  }

  const tonight = week[0];
  if (tonight && !tonight.meal) {
    quests.push({
      key: 'dinner',
      title: 'No dinner decided for tonight',
      detail: 'Spin it and let the kitchen choose from what you already have.',
      href: '/dinner',
      area: 'kitchen',
      glyph: '🎰',
      reward: '+10 XP',
      urgency: 80,
    });
  } else if (tonight?.meal && tonight.meal.status === 'planned') {
    quests.push({
      key: 'cooked',
      title: `Did you cook the ${tonight.meal.recipe.name.toLowerCase()}?`,
      detail: 'One tap, and tonight counts.',
      href: '/dinner',
      area: 'kitchen',
      glyph: '🍳',
      reward: '+20 XP',
      urgency: 60,
    });
  }

  // --- body ---
  for (const routine of routines) {
    if (routine.doneToday || routine.hitTarget) continue;
    const left = routine.targetPerWeek - routine.doneThisWeek;
    quests.push({
      key: `routine:${routine.id}`,
      title: routine.name,
      detail: `${left} more this week to hit your target. No rush about which day.`,
      href: '/routines',
      area: 'body',
      glyph: '✨',
      reward: '+12 XP',
      urgency: 55 - Math.min(routines.indexOf(routine), 4),
    });
  }

  // --- home ---
  for (const supply of supplies) {
    if (supply.state !== 'out' && supply.state !== 'soon') continue;
    quests.push({
      key: `supply:${supply.id}`,
      title:
        supply.state === 'out'
          ? `${supply.name} has probably run out`
          : `${supply.name} runs out in ${supply.daysLeft} day${supply.daysLeft === 1 ? '' : 's'}`,
      detail: 'Add it to the list, or mark it bought.',
      href: '/supplies',
      area: 'home',
      glyph: '🧺',
      reward: '+8 XP',
      urgency: supply.state === 'out' ? 75 : 50,
    });
  }

  if (bins.answered < bins.total) {
    const left = bins.total - bins.answered;
    quests.push({
      key: 'bins',
      title: `Which of the ten bins do you have?`,
      detail: `${left} still unanswered. Sorting advice is no use without somewhere to put it.`,
      href: '/sort/bins',
      area: 'home',
      glyph: '🗑️',
      reward: `+${left * 6} XP`,
      urgency: 45,
    });
  }

  // --- money ---
  if (toReview > 0) {
    quests.push({
      key: 'review',
      title: `${toReview} transaction${toReview === 1 ? '' : 's'} need a category`,
      detail: 'One tap each, and the answer sticks for that merchant.',
      href: '/review',
      area: 'money',
      glyph: '💳',
      reward: `+${Math.min(toReview, 20) * 5} XP`,
      urgency: 40,
    });
  }

  // --- the floor ---
  //
  // Whatever else is or is not true, there is always a round to play. This is
  // the line that keeps the screen from ever saying "nothing to do".
  quests.push({
    key: 'sort-round',
    title: 'Play a round of Sorter',
    detail: 'Ten items, ten bins. Thirty seconds, and you will learn something.',
    href: '/sort',
    area: 'home',
    glyph: '♻️',
    reward: 'up to +100 XP',
    urgency: 10,
  });

  return quests.sort((a, b) => b.urgency - a.urgency);
}

/** Counts for the board's tiles, in one pass. */
export interface BoardCounts {
  pantryTotal: number;
  pantryUrgent: number;
  dinnerTonight: string | null;
  routinesLeft: number;
  suppliesLow: number;
  binsUnanswered: number;
  reviewCount: number;
  rescuedLast30: number;
}

export async function boardCounts(userId: string, now: string = today()): Promise<BoardCounts> {
  const [pantry, week, routines, bins, supplies, toReview] = await Promise.all([
    pantrySummary(userId, now),
    weekPlan(userId, now),
    listRoutines(userId, now),
    binSummary(userId),
    listSupplies(userId, now),
    reviewCount(userId),
  ]);

  return {
    pantryTotal: pantry.total,
    pantryUrgent: pantry.expired + pantry.urgent,
    dinnerTonight: week[0]?.meal?.recipe.name ?? null,
    routinesLeft: routines.filter((r) => !r.hitTarget).length,
    suppliesLow: supplies.filter((s) => s.state === 'out' || s.state === 'soon').length,
    binsUnanswered: bins.total - bins.answered,
    reviewCount: toReview,
    rescuedLast30: pantry.rescuedLast30,
  };
}

/** Days since the account did anything at all, for a gentle welcome back. */
export function daysAway(lastActiveOn: string | null, now: string = today()): number {
  if (!lastActiveOn) return 0;
  return Math.max(0, daysBetween(lastActiveOn, now));
}
