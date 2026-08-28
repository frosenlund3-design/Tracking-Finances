import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getPlayer, refreshUnlocks, xpToday } from '@/services/player';
import { rightNow } from '@/services/quests';
import { mostPlayed, playCounts, recentGames, topGames } from '@/services/catalog';
import { AREA_COLOR, PlayerBar } from '@/components/play/chrome';
import { CreatureByKey } from '@/components/creature';
import { nearDayLabel, today } from '@/lib/dates';
import { Board, type PlayedRow, type QuestRow } from './board';

export const metadata: Metadata = { title: 'Spil' };
export const dynamic = 'force-dynamic';

/**
 * Brættet.
 *
 * Alt hentes i ét hug og sendes ned som almindelige data — søgningen og
 * rækkerne kører i browseren, så et katalog på toogtres spil kan bladres
 * uden en eneste rundtur til serveren.
 */
export default async function PlayPage() {
  const user = await requireUser();

  // At møde op er selv betingelsen for den første figur.
  await refreshUnlocks(user.id);

  const [player, todayXp, quests, recent, favourites, counts] = await Promise.all([
    getPlayer(user.id),
    xpToday(user.id),
    rightNow(user.id),
    recentGames(user.id, 12),
    mostPlayed(user.id, 12),
    playCounts(user.id),
  ]);

  const now = today();
  const firstName = (user.displayName || '').split(' ')[0];
  const newest = player.collection[player.collection.length - 1];

  const questRows: QuestRow[] = quests.map((quest) => ({
    key: quest.key,
    title: quest.title,
    detail: quest.detail,
    href: quest.href,
    color: AREA_COLOR[quest.area],
    glyph: quest.glyph,
    reward: quest.reward,
  }));

  const recentRows: PlayedRow[] = recent.map((run) => ({
    gameId: run.game.id,
    label: nearDayLabel(run.playedAt.slice(0, 10), new Date(`${now}T12:00:00Z`)),
  }));

  const favouriteRows: PlayedRow[] = favourites.map((fav) => ({
    gameId: fav.game.id,
    label: `${fav.plays}×`,
  }));

  return (
    <div className="rise space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight">
            {firstName ? `Hej ${firstName}` : 'Dit bræt'}
          </h1>
          <p className="mt-0.5 text-[13.5px] text-ink-muted">
            Vælg hvad som helst. Ingenting her udløber fordi du lod være.
          </p>
        </div>
        {newest ? (
          <Link href="/collection" className="pressable shrink-0" aria-label="Din samling">
            <CreatureByKey keyName={newest} className="h-14 w-14" />
          </Link>
        ) : null}
      </header>

      <PlayerBar player={player} xpToday={todayXp} />

      <Board
        quests={questRows}
        recent={recentRows}
        favourites={favouriteRows}
        top={topGames(10).map((g) => g.id)}
        playCounts={Object.fromEntries(counts)}
      />
    </div>
  );
}
