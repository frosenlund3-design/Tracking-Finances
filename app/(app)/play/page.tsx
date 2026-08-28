import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getPlayer, refreshUnlocks, xpToday } from '@/services/player';
import { boardCounts, rightNow } from '@/services/quests';
import { AREA_COLOR, PlayTile, PlayerBar, QuestRow } from '@/components/play/chrome';
import { CreatureByKey } from '@/components/creature';
import { CREATURES } from '@/lib/creatures';
import { SectionHeading } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Play' };
export const dynamic = 'force-dynamic';

/**
 * The board.
 *
 * Two halves, in this order on purpose. First "right now" — a short list of
 * things finishable in about two minutes, so that opening the app and doing
 * something useful can be the same action. Then the games, as a wall of
 * colour, because a grid of bright tiles is the thing that gets tapped when
 * nothing in particular needs doing.
 *
 * What is deliberately absent: a streak, a daily goal, a red badge counting
 * how far behind you are, and anything at all that expires overnight.
 */
export default async function PlayPage() {
  const user = await requireUser();

  // Turning up is itself the condition for the starter creature.
  await refreshUnlocks(user.id);

  const [player, todayXp, quests, counts] = await Promise.all([
    getPlayer(user.id),
    xpToday(user.id),
    rightNow(user.id),
    boardCounts(user.id),
  ]);

  const firstName = (user.displayName || '').split(' ')[0];
  const newest = player.collection[player.collection.length - 1];

  return (
    <div className="rise space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight">
            {firstName ? `Hi ${firstName}` : 'Your board'}
          </h1>
          <p className="mt-0.5 text-[13.5px] text-ink-muted">
            Pick anything. Nothing here expires if you do not.
          </p>
        </div>
        {newest ? (
          <Link href="/collection" className="pressable shrink-0">
            <CreatureByKey keyName={newest} className="h-14 w-14" />
          </Link>
        ) : null}
      </header>

      <PlayerBar player={player} xpToday={todayXp} />

      <section>
        <SectionHeading title="Right now" />
        <div className="mt-2 space-y-2">
          {quests.slice(0, 4).map((quest) => (
            <QuestRow
              key={quest.key}
              href={quest.href}
              title={quest.title}
              detail={quest.detail}
              color={AREA_COLOR[quest.area]}
              glyph={quest.glyph}
              reward={quest.reward}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionHeading title="Games" />
        <div className="mt-2 grid grid-cols-2 gap-3">
          <PlayTile
            href="/sort"
            title="Sorter!"
            subtitle="Ten items, ten bins"
            color={AREA_COLOR.home}
            glyph="♻️"
          />
          <PlayTile
            href="/kitchen/expiry"
            title="Expiry Rush"
            subtitle="Swipe before it turns"
            color={AREA_COLOR.kitchen}
            glyph="⏳"
            badge={counts.pantryUrgent || null}
          />
          <PlayTile
            href="/dinner"
            title="Dinner Roulette"
            subtitle="Spin what your fridge allows"
            color="var(--color-play-body)"
            glyph="🎰"
            badge={counts.dinnerTonight ? '✓' : null}
          />
          <PlayTile
            href="/sprint"
            title="2-Minute Sprint"
            subtitle="Three tasks, one timer"
            color="var(--color-play-money)"
            glyph="⏱️"
          />
        </div>
      </section>

      <section>
        <SectionHeading title="Your life, in drawers" />
        <div className="mt-2 grid grid-cols-2 gap-3">
          <PlayTile
            href="/kitchen"
            title="Kitchen"
            subtitle={counts.pantryTotal > 0 ? `${counts.pantryTotal} things in` : 'Nothing in yet'}
            color={AREA_COLOR.kitchen}
            glyph="🥫"
            badge={counts.pantryUrgent || null}
          />
          <PlayTile
            href="/sort/bins"
            title="Home"
            subtitle="Bins, sorting, supplies"
            color={AREA_COLOR.home}
            glyph="🏠"
            badge={counts.binsUnanswered || null}
          />
          <PlayTile
            href="/routines"
            title="Body"
            subtitle="Training, skincare, anything"
            color={AREA_COLOR.body}
            glyph="💪"
            badge={counts.routinesLeft || null}
          />
          <PlayTile
            href="/dashboard"
            title="Money"
            subtitle="In, out, what changed"
            color={AREA_COLOR.money}
            glyph="💳"
            badge={counts.reviewCount || null}
          />
        </div>
      </section>

      <section>
        <SectionHeading
          title="Collection"
          action={
            <Link href="/collection" className="text-[13px] font-medium text-accent">
              All {CREATURES.length}
            </Link>
          }
        />
        <div className="scroll-x mt-2 flex gap-3 overflow-x-auto pb-1">
          {player.collection.length === 0 ? (
            <p className="text-[13px] text-ink-muted">
              Do anything at all and the first one turns up.
            </p>
          ) : (
            player.collection
              .slice()
              .reverse()
              .map((key) => (
                <Link
                  key={key}
                  href="/collection"
                  className="pressable shrink-0 rounded-2xl border border-border bg-surface p-2"
                >
                  <CreatureByKey keyName={key} className="h-16 w-16" />
                </Link>
              ))
          )}
        </div>
      </section>

      {counts.rescuedLast30 > 0 ? (
        <p className="px-1 text-[13px] leading-relaxed text-ink-muted">
          You used or froze{' '}
          <strong className="font-semibold text-ink">{counts.rescuedLast30} things</strong> before
          their date this month. That is food that did not become compost.
        </p>
      ) : null}
    </div>
  );
}
