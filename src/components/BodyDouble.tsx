import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Button } from './ui/Button'

/**
 * Body double mode: "Bliv hos mig mens jeg gør det".
 *
 * A calm presence and one checkbox at a time. The breathing circle is the
 * whole point — it makes the screen feel occupied rather than empty.
 */
export function BodyDouble({ nodeId }: { nodeId: string }) {
  const node = useStore((s) => s.map[nodeId])
  const toggleStep = useStore((s) => s.toggleStep)
  const complete = useStore((s) => s.completeNode)
  const breakDown = useStore((s) => s.breakDown)
  const close = useStore((s) => s.closeOverlay)
  const tone = useStore((s) => s.profile.tone)
  const reduced = useStore((s) => s.prefs.reducedStimulation)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const i = window.setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => window.clearInterval(i)
  }, [])

  useEffect(() => {
    if (node && node.steps.length === 0) void breakDown(node.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId])

  if (!node) return null

  const current = node.steps.find((s) => !s.done)
  const done = node.steps.filter((s) => s.done)

  const presence =
    tone === 'blunt'
      ? 'Jeg venter her.'
      : tone === 'humor'
        ? 'Jeg sidder her og kigger (venligt).'
        : 'Jeg bliver her imens.'

  return (
    <div className="flex h-full flex-col items-center px-6 pb-6 pt-4 text-center">
      <div className="relative mb-8 mt-6 h-28 w-28">
        <motion.div
          className={`absolute inset-0 rounded-full border border-line bg-surface shadow-node ${reduced ? '' : 'breathe'}`}
        />
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-[12.5px] text-faint">
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
          </span>
        </div>
      </div>

      <p className="text-[16px] text-muted">{presence}</p>

      <div className="mt-8 w-full flex-1">
        <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Din eneste opgave</p>
        <motion.h2
          key={current?.id ?? 'done'}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto mt-3 max-w-[18rem] text-[24px] font-semibold leading-tight tracking-[-0.025em]"
        >
          {current ? current.title : node.title}
        </motion.h2>

        {done.length > 0 && (
          <ul className="mx-auto mt-7 max-w-[18rem] space-y-1.5 text-left">
            {done.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-[14px] text-faint line-through">
                <Check size={14} className="shrink-0 text-calm" />
                {s.title}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="w-full space-y-2.5">
        <Button
          full
          onClick={async () => {
            if (current) {
              await toggleStep(node.id, current.id)
              if (node.steps.filter((s) => !s.done).length === 1) {
                await complete(node.id, 'body-double')
                close()
              }
            } else {
              await complete(node.id, 'body-double')
              close()
            }
          }}
        >
          {current ? 'Gjort' : 'Færdig'}
        </Button>
        <button onClick={close} className="focus-ring min-h-[48px] w-full text-[14.5px] text-faint">
          Vi stopper her — det er fint
        </button>
      </div>
    </div>
  )
}
