import Link from 'next/link';
import { cn } from '@/lib/cn';
import { sceneFor } from '@/lib/games/art';
import type { Game } from '@/lib/games/catalog';

/**
 * Spilflisen.
 *
 * Bygget som en scene frem for et ikon på en farve: dybde i baggrunden,
 * rekvisitter der ligger bagved, og motivet stort forrest med skygge. Det er
 * forskellen på en liste og et katalog.
 *
 * Billederne er almindelige <img> med lazy loading — 102 SVG'er på 684 KB i
 * alt, og kun dem der er på skærmen bliver hentet.
 */
export function GameTile({
  game,
  size = 'md',
  badge,
  className,
}: {
  game: Game;
  size?: 'sm' | 'md' | 'lg';
  badge?: string | null;
  className?: string;
}) {
  const scene = sceneFor(game);

  const box =
    size === 'lg'
      ? 'w-[15.5rem] aspect-[16/10]'
      : size === 'sm'
        ? 'w-[8.5rem] aspect-[4/5]'
        : 'w-[11rem] aspect-[4/5]';

  return (
    <Link
      href={game.route ?? `/spil/${game.id}`}
      aria-label={game.name}
      className={cn('play-tile group relative block shrink-0 overflow-hidden', box, className)}
      style={{ background: `linear-gradient(150deg, ${scene.from}, ${scene.to})` }}
    >
      {/* Lyset øverst til venstre, som giver fladen form. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-6 -top-10 h-32 w-32 rounded-full opacity-55 blur-2xl"
        style={{ background: scene.glow }}
      />

      {scene.props.map((prop, i) => (
        <img
          key={i}
          src={prop.src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="pointer-events-none absolute select-none"
          style={{
            left: `${prop.x}%`,
            top: `${prop.y}%`,
            width: `${prop.size}%`,
            opacity: prop.opacity,
            transform: `rotate(${prop.rotate}deg)`,
          }}
        />
      ))}

      <img
        src={scene.hero}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className={cn(
          'pointer-events-none absolute select-none drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]',
          'transition-transform duration-300 group-active:scale-95',
          size === 'lg' ? 'right-3 top-2 w-[42%]' : 'right-2 top-3 w-[52%]',
        )}
      />

      {badge ? (
        <span className="absolute left-2.5 top-2.5 rounded-full bg-black/35 px-2 py-0.5 text-[10.5px] font-bold text-white backdrop-blur-sm">
          {badge}
        </span>
      ) : null}

      {/* Teksten står på en mørkning, ikke direkte på baggrunden, så den er
          læsbar uanset hvilken farve kategorien har fået. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%]"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.62), transparent)' }}
      />
      <span className="absolute inset-x-0 bottom-0 p-3">
        <span className="block text-[14px] font-bold leading-tight tracking-tight text-white drop-shadow">
          {game.name}
        </span>
        {size !== 'sm' ? (
          <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-white/80">
            {game.tagline}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
