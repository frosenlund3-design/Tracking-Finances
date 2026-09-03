import { AnimatePresence, motion } from 'framer-motion'
import { History, Plus, Send, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, useClosedToday, useMentalLoad, useNextTask } from '@/store/useStore'
import { askCoach } from '@/lib/coach/adapter'
import { complexityOf, findTaskByText } from '@/lib/coach/engine'
import type { CoachAction, CoachState, Strategy } from '@/lib/coach/types'
import { chooseOpening, OPENING_MEMORY } from '@/lib/coach/opening'
import { isoDate } from '@/lib/time'
import { haptic } from '@/lib/haptics'
import { parkPresets } from '@/lib/time'
import { MicButton } from './ui/MicButton'
import { actionableLeaves } from '@/lib/nodes'
import { BLOCK_ANSWERS, BLOCK_NAMED, scanAttention } from '@/lib/attention'
import { ROOT_ID } from '@/db/db'
import { observe } from '@/lib/coach/memory'
import { handleAgentRequest, type AgentEffect } from '@/lib/coach/agent'
import { matchTriggers } from '@/lib/coach/triggers'
import { TOPIC_NAMES, namedTopic, understand, type AskTopic } from '@/lib/coach/understand'
import { answerMeta } from '@/lib/coach/meta'
import { FIRST_MOVE, prioritise, rightNow, summarise, triage } from '@/lib/coach/help'
import { landlordRefused, landlordTemplate, moneyAnswer, rentAnswer } from '@/lib/coach/crisis'
import { alreadyLine, captureOffer, detectCaptures, manyOffer } from '@/lib/coach/capture'
import { anchorFrom, anchorPhrase, cadenceLabel, readHabits, spotHabits, type HabitMention } from '@/lib/habits'
import { routineReply } from '@/lib/coach/routines'
import type { ParsedLoop } from '@/lib/brainDump'
import type { ProcrastinationReason } from '@/db/types'

/**
 * ADHD Coach.
 *
 * A coach, not a clinician, it says so in the footer and never behaves
 * otherwise. It reads the real task tree, so its suggestions point at things
 * that actually exist, and every reply is 1–4 short lines.
 */
