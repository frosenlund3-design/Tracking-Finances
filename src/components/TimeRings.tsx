import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import {
  DAYS_SHORT_DA, MONTHS_DA, PARTS, PART_LABELS, addDays, daysOfWeek, isoDate, isoWeek,
  startOfWeek, weeksInMonth,
} from '@/lib/time'
import type { LoopNode, TimePart } from '@/db/types'
import { isOpen } from '@/lib/nodes'
import { haptic } from '@/lib/haptics'
import { Sheet } from './ui/Sheet'
import { humanMinutes } from '@/lib/time'

type Level = 'year' | 'month' | 'week' | 'day'

interface Ring {
  key: string
  label: string
  sub?: string
  count: number
  onTap: () => void
  highlight?: boolean
}

/**
 * Time as circles, not a grid.
 *
 * Year → months → weeks → days → parts of day, each level a ring you zoom
 * into. Scheduling stays entirely optional: a loop can live only in the
 * circle map and never touch this screen at all.
 */
export function TimeRings() {
  const nodes = useStore((s) => s.nodes)
  const reduced = useStore((s) => s.prefs.reducedStimulation)
  const [level, setLevel] = useState<Level>('week')
  const [cursor, setCursor] = useState(new Date())
  const [openPart, setOpenPart] = useState<{ date: string; part: TimePart } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scheduled = useMemo(() => {
    const byDate = new Map<string, LoopNode[]>()
    for (const n of nodes) {
      if (!n.scheduledDate || !isOpen(n)) continue
      const list = byDate.get(n.scheduledDate) ?? []
      list.push(n)
      byDate.set(n.scheduledDate, list)
    }
    return byDate
  }, [nodes])

  const todayIso = isoDate(new Date())

  const { centerLabel, centerSub, rings, canGoUp } = useMemo(() => {
    const countInRange = (from: Date, to: Date): number => {
      let total = 0
      for (const [iso, list] of scheduled) {
        const d = new Date(iso)
        if (d >= from && d <= to) total += list.length
      }
      return total
    }

    if (level === 'year') {
      const y = cursor.getFullYear()
      return {
        centerLabel: String(y),
        centerSub: `${countInRange(new Date(y, 0, 1), new Date(y, 11, 31))} planlagt`,
        canGoUp: false,
        rings: MONTHS_DA.map((m, i) => ({
          key: m,
          label: m.slice(0, 3),
          count: countInRange(new Date(y, i, 1), new Date(y, i + 1, 0)),
          highlight: i === new Date().getMonth() && y === new Date().getFullYear(),
          onTap: () => {
            setCursor(new Date(y, i, 1))
            setLevel('month')
          },
        })) as Ring[],
      }
    }

    if (level === 'month') {
      const y = cursor.getFullYear()
      const m = cursor.getMonth()
      const weeks = weeksInMonth(y, m)
      return {
        centerLabel: MONTHS_DA[m],
        centerSub: String(y),
        canGoUp: true,
        rings: weeks.map((w) => ({
          key: `w${w.week}-${w.start.getTime()}`,
          label: `Uge ${w.week}`,
          count: countInRange(w.start, addDays(w.start, 6)),
          highlight: isoWeek(new Date()) === w.week,
          onTap: () => {
            setCursor(w.start)
            setLevel('week')
          },
        })) as Ring[],
      }
    }

    if (level === 'week') {
      const start = startOfWeek(cursor)
      const days = daysOfWeek(start)
      return {
        centerLabel: `Uge ${isoWeek(start)}`,
        centerSub: MONTHS_DA[start.getMonth()],
        canGoUp: true,
        rings: days.map((d) => ({
          key: isoDate(d),
          label: DAYS_SHORT_DA[d.getDay()],
          sub: String(d.getDate()),
          count: (scheduled.get(isoDate(d)) ?? []).length,
          highlight: isoDate(d) === todayIso,
          onTap: () => {
            setCursor(d)
            setLevel('day')
          },
        })) as Ring[],
      }
    }

    const iso = isoDate(cursor)
    const dayTasks = scheduled.get(iso) ?? []
    return {
      centerLabel: DAYS_SHORT_DA[cursor.getDay()] === 'Ons' ? 'Onsdag' : fullDay(cursor),
      centerSub: `${cursor.getDate()}. ${MONTHS_DA[cursor.getMonth()].toLowerCase()}`,
      canGoUp: true,
      rings: PARTS.map((p) => ({
        key: p,
        label: PART_LABELS[p],
        count: dayTasks.filter((t) => t.scheduledPart === p).length,
        onTap: () => setOpenPart({ date: iso, part: p }),
      })) as Ring[],
    }
  }, [level, cursor, scheduled, todayIso])

  const goUp = () => {
    haptic('soft')
    setLevel(level === 'day' ? 'week' : level === 'week' ? 'month' : 'year')
  }

  const cx = size.w / 2
  const cy = size.h / 2
  const centerR = Math.min(size.w, size.h) * 0.16
  const ringR = Math.min(size.w, size.h) / 2 - 58
  const itemR = Math.max(26, Math.min(40, (ringR * Math.sin(Math.PI / Math.max(rings.length, 3))) - 8))

  const partTasks = openPart ? (scheduled.get(openPart.date) ?? []).filter((t) => t.scheduledPart === openPart.part) : []

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-4 pt-safe">
        <div className="pointer-events-auto flex items-center gap-2 py-2">
          {canGoUp && (
            <button
              onClick={goUp}
              aria-label="Ud"
              className="focus-ring grid h-11 w-11 place-items-center rounded-full bg-surface/80 backdrop-blur text-muted shadow-soft active:scale-95"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <div className="flex gap-1">
            {(['year', 'month', 'week', 'day'] as Level[]).map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`focus-ring flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-3.5 text-[12.5px] ${
                  level === l ? 'bg-accent-soft font-medium' : 'text-faint'
                }`}
              >
                {l === 'year' ? 'År' : l === 'month' ? 'Måned' : l === 'week' ? 'Uge' : 'Dag'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div ref={containerRef} className="h-full w-full">
        {size.w > 0 && (
          <AnimatePresence mode="popLayout">
            <motion.div
              key={`${level}-${isoDate(cursor)}`}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.06 }}
              transition={reduced ? { duration: 0.15 } : { type: 'spring', stiffness: 220, damping: 28 }}
              className="relative h-full w-full"
            >
              <div
                className="absolute grid place-items-center rounded-full border border-line bg-surface shadow-node"
                style={{ left: cx, top: cy, width: centerR * 2, height: centerR * 2, marginLeft: -centerR, marginTop: -centerR }}
              >
                <div className="text-center">
                  <p className="text-[17px] font-semibold tracking-[-0.02em]">{centerLabel}</p>
                  {centerSub && <p className="mt-0.5 text-[12px] text-faint">{centerSub}</p>}
                </div>
              </div>

              {rings.map((r, i) => {
                const angle = -Math.PI / 2 + (i / rings.length) * Math.PI * 2
                return (
                  <button
                    key={r.key}
                    onClick={() => {
                      haptic('tap')
                      r.onTap()
                    }}
                    className={`focus-ring absolute grid place-items-center rounded-full border shadow-soft active:scale-95 transition ${
                      r.highlight ? 'border-ink/25 bg-accent-soft' : 'border-line bg-surface'
                    }`}
                    style={{
                      left: cx + Math.cos(angle) * ringR,
                      top: cy + Math.sin(angle) * ringR,
                      width: itemR * 2,
                      height: itemR * 2,
                      marginLeft: -itemR,
                      marginTop: -itemR,
                    }}
                  >
                    <span className="text-center leading-tight">
                      <span className="block text-[12.5px] font-medium">{r.label}</span>
                      {r.sub && <span className="block text-[11px] text-faint">{r.sub}</span>}
                      {r.count > 0 && (
                        <span className="mt-0.5 block text-[11px] text-accent">{r.count}</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <p className="pointer-events-none absolute inset-x-0 bottom-24 px-8 text-center text-[12.5px] leading-relaxed text-faint">
        Tid er valgfrit her. Ting behøver ikke ligge på en dag for at blive lavet.
      </p>

      <Sheet
        open={!!openPart}
        onClose={() => setOpenPart(null)}
        title={openPart ? PART_LABELS[openPart.part] : ''}
      >
        <TimeSlot tasks={partTasks} date={openPart?.date} part={openPart?.part} onDone={() => setOpenPart(null)} />
      </Sheet>
    </div>
  )
}

function TimeSlot({
  tasks,
  date,
  part,
  onDone,
}: {
  tasks: LoopNode[]
  date?: string
  part?: TimePart
  onDone: () => void
}) {
  const openOverlay = useStore((s) => s.openOverlay)
  const nodes = useStore((s) => s.nodes)
  const map = useStore((s) => s.map)
  const schedule = useStore((s) => s.schedule)
  const [picking, setPicking] = useState(false)

  const unscheduled = nodes.filter(
    (n) => isOpen(n) && !n.isArea && !n.scheduledDate && n.childIds.filter((c) => map[c] && isOpen(map[c])).length === 0,
  )

  return (
    <div className="pb-6">
      {tasks.length === 0 && !picking && (
        <p className="py-6 text-center text-[15px] text-muted">Der ligger ikke noget her.</p>
      )}

      <div className="space-y-2">
        {tasks.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              onDone()
              openOverlay({ kind: 'start', nodeId: t.id })
            }}
            className="focus-ring flex w-full items-center justify-between rounded-xl2 border border-line bg-surface px-4 py-3.5 text-left active:scale-[0.99]"
          >
            <span className="min-w-0 flex-1 truncate text-[15px]">{t.title}</span>
            <span className="ml-3 shrink-0 text-[12.5px] text-faint">{humanMinutes(t.estimatedMinutes)}</span>
          </button>
        ))}
      </div>

      {picking ? (
        <div className="mt-4 space-y-2">
          <p className="text-[13px] text-faint">Vælg noget, du gerne vil lægge her:</p>
          {unscheduled.slice(0, 20).map((n) => (
            <button
              key={n.id}
              onClick={async () => {
                await schedule(n.id, date, part)
                setPicking(false)
              }}
              className="focus-ring w-full rounded-xl2 border border-line bg-surface px-4 py-3.5 text-left text-[15px] active:scale-[0.99]"
            >
              {n.title}
            </button>
          ))}
          {unscheduled.length === 0 && <p className="py-4 text-center text-[14px] text-faint">Der er ikke noget at lægge her.</p>}
        </div>
      ) : (
        <button
          onClick={() => setPicking(true)}
          className="focus-ring mt-4 min-h-[50px] w-full rounded-xl2 border border-line bg-surface text-[15px] text-muted active:scale-[0.99]"
        >
          Læg noget her
        </button>
      )}
    </div>
  )
}

function fullDay(d: Date): string {
  const names = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag']
  return names[d.getDay()]
}
