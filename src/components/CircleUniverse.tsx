import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion'
import { ChevronLeft, Plus } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ROOT_ID } from '@/db/db'
import { useStore } from '@/store/useStore'
import { layoutRadial, maxVisibleFor } from '@/lib/layout'
import { pathOf, visibleChildren } from '@/lib/nodes'
import { CircleView } from './CircleView'
import { Sheet } from './ui/Sheet'
import { haptic } from '@/lib/haptics'
import { humanMinutes } from '@/lib/time'
import type { LoopNode } from '@/db/types'

/**
 * The circle universe: the app's real navigation.
 *
 * Zooming into a circle is a shared-element transition — the tapped circle
 * keeps its identity and travels to the centre while its new children unfold
 * around it. That is what makes it feel like moving inward rather than
 * changing page.
 *
 * The pan/pinch layer sits above the layout: layout decides where circles are,
 * the user decides where the camera is.
 */
export function CircleUniverse() {
  const focusId = useStore((s) => s.focusId)
  const setFocus = useStore((s) => s.setFocus)
  const map = useStore((s) => s.map)
  const openOverlay = useStore((s) => s.openOverlay)
  const density = useStore((s) => s.profile.density)
  const reduced = useStore((s) => s.prefs.reducedStimulation)

  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  // The rest of a crowded circle opens as a list. Cramming twenty circles into
  // one ring is geometrically possible and completely unreadable, and an
  // unreadable map is worse than no map.
  const [overflowList, setOverflowList] = useState<LoopNode[] | null>(null)

  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const scaleRaw = useMotionValue(1)
  const scale = useSpring(scaleRaw, { stiffness: 320, damping: 34 })

  const panned = useRef(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ dist: number; scale: number; x: number; y: number; cx: number; cy: number } | null>(null)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Recentre the camera whenever we move to another circle.
  const resetCamera = useCallback(() => {
    x.set(0)
    y.set(0)
    scaleRaw.set(1)
  }, [x, y, scaleRaw])

  useEffect(() => {
    resetCamera()
    setOverflowList(null)
  }, [focusId, resetCamera])

  const children = visibleChildren(map, focusId)
  const layout =
    size.w > 0
      ? layoutRadial(map, focusId, children, {
          width: size.w,
          height: size.h,
          maxVisible: maxVisibleFor(density),
        })
      : null

  const trail = pathOf(map, focusId)

  // --- gestures -----------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale: scaleRaw.get(),
        x: x.get(),
        y: y.get(),
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      }
    }
    panned.current = false
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size >= 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const next = clamp((dist / gesture.current.dist) * gesture.current.scale, 0.55, 2.6)
      scaleRaw.set(next)
      panned.current = true
      return
    }

    if (pointers.current.size === 1 && e.buttons !== 0) {
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      if (Math.abs(dx) + Math.abs(dy) > 2) panned.current = true
      x.set(x.get() + dx)
      y.set(y.get() + dy)
    }
  }

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) gesture.current = null
    // Let the click handler read the flag before we clear it.
    window.setTimeout(() => {
      if (pointers.current.size === 0) panned.current = false
    }, 60)
  }

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      scaleRaw.set(clamp(scaleRaw.get() * (1 - e.deltaY / 300), 0.55, 2.6))
    } else {
      x.set(x.get() - e.deltaX)
      y.set(y.get() - e.deltaY)
    }
  }

  const goUp = () => {
    const parent = map[focusId]?.parentId
    if (parent) {
      haptic('soft')
      setFocus(parent)
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Breadcrumb — discreet, as specified. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-safe">
        <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar py-2">
          {focusId !== ROOT_ID && (
            <button
              onClick={goUp}
              aria-label="Tilbage"
              className="focus-ring -ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface/80 backdrop-blur text-muted shadow-soft active:scale-95"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <div className="flex items-center gap-1 text-[12.5px] text-faint">
            {trail.map((n, i) => (
              <span key={n.id} className="flex shrink-0 items-center gap-1">
                {i > 0 && <span className="opacity-50">›</span>}
                <button
                  onClick={() => setFocus(n.id)}
                  className={`focus-ring rounded-full px-1.5 py-1 ${
                    i === trail.length - 1 ? 'text-muted font-medium' : 'hover:text-muted'
                  }`}
                >
                  {n.title}
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
        onWheel={onWheel}
        onDoubleClick={resetCamera}
      >
        <motion.div className="relative h-full w-full" style={{ x, y, scale }}>
          {layout && (
            <AnimatePresence mode="popLayout">
              <CircleView
                key={layout.center.id}
                node={layout.center.node}
                map={map}
                x={layout.center.x}
                y={layout.center.y}
                r={layout.center.r}
                isCenter
                reduced={reduced}
                wasPanning={() => panned.current}
                onTap={() => layout.center.node && openOverlay({ kind: 'node', nodeId: layout.center.id })}
                onLongPress={() => layout.center.node && openOverlay({ kind: 'node', nodeId: layout.center.id })}
              />
              {layout.children.map((p) => (
                <CircleView
                  key={p.id}
                  node={p.node}
                  map={map}
                  x={p.x}
                  y={p.y}
                  r={p.r}
                  overflowCount={p.overflow?.length}
                  reduced={reduced}
                  wasPanning={() => panned.current}
                  onTap={() => {
                    if (!p.node) {
                      setOverflowList(p.overflow ?? [])
                      return
                    }
                    const hasKids = visibleChildren(map, p.node.id).length > 0
                    if (hasKids) setFocus(p.node.id)
                    else openOverlay({ kind: 'node', nodeId: p.node.id })
                  }}
                  onLongPress={() => p.node && openOverlay({ kind: 'node', nodeId: p.node.id })}
                />
              ))}
            </AnimatePresence>
          )}

          {layout && layout.children.length === 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-x-0 text-center text-[14px] text-faint"
              style={{ top: layout.center.y + layout.center.r + 34 }}
            >
              Der er ikke noget herinde endnu.
            </motion.p>
          )}
        </motion.div>
      </div>

      <Sheet
        open={!!overflowList}
        onClose={() => setOverflowList(null)}
        title={overflowList ? `${overflowList.length} mere i ${map[focusId]?.title ?? ''}` : ''}
      >
        <div className="space-y-2 pb-6">
          {(overflowList ?? []).map((n) => {
            const hasKids = visibleChildren(map, n.id).length > 0
            return (
              <button
                key={n.id}
                onClick={() => {
                  setOverflowList(null)
                  if (hasKids) setFocus(n.id)
                  else openOverlay({ kind: 'node', nodeId: n.id })
                }}
                className="focus-ring flex w-full items-center justify-between gap-3 rounded-xl2 border border-line bg-surface px-4 py-3.5 text-left active:scale-[0.99]"
              >
                <span className="min-w-0 flex-1 truncate text-[15px]">{n.title}</span>
                <span className="shrink-0 text-[12.5px] text-faint">
                  {hasKids ? `${visibleChildren(map, n.id).length} indeni` : humanMinutes(n.estimatedMinutes)}
                </span>
              </button>
            )
          })}
        </div>
      </Sheet>

      {/* Add something inside the circle you are standing in. */}
      <button
        onClick={() => openOverlay({ kind: 'quickadd', parentId: focusId })}
        className="focus-ring absolute bottom-24 right-5 z-20 grid h-14 w-14 place-items-center rounded-full bg-ink text-canvas shadow-lift active:scale-95 transition"
        aria-label="Tilføj i denne cirkel"
      >
        <Plus size={24} />
      </button>
    </div>
  )
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}
