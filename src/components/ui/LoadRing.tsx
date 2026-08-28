import { motion } from 'framer-motion'

interface Props {
  /** 0–100 */
  percent: number
  size?: number
  /** Small dots around the ring, one per open loop. */
  loops?: number
  label?: string
  sublabel?: string
  onClick?: () => void
}

/**
 * The mental-load ring.
 *
 * Deliberately not a red alarm gauge: the arc is warm at every value, and the
 * colour shifts from calm green through taupe to a soft plum — never to red.
 */
export function LoadRing({ percent, size = 168, loops = 0, label, sublabel, onClick }: Props) {
  const stroke = 10
  const r = (size - stroke) / 2 - 10
  const c = 2 * Math.PI * r
  const dash = (Math.min(100, Math.max(0, percent)) / 100) * c
  const dotCount = Math.min(loops, 24)

  const hue = percent < 35 ? 'var(--ring-calm)' : percent < 70 ? 'var(--ring-mid)' : 'var(--ring-high)'

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="focus-ring relative grid place-items-center rounded-full disabled:cursor-default"
      style={
        {
          width: size,
          height: size,
          ['--ring-calm' as string]: 'rgb(var(--c-calm))',
          ['--ring-mid' as string]: 'rgb(var(--c-warm))',
          ['--ring-high' as string]: 'rgb(var(--c-accent))',
        } as React.CSSProperties
      }
      aria-label={label ? `${label}: ${percent}%` : undefined}
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--c-line))" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={hue}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          initial={false}
          animate={{ strokeDasharray: `${dash} ${c}` }}
          transition={{ type: 'spring', stiffness: 90, damping: 20 }}
        />
      </svg>

      {/* One faint dot per open loop, sitting just outside the ring. */}
      <svg width={size} height={size} className="absolute inset-0 pointer-events-none">
        {Array.from({ length: dotCount }).map((_, i) => {
          const angle = (i / Math.max(dotCount, 1)) * Math.PI * 2 - Math.PI / 2
          const rr = r + stroke / 2 + 7
          return (
            <circle
              key={i}
              cx={size / 2 + Math.cos(angle) * rr}
              cy={size / 2 + Math.sin(angle) * rr}
              r={2.4}
              fill="rgb(var(--c-faint))"
              opacity={0.75}
            />
          )
        })}
      </svg>

      <div className="relative text-center">
        <div className="text-[34px] font-semibold tracking-[-0.03em] leading-none">{percent}%</div>
        {label && <div className="mt-1.5 text-[11px] uppercase tracking-[0.14em] text-faint">{label}</div>}
        {sublabel && <div className="mt-1 text-[13px] text-muted">{sublabel}</div>}
      </div>
    </button>
  )
}
