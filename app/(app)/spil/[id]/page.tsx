import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { game as findGame } from '@/lib/games/catalog';
import { bestScore } from '@/services/catalog';
import { GameRunner } from './runner';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: findGame(id)?.name ?? 'Spil' };
}

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const game = findGame(id);
  if (!game) notFound();

  // Nogle spil har deres egen skærm. Kataloget peger på dem, motoren kører
  // dem ikke — og en direkte adresse skal ende samme sted som flisen gør.
  if (game.route) redirect(game.route);

  return <GameRunner game={game} best={await bestScore(user.id, game.id)} />;
}
