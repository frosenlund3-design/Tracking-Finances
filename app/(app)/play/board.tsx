'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { GameTile } from '@/components/play/tile';
import { cn } from '@/lib/cn';
import { CATEGORIES, GAMES, game as findGame, type Game } from '@/lib/games/catalog';
import { searchGames } from '@/lib/games/search';
import { formatDuration } from '@/lib/games/plan';
import { loadSoundPreference, primeSound, feedback } from '@/lib/sound';

export interface PlayedRow {
  gameId: string;
  label: string;
}

export interface QuestRow {
  key: string;
  title: string;
  detail: string;
  href: string;
  color: string;
  glyph: string;
  reward: string;
}

/**
 * Brættet.
 *
 * Bygget som et katalog frem for en menu: vandrette rækker der kan svirpes,
 * en søgning der svarer mens man skriver, og de tre rækker der handler om
 * dig selv — historik, spil igen, top — øverst, fordi det er dem der gør
 * forskellen på et katalog man bladrer i én gang og et man vender tilbage til.
 *
 * Hele kataloget ligger i klienten. Toogtres spil med navn og linje fylder
 * nogle få kilobyte, og en søgning der skal vente på serveren mens man står
 * med telefonen i den ene hånd og en klud i den anden er ikke en søgning.
 */
export function Board({
  quests,
  recent,
  favourites,
  top,
  playCounts,
}: {
  quests: QuestRow[];
  recent: PlayedRow[];
  favourites: PlayedRow[];
  top: string[];
  playCounts: Record<string, number>;
}) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSoundPreference();
  }, []);

  const hits = useMemo(() => searchGames(query, 30).map((h) => h.game), [query]);

  const recentGames = recent
    .map((r) => ({ game: findGame(r.gameId), label: r.label }))
    .filter((r): r is { game: Game; label: string } => Boolean(r.game));
  const favouriteGames = favourites
    .map((r) => ({ game: findGame(r.gameId), label: r.label }))
    .filter((r): r is { game: Game; label: string } => Boolean(r.game));
  const topList = top.map(findGame).filter((g): g is Game => Boolean(g));
  const featured = GAMES.filter((g) => g.featured);

  return (
    <div className="space-y-7" onPointerDownCapture={() => primeSound()}>
      {/* Søgning */}
      <div className="sticky top-0 z-20 -mx-4 bg-canvas/90 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-ink-subtle"
          >
            🔍
          </span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearching(e.target.value.trim().length > 0);
            }}
            placeholder="Søg efter et spil — “tøj”, “morgen”, “skrald”…"
            aria-label="Søg i kataloget"
            className={cn(
              'w-full rounded-2xl border border-border bg-surface py-3 pl-10 pr-4',
              'text-[16px] text-ink placeholder:text-ink-subtle sm:text-[14px]',
              'transition-colors focus:border-accent',
            )}
          />
        </div>
      </div>

      {searching ? (
        <section>
          <RowHeading title={hits.length > 0 ? `${hits.length} spil` : 'Ingen træf'} />
          {hits.length > 0 ? (
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {hits.map((game) => (
                <GameTile
                  key={game.id}
                  game={game}
                  className="w-full"
                  badge={playCounts[game.id] ? `${playCounts[game.id]}×` : null}
                />
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-2xl border border-border bg-surface p-4 text-[13.5px] leading-relaxed text-ink-muted">
              Ikke noget der hedder det. Prøv et rum — soveværelse, køkken, badeværelse — eller det
              du faktisk skal: vaske, sortere, ringe, betale.
            </p>
          )}
        </section>
      ) : (
        <>
          {quests.length > 0 ? (
            <section>
              <RowHeading title="Lige nu" />
              <div className="mt-2 space-y-2">
                {quests.slice(0, 3).map((quest) => (
                  <Link
                    key={quest.key}
                    href={quest.href}
                    onClick={() => feedback('tap')}
                    className="pressable flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[20px] text-white"
                      style={{ background: quest.color }}
                    >
                      {quest.glyph}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold leading-tight">
                        {quest.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-ink-muted">
                        {quest.detail}
                      </span>
                    </span>
                    <span className="numeral shrink-0 rounded-full bg-accent-soft px-2 py-1 text-[11.5px] font-bold text-accent-ink">
                      {quest.reward}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {recentGames.length > 0 ? (
            <Row title="🕞 Historik" subtitle="Det du har spillet på det seneste">
              {recentGames.map(({ game, label }) => (
                <GameTile key={game.id} game={game} badge={label} />
              ))}
            </Row>
          ) : null}

          {favouriteGames.length > 0 ? (
            <Row title="🔁 Spil igen" subtitle="Dem du kommer tilbage til">
              {favouriteGames.map(({ game, label }) => (
                <GameTile key={game.id} game={game} badge={label} />
              ))}
            </Row>
          ) : null}

          <Row title="⭐ Top" subtitle="Mest udbytte for tiden det tager">
            {topList.map((game) => (
              <GameTile key={game.id} game={game} size="lg" />
            ))}
          </Row>

          {recentGames.length === 0 ? (
            <Row title="✨ Start her" subtitle="De første der er værd at prøve">
              {featured.map((game) => (
                <GameTile key={game.id} game={game} />
              ))}
            </Row>
          ) : null}

          {CATEGORIES.map((cat) => {
            const inside = GAMES.filter((g) => g.category === cat.id);
            if (inside.length === 0) return null;
            return (
              <Row key={cat.id} title={`${cat.emoji} ${cat.label}`} subtitle={cat.blurb}>
                {inside.map((game) => (
                  <GameTile
                    key={game.id}
                    game={game}
                    badge={playCounts[game.id] ? `${playCounts[game.id]}×` : null}
                  />
                ))}
              </Row>
            );
          })}

          <p className="px-1 pb-2 text-[12.5px] leading-relaxed text-ink-subtle">
            {GAMES.length} spil. Ingen af dem udløber, ingen af dem kan mislykkes, og der er
            ingenting der venter på dig i morgen fordi du ikke gjorde det i dag.
          </p>
        </>
      )}
    </div>
  );
}

function RowHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-1">
      <h2 className="text-[17px] font-bold tracking-tight">{title}</h2>
      {subtitle ? <p className="mt-0.5 text-[12.5px] text-ink-subtle">{subtitle}</p> : null}
    </div>
  );
}

/** En vandret række der kan svirpes, med kant-til-kant på telefonen. */
function Row({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <RowHeading title={title} subtitle={subtitle} />
      <div className="scroll-x -mx-4 mt-2 flex gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
        {children}
      </div>
    </section>
  );
}
