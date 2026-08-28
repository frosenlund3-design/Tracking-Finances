import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import { useStore, useRanked } from '@/store/useStore'
import { haptic } from '@/lib/haptics'
import { humanMinutes } from '@/lib/time'
import { Button } from './ui/Button'

/**
 * Scroll Rescue.
 *
 * HONESTY NOTE: a web app on iOS cannot block TikTok or Instagram, cannot see
 * what other apps are running, and cannot read Screen Time. Nothing here
 * pretends otherwise, this is a way *out* of the scroll, opened by the user,
 * not a blocker. The technical limit is stated in the UI rather than hidden.
 *
 * What it does do is real: break state, physical reset, then one tiny task.
 */
export function ScrollRescue() {
  const ranked = useRanked()
  const openOverlay = useStore((s) => s.openOverlay)
  const award = useStore((s) => s.award)
  const close = useStore((s) => s.closeOverlay)
  const [phase, setPhase] = useState<'intro' | 'count' | 'phone' | 'stand' | 'task'>('intro')
  const [count, setCount] = useState(5)

  // The smallest, easiest thing we have, momentum matters more than value.
  const tiny = [...ranked].sort((a, b) => a.node.estimatedMinutes - b.node.estimatedMinutes)[0] ?? null

  useEffect(() => {
    if (phase !== 'count') return
    if (count === 0) {
      haptic('success')
      const t = window.setTimeout(() => setPhase('phone'), 700)
      return () => window.clearTimeout(t)
    }
    haptic('tap')
    const t = window.setTimeout(() => setCount((c) => c - 1), 1000)
    return () => window.clearTimeout(t)
  }, [phase, count])

  return (
    <div className="flex min-h-[62dvh] flex-col px-1 pb-6 pt-2 text-center">
      <AnimatePresence mode="wait">
        {phase === 'intro' && (
          <Step key="intro">
            <h2 className="text-[25px] font-semibold leading-tight tracking-[-0.025em]">
              Hej. Ingen dårlig samvittighed.
            </h2>
            <p className="mt-3 text-[16px] leading-relaxed text-muted">Vi skal bare bryde loopet.</p>
            <div className="mt-9 space-y-2.5">
              <Button full onClick={() => setPhase('count')}>
                5 sekunders reset
              </Button>
              <button
                onClick={() => setPhase('task')}
                className="focus-ring min-h-[48px] w-full text-[14.5px] text-faint"
              >
                Spring over, giv mig bare en lille ting
              </button>
            </div>
          </Step>
        )}

        {phase === 'count' && (
          <Step key="count">
            <AnimatePresence mode="wait">
              <motion.p
                key={count}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.4, opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="text-[96px] font-semibold leading-none tracking-[-0.04em]"
              >
                {count === 0 ? '·' : count}
              </motion.p>
            </AnimatePresence>
            <p className="mt-6 text-[16px] text-muted">Bare træk vejret ind imens.</p>
          </Step>
        )}

        {phase === 'phone' && (
          <Step key="phone">
            <h2 className="text-[25px] font-semibold leading-tight tracking-[-0.025em]">
              Læg telefonen med skærmen nedad
            </h2>
            <p className="mt-3 text-[15.5px] leading-relaxed text-muted">I tre sekunder. Så tager du den op igen.</p>
            <div className="mt-9">
              <Button full onClick={() => setPhase('stand')}>
                Gjort
              </Button>
            </div>
          </Step>
        )}

        {phase === 'stand' && (
          <Step key="stand">
            <h2 className="text-[25px] font-semibold leading-tight tracking-[-0.025em]">Rejs dig op</h2>
            <p className="mt-3 text-[15.5px] leading-relaxed text-muted">Det er hele skridtet. Ikke andet.</p>
            <div className="mt-9 space-y-2.5">
              <Button
                full
                onClick={async () => {
                  await award('procrastination-broken')
                  setPhase('task')
                }}
              >
                Jeg står op
              </Button>
              <button onClick={() => setPhase('task')} className="focus-ring min-h-[48px] w-full text-[14.5px] text-faint">
                Jeg kan ikke lige nu
              </button>
            </div>
          </Step>
        )}

        {phase === 'task' && (
          <Step key="task">
            {tiny ? (
              <>
                <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Første skridt</p>
                <h2 className="mx-auto mt-3 max-w-[17rem] text-[24px] font-semibold leading-tight tracking-[-0.025em]">
                  {tiny.node.title}
                </h2>
                <p className="mt-2 text-[14px] text-muted">ca. {humanMinutes(tiny.node.estimatedMinutes)}</p>
                <div className="mt-9 space-y-2.5">
                  <Button full onClick={() => openOverlay({ kind: 'start', nodeId: tiny.node.id })}>
                    Start den
                  </Button>
                  <button onClick={close} className="focus-ring min-h-[48px] w-full text-[14.5px] text-faint">
                    Ikke nu, men tak
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-[23px] font-semibold leading-tight tracking-[-0.025em]">
                  Der er ikke noget, du skal
                </h2>
                <p className="mt-3 text-[15.5px] leading-relaxed text-muted">
                  Så må du gerne scrolle videre med god samvittighed.
                </p>
                <div className="mt-9">
                  <Button full onClick={close}>
                    Okay
                  </Button>
                </div>
              </>
            )}
          </Step>
        )}
      </AnimatePresence>

      <div className="mt-auto flex items-start gap-2.5 rounded-xl2 border border-line bg-surface p-4 text-left">
        <Info size={15} className="mt-0.5 shrink-0 text-faint" />
        <p className="text-[12.5px] leading-relaxed text-faint">
          Loops kan ikke blokere andre apps. En web-app må ikke det på iPhone, og jeg vil hellere sige det
          ligeud end lade som om. Det her bryder loopet i stedet.
        </p>
      </div>
    </div>
  )
}

function Step({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="flex flex-1 flex-col justify-center py-8"
    >
      {children}
    </motion.div>
  )
}
