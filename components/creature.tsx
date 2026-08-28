import { cn } from '@/lib/cn';
import { creature as lookup, type Creature } from '@/lib/creatures';

/**
 * The cast, drawn rather than downloaded.
 *
 * Every creature is one shared body with its own accessory, so fourteen of
 * them read as one family instead of fourteen pieces of clip art — and
 * because it is all inline SVG derived from a single hue, nothing can fail to
 * load, nothing needs a licence, and each one costs a few hundred bytes.
 */

function palette(hue: number) {
  return {
    body: `hsl(${hue} 74% 62%)`,
    shade: `hsl(${hue} 66% 47%)`,
    light: `hsl(${hue} 90% 80%)`,
    ink: `hsl(${hue} 45% 18%)`,
  };
}

export function CreatureArt({
  creature,
  className,
  idle = true,
}: {
  creature: Creature;
  className?: string;
  idle?: boolean;
}) {
  const c = palette(creature.hue);
  const id = `cr-${creature.key}`;

  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={creature.name}
      className={cn(idle && 'creature-idle', className)}
    >
      <defs>
        <radialGradient id={`${id}-body`} cx="35%" cy="28%" r="82%">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="60%" stopColor={c.body} />
          <stop offset="100%" stopColor={c.shade} />
        </radialGradient>
      </defs>

      <ellipse cx="50" cy="90" rx="26" ry="5" fill={c.ink} opacity="0.16" />

      {/* One body for all of them: a squircle that reads as soft at any size. */}
      <path
        d="M50 14c22 0 33 13 33 33 0 21-12 37-33 37S17 68 17 47C17 27 28 14 50 14Z"
        fill={`url(#${id}-body)`}
      />

      <Accessory creature={creature} c={c} />

      {/* Eyes last, so nothing ever draws over the face. */}
      <ellipse cx="40" cy="46" rx="8.5" ry="9.5" fill="#fff" />
      <ellipse cx="62" cy="46" rx="8.5" ry="9.5" fill="#fff" />
      <ellipse cx="41.5" cy="48" rx="4.2" ry="4.8" fill={c.ink} />
      <ellipse cx="63.5" cy="48" rx="4.2" ry="4.8" fill={c.ink} />
      <circle cx="39.6" cy="45.4" r="1.7" fill="#fff" />
      <circle cx="61.6" cy="45.4" r="1.7" fill="#fff" />
      <path
        d="M44 63c3.4 3.4 8.6 3.4 12 0"
        fill="none"
        stroke={c.ink}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  );
}

type Pal = ReturnType<typeof palette>;

