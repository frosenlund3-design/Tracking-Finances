import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Check, HandHelping, Pause, Timer } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { haptic } from '@/lib/haptics'
import { humanMinutes } from '@/lib/time'
import { calibratedMinutes, calibratedSeconds } from '@/lib/calibration'
import { estimateStepSeconds, humanSeconds } from '@/lib/firstAction'
import { useCalibration } from '@/store/useStore'
import { Button } from './ui/Button'
import { MicButton } from './ui/MicButton'
import { TaskFinished, type FinishSummary } from './TaskFinished'

/**
 * Start Mode, the anti-procrastination screen.
 *
 * The gap this closes is "I know what to do but my body won't start". So the
 * screen strips everything away and shows exactly one physical action. Not
 * "gør rent" but "rejs dig op".
 */
export function StartMode({ nodeId }: { nodeId: string }) {
  const node = useStore((s) => s.map[nodeId])
  const toggleStep = useStore((s) => s.toggleStep)
  const captureStep = useStore((s) => s.captureStep)
  const complete = useStore((s) => s.completeNode)
  const award = useStore((s) => s.award)
  const startNode = useStore((s) => s.startNode)
  const breakDown = useStore((s) => s.breakDown)
  const postpone = useStore((s) => s.postponeNode)
  const close = useStore((s) => s.closeOverlay)
  const openOverlay = useStore((s) => s.openOverlay)
  const goodEnoughMode = useStore((s) => s.prefs.goodEnoughMode)
  const tone = useStore((s) => s.profile.tone)
  const dismissCelebration = useStore((s) => s.dismissCelebration)

  const cal = useCalibration()
  /**
   * The clock on screen, which measures the step in front of her and nothing
   * else.
   *
   * It goes back to zero every time she finishes a step. That is not a cosmetic
   * choice. A number that keeps climbing across five steps turns "næste, næste,
   * næste" into a running account of how long this is taking, and a running
   * account of how long something is taking is the thing that makes her stop.
   * Each step gets a clean clock, small enough to be obviously survivable.
   */
  const [elapsed, setElapsed] = useState(0)
  /**
   * The seconds already spent on finished steps.
   *
   * Kept in a ref and deliberately never rendered while she is working. It
   * exists so the total can be told at the end, once it is a number about
   * something she finished rather than something she is still inside.
   */
  const banked = useRef(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [stuck, setStuck] = useState(false)
  const [timerEnd, setTimerEnd] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [now, setNow] = useState(Date.now())
  /** Set the moment the whole task closes, and it takes over the screen. */
  const [finished, setFinished] = useState<FinishSummary | null>(null)

  useEffect(() => {
    // The visible clock is the point: it is how she finds out for herself that
    // "2 min" really was two minutes. Trust in the number has to be earned.
    if (finished) return
    const tick = window.setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => window.clearInterval(tick)
  }, [nodeId, finished])

  // A new task means a new total, not a continuation of the last one.
  useEffect(() => {
    banked.current = 0
    setElapsed(0)
  }, [nodeId])

  useEffect(() => {
    if (node && node.status !== 'active') void startNode(node.id)
    // Only when entering the mode for this task.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId])

  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      haptic('success')
      const t = window.setTimeout(() => setCountdown(null), 900)
      return () => window.clearTimeout(t)
    }
    haptic('tap')
    const t = window.setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => window.clearTimeout(t)
  }, [countdown])

  useEffect(() => {
    if (!timerEnd) return
    const i = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(i)
  }, [timerEnd])

  const steps = node?.steps ?? []
  const currentStep = steps.find((s) => !s.done)
  // The clock has to measure the thing on screen. Showing "0:12 af 25 min"
  // next to a single small step made the number meaningless.
  const stepBudget = currentStep
    ? humanSeconds(calibratedSeconds(estimateStepSeconds(currentStep.title), cal))
    : humanMinutes(calibratedMinutes(node?.estimatedMinutes ?? 10, cal))
  const currentStepId = currentStep?.id
  const currentCaptured = currentStep?.captured
  const doneCount = steps.filter((s) => s.done).length
  const remaining = timerEnd ? Math.max(0, Math.round((timerEnd - now) / 1000)) : null

  // Load whatever was already written for this step, and clear between steps.
  useEffect(() => {
    setDraft(currentCaptured ?? '')
  }, [currentStepId, currentCaptured])

  // Every hook is above this line: an early return before one would change the
  // hook order between renders and crash React.
  if (!node) return null

  /** Close the whole thing, with the time it really took, and mark the moment. */
  const finishTask = async (totalSeconds: number) => {
    const minutes = Math.round((totalSeconds / 60) * 10) / 10
    const summary: Omit<FinishSummary, 'xp'> = {
      title: node.title,
      totalSeconds,
      steps: steps.length,
      estimatedMinutes: node.estimatedMinutes,
      repeat: node.repeat,
      repeatEvery: node.repeatEvery,
    }
    // Only pass a measured time we can stand behind. Under five seconds means
    // she ticked something already done, and feeding that into the calibration
    // would teach the app that her tasks take no time at all.
    await complete(node.id, 'start-mode', totalSeconds >= 5 ? { actualMinutes: minutes } : undefined)
    // One ending, not two. The little toast fires from the store on every
    // close; here it would sit on top of the screen that is already saying the
    // same thing, louder and better.
    dismissCelebration()
    setFinished({ ...summary, xp: useStore.getState().completions[0]?.xp ?? 0 })
    haptic('success')
  }

  const finishStep = async () => {
    if (currentStep) {
      if (currentStep.captureLabel && draft.trim()) {
        await captureStep(node.id, currentStep.id, draft.trim())
      }
      await toggleStep(node.id, currentStep.id)
      const willBeLast = steps.filter((s) => !s.done).length === 1
      if (willBeLast) {
        await finishTask(banked.current + elapsed)
        return
      }
      // On to the next one with a clean clock. The seconds are not lost, they
      // are put away until the end.
      banked.current += elapsed
      setElapsed(0)
      haptic('tap')
    } else {
      await finishTask(banked.current + elapsed)
    }
  }

  const stuckOptions = [
    { label: 'Kan du bare rejse dig?', action: () => setCountdown(5) },
    { label: 'Gør den mindre', action: () => void breakDown(node.id) },
    { label: 'Bliv hos mig imens', action: () => openOverlay({ kind: 'bodydouble', nodeId: node.id }) },
    { label: 'Sæt 10 minutter på', action: () => setTimerEnd(Date.now() + 10 * 60 * 1000) },
    { label: 'Snak med coachen', action: () => openOverlay({ kind: 'coach', nodeId: node.id }) },
  ]

  if (finished) return <TaskFinished summary={finished} onDone={close} />

  return (
    <div className="flex h-full flex-col px-6 pb-6 pt-2">
      {/* Countdown takes over completely when running. */}
      <AnimatePresence>
        {countdown !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 grid place-items-center bg-surface"
          >
            <div className="text-center">
              <AnimatePresence mode="wait">
                <motion.p
                  key={countdown}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.5, opacity: 0 }}
                  transition={{ duration: 0.35 }}
                  className="text-[92px] font-semibold leading-none tracking-[-0.04em]"
                >
                  {countdown === 0 ? '↑' : countdown}
                </motion.p>
              </AnimatePresence>
              <p className="mt-6 text-[18px] text-muted">
                {countdown === 0 ? 'Bare rejs dig.' : 'Når vi rammer 1, rejser du dig.'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex shrink-0 items-center justify-between text-[12.5px] text-faint">
        <span className="truncate pr-3">{node.title}</span>
        {steps.length > 0 && (
          <span className="shrink-0">
            {doneCount}/{steps.length}
          </span>
        )}
      </div>

      {/*
        min-h-0 + its own scroll. Without it this flex child is allowed to
        shrink below its content, and on a long step (heading, capture field,
        good-enough note) the content spilled downwards and painted over the
        "Jeg sidder fast" panel and the action buttons, they were visible,
        looked normal, and swallowed taps.
      */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto no-scrollbar py-2 text-center">
        <motion.div
          key={currentStep?.id ?? 'single'}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 24 }}
          className="w-full"
        >
          <div className="mx-auto mb-8 grid h-24 w-24 place-items-center rounded-full border border-line bg-raised shadow-node">
            <span className="text-center leading-tight">
              <span className="block text-[17px] font-semibold tabular-nums">
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
              </span>
              <span className="mt-0.5 block text-[11px] text-faint">
                af {stepBudget}
              </span>
            </span>
          </div>

          <p className="text-[11px] uppercase tracking-[0.16em] text-faint">
            {currentStep ? 'Kun det her' : 'Din opgave'}
          </p>
          <h2 className="mx-auto mt-3 max-w-[18rem] text-[28px] font-semibold leading-tight tracking-[-0.03em]">
            {currentStep ? currentStep.title : node.title}
          </h2>

          {goodEnoughMode && node.goodEnoughNote && (
            <p className="mx-auto mt-4 max-w-[17rem] rounded-xl2 bg-accent-soft/60 px-4 py-3 text-[14px] leading-relaxed text-ink/80">
              {node.goodEnoughNote}
            </p>
          )}

          {remaining !== null && (
            <p className="mt-5 text-[15px] text-muted">
              <Timer size={15} className="mr-1.5 -mt-0.5 inline" />
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} tilbage
            </p>
          )}

          {currentStep?.captureLabel && (
            <div className="mx-auto mt-6 w-full max-w-[20rem] text-left">
              <label className="block text-[12px] text-faint" htmlFor="step-capture">
                {currentStep.captureLabel}
              </label>
              <div className="mt-1.5 flex gap-2">
                <textarea
                  id="step-capture"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => void captureStep(node.id, currentStep.id, draft)}
                  rows={3}
                  placeholder="Skriv løs, det bliver gemt på opgaven"
                  className="min-h-[84px] flex-1 resize-none rounded-xl2 border border-line bg-surface p-3.5 text-[15.5px] leading-relaxed outline-none placeholder:text-faint/80 focus:border-ink/20"
                />
                <MicButton
                  onText={(t) => {
                    setDraft(t)
                    void captureStep(node.id, currentStep.id, t)
                  }}
                  existing={draft}
                  label="Sig det i stedet for at skrive"
                />
              </div>
            </div>
          )}

          {steps.length === 0 && (
            <button
              onClick={() => void breakDown(node.id)}
              className="focus-ring mt-6 rounded-full border border-line bg-raised px-5 py-2.5 text-[14px] text-muted active:scale-95"
            >
              Del den op i småting
            </button>
          )}
        </motion.div>
      </div>

      <AnimatePresence>
        {stuck && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="shrink-0 overflow-hidden"
          >
            <div className="mb-4 rounded-xl2 border border-line bg-surface p-4">
              <p className="text-[15px] font-medium">
                {tone === 'blunt' ? 'Fint. Vi gør den mindre.' : 'Okay. Vi gør den latterligt nem.'}
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {stuckOptions.map((o) => (
                  <button
                    key={o.label}
                    onClick={() => {
                      haptic('tap')
                      o.action()
                      setStuck(false)
                    }}
                    className="focus-ring min-h-[48px] rounded-xl2 border border-line bg-raised px-4 text-left text-[15px] active:scale-[0.99]"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="shrink-0 space-y-2.5">
        <Button full onClick={finishStep}>
          <Check size={18} className="mr-2 -mt-0.5 inline" />
          {currentStep ? 'Gjort, næste' : 'Færdig'}
        </Button>

        {goodEnoughMode && (
          <button
            onClick={async () => {
              await award('good-enough', { nodeId: node.id })
              await finishTask(banked.current + elapsed)
            }}
            className="focus-ring min-h-[48px] w-full rounded-xl2 bg-accent-soft text-[15px] font-medium active:scale-[0.99]"
          >
            Godt nok, den tæller som færdig
          </button>
        )}

        <div className="flex gap-2.5">
          <button
            onClick={() => {
              haptic('soft')
              setStuck((s) => !s)
            }}
            className="focus-ring min-h-[48px] flex-1 rounded-xl2 border border-line bg-surface text-[14.5px] text-muted active:scale-[0.99]"
          >
            <HandHelping size={16} className="mr-1.5 -mt-0.5 inline" />
            Jeg sidder fast
          </button>
          <button
            onClick={async () => {
              await postpone(node.id)
              close()
            }}
            className="focus-ring min-h-[48px] flex-1 rounded-xl2 border border-line bg-surface text-[14.5px] text-muted active:scale-[0.99]"
          >
            <Pause size={16} className="mr-1.5 -mt-0.5 inline" />
            Stop for nu
          </button>
        </div>
        <p className="pt-1 text-center text-[12.5px] text-faint">
          At stoppe er ikke at fejle. Det du nåede, tæller.
        </p>
      </div>
    </div>
  )
}
