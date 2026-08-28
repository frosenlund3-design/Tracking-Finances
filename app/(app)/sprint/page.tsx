import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { ROOMS, SPRINT_SECONDS } from '@/lib/sprint';
import { Sprint } from './sprint';

export const metadata: Metadata = { title: 'Two-minute sprint' };
export const dynamic = 'force-dynamic';

export default async function SprintPage() {
  await requireUser();
  return (
    <Sprint
      rooms={ROOMS.map((r) => ({ key: r.key, label: r.label, glyph: r.glyph }))}
      seconds={SPRINT_SECONDS}
    />
  );
}
