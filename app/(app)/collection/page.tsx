import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getPlayer } from '@/services/player';
import { CREATURES, RARITY_LABEL, RARITY_ORDER, type Rarity } from '@/lib/creatures';
import { CreatureArt, CreatureLocked } from '@/components/creature';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Collection' };
export const dynamic = 'force-dynamic';

const RING: Record<Rarity, string> = {
  common: 'ring-border',
  rare: 'ring-sky-400/50',
  epic: 'ring-violet-400/60',
  legendary: 'ring-amber-400/70',
};

/**
 * Everyone you have met.
 *
 * Locked ones are shown, not hidden: a silhouette with its condition written
 * underneath is a reason to do something, and an empty grid is a reason to
 * close the app. Nothing here is bought, and nothing is drawn at random.
 */
export default async function CollectionPage() {
  const user = await requireUser();
  const player = await getPlayer(user.id);
  const owned = new Set(player.collection);

  const sorted = [...CREATURES].sort((a, b) => {
    const mine = Number(owned.has(b.key)) - Number(owned.has(a.key));
    return mine || RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
  });

  return (
    <div className="rise space-y-5">
      <header>
        <h1 className="text-[28px] font-bold tracking-tight">Collection</h1>
        <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-muted">
          {player.collection.length} of {CREATURES.length}. Every one is earned by doing something —
          none of them are random, and none of them can be bought.
        </p>
      </header>

      <div className="meter h-2">
        <span
          style={{
            width: `${Math.max((player.collection.length / CREATURES.length) * 100, 2)}%`,
            background: 'var(--color-play-xp)',
          }}
        />
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {sorted.map((creature) => {
          const mine = owned.has(creature.key);
          return (
            <li
              key={creature.key}
              className={cn(
                'rounded-2xl bg-surface p-3 text-center ring-1',
                mine ? RING[creature.rarity] : 'ring-border',
                mine && creature.rarity === 'legendary' && 'holo',
              )}
            >
              {mine ? (
                <CreatureArt creature={creature} className="mx-auto h-20 w-20" />
              ) : (
                <CreatureLocked className="mx-auto h-20 w-20 text-ink" />
              )}
              <p
                className={cn(
                  'mt-1.5 text-[14px] font-bold leading-tight',
                  !mine && 'text-ink-subtle',
                )}
              >
                {mine ? creature.name : '???'}
              </p>
              <p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-subtle">
                {RARITY_LABEL[creature.rarity]}
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
                {mine ? creature.blurb : creature.unlock}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
