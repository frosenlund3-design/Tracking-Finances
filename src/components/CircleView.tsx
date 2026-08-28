import { motion } from 'framer-motion'
import { useMemo, useRef, useState } from 'react'
import type { LoopNode } from '@/db/types'
import { depthBelow, openDescendantCount, type NodeMap } from '@/lib/nodes'
import { centerTone, toneFor, type CircleTone } from '@/lib/colors'
import { haptic } from '@/lib/haptics'

interface Props {
  node: LoopNode | null
  map: NodeMap
  x: number
  y: number
  r: number
  isCenter?: boolean
  /** Direction from the centre, in radians, the chain walks along it. */
  angle?: number
  overflowCount?: number
  onTap: () => void
  onLongPress?: () => void
  /** Returns true when the gesture was a pan, so the tap should be ignored. */
  wasPanning?: () => boolean
  reduced: boolean
  dark: boolean
}

/**
 * One circle.
 *
 * No outline: the shape is defined by a soft gradient fill that fades from a
 * light tone into the base, with the shadow tinted to match. Inside sit the
 * nested levels as progressively smaller, progressively lighter circles, so
 * you can see how deep a thing goes before you enter it.
 *
 * Those inner circles are deliberately inert. You step inward one level per
 * tap; you cannot reach past the circle you are looking at.
 */
export function CircleView({
  node,
  map,
  x,
  y,
  r,
  isCenter,
  angle = 0,
  overflowCount,
  onTap,
  onLongPress,
  wasPanning,
  reduced,
  dark,
}: Props) {
  const timer = useRef<number | null>(null)
  const [pressed, setPressed] = useState(false)

  const openCount = node ? openDescendantCount(map, node.id) : 0
  const stepsDone = node?.steps.filter((s) => s.done).length ?? 0
  const stepProgress = node?.steps.length ? stepsDone / node.steps.length : 0
  const depth = node ? depthBelow(map, node.id) : 0

  const tone: CircleTone = useMemo(() => {
    if (!node) return centerTone(dark)
    if (isCenter) return centerTone(dark)
    const parent = node.parentId ? map[node.parentId] : null
    const siblingIndex = parent ? Math.max(0, parent.childIds.indexOf(node.id)) : 0
    return toneFor(node.id, siblingIndex, node.parentId, dark)
  }, [node, isCenter, map, dark])

  const label = node ? node.title : `+${overflowCount} flere`
  const fontSize = isCenter ? 17 : r > 46 ? 14 : r > 36 ? 12.5 : 11.5

  const startPress = () => {
    if (!onLongPress) return
    timer.current = window.setTimeout(() => {
      haptic('step')
      onLongPress()
      timer.current = null
    }, 460)
    setPressed(true)
  }
  const endPress = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    setPressed(false)
  }

  /**
   * The chain outward: one bead per level beneath this circle, each smaller
   * than the last. It says the thing she needs to believe before she can
   * start, that this gets smaller and smaller, and the last one is tiny.
   *
   * The beads are deliberately inert. You still step inward one circle per
   * tap; the chain shows how far down it goes, it is not a shortcut past the
   * levels in between.
   */
  const chain = Array.from({ length: depth }, (_, i) => ({
    r: r * [0.3, 0.18, 0.11][i],
    // Each bead sits just outside the previous one, walking away from centre.
    gap: [1.16, 1.56, 1.82][i],
    tone: tone.nested[i],
  }))

  return (
    <>
      {/* The trail of ever-smaller circles heading away from centre. */}
      {!isCenter &&
        chain.map((bead, i) => (
          <motion.span
            key={`bead-${i}`}
            aria-hidden
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={
              reduced
                ? { duration: 0.12 }
                : { type: 'spring', stiffness: 400, damping: 34, delay: 0.03 * (i + 1) }
            }
            className="pointer-events-none absolute rounded-full"
            style={{
              left: x + Math.cos(angle) * r * bead.gap,
              top: y + Math.sin(angle) * r * bead.gap,
              width: bead.r * 2,
              height: bead.r * 2,
              marginLeft: -bead.r,
              marginTop: -bead.r,
              background: bead.tone,
              boxShadow: `0 1px 4px ${tone.shadow}`,
            }}
          />
        ))}

    <motion.button
      layoutId={node ? `circle-${node.id}` : 'circle-overflow'}
      data-node-id={node?.id}
      layout
      initial={{ opacity: 0, scale: 0.72 }}
      animate={{ opacity: 1, scale: pressed ? 0.94 : 1 }}
      exit={{ opacity: 0, scale: 0.6 }}
      transition={
        reduced
          ? { duration: 0.14 }
          : { type: 'spring', stiffness: 420, damping: 36, mass: 0.7 }
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
      className="absolute grid place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-4"
      style={{
        left: x,
        top: y,
        width: r * 2,
        height: r * 2,
        marginLeft: -r,
        marginTop: -r,
        background: `linear-gradient(148deg, ${tone.from} 0%, ${tone.to} 100%)`,
        boxShadow: isCenter
          ? `0 2px 8px ${tone.shadow}, 0 24px 56px -20px ${tone.shadow}`
          : `0 1px 5px ${tone.shadow}, 0 14px 32px -14px ${tone.shadow}`,
        color: tone.text,
        touchAction: 'none',
      }}
      aria-label={
        node
          ? `${node.title}${openCount ? `, ${openCount} åbne loops` : ''}${depth ? `, ${depth} ${depth === 1 ? 'niveau' : 'niveauer'} indeni` : ''}`
          : `Vis ${overflowCount} flere`
      }
    >
      {/* Progress on a task that is partly done. */}
      {stepProgress > 0 && (
        <svg className="pointer-events-none absolute inset-0 -rotate-90" width={r * 2} height={r * 2}>
          <circle
            cx={r}
            cy={r}
            r={r - 2.5}
            fill="none"
            stroke={tone.text}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={`${stepProgress * 2 * Math.PI * (r - 2.5)} ${2 * Math.PI * (r - 2.5)}`}
            opacity={0.45}
          />
        </svg>
      )}

      <span className="relative px-1.5 text-center leading-[1.15]" style={{ maxWidth: r * 1.94 }}>
        <span
          className="block font-medium tracking-[-0.01em]"
          style={{
            fontSize,
            display: '-webkit-box',
            WebkitLineClamp: isCenter ? 3 : r > 32 ? 3 : 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            overflowWrap: 'break-word',
            hyphens: 'auto',
          }}
        >
          {label}
        </span>
        {isCenter && openCount > 0 && (
          <span className="mt-1 block text-[11px] opacity-60">{openCount} åbne</span>
        )}
        {!isCenter && node && openCount > 0 && r > 36 && (
          <span className="mt-0.5 block text-[10.5px] opacity-55">{openCount}</span>
        )}
      </span>

      {node?.status === 'active' && (
        <span
          className="absolute right-3 top-2 h-2.5 w-2.5 rounded-full"
          style={{ background: tone.text, opacity: 0.7 }}
          aria-hidden
        />
      )}
    </motion.button>
    </>
  )
}