export function Coach({ nodeId, ask }: { nodeId?: string; ask?: boolean }) {
  const map = useStore((s) => s.map)
  const profile = useStore((s) => s.profile)
  const prefs = useStore((s) => s.prefs)
  const savePrefs = useStore((s) => s.savePrefs)
  const allMessages = useStore((s) => s.coachMessages)
  const sessions = useStore((s) => s.coachSessions)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const startSession = useStore((s) => s.startCoachSession)
  const openSession = useStore((s) => s.openCoachSession)
  const deleteSession = useStore((s) => s.deleteCoachSession)
  const remember = useStore((s) => s.rememberObservations)
  const memories = useStore((s) => s.memories)
  const dismissMemory = useStore((s) => s.dismissMemory)
  const nodes = useStore((s) => s.nodes)
  const completions = useStore((s) => s.completions)
  const addMessage = useStore((s) => s.addCoachMessage)
  const openOverlay = useStore((s) => s.openOverlay)
  const parkNode = useStore((s) => s.parkNode)
  const toggleStep = useStore((s) => s.toggleStep)
  const setGoodEnough = useStore((s) => s.setGoodEnough)
  const updateNode = useStore((s) => s.updateNode)
  const breakDown = useStore((s) => s.breakDown)
  const addStep = useStore((s) => s.addStep)
  const scheduleNode = useStore((s) => s.schedule)
  const renameNode = useStore((s) => s.renameNode)
  const deleteNode = useStore((s) => s.deleteNode)
  const moveNode = useStore((s) => s.moveNode)
  const completeNode = useStore((s) => s.completeNode)
  const unparkNode = useStore((s) => s.unparkNode)
  const addNote = useStore((s) => s.addNote)
  const commitBrainDump = useStore((s) => s.commitBrainDump)
  const addHabits = useStore((s) => s.addHabits)
  const saveProfile = useStore((s) => s.saveProfile)
  const load = useMentalLoad()
  const closedToday = useClosedToday()
  const next = useNextTask()

  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [options, setOptions] = useState<string[]>([])
  const [action, setAction] = useState<CoachAction | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const usedConcepts = useRef<string[]>([])
  const usedTriggers = useRef<string[]>([])
  /** A destructive effect waiting for her yes. */
  const [pending, setPending] = useState<AgentEffect | null>(null)
  /** Things she said in chat that are not in the tree yet, waiting on her. */
  const [queue, setQueue] = useState<ParsedLoop[]>([])
  /** Whether the batch being worked through was a single thing. */
  const handledOne = useRef(false)
  /**
   * Routines she just described, waiting on her word.
   *
   * Kept apart from `queue`, which is for one-off tasks. A routine is not a
   * task and must not be filed as one, so it cannot share the path that files
   * things.
   */
  const [habitOffer, setHabitOffer] = useState<{ create: HabitMention[]; anchors: HabitMention[]; cue: string | null } | null>(null)
  /** When she asked to pick only some of them, the ones on the table. */
  const [pendingHabits, setPendingHabits] = useState<HabitMention[]>([])
  /** The rest of a multi-part request, so "og hvad så med økonomien" works. */
  const [pendingAsks, setPendingAsks] = useState<AskTopic[]>([])
  /** The current message, readable from the ask handler. */
  const trimmedRef = useRef('')
  /** What the conversation is about, so "hjælp mig nu" knows what "det" is. */
  const lastSubject = useRef<AskTopic | null>(null)
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
  const sessionId = activeSessionId ?? ''
  const messages = allMessages.filter((m) => m.sessionId === sessionId)

  // The circles she could move something into, named the way she named them.
  const circles = useMemo(
    () =>
      nodes
        .filter((n) => n.isArea && n.id !== ROOT_ID && n.status !== 'done')
        .map((n) => ({ id: n.id, title: n.title })),
    [nodes],
  )

  // Patterns from her own data, recomputed as the data changes.
  const observations = useMemo(
    () => observe(nodes, map, completions).filter((o) => !o.id.startsWith('__')),
    [nodes, map, completions],
  )

  useEffect(() => {
    let cancelled = false

    const boot = async () => {
      // Always land in a real conversation, so nothing is ever written into a
      // session she cannot find again.
      let id = activeSessionId
      if (!id) id = await startSession()
      if (cancelled) return

      // What the app has worked out about her, kept so it survives the chat.
      if (observations.length) void remember(observations.slice(0, 4))

      const existing = useStore.getState().coachMessages.filter((m) => m.sessionId === id)
      if (existing.length > 0 && !ask) return

      const attention = ask ? scanAttention(map).find((a) => !nodeId || a.node.id === nodeId) : null

      if (attention) {
        // Observation, then one open question. No advice yet, advice before
        // the reason is known is just guessing out loud.
        setNamedTaskId(attention.node.id)
        setDiagnosing(attention.node.id)
        void addMessage({
          sessionId: id,
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

      if (existing.length === 0) {
        // A new conversation asks something new. The same greeting five times
        // in a row stops being a coach and becomes a doorbell.
        const yesterday = isoDate(new Date(Date.now() - 86_400_000))
        const opening = chooseOpening({
          tone: profile.tone,
          closedToday,
          closedYesterday: completions.filter((c) => isoDate(new Date(c.completedAt)) === yesterday)
            .length,
          energy: prefs.currentEnergy,
          openLoops: load.openLoops,
          stale: scanAttention(map)[0]?.node ?? null,
          observations,
          daysSinceLastChat: sessions[0]
            ? Math.floor((Date.now() - sessions[0].updatedAt) / 86_400_000)
            : null,
          recent: prefs.recentOpenings ?? [],
        })
        void addMessage({ sessionId: id, role: 'coach', text: opening.lines.join('\n') })
        setOptions(opening.options)
        void savePrefs({
          recentOpenings: [opening.id, ...(prefs.recentOpenings ?? [])].slice(0, OPENING_MEMORY),
        })
        // An opening that named a stale task is also a diagnosis question.
        if (opening.id === 'stale') {
          const node = scanAttention(map)[0]?.node
          if (node) {
            setNamedTaskId(node.id)
            setDiagnosing(node.id)
            void updateNode(node.id, { lastAskedAt: Date.now() })
          }
        }

        // Asked once, when she has used the coach enough to know whether she
        // wants it to know her. Not during onboarding, where it would be one
        // more form standing between her and the app, and never again after.
        const spoken = useStore.getState().coachMessages.filter((m) => m.role === 'user').length
        if (!profile.self && !prefs.selfInvited && spoken >= 4) {
          void savePrefs({ selfInvited: true })
          void addMessage({
            sessionId: id,
            role: 'coach',
            text: [
              'Må jeg spørge om noget, før vi fortsætter?',
              'Jeg bliver markant bedre, hvis jeg ved lidt om dig: diagnoser, hvad du døjer med, og hvad der rammer dig hårdt. Så holder jeg op med at sige ting, du har hørt hundrede gange.',
              'Du bestemmer selv hvor lidt du skriver, og du kan slette det igen.',
            ].join('\n'),
          })
          setOptions(['Fortæl mig hvor', 'Ikke nu'])
        }
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId])

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

  /**
   * Carry out something the coach decided to do.
   *
   * Every one of these is reversible except the delete, and the delete is the
   * only one that waits for a yes.
   */
  const applyEffect = async (e: AgentEffect) => {
    switch (e.kind) {
      case 'resplit':
        await breakDown(e.nodeId, e.granularity)
        break
      case 'add-step':
        await addStep(e.nodeId, e.title)
        break
      case 'schedule':
        await scheduleNode(e.nodeId, e.date, e.part)
        break
      case 'park':
        await parkNode(e.nodeId, e.until)
        break
      case 'unpark':
        await unparkNode(e.nodeId)
        break
      case 'rename':
        await renameNode(e.nodeId, e.title)
        break
      case 'estimate':
        await updateNode(e.nodeId, { estimatedMinutes: e.minutes })
        break
      case 'good-enough':
        await setGoodEnough(e.nodeId, e.note)
        break
      case 'complete':
        await completeNode(e.nodeId, 'coach')
        break
      case 'move':
        await moveNode(e.nodeId, e.parentId)
        break
      case 'cue':
        await updateNode(e.nodeId, { cue: e.cue })
        break
      case 'repeat':
        await updateNode(e.nodeId, { repeat: e.repeat })
        break
      case 'delete':
        await deleteNode(e.nodeId)
        break
    }
    haptic('tap')
  }

  /** Say something back without running the whole engine. */
  const say = async (lines: string[], opts?: string[]) => {
    await addMessage({ sessionId, role: 'coach', text: lines.filter(Boolean).join('\n'), options: opts })
    setOptions(opts ?? [])
    setThinking(false)
    haptic('soft')
  }

  /**
   * Keep the fixed points she already hits, without ever making them tasks.
   *
   * This is the whole reason routines are handled separately. She is currently
   * succeeding at wiping the counter every day. Put it on a list and there is
   * now a way to fail at it, and there will be a morning it sits there
   * unticked telling her she is behind on something she is not behind on.
   */
  const saveRoutines = async (anchors: HabitMention[]) => {
    if (!anchors.length) return
    const phrases = anchors.filter((h) => h.anchor).map(anchorPhrase)
    const self = profile.self
    const existing = self?.routines ?? []
    const merged = [...existing]
    for (const phrase of phrases) {
      if (!merged.some((m) => m.toLowerCase() === phrase.toLowerCase())) merged.push(phrase)
    }
    await saveProfile({
      self: {
        diagnoses: self?.diagnoses ?? [],
        challenges: self?.challenges ?? [],
        triggers: self?.triggers ?? [],
        familiarity: self?.familiarity ?? 'some',
        freeText: self?.freeText,
        ...self,
        routines: merged,
      },
    })
  }

  /** Create the routines she said yes to, and say exactly what happened. */
  const commitHabits = async (create: HabitMention[], anchors: HabitMention[], cue: string | null) => {
    await saveRoutines(anchors)
    const made = await addHabits(create, cue)
    if (!made.length) {
      await say(['Der var ikke noget at lægge ind.'], ['Hvad skal jeg lave?'])
      return
    }
    const lines = [
      made.length === 1 ? 'Lagt ind.' : `${made.length} lagt ind.`,
      made.map((n) => `${n.title} · ${cadenceLabel({ unit: n.repeat ?? 'day', every: n.repeatEvery ?? 1 })}`).join('\n'),
      cue ? `De hænger på "${cue.toLowerCase()}".` : '',
      // Said out loud because it is the thing that makes a recurring task
      // survivable. Every habit app she has quit kept score of the misses.
      'De hober sig ikke op. Springer du en over, findes den bare næste gang, og der er ingen optælling af de sprungne.',
    ].filter(Boolean)
    await say(lines, ['Vis dem', 'Hvad skal jeg lave nu?'])
  }

  /**
   * Answer what she asked for, in the order she asked.
   *
   * Several things in one message is the normal case, not the exception. She
   * writes one message and means three, and answering one of them chosen at
   * random is worse than answering none: it looks like it understood.
   *
   * So the whole list is acknowledged, the first one is answered properly, and
   * the rest are named as the next thing. Money jumps the queue: whatever else
   * is in the message, that is the sentence that matters.
   */
  const answerAsks = async (
    topics: AskTopic[],
    urgent: boolean,
    resuming = false,
  ): Promise<boolean> => {
    const ctx = {
      energy: prefs.currentEnergy,
      now: new Date(),
      profile,
      goodEnoughMode: prefs.goodEnoughMode,
    }
    const ordered = [...topics].sort((a, b) => (a === 'money' ? -1 : b === 'money' ? 1 : 0))
    const first = ordered[0]
    const rest = ordered.slice(1)

    const answerFor = (): { lines: string[]; options: string[]; focusId?: string } | null => {
      switch (first) {
        case 'money':
          return /husleje|leje\b|bolig|udsat/i.test(trimmedRef.current) ? rentAnswer() : moneyAnswer()
        case 'prioritise':
          return prioritise(map, ctx)
        case 'sort':
          return summarise(map)
        case 'overwhelm':
          return triage(map, ctx)
        case 'start':
          // "Bare hjælp mig nu" means one thing to do about what we are
          // actually talking about, not a task picked out of the ranking that
          // has nothing to do with the last five minutes.
          return rightNow(map, ctx, lastSubject.current ? FIRST_MOVE[lastSubject.current] : undefined)
        case 'plan-time':
          return {
            lines: [
              'Det kan jeg. Ikke en fyldt kalender, kun de ting hvor tidspunktet faktisk gør en forskel.',
              'Jeg kigger på åbningstider, hvornår du har energi, og hvad der har en frist.',
            ],
            options: ['Ja, fordel dem', 'Ikke nu'],
          }
        default:
          return null
      }
    }

    const answer = answerFor()
    if (!answer) return false

    if (answer.focusId) setNamedTaskId(answer.focusId)
    await new Promise((r) => setTimeout(r, prefs.reducedStimulation ? 100 : 380))

    const lead =
      first === 'money' || urgent || resuming || !rest.length
        ? []
        : [`Du spurgte om ${ordered.length} ting. Vi tager dem én ad gangen.`]
    const tail = rest.length
      ? [rest.length === 1 ? `Bagefter tager vi ${TOPIC_NAMES[rest[0]]}.` : `Bagefter: ${rest.map((t) => TOPIC_NAMES[t]).join(', ')}.`]
      : []

    // An urgent "hjælp mig nu" is an interjection inside the conversation, not
    // a new agenda, so it leaves the rest of what she asked for standing.
    if (first !== 'start') {
      setPendingAsks(rest)
      lastSubject.current = first
    }
    await say([...lead, ...answer.lines, ...tail], answer.options)
    return true
  }

  /** Work through things she emptied out of her head, one at a time. */
  const advanceQueue = async (rest: ParsedLoop[]) => {
    setQueue(rest)
    if (!rest.length) {
      await say(
        handledOne.current
          ? ['Så er den ude af hovedet.', 'Du skal ikke huske på den nu.']
          : ['Så er de ude af hovedet.', 'Du skal ikke huske på nogen af dem nu.'],
        ['Hvad skal jeg starte med?', 'Jeg stopper her'],
      )
      return
    }
    await say([`Næste: “${rest[0].title}”. Er den din?`], ['Ja', 'Nej, den skal ikke ind', 'Det er bare en note'])
  }

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setInput('')
    setOptions([])
    setAction(null)
    await addMessage({ sessionId, role: 'user', text: trimmed })
    setThinking(true)

    // If she names a task, talk about that one, not whatever was on screen.
    const named = findTaskByText(trimmed, actionableLeaves(map))
    if (named) setNamedTaskId(named.id)
    const focus = named ?? task

    if (/^fort[æa]l mig hvor$/i.test(trimmed)) {
      await say(['Indstillinger, øverst under "Din profil". Jeg åbner den.'])
      openOverlay({ kind: 'self' })
      return
    }

    // Read the whole message before anything is allowed to act on a piece of
    // it. Everything below is downstream of this.
    trimmedRef.current = trimmed
    const said = understand(trimmed)
    const yes = said.affirmation
    const no = said.refusal

    // 0. She is answering the coach's own question about what blocks a task.
    //
    // This has to come first. "Jeg ved ikke hvor jeg skal starte" is one of
    // the offered answers and is also shaped exactly like a question about the
    // task, so anything downstream would happily answer it instead of hearing
    // it. Being asked something and then having the answer treated as a new
    // question is the single most demoralising thing an assistant can do.
    const blockAnswer = diagnosing
      ? BLOCK_ANSWERS.find((a) => a.label.toLowerCase() === trimmed.toLowerCase())
      : undefined

    // 0.5. A question about the coach is answered by the coach about itself.
    //
    // Never by looking at whatever task happened to be in focus. "Skulle du
    // ikke være terapeut?" was answered as a question about a loop called
    // "Eller bruge håndklæde faktisk)", which is the reply that ends it.
    if (said.meta && !blockAnswer) {
      const answer = answerMeta(said.meta)
      setQueue([])
      setPending(null)
      await new Promise((r) => setTimeout(r, prefs.reducedStimulation ? 100 : 320))
      await say(answer.lines, answer.options)
      return
    }

    // 0.52. Follow-ups on the rent answer, which is the one place where the
    // next question is entirely predictable.
    if (/\b(hj[æa]lp mig med at skrive til udlejer|skriv (?:den )?(?:til udlejer|beskeden))\b/i.test(trimmed)) {
      const a = landlordTemplate()
      await say(a.lines, a.options)
      return
    }
    if (/\b(hvad hvis de siger nej|de sagde nej|udlejer sagde nej|de vil ikke)\b/i.test(trimmed)) {
      const a = landlordRefused()
      await say(a.lines, a.options)
      return
    }

    // 0.55. Picking up the rest of a multi-part request.
    //
    // "Ja" after "bagefter tager vi økonomien" has to mean the economy, not a
    // yes to something three messages ago.
    if (pendingAsks.length && (said.affirmation || /\b(og |hvad (?:s[åa] )?med|videre|n[æa]ste)\b/i.test(trimmed))) {
      // If she named one of them, that is the one. Order in the queue does not
      // beat what she just said.
      const wanted = namedTopic(trimmed, pendingAsks) ?? pendingAsks[0]
      const later = pendingAsks.filter((t) => t !== wanted)
      setPendingAsks(later)
      if (await answerAsks([wanted, ...later], said.urgent, true)) return
    }

    // 0.6. She is asking for something. Answer it, all of it, in her order.
    if (said.asks.length && !blockAnswer) {
      // A request cancels any bookkeeping that was waiting on a yes. She has
      // moved on, and finishing the queue first is how "hjælp mig nu" got
      // answered with "fint, den ryger ikke ind".
      setQueue([])
      setPending(null)
      const handled = await answerAsks(said.asks.map((a) => a.topic), said.urgent)
      if (handled) return
    }

    // 0.7. She is answering an offer to set up routines.
    //
    // Before the destructive-confirm and the queue, because those both read a
    // bare "ja" and would happily claim this one.
    if (habitOffer && !blockAnswer) {
      const offer = habitOffer
      const all = /\bl[æa]g (?:den|dem|de \d+) ind|alle sammen|alle tre|ja tak|^ja\b/i.test(trimmed) || yes
      const some = /\bkun nogle|nogle af dem|v[æa]lge|udv[æa]lg|en ad gangen\b/i.test(trimmed)
      const anchorsOnly = /\bfaste punkter|gem dem\b/i.test(trimmed)

      if (anchorsOnly || (no && offer.anchors.length)) {
        setHabitOffer(null)
        await saveRoutines(offer.anchors)
        await say(
          [
            'Gemt som dine faste punkter.',
            'Nu er de der, når noget nyt skal hænges på noget. Du får dem aldrig som opgaver.',
          ],
          ['Hvad skal jeg lave?', 'Jeg vil have noget nyt ind'],
        )
        return
      }
      if (some) {
        setHabitOffer(null)
        await say(
          ['Sig hvilke, så tager jeg kun dem.', offer.create.map((h) => h.title).join(', ') + '.'],
          offer.create.map((h) => h.title),
        )
        setPendingHabits(offer.create)
        return
      }
      if (no) {
        setHabitOffer(null)
        await say(['Så lader vi det ligge.', 'Det du allerede gør, kører videre uanset hvad jeg gemmer.'], [
          'Hvad skal jeg lave?',
        ])
        return
      }
      if (all) {
        setHabitOffer(null)
        await commitHabits(offer.create, offer.anchors, offer.cue)
        return
      }
    }

    // She named one of the routines from the offer.
    if (pendingHabits.length && !blockAnswer) {
      const picked = pendingHabits.filter((h) => trimmed.toLowerCase().includes(h.title.toLowerCase()))
      if (picked.length) {
        setPendingHabits([])
        await commitHabits(picked, [], anchorFrom(picked))
        return
      }
      setPendingHabits([])
    }

    // 1. Something destructive is waiting on her word.
    if (pending && !blockAnswer) {
      const effect = pending
      setPending(null)
      if (yes) {
        await applyEffect(effect)
        await say(['Væk.', 'Det tæller også som at få hovedet tilbage.'], ['Hvad så nu?'])
      } else {
        await say(['Så lader vi den stå.'], ['Parkér den i stedet', 'Hvad skal jeg lave?'])
      }
      return
    }

    // 2. Working through a head she emptied a moment ago.
    if (queue.length && !blockAnswer) {
      const [head, ...rest] = queue
      if (yes) {
        await commitBrainDump(head.raw, [head])
        await say([`Lagt ind under ${head.path.join(' › ')}.`])
        await advanceQueue(rest)
        return
      }
      if (/note/i.test(trimmed)) {
        await addNote(head.raw)
        await say(['Gemt i Hovedet som en note. Den tæller ikke med som noget, du skal gøre.'])
        await advanceQueue(rest)
        return
      }
      if (no) {
        await say(['Fint. Den ryger ikke ind.'])
        await advanceQueue(rest)
        return
      }
      // Anything else: she has moved on. Drop the queue rather than nag.
      setQueue([])
    }

    // 2.4. Turning loops that are really routines into ones that come back.
    //
    // Offered from the overview, where the app can see them, but never applied
    // on its own: it is pattern-matching on a word, and she is the one who
    // knows whether "vask gulv" is a habit or a one-off before guests arrive.
    if (/\bg[øo]r vanerne til gentagelser|lav dem om til vaner|g[øo]r dem til gentagelser\b/i.test(trimmed)) {
      const found = spotHabits(actionableLeaves(map))
      if (!found.length) {
        await say(['Jeg kan ikke se nogen på listen, der ligner en vane lige nu.'], ['Hvad skal jeg lave?'])
        return
      }
      for (const h of found) {
        await updateNode(h.node.id, {
          repeat: h.cadence.unit,
          repeatEvery: h.cadence.every,
          scheduledDate: h.node.scheduledDate ?? isoDate(new Date()),
        })
      }
      await say(
        [
          `${found.length === 1 ? 'Den' : `De ${found.length}`} kommer igen af sig selv nu:`,
          found.map((h) => `${h.node.title} · ${cadenceLabel(h.cadence)}`).join('\n'),
          'De hober sig ikke op, og der bliver ikke talt på de sprungne. Passer en af dem ikke, så sig til.',
        ],
        ['Den passer ikke', 'Hvad skal jeg lave nu?'],
      )
      return
    }

    // 2.5. She is describing her routines.
    //
    // This has to sit above the agent. The reply that made her say the coach
    // understood nothing came from the agent seeing "hver dag" inside six
    // hundred characters about her everyday life and setting a daily repeat on
    // an unrelated task. A message about routines is answered as a message
    // about routines, and never reaches a branch that matches fragments.
    const habits = blockAnswer ? null : readHabits(trimmed)
    if (habits && (habits.doing.length || habits.wanted.length)) {
      setQueue([])
      setPending(null)
      const reply = routineReply(habits)
      setHabitOffer({ create: reply.create, anchors: reply.anchors, cue: anchorFrom(reply.anchors) })
      await new Promise((r) => setTimeout(r, prefs.reducedStimulation ? 100 : 320))
      await say(reply.lines, reply.options)
      return
    }

    // 3. An explicit request to change something wins over advice.
    //
    // With one exception. "Hvad nu hvis de bliver sure på mig?" is shaped like
    // a question about the task, and answering it as one would step straight
    // past the thing she actually said. So a request that only produces words
    // yields to a live trigger. A request that changes data does not: if she
    // says "parkér den", the task moves, whatever else is in the sentence.
    const liveTrigger = matchTriggers(trimmed, profile.self?.triggers).some(
      (h) => !usedTriggers.current.includes(h.trigger),
    )
    const agent = blockAnswer ? null : handleAgentRequest({ text: trimmed, task: focus, circles, namedTask: !!named || !!nodeId, routines: profile.self?.routines })
    if (agent && !(liveTrigger && !agent.effect)) {
      if (agent.effect && agent.confirm) setPending(agent.effect)
      else if (agent.effect) await applyEffect(agent.effect)
      await new Promise((r) => setTimeout(r, prefs.reducedStimulation ? 100 : 320))
      await say(agent.lines, agent.confirm ? [agent.confirm, ...(agent.options ?? [])] : agent.options)
      return
    }

    // 4. Something she has to do, said out loud in passing.
    //
    // Three things must not be filed as tasks. A request for help, which is
    // what `isRequest` is for. An answer to the coach's own question. And
    // anything that touches a live trigger: "har en bunke regninger jeg ikke
    // tør kigge på" is her telling the coach where it hurts, and answering it
    // with "skal jeg lægge den ind?" is the app filing the feeling as a chore.
    const captured =
      blockAnswer || said.isRequest || liveTrigger ? null : detectCaptures(trimmed, map)
    if (captured) {
      await new Promise((r) => setTimeout(r, prefs.reducedStimulation ? 100 : 320))
      const known = alreadyLine(captured.already)
      if (!captured.items.length && known) {
        await say([known, 'Du behøver ikke huske på den.'], ['Skal jeg finde noget til dig?', 'Nej tak'])
        return
      }
      setQueue(captured.items)
      handledOne.current = captured.items.length === 1
      if (captured.many) {
        await say([known, ...manyOffer(captured.items)].filter(Boolean) as string[], [
          'Ja',
          'Nej, den skal ikke ind',
          'Det er bare en note',
        ])
      } else {
        await say([known, ...captureOffer(captured.items)].filter(Boolean) as string[], ['Ja', 'Nej tak'])
      }
      return
    }

    // Answering the "what happens when you get to it?" question. We record it
    // on the task so the app stops asking and starts adapting.
    let naming: string | null = null
    if (diagnosing) {
      const reason: ProcrastinationReason | null = blockAnswer?.reason ?? null
      if (reason) {
        await updateNode(diagnosing, { blockReason: reason })
        naming = BLOCK_NAMED[reason]
      }
      setDiagnosing(null)
    }

    const reply = await askCoach({
      text: trimmed,
      state: buildState(focus),
      closedToday,
      self: profile.self,
      observations,
      usedConcepts: usedConcepts.current,
      usedTriggers: usedTriggers.current,
      history: messages.slice(-10).map((m) => ({ role: m.role, text: m.text })),
    })
    if (reply.conceptId) usedConcepts.current = [...usedConcepts.current, reply.conceptId]
    if (reply.triggerNamed) usedTriggers.current = [...usedTriggers.current, reply.triggerNamed]
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
      <div className="flex items-center justify-between gap-2 pb-1">
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="focus-ring -ml-1 flex min-h-[44px] items-center gap-1.5 rounded-full px-2 text-[13px] text-muted"
        >
          <History size={14} />
          {showHistory ? 'Tilbage til samtalen' : `Tidligere samtaler (${sessions.length})`}
        </button>
        <button
          onClick={async () => {
            await startSession()
            usedConcepts.current = []
            usedTriggers.current = []
            setPending(null)
            setQueue([])
            setShowHistory(false)
            setOptions([])
          }}
          className="focus-ring -mr-1 flex min-h-[44px] items-center gap-1.5 rounded-full px-2 text-[13px] text-muted"
        >
          <Plus size={14} />
          Ny
        </button>
      </div>

      {showHistory ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto no-scrollbar py-2">
          {sessions.length === 0 && (
            <p className="py-8 text-center text-[14.5px] text-faint">Ingen tidligere samtaler.</p>
          )}
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`flex items-start gap-3 rounded-xl2 border p-4 ${
                session.id === activeSessionId ? 'border-ink/25 bg-accent-soft/40' : 'border-line bg-surface'
              }`}
            >
              <button
                onClick={() => {
                  openSession(session.id)
                  usedConcepts.current = []
                  usedTriggers.current = []
                  setPending(null)
                  setQueue([])
                  setShowHistory(false)
                  setOptions([])
                }}
                className="focus-ring min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-[15px] font-medium">{session.title}</span>
                <span className="mt-0.5 block text-[12.5px] text-faint">
                  {new Date(session.updatedAt).toLocaleDateString('da-DK', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · {session.messageCount} beskeder
                </span>
              </button>
              <button
                onClick={() => void deleteSession(session.id)}
                aria-label="Slet samtale"
                className="focus-ring -mr-1 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-faint"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}

          {memories.filter((m) => !m.dismissed).length > 0 && (
            <div className="mt-6">
              <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Hvad jeg har lagt mærke til</p>
              <div className="mt-2.5 space-y-2">
                {memories
                  .filter((m) => !m.dismissed)
                  .slice(0, 6)
                  .map((m) => (
                    <div key={m.id} className="rounded-xl2 border border-line bg-surface p-4">
                      <p className="flex items-start gap-2 text-[14.5px] leading-snug">
                        <Sparkles size={14} className="mt-0.5 shrink-0 text-warm" />
                        {m.text}
                      </p>
                      {m.evidence && <p className="mt-1.5 pl-6 text-[12.5px] text-faint">{m.evidence}</p>}
                      <button
                        onClick={() => void dismissMemory(m.id)}
                        className="focus-ring mt-1.5 flex min-h-[44px] items-center pl-6 text-[12.5px] text-faint"
                      >
                        Det passer ikke på mig
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      ) : (
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
              data-role={m.role}
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
      )}

      {!showHistory && action && (
        <button
          onClick={() => void runAction(action)}
          className="focus-ring mb-2 min-h-[48px] w-full rounded-xl2 bg-accent-soft text-[15px] font-medium active:scale-[0.99]"
        >
          {actionLabel(action)}
        </button>
      )}

      {!showHistory && options.length > 0 && (
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

      {!showHistory && (
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
          placeholder="Skriv eller tal…"
          className="min-h-[50px] min-w-0 flex-1 rounded-xl2 border border-line bg-surface px-4 text-[16px] outline-none placeholder:text-faint focus:border-ink/20"
        />
        <MicButton onText={setInput} existing={input} label="Fortæl coachen hvad der sker" />
        {/*
          Disabled while the field is empty. It used to be fully lit and simply
          do nothing when pressed, which reads as the app being broken rather
          than as the field being empty.
        */}
        <button
          type="submit"
          aria-label="Send"
          disabled={!input.trim()}
          className={`focus-ring grid h-[50px] w-[50px] shrink-0 place-items-center rounded-xl2 transition ${
            input.trim() ? 'bg-ink text-canvas active:scale-95' : 'bg-line/60 text-faint'
          }`}
        >
          <Send size={18} />
        </button>
      </form>
      )}

      <p className="pb-2 text-center text-[11.5px] leading-relaxed text-faint/80">
        Coachen er en hjælper, ikke psykolog, læge eller behandler. Alt bliver på din telefon.
      </p>
    </div>
  )
}
