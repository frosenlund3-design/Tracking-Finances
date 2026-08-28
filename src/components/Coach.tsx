import { AnimatePresence, motion } from 'framer-motion'
import { Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useStore, useClosedToday, useMentalLoad, useNextTask } from '@/store/useStore'
import { askCoach } from '@/lib/coach/adapter'
import { complexityOf, findTaskByText } from '@/lib/coach/engine'
import type { CoachAction, CoachState, Strategy } from '@/lib/coach/types'
import { GREETINGS } from '@/lib/coach/responses'
import { haptic } from '@/lib/haptics'
import { parkPresets } from '@/lib/time'
import { actionableLeaves } from '@/lib/nodes'
import { BLOCK_ANSWERS, BLOCK_NAMED, scanAttention } from '@/lib/attention'
import type { ProcrastinationReason } from '@/db/types'

/**
 * ADHD Coach.
 *
 * A coach, not a clinician — it says so in the footer and never behaves
 * otherwise. It reads the real task tree, so its suggestions point at things
 * that actually exist, and every reply is 1–4 short lines.
 */
export function Coach({ nodeId, ask }: { nodeId?: string; ask?: boolean }) {
  const map = useStore((s) => s.map)
  const profile = useStore((s) => s.profile)
  const prefs = useStore((s) => s.prefs)
  const messages = useStore((s) => s.coachMessages)
  const addMessage = useStore((s) => s.addCoachMessage)
  const openOverlay = useStore((s) => s.openOverlay)
  const parkNode = useStore((s) => s.parkNode)
  const toggleStep = useStore((s) => s.toggleStep)
  const setGoodEnough = useStore((s) => s.setGoodEnough)
  const updateNode = useStore((s) => s.updateNode)
  const load = useMentalLoad()
  const closedToday = useClosedToday()
  const next = useNextTask()

  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [options, setOptions] = useState<string[]>([])
  const [action, setAction] = useState<CoachAction | null>(null)
  const used = useRef<Strategy[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  // The task in focus can be handed in, named by the user mid-conversation,
  // or fall back to whatever the engine would suggest next.
  const [namedTaskId, setNamedTaskId] = useState<string | null>(null)
  // While this holds a node id, the coach has asked what is in the way and is
  // waiting for the answer. Problem finding before problem solving: the app
  // must not guess why a person is stuck.
  const [diagnosing, setDiagnosing] = useState<string | null>(null)
  // A task she names beats the one we happened to open with.
  const task = (namedTaskId ? map[namedTaskId] : null) ?? (nodeId ? map[nodeId] : null) ?? next?.node ?? null
  const sessionId = 'default'

  useEffect(() => {
    const attention = ask ? scanAttention(map).find((a) => !nodeId || a.node.id === nodeId) : null

    if (attention) {
      // Observation, then one open question. No advice yet — advice before the
      // reason is known is just guessing out loud.
      setNamedTaskId(attention.node.id)
      setDiagnosing(attention.node.id)
      void addMessage({
        sessionId,
        role: 'coach',
        text: [
          attention.headline,
          'Jeg gætter ikke på hvorfor.',
          'Hvad sker der, når du kommer til den?',
        ].join('\n'),
      })
      setOptions(BLOCK_ANSWERS.map((a) => a.label))
      void updateNode(attention.node.id, { lastAskedAt: Date.now() })
      return
    }

    if (messages.length === 0) {
      const line = GREETINGS[profile.tone][Math.floor(Math.random() * GREETINGS[profile.tone].length)]
      void addMessage({ sessionId, role: 'coach', text: line })
      setOptions(['Jeg kan ikke komme i gang', 'Der er for meget', 'Hvad skal jeg lave?'])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, thinking])

  const buildState = (focus = task): CoachState => ({
    userMood: load.percent > 75 ? 'anxious' : prefs.currentEnergy <= 30 ? 'flat' : 'okay',
    userEnergy: prefs.currentEnergy,
    avoidanceReason: null,
    currentTask: focus,
    taskComplexity: complexityOf(focus),
    procrastinationDuration: focus ? Math.round((Date.now() - focus.createdAt) / 60000) : 0,
    previouslyCompletedSteps: focus?.steps.filter((s) => s.done).length ?? 0,
    personalityProfile: profile,
    usedStrategies: used.current,
    openLoops: load.openLoops,
    mentalLoadPercent: load.percent,
  })

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setInput('')
    setOptions([])
    setAction(null)
    await addMessage({ sessionId, role: 'user', text: trimmed })
    setThinking(true)

    // If she names a task, talk about that one — not whatever was on screen.
    const named = findTaskByText(trimmed, actionableLeaves(map))
    if (named) setNamedTaskId(named.id)
    const focus = named ?? task

    // Answering the "what happens when you get to it?" question. We record it
    // on the task so the app stops asking and starts adapting.
    let naming: string | null = null
    if (diagnosing) {
      const answer = BLOCK_ANSWERS.find((a) => a.label.toLowerCase() === trimmed.toLowerCase())
      const reason: ProcrastinationReason | null = answer?.reason ?? null
      if (reason) {
        await updateNode(diagnosing, { blockReason: reason })
        naming = BLOCK_NAMED[reason]
      }
      setDiagnosing(null)
    }

    const reply = await askCoach({ text: trimmed, state: buildState(focus), closedToday })
    // A short beat so it does not feel like a lookup table firing back.
    await new Promise((r) => setTimeout(r, prefs.reducedStimulation ? 120 : 420))

    used.current = [...used.current, reply.strategy].slice(-5)
    await addMessage({
      sessionId,
      role: 'coach',
      // Name the problem first, then act on it.
      text: [naming, ...reply.lines].filter(Boolean).join('\n'),
      options: reply.options,
      strategy: reply.strategy,
    })
    setThinking(false)
    setOptions(reply.options ?? [])
    setAction(reply.action ?? null)
    haptic('soft')
  }

  const runAction = async (a: CoachAction) => {
    switch (a.type) {
      case 'start-task':
        openOverlay({ kind: 'start', nodeId: a.nodeId })
        break
      case 'open-body-double':
        if (a.nodeId) openOverlay({ kind: 'bodydouble', nodeId: a.nodeId })
        break
      case 'open-what-now':
        openOverlay({ kind: 'whatnow' })
        break
      case 'brain-dump':
        openOverlay({ kind: 'braindump' })
        break
      case 'scroll-rescue':
        openOverlay({ kind: 'rescue' })
        break
      case 'park-task':
        await parkNode(a.nodeId, parkPresets()[1].until)
        await addMessage({ sessionId, role: 'coach', text: 'Parkeret. Den kommer selv tilbage om en uge.' })
        break
      case 'break-down':
        openOverlay({ kind: 'node', nodeId: a.nodeId })
        break
      case 'good-enough':
        await setGoodEnough(a.nodeId, 'Lav 20% af den. Det tæller som færdig.')
        await addMessage({ sessionId, role: 'coach', text: 'Så er målet 20% af den. Ikke mere.' })
        break
      case 'complete-step': {
        const n = map[a.nodeId]
        const step = n?.steps.find((s) => !s.done)
        if (n && step) await toggleStep(n.id, step.id)
        break
      }
    }
  }

  const actionLabel = (a: CoachAction): string => {
    switch (a.type) {
      case 'start-task':
        return 'Åbn start-tilstand'
      case 'open-body-double':
        return 'Bliv hos mig'
      case 'open-what-now':
        return 'Find noget til mig'
      case 'brain-dump':
        return 'Åbn brain dump'
      case 'scroll-rescue':
        return 'Start scroll-redning'
      case 'park-task':
        return 'Parkér den'
      case 'good-enough':
        return 'Sæt "godt nok"-mål'
      default:
        return 'Ja tak'
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto no-scrollbar py-2">
        {task && (
          <p className="pb-1 text-center text-[12px] text-faint">
            Jeg kigger på: <span className="text-muted">{task.title}</span>
          </p>
        )}

        {messages.map((m) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] whitespace-pre-line rounded-xl2 px-4 py-3 text-[15.5px] leading-relaxed ${
                m.role === 'user'
                  ? 'bg-ink text-canvas rounded-br-md'
                  : 'bg-surface border border-line rounded-bl-md'
              }`}
            >
              {m.text}
            </div>
          </motion.div>
        ))}

        <AnimatePresence>
          {thinking && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-1.5 pl-4">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-2 w-2 rounded-full bg-faint"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.16 }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {action && (
        <button
          onClick={() => void runAction(action)}
          className="focus-ring mb-2 min-h-[48px] w-full rounded-xl2 bg-accent-soft text-[15px] font-medium active:scale-[0.99]"
        >
          {actionLabel(action)}
        </button>
      )}

      {options.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {options.map((o) => (
            <button
              key={o}
              onClick={() => void send(o)}
              className="focus-ring min-h-[44px] rounded-full border border-line bg-surface px-4 text-[14px] active:scale-95"
            >
              {o}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
        className="flex items-end gap-2 pb-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Skriv hvad der sker…"
          className="min-h-[50px] flex-1 rounded-xl2 border border-line bg-surface px-4 text-[16px] outline-none placeholder:text-faint focus:border-ink/20"
        />
        <button
          type="submit"
          aria-label="Send"
          className="focus-ring grid h-[50px] w-[50px] shrink-0 place-items-center rounded-xl2 bg-ink text-canvas active:scale-95"
        >
          <Send size={18} />
        </button>
      </form>

      <p className="pb-2 text-center text-[11.5px] leading-relaxed text-faint/80">
        Coachen er en hjælper — ikke psykolog, læge eller behandler. Alt bliver på din telefon.
      </p>
    </div>
  )
}
