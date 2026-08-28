import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { listRoutines, routineHistory, weekStart } from '@/services/routines';
import { today } from '@/lib/dates';
import { addDays } from '@/lib/normalize';
import { Routines, type RoutineRow } from './routines';

export const metadata: Metadata = { title: 'Routines' };
export const dynamic = 'force-dynamic';

export default async function RoutinesPage() {
  const user = await requireUser();
  const now = today();
  const routines = await listRoutines(user.id, now);

  const monday = weekStart(now);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const rows: RoutineRow[] = await Promise.all(
    routines.map(async (routine) => {
      const history = await routineHistory(user.id, routine.id, now);
      const done = new Set(history.filter((d) => d.done).map((d) => d.date));
      return {
        id: routine.id,
        name: routine.name,
        icon: routine.icon,
        area: routine.area,
        targetPerWeek: routine.targetPerWeek,
        doneThisWeek: routine.doneThisWeek,
        doneToday: routine.doneToday,
        doneEver: routine.doneEver,
        hitTarget: routine.hitTarget,
        week: days.map((date) => done.has(date)),
      };
    }),
  );

  return <Routines routines={rows} />;
}
