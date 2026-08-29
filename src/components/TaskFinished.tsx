import { motion } from 'framer-motion'
import { Check, RotateCw } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { cadenceLabel } from '@/lib/habits'
import type { LoopNode } from '@/db/types'

export interface FinishSummary {
  title: string
  /** Every second spent on the task, including all of its steps. */
  totalSeconds: number
  steps: number
  estimatedMinutes: number
  xp: number
  repeat?: LoopNode['repeat']
  repeatEvery?: number
}

/**
 * The end of a task, given its own screen.
 *
 * Two things happen here that a two-second toast could not do.
 *
 * It tells her the total. While she was working, the clock restarted at every
 * step on purpose, so she never had to watch a number climb. That is right for
 * getting through it and wrong for afterwards: the whole of the time she spent
 * is the one number worth having, and it belongs at the end, once it is a fact
 * about something finished rather than a running commentary on something she
 * is still inside.
 *
 * And it puts that total next to the estimate. Time blindness is not fixed by
 * being told about it; it is chipped at by seeing the two numbers side by side
 * often enough that the estimate starts to mean something. The app does not
 * editorialise about which one was right. It shows both and shuts up.
 *
 * It is also the one big moment in the app. Everything else is deliberately
 * quiet, because a party every time stops meaning anything, but finishing a
 * task with five steps in it is not every time.
 */
export function TaskFinished({ summary, onDone }: { summary: FinishSummary; onDone: () => void }) {
  const showXP = useStore((s) => s.prefs.showXP)
  const reduced = useStore((s) => s.prefs.reducedStimulation)

  const minutes = Math.floor(summary.totalSeconds / 60)
  const seconds = summary.totalSeconds % 60
  const estimate = summary.estimatedMinutes
  const actual = summary.totalSeconds / 60

  // Only worth saying when the gap is real. "Du satte 10 min af, det tog 9"
  // is noise, and noise next to a number is how a number stops being read.
  const gap =
    estimate >= 1 && summary.totalSeconds >= 30
      ? actual < estimate * 0.6
        ? `Du havde sat ${estimate} min af. Den tog ${Math.max(1, Math.round(actual))}.`
        : actual > estimate * 1.6
          ? `Du havde sat ${estimate} min af, og den tog ${Math.round(actual)}. Det er ikke dig, der er langsom, det er estimatet, der var forkert. Jeg retter det for næste gang.`
          : null
      : null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-[70] grid place-items-center bg-surface px-7"
    >
      <div className="w-full max-w-[20rem] text-center">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.05 }}
          className="relative mx-auto grid h-24 w-24 place-items-center"
        >
          <svg width={96} height={96} className="absolute -rotate-90" aria-hidden>
            <motion.circle
              cx={48}
              cy={48}
              r={44}
              fill="none"
              stroke="rgb(var(--c-calm))"
              strokeWidth={3}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: reduced ? 0.25 : 0.9, ease: 'easeOut' }}
            />
          </svg>
          <Check size={34} className="text-calm" />
        </motion.div>

        <p className="mt-7 text-[11px] uppercase tracking-[0.18em] text-faint">Du brugte</p>
        <p className="mt-1.5 text-[52px] font-semibold leading-none tracking-[-0.045em] tabular-nums">
          {minutes}:{String(seconds).padStart(2, '0')}
        </p>

        <p className="mt-4 text-[16px] font-medium leading-snug">{summary.title}</p>

        {summary.steps > 1 && (
          <p className="mt-1.5 text-[13.5px] text-muted">
            {summary.steps} trin, samlet. Hvert enkelt så kort ud, fordi det var det.
          </p>
        )}

        {gap && <p className="mt-4 text-[13.5px] leading-relaxed text-muted">{gap}</p>}

        {summary.repeat ? (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-raised px-3.5 py-1.5 text-[12.5px] text-muted">
            <RotateCw size={13} className="text-faint" />
            Kommer igen {cadenceLabel({ unit: summary.repeat, every: summary.repeatEvery ?? 1 })}
          </p>
        ) : (
          <p className="mt-4 text-[13.5px] text-muted">Den er ude af hovedet nu.</p>
        )}

        {showXP && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduced ? 0.1 : 0.45 }}
            className="mt-5 inline-block rounded-full bg-accent-soft px-4 py-2 text-[15px] font-semibold text-ink/80"
          >
            +{summary.xp} point
          </motion.p>
        )}

        <button
          onClick={onDone}
          className="focus-ring mt-8 min-h-[56px] w-full rounded-3xl bg-ink text-[16px] font-semibold text-canvas active:scale-[0.98]"
        >
          Færdig
        </button>
      </div>
    </motion.div>
  )
}
