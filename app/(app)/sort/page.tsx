import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { buildSortRound, FRACTIONS } from '@/lib/waste';
import { bestScores } from '@/services/games';
import { SortGame } from './game';

export const metadata: Metadata = { title: 'Sorter!' };
export const dynamic = 'force-dynamic';

export default async function SortPage() {
  const user = await requireUser();
  const [best] = await Promise.all([bestScores(user.id)]);

  return (
    <SortGame
      round={buildSortRound(10)}
      fractions={FRACTIONS}
      best={best.find((b) => b.game === 'sort')?.best ?? 0}
    />
  );
}
