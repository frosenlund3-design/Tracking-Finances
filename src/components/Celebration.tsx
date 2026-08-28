import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { useStore } from '@/store/useStore'

/**
 * Completion feedback.
 *
 * Under a second, no confetti by default. The ring closing and shrinking is
 * the reward; the XP is a quiet number next to it. Big celebrations are rare
 * on purpose — a party every time stops meaning anything.
 */
export function Celebration() {
  const celebration = useStore((s) => s.celebration)
  const dismiss = useStore((s) => s.dismissCelebration)
  const showXP = useStore((s) => s.prefs.showXP)
  const reduced = useStore((s) => s.prefs.reducedStimulation)

  useEffect(() => {
    if (!celebration) return
    const t = window.setTimeout(dismiss, reduced ? 1400 : 2100)
    return () => window.clearTimeout(t)
  }, [celebration, dismiss, reduced])

  return (
    <AnimatePresence>
      {celebration && (
        <motion.div
          className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        >
          <div className="pointer-events-auto flex items-center gap-3.5 rounded-xl3 border border-line bg-raised px-5 py-4 shadow-lift">
            <div className="relative grid h-11 w-11 shrink-0 place-items-center">
              <svg width={44} height={44} className="absolute -rotate-90">
                <motion.circle
                  cx={22}
                  cy={22}
                  r={18}
                  fill="none"
                  stroke="rgb(var(--c-calm))"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: reduced ? 0.2 : 0.55, ease: 'easeOut' }}
                />
              </svg>
              <motion.span
                className="h-3.5 w-3.5 rounded-full bg-calm"
                initial={{ scale: 1, opacity: 1 }}
                animate={{ scale: [1, 1.25, 0.2], opacity: [1, 1, 0] }}
                transition={{ duration: reduced ? 0.3 : 0.8, times: [0, 0.4, 1], delay: 0.25 }}
              />
            </div>

            <div className="min-w-0">
              <p className="text-[15px] font-medium leading-snug">{celebration.line}</p>
              <p className="mt-0.5 truncate text-[12.5px] text-faint">{celebration.title}</p>
            </div>

            {showXP && (
              <motion.span
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="ml-1 shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-[12.5px] font-medium text-ink/70"
              >
                +{celebration.xp}
              </motion.span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
