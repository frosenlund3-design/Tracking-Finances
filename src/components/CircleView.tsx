import { motion } from 'framer-motion'
import { useMemo, useRef, useState } from 'react'
import type { LoopNode } from '@/db/types'
import { openDescendantCount, type NodeMap } from '@/lib/nodes'
import { haptic } from '@/lib/haptics'

interface Props {
  node: LoopNode | null
  map: NodeMap
  x: number
  y: number
  r: number
  isCenter?: boolean
  overflowCount?: number
  onTap: () => void
  onLongPress?: () => void
  /** Returns true when the gesture was a pan, so the tap should be ignored. */
  wasPanning?: () => boolean
  reduced: boolean
}

const AREA_TINT: Record<string, string> = {
  work: 'rgb(var(--c-accent) / 0.14)',
  home: 'rgb(var(--c-warm) / 0.16)',
  family: 'rgb(var(--c-calm) / 0.16)',
  personal: 'rgb(var(--c-accent) / 0.10)',
  money: 'rgb(var(--c-warm) / 0.10)',
  health: 'rgb(var(--c-calm) / 0.12)',
  admin: 'rgb(var(--c-faint) / 0.14)',
  other: 'rgb(var(--c-line) / 0.55)',
}

/** One circle. Also renders the "+N flere" bucket when `node` is null. */
export function CircleView({
  node,
  map,
  x,
  y,
  r,
  isCenter,
  overflowCount,
  onTap,
  onLongPress,
  wasPanning,
  reduced,
}: Props) {
  const timer = useRef<number | null>(null)
  const [pressed, setPressed] = useState(false)

  const openCount = node ? openDescendantCount(map, node.id) : 0
  const stepsDone = node?.steps.filter((s) => s.done).length ?? 0
  const stepProgress = node?.steps.length ? stepsDone / node.steps.length : 0

  const label = node ? node.title : `+${overflowCount} flere`
  const fontSize = useMemo(() => {
    return isCenter ? 17 : r > 46 ? 14 : r > 36 ? 12.5 : 11.5
  }, [isCenter, r])

  const startPress = () => {
    if (!onLongPress) return
    timer.current = window.setTimeout(() => {
      haptic('step')
      onLongPress()
      timer.current = null
    }, 480)
    setPressed(true)
  }
  const endPress = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    setPressed(false)
  }

  const tint = node ? AREA_TINT[node.area] ?? AREA_TINT.other : AREA_TINT.other

  return (
    <motion.button
      layoutId={node ? `circle-${node.id}` : 'circle-overflow'}
      layout
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: pressed ? 0.95 : 1 }}
      exit={{ opacity: 0, scale: 0.55 }}
      transition={
        reduced
          ? { duration: 0.15 }
          : { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 }
      }
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      onClick={() => {
        if (wasPanning?.()) return
        haptic('tap')
        onTap()
      }}
      onContextMenu={(e) => e.preventDefault()}
      className="focus-ring absolute grid place-items-center rounded-full"
      style={{
        left: x,
        top: y,
        width: r * 2,
        height: r * 2,
        marginLeft: -r,
        marginTop: -r,
        background: `radial-gradient(circle at 32% 28%, rgb(var(--c-raised)), rgb(var(--c-surface)) 62%), ${tint}`,
        backgroundBlendMode: 'multiply',
        boxShadow: isCenter
          ? '0 3px 10px rgb(60 46 34 / 0.07), 0 26px 60px -22px rgb(60 46 34 / 0.30)'
          : '0 2px 6px rgb(60 46 34 / 0.05), 0 12px 30px -14px rgb(60 46 34 / 0.24)',
        border: '1px solid rgb(var(--c-line))',
        touchAction: 'none',
      }}
      aria-label={node ? `${node.title}${openCount ? `, ${openCount} åbne loops` : ''}` : `Vis ${overflowCount} flere`}
    >
      {/* Progress ring for a task that is partly done. */}
      {stepProgress > 0 && (
        <svg className="absolute inset-0 -rotate-90 pointer-events-none" width={r * 2} height={r * 2}>
          <circle
            cx={r}
            cy={r}
            r={r - 3}
            fill="none"
            stroke="rgb(var(--c-accent))"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${stepProgress * 2 * Math.PI * (r - 3)} ${2 * Math.PI * (r - 3)}`}
            opacity={0.85}
          />
        </svg>
      )}

      <div className="px-1.5 text-center leading-[1.15]" style={{ maxWidth: r * 1.94 }}>
        <div
          className="font-medium tracking-[-0.01em]"
          style={{
            fontSize,
            display: '-webkit-box',
            WebkitLineClamp: isCenter ? 3 : r > 32 ? 3 : 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            // Break between words, and only inside a word as a last resort —
            // "Skri v…" is worse than "Skriv notat…".
            overflowWrap: 'break-word',
            hyphens: 'auto',
          }}
        >
          {label}
        </div>
        {isCenter && openCount > 0 && (
          <div className="mt-1 text-[11px] text-muted">{openCount} åbne</div>
        )}
        {!isCenter && node && openCount > 0 && r > 36 && (
          <div className="mt-0.5 text-[10.5px] text-faint">{openCount}</div>
        )}
      </div>

      {node?.status === 'active' && (
        <span className="absolute -top-0.5 right-2 h-2.5 w-2.5 rounded-full bg-calm shadow" aria-hidden />
      )}
    </motion.button>
  )
}
