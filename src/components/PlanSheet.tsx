import { motion } from 'framer-motion'
import { CalendarCheck, Info, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useStore, useCalibration } from '@/store/useStore'
import { buildPlan, partName, type PlannedItem } from '@/lib/planner'
import { relativeDay, humanMinutes } from '@/lib/time'
import { calibratedMinutes } from '@/lib/calibration'
import { Button } from './ui/Button'

/**
 * "Fordel dem for mig".
 *
 * A proposal, never an action. The app works out when each loop actually fits
 * — opening hours, her energy peak, the deadline, what is already booked — and
 * then shows its reasoning and waits. She can drop any single line before
 * saying yes.
 *
 * Most loops are deliberately left unplaced. A full week is the calendar she
 * already refuses to use.
 */
export function PlanSheet() {
  const map = useStore((s) => s.map)
  const profile = useStore((s) => s.profile)
  const schedule = useStore((s) => s.schedule)
  const close = useStore((s) => s.closeOverlay)
  const cal = useCalibration()

  const initial = useMemo(
    () => buildPlan(map, { profile, calibration: cal }),
    [map, profile, cal],
  )
  const [items, setItems] = useState<PlannedItem[]>(initial.items)
  const [saved, setSaved] = useState(false)

  const byDay = useMemo(() => {
    const groups = new Map<string, PlannedItem[]>()
    for (const item of items) {
      const list = groups.get(item.date) ?? []
      list.push(item)
      groups.set(item.date, list)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [items])

  const apply = async () => {
    for (const item of items) await schedule(item.node.id, item.date, item.part)
    setSaved(true)
  }

  if (saved) {
    return (
      <div className="py-14 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-calm/15">
          <CalendarCheck size={26} className="text-calm" />
        </div>
        <p className="mt-5 text-[20px] font-semibold tracking-[-0.02em]">Lagt ind</p>
        <p className="mx-auto mt-2 max-w-[18rem] text-[15px] leading-relaxed text-muted">
          {items.length} {items.length === 1 ? 'ting har' : 'ting har'} fået et tidspunkt. Du kan
          flytte eller fjerne dem når som helst — intet er låst.
        </p>
        <div className="mx-auto mt-7 max-w-[16rem]">
          <Button full onClick={close}>
            Okay
          </Button>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-[18px] font-semibold tracking-[-0.02em]">Der er ikke noget at fordele</p>
        <p className="mx-auto mt-2.5 max-w-[19rem] text-[15px] leading-relaxed text-muted">
          Enten ligger dine loops allerede på en dag, eller også er der ikke nogen af dem, hvor et
          bestemt tidspunkt ville gøre det nemmere.
        </p>
      </div>
    )
  }

  return (
    <div className="pb-6">
      <p className="text-[14.5px] leading-relaxed text-muted">
        Jeg har kigget på åbningstider, hvornår du har energi, og hvad der har en frist. Sådan her
        ville jeg lægge dem:
      </p>

      <div className="mt-5 space-y-5">
        {byDay.map(([date, dayItems]) => (
          <div key={date}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
              {relativeDay(date)}
            </p>
            <div className="mt-2.5 space-y-2">
              {dayItems.map((item) => (
                <motion.div
                  key={item.node.id}
                  layout
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-3 rounded-xl2 border border-line bg-surface p-4"
                >
                  <span className="mt-0.5 w-[86px] shrink-0 text-[12.5px] font-medium text-muted">
                    {partName(item.part)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium leading-snug">{item.node.title}</span>
                    <span className="mt-0.5 block text-[12.5px] text-faint">
                      {humanMinutes(calibratedMinutes(item.node.estimatedMinutes, cal))} · {item.reason}
                    </span>
                  </span>
                  <button
                    onClick={() => setItems(items.filter((i) => i.node.id !== item.node.id))}
                    className="focus-ring -mr-1 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-[12px] text-faint"
                    aria-label={`Fjern ${item.node.title} fra forslaget`}
                  >
                    Fjern
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-start gap-2.5 rounded-xl2 bg-canvas p-4">
        <Info size={14} className="mt-0.5 shrink-0 text-faint" />
        <p className="text-[12px] leading-relaxed text-faint">
          Resten af dine loops får med vilje ikke et tidspunkt. En fyldt uge er lige præcis den
          kalender, der ikke virker for dig — det her er kun de ting, hvor tidspunktet faktisk gør
          en forskel.
        </p>
      </div>

      <div className="mt-5">
        <Button full onClick={apply}>
          <Sparkles size={16} className="mr-2 -mt-0.5 inline" />
          Læg dem ind
        </Button>
      </div>
    </div>
  )
}