/** The one thing that makes each creature itself. */
function Accessory({ creature, c }: { creature: Creature; c: Pal }) {
  switch (creature.key) {
    case 'streg':
      return (
        <g fill={c.ink} opacity="0.8">
          <rect x="30" y="22" width="3" height="12" rx="1.5" />
          <rect x="36" y="22" width="2" height="12" rx="1" />
          <rect x="41" y="22" width="4" height="12" rx="2" />
          <rect x="48" y="22" width="2" height="12" rx="1" />
          <rect x="53" y="22" width="3" height="12" rx="1.5" />
          <rect x="59" y="22" width="2" height="12" rx="1" />
          <rect x="64" y="22" width="4" height="12" rx="2" />
        </g>
      );
    case 'frost':
      return (
        <g stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity="0.92">
          <path d="M50 10v18M42 14l8 6 8-6M50 28 42 24M50 28l8-4" />
          <path d="M22 62h-8M78 62h8" opacity="0.6" />
        </g>
      );
    case 'krumme':
      return (
        <g fill={c.shade} opacity="0.85">
          <circle cx="30" cy="70" r="3.4" />
          <circle cx="70" cy="72" r="2.6" />
          <circle cx="50" cy="78" r="2.2" />
        </g>
      );
    case 'panden':
      return (
        <g>
          <rect x="20" y="18" width="60" height="8" rx="4" fill={c.shade} />
          <rect x="76" y="14" width="18" height="6" rx="3" fill={c.ink} opacity="0.7" />
          <path
            d="M40 12c0-4 6-4 6-8M54 12c0-4 6-4 6-8"
            fill="none"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinecap="round"
            opacity="0.5"
          />
        </g>
      );
    case 'gulerod':
      return (
        <g>
          <path d="M50 6c-4 6-6 10-6 14h12c0-4-2-8-6-14Z" fill="hsl(140 55% 45%)" />
          <path d="M44 20h12l-2 8H46Z" fill={c.shade} />
        </g>
      );
    case 'skrald':
      return (
        <g>
          <rect x="28" y="16" width="44" height="7" rx="3.5" fill={c.shade} />
          <rect x="44" y="10" width="12" height="6" rx="3" fill={c.ink} opacity="0.6" />
          <path
            d="M38 70v8M50 72v8M62 70v8"
            stroke="#fff"
            strokeWidth="2.6"
            strokeLinecap="round"
            opacity="0.45"
          />
        </g>
      );
    case 'pap':
      return (
        <g fill="none" stroke={c.ink} strokeWidth="2.4" opacity="0.5">
          <path d="M24 34h52M50 34v46" />
          <path d="M32 24l8 10M68 24l-8 10" strokeLinecap="round" />
        </g>
      );
    case 'glasse':
      return (
        <g>
          <path d="M38 12h24l-4 16H42Z" fill="#fff" opacity="0.5" />
          <path d="M42 28h16v6H42Z" fill="#fff" opacity="0.3" />
        </g>
      );
    case 'ur':
      return (
        <g>
          <circle cx="50" cy="38" r="15" fill="#fff" opacity="0.92" />
          <path
            d="M50 30v8l6 4"
            fill="none"
            stroke={c.ink}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      );
    case 'boble':
      return (
        <g fill="#fff">
          <circle cx="26" cy="26" r="7" opacity="0.55" />
          <circle cx="74" cy="30" r="5" opacity="0.45" />
          <circle cx="66" cy="18" r="3.4" opacity="0.7" />
          <circle cx="24" cy="23" r="2" opacity="0.9" />
        </g>
      );
    case 'vaegt':
      return (
        <g fill={c.ink} opacity="0.72">
          <rect x="16" y="60" width="9" height="18" rx="3.5" />
          <rect x="75" y="60" width="9" height="18" rx="3.5" />
          <rect x="24" y="66" width="52" height="6" rx="3" />
        </g>
      );
    case 'moent':
      return (
        <g>
          <circle cx="50" cy="32" r="14" fill="hsl(48 90% 62%)" />
          <circle cx="50" cy="32" r="10" fill="none" stroke="hsl(40 70% 40%)" strokeWidth="1.8" />
          <text
            x="50"
            y="37"
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="hsl(40 70% 32%)"
            fontFamily="ui-sans-serif, sans-serif"
          >
            kr
          </text>
        </g>
      );
    case 'stjerne':
      return (
        <g>
          <path
            d="m50 4 5.6 11.8L68 17.6l-9 9 2.2 12.6L50 33.4l-11.2 5.8L41 26.6l-9-9 12.4-1.8Z"
            fill="hsl(48 100% 66%)"
            stroke="hsl(40 90% 48%)"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <g fill="#fff" opacity="0.85">
            <circle cx="20" cy="30" r="2.4" />
            <circle cx="82" cy="38" r="1.8" />
            <circle cx="76" cy="22" r="1.4" />
          </g>
        </g>
      );
    default:
      // Prik, and anything new before it gets its own accessory.
      return <circle cx="50" cy="24" r="5" fill="#fff" opacity="0.5" />;
  }
}

/** Renders by key, so callers can hold a string. */
export function CreatureByKey({
  keyName,
  className,
  idle,
}: {
  keyName: string;
  className?: string;
  idle?: boolean;
}) {
  const found = lookup(keyName);
  if (!found) return null;
  return <CreatureArt creature={found} className={className} idle={idle} />;
}

/** The silhouette shown for one you have not met yet. */
export function CreatureLocked({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <ellipse cx="50" cy="90" rx="24" ry="4.5" fill="currentColor" opacity="0.1" />
      <path
        d="M50 14c22 0 33 13 33 33 0 21-12 37-33 37S17 68 17 47C17 27 28 14 50 14Z"
        fill="currentColor"
        opacity="0.13"
      />
      <text
        x="50"
        y="62"
        textAnchor="middle"
        fontSize="30"
        fontWeight="700"
        fill="currentColor"
        opacity="0.3"
        fontFamily="ui-sans-serif, sans-serif"
      >
        ?
      </text>
    </svg>
  );
}
