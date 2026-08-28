import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { Player } from '@/services/player';
import type { Area } from '@/lib/game';

/**
 * The shared furniture of the play screens: a level bar, an area colour, and
 * the big tappable tile everything is built from.
 */

export const AREA_COLOR: Record<Area | 'xp', string> = {
  kitchen: 'var(--color-play-kitchen)',
  home: 'var(--color-play-home)',
  body: 'var(--color-play-body)',
  money: 'var(--color-play-money)',
  xp: 'var(--color-play-xp)',
};

/**
 * Level, points to the next one, and momentum.
 *
 * Momentum is shown as a bar with a marked floor, because the floor is the
 * promise: the shaded part is what a fortnight away cannot take.
 */
export function PlayerBar({ player, xpToday }: { player: Player; xpToday: number }) {
  const { progress, tier, momentum, floor } = player;

  return (
    <div className="rounded-[var(--radius-card)] bg-play-ink p-4 text-white shadow-raised">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
            Level {progress.level}
          </p>
          <p className="truncate text-[19px] font-bold tracking-tight">{progress.title}</p>
        </div>
        <Link
          href="/collection"
          className="pressable shrink-0 rounded-full bg-white/12 px-3 py-1.5 text-[12.5px] font-medium"
        >
          {player.collection.length} collected
        </Link>
      </div>

      <div className="meter mt-3 h-2 bg-white/15">
        <span
          style={{ width: `${Math.max(progress.fraction * 100, 3)}%`, background: AREA_COLOR.xp }}
        />
      </div>
      <p className="mt-1.5 text-[12px] text-white/65">
        {progress.toNext} XP to level {progress.level + 1}
        {xpToday > 0 ? ` · ${xpToday} today` : ''}
      </p>

      <div className="mt-3 flex items-center gap-2.5 border-t border-white/10 pt-3">
        <span className="text-[12.5px] font-medium text-white/80">{tier.label}</span>
        <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/15">
          {/* The floor: what a fortnight away cannot take back. */}
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-white/25"
            style={{ width: `${floor}%` }}
          />
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-white/85"
            style={{ width: `${Math.max(momentum, 2)}%` }}
          />
        </span>
        <span className="numeral text-[12px] text-white/55">{momentum}</span>
      </div>
      {floor > 0 ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/50">
          Momentum never drops below {floor} now. Time off costs a little, never everything.
        </p>
      ) : null}
    </div>
  );
}

/** The chunky tile the whole board is made of. */
export function PlayTile({
  href,
  title,
  subtitle,
  color,
  glyph,
  badge,
  size = 'half',
  className,
}: {
  href: string;
  title: string;
  subtitle?: string;
  color: string;
  glyph: React.ReactNode;
  badge?: string | number | null;
  size?: 'half' | 'full';
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn('play-tile block p-4', size === 'full' ? 'col-span-2' : '', className)}
      style={{ background: color }}
    >
      <div className="relative flex items-start justify-between gap-2">
        <span aria-hidden="true" className="text-[30px] leading-none drop-shadow-sm">
          {glyph}
        </span>
        {badge !== null && badge !== undefined && badge !== '' ? (
          <span className="numeral rounded-full bg-black/25 px-2 py-0.5 text-[11.5px] font-bold">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="relative mt-6 text-[16px] font-bold leading-tight tracking-tight">{title}</p>
      {subtitle ? (
        <p className="relative mt-0.5 text-[12.5px] leading-snug text-white/80">{subtitle}</p>
      ) : null}
    </Link>
  );
}

/** A row that reads as one thing to do right now. */
export function QuestRow({
  href,
  title,
  detail,
  color,
  glyph,
  reward,
}: {
  href: string;
  title: string;
  detail: string;
  color: string;
  glyph: React.ReactNode;
  reward?: string;
}) {
  return (
    <Link
      href={href}
      className="pressable flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5"
    >
      <span
        aria-hidden="true"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[20px]"
        style={{ background: color, color: '#fff' }}
      >
        {glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold leading-tight">{title}</span>
        <span className="mt-0.5 block truncate text-[12.5px] text-ink-muted">{detail}</span>
      </span>
      {reward ? (
        <span className="numeral shrink-0 rounded-full bg-accent-soft px-2 py-1 text-[11.5px] font-bold text-accent-ink">
          {reward}
        </span>
      ) : (
        <span aria-hidden="true" className="shrink-0 text-ink-subtle">
          ›
        </span>
      )}
    </Link>
  );
}
