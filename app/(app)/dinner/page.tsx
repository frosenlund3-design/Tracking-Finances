import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { suggestDinners, weekPlan } from '@/services/meals';
import { nearDayLabel, today } from '@/lib/dates';
import { Roulette, type DinnerCard, type WeekDay } from './roulette';

export const metadata: Metadata = { title: 'Dinner' };
export const dynamic = 'force-dynamic';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default async function DinnerPage() {
  const user = await requireUser();
  const now = today();

  const [suggestions, week] = await Promise.all([
    // Eight, so the wheel has somewhere to travel without dropping to
    // recipes the kitchen cannot support at all.
    suggestDinners(user.id, 8, now),
    weekPlan(user.id, now),
  ]);

  const cards: DinnerCard[] = suggestions.map((s) => ({
    key: s.recipe.key,
    name: s.recipe.name,
    blurb: s.recipe.blurb,
    minutes: s.recipe.minutes,
    serves: s.recipe.serves,
    effort: s.recipe.effort,
    coverage: s.coverage,
    have: s.have.map((i) => i.name),
    missing: s.missing.map((i) => i.name),
    rescues: s.rescues.map((i) => i.name),
    steps: s.recipe.steps,
    tags: s.recipe.tags,
  }));

  // A rolling seven days, not a calendar week — so the first two rows say so
  // rather than making the reader work out which weekday today is.
  const days: WeekDay[] = week.map((day, i) => ({
    date: day.date,
    label: nearDayLabel(day.date),
    weekday:
      i === 0 ? 'Today' : i === 1 ? 'Tom.' : WEEKDAYS[new Date(`${day.date}T00:00:00.000Z`).getUTCDay()]!,
    recipeName: day.meal?.recipe.name ?? null,
    status: day.meal?.status ?? null,
  }));

  return <Roulette cards={cards} week={days} todayIso={now} />;
}
