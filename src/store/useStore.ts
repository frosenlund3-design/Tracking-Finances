import { create } from 'zustand'
import { db, defaultPrefs, defaultProfile, loadAll, openNode, putNode, putNodes, ROOT_ID, uid } from '@/db/db'
import { buildBaseTree, buildDemoTree } from '@/db/seed'
import type {
  BrainDumpEntry,
  ClaimedReward,
  CoachMemory,
  CoachMessage,
  CoachSession,
  Completion,
  EnergyLevel,
  LoopNode,
  Note,
  RewardEvent,
  RewardGoal,
  RewardKind,
  UserPreferences,
  UserProfile,
} from '@/db/types'
import { actionableLeaves, areaOf, canFocus, isParkedNow, makeNode, toMap, toStep, type NodeMap } from '@/lib/nodes'
import { computeMentalLoad, type MentalLoad } from '@/lib/mentalLoad'
import { rankTasks, scoreTask, xpFor, type ScoredTask } from '@/lib/scoring'
import { buildFocus, SHORTLIST_SIZE, type Focus } from '@/lib/focus'
import { decompose, type Granularity } from '@/lib/decompose'
import type { ParsedLoop } from '@/lib/brainDump'
import type { HabitMention } from '@/lib/habits'
import { REWARD_XP, rewardLine } from '@/lib/rewards'
import { haptic, setHapticsEnabled } from '@/lib/haptics'
import { isoDate, parseIso } from '@/lib/time'
import { calibrationFrom, MAX_CREDIBLE_MINUTES, NEUTRAL, type Calibration } from '@/lib/calibration'
import { urgencyFor } from '@/lib/deadlines'
import { xpTargetFor } from '@/lib/giftcards'

/** Placeholder until she has said something worth naming the conversation after. */
const NEW_SESSION_TITLE = 'Ny samtale'
import {
  deriveKey, isStrongEnough, isUnlocked, newSalt, openText, sameVerifier, sealText, setSessionKey, verifierFor,
} from '@/lib/vault'

export type Screen = 'home' | 'map' | 'time' | 'rewards' | 'settings' | 'stats'

export type Overlay =
  | { kind: 'none' }
  | { kind: 'braindump' }
  | { kind: 'whatnow' }
  | { kind: 'start'; nodeId: string }
  | { kind: 'bodydouble'; nodeId: string }
  | { kind: 'coach'; nodeId?: string; ask?: boolean }
  | { kind: 'rescue' }
  | { kind: 'node'; nodeId: string }
  | { kind: 'energy' }
  | { kind: 'notes' }
  | { kind: 'plan' }
  | { kind: 'self' }
  | { kind: 'quickadd'; parentId: string }

export interface Celebration {
  id: string
  title: string
  line: string
  xp: number
  big: boolean
}

export type AuthState = 'none' | 'locked' | 'unlocked'

interface State {
  ready: boolean
  authState: AuthState
  authName?: string
  nodes: LoopNode[]
  map: NodeMap
  profile: UserProfile
  prefs: UserPreferences
  completions: Completion[]
  rewards: RewardEvent[]
  dumps: BrainDumpEntry[]
  claimed: ClaimedReward[]
  coachMessages: CoachMessage[]
  notes: Note[]
  coachSessions: CoachSession[]
  memories: CoachMemory[]
  /** The conversation currently open. */
  activeSessionId: string | null

  screen: Screen
  overlay: Overlay
  focusId: string
  celebration: Celebration | null
  /** Tasks the user said "not now" to in this session. */
  skipped: string[]
  daysAway: number

  init: () => Promise<void>
  setScreen: (s: Screen) => void
  openOverlay: (o: Overlay) => void
  closeOverlay: () => void
  setFocus: (id: string) => void
  focusUp: () => void
  dismissCelebration: () => void

  saveProfile: (patch: Partial<UserProfile>) => Promise<void>
  savePrefs: (patch: Partial<UserPreferences>) => Promise<void>
  setEnergy: (energy: EnergyLevel) => Promise<void>

  addNode: (input: { title: string; parentId: string; minutes?: number; autoBreak?: boolean }) => Promise<LoopNode>
  addHabits: (habits: HabitMention[], cue?: string | null) => Promise<LoopNode[]>
  ensureFocus: () => Promise<void>
  updateNode: (id: string, patch: Partial<LoopNode>) => Promise<void>
  moveNode: (id: string, newParentId: string) => Promise<boolean>
  renameNode: (id: string, title: string) => Promise<void>
  deleteNode: (id: string) => Promise<void>
  completeNode: (id: string, via: Completion['via'], opts?: { actualMinutes?: number }) => Promise<void>
  dropNode: (id: string) => Promise<void>
  delegateNode: (id: string) => Promise<void>
  startNode: (id: string) => Promise<void>
  parkNode: (id: string, until: number) => Promise<void>
  unparkNode: (id: string) => Promise<void>
  postponeNode: (id: string) => Promise<void>
  toggleStep: (nodeId: string, stepId: string) => Promise<void>
  addStep: (nodeId: string, title: string) => Promise<void>
  captureStep: (nodeId: string, stepId: string, text: string) => Promise<void>
  addNote: (text: string, nodeId?: string) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  breakDown: (nodeId: string, granularity?: Granularity) => Promise<boolean>
  setGoodEnough: (nodeId: string, note: string) => Promise<void>
  schedule: (nodeId: string, date?: string, part?: LoopNode['scheduledPart']) => Promise<void>
  setDue: (
    nodeId: string,
    date: string,
    time: string,
    kind: 'deadline' | 'appointment',
  ) => Promise<void>

  commitBrainDump: (raw: string, parsed: ParsedLoop[]) => Promise<number>
  award: (kind: RewardKind, opts?: { xp?: number; label?: string; nodeId?: string }) => Promise<void>

  declareDayDone: () => Promise<void>
  wantMoreToday: () => Promise<void>

  setRewardGoal: (storeId: string, amountDKK: 50 | 100 | 200) => Promise<void>
  clearRewardGoal: () => Promise<void>
  claimReward: () => Promise<ClaimedReward | null>

  addCoachMessage: (m: Omit<CoachMessage, 'id' | 'createdAt'>) => Promise<CoachMessage>
  clearCoach: () => Promise<void>
  startCoachSession: (title?: string) => Promise<string>
  openCoachSession: (id: string) => void
  renameCoachSession: (id: string, title: string) => Promise<void>
  deleteCoachSession: (id: string) => Promise<void>
  rememberObservations: (observations: Array<{ id: string; kind: CoachMemory['kind']; text: string; evidence?: string }>) => Promise<void>
  dismissMemory: (id: string) => Promise<void>

  createLock: (password: string, name?: string) => Promise<{ ok: boolean; error?: string }>
  unlock: (password: string) => Promise<{ ok: boolean; error?: string }>
  removeLock: (password: string) => Promise<{ ok: boolean; error?: string }>
  lockNow: () => void

  loadDemoData: () => Promise<void>
  removeDemoData: () => Promise<void>
  reload: () => Promise<void>
}

function applyTheme(theme: UserProfile['theme'], reduced: boolean) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.setAttribute('data-calm', reduced ? 'on' : 'off')
  const meta = document.querySelector('meta[name="theme-color"]')
  const bg = getComputedStyle(root).getPropertyValue('--c-canvas').trim()
  if (meta && bg) meta.setAttribute('content', `rgb(${bg.replace(/\s+/g, ',')})`)
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  authState: 'none',
  nodes: [],
  map: {},
  profile: defaultProfile(),
  prefs: defaultPrefs(),
  completions: [],
  rewards: [],
  dumps: [],
  claimed: [],
  coachMessages: [],
  notes: [],
  coachSessions: [],
  memories: [],
  activeSessionId: null,

  screen: 'home',
  overlay: { kind: 'none' },
  focusId: ROOT_ID,
  celebration: null,
  skipped: [],
  daysAway: 0,

  async init() {
    const authRow = await db.auth.get('auth')
    if (authRow && !isUnlocked()) {
      // Nothing is read until the password is entered, so no content ever
      // reaches the screen behind the lock.
      set({ ready: true, authState: 'locked', authName: authRow.name })
      return
    }

    let data = await loadAll()

    if (data.nodes.length === 0) {
      const base = buildBaseTree()
      const withDemo = import.meta.env.DEV ? buildDemoTree(base) : base
      await putNodes(withDemo)
      await db.profile.put(data.profile)
      await db.prefs.put(data.prefs)
      data = await loadAll()
    }

    const daysAway = Math.floor((Date.now() - (data.prefs.lastOpenedAt || Date.now())) / 86_400_000)

    // Parked loops wake themselves up. The user never has to remember.
    const now = Date.now()
    const woken = data.nodes.filter((n) => n.status === 'parked' && (n.parkedUntil ?? 0) <= now)
    if (woken.length) {
      const updated = woken.map((n) => ({ ...n, status: 'open' as const, parkedUntil: undefined, updatedAt: now }))
      await putNodes(updated)
      data.nodes = data.nodes.map((n) => updated.find((u) => u.id === n.id) ?? n)
    }

    // Urgency is derived from the clock, so it has to be re-derived as days
    // pass. Otherwise a deadline set last week stays labelled "om 3 dage".
    const restamped = data.nodes.filter((n) => n.dueAt && urgencyFor(n, now) !== n.urgency)
    if (restamped.length) {
      const updated = restamped.map((n) => ({ ...n, urgency: urgencyFor(n, now), updatedAt: now }))
      await putNodes(updated)
      data.nodes = data.nodes.map((n) => updated.find((u) => u.id === n.id) ?? n)
    }

    const today = isoDate(new Date())
    const map = toMap(data.nodes)
    const prefs = { ...data.prefs, lastOpenedAt: now }
    if (prefs.loadSnapshotDate !== today) {
      // Taken on the first opening of the day, so "mental load er faldet X%"
      // measures the day rather than the session.
      prefs.loadSnapshot = computeMentalLoad(data.nodes, map).percent
      prefs.loadSnapshotDate = today
      // A new day is a fresh one. Yesterday's "finished" never carries over,
      // and neither do the extras she asked for.
      prefs.doneForDay = undefined
      prefs.extraToday = 0
      prefs.extraTodayDate = today
    }
    await db.prefs.put(prefs)
    setHapticsEnabled(prefs.haptics)
    applyTheme(data.profile.theme, prefs.reducedStimulation)

    set({
      ready: true,
      authState: authRow ? 'unlocked' : 'none',
      authName: authRow?.name,
      nodes: data.nodes,
      map,
      profile: data.profile,
      prefs,
      completions: data.completions,
      rewards: data.rewards,
      dumps: data.dumps,
      claimed: data.claimed,
      coachMessages: data.coachMessages,
      notes: data.notes,
      coachSessions: data.coachSessions,
      memories: data.memories,
      daysAway,
    })

    if (daysAway >= 3 && data.profile.onboarded) {
      await get().award('return-after-break')
    }
  },

  setScreen: (screen) => set({ screen, overlay: { kind: 'none' } }),
  openOverlay: (overlay) => set({ overlay }),
  closeOverlay: () => set({ overlay: { kind: 'none' } }),
  setFocus: (focusId) => {
    const { map, focusId: current } = get()
    // Stepping inward is one circle at a time. Anything further in is reached
    // by walking, so the user always sees the level in between.
    if (!map[focusId] || !canFocus(map, current, focusId)) {
      set({ screen: 'map' })
      return
    }
    set({ focusId, screen: 'map' })
  },
  focusUp: () => {
    const { map, focusId } = get()
    const parent = map[focusId]?.parentId
    if (parent) set({ focusId: parent })
  },
  dismissCelebration: () => set({ celebration: null }),

  async saveProfile(patch) {
    const profile = { ...get().profile, ...patch }
    await db.profile.put(profile)
    applyTheme(profile.theme, get().prefs.reducedStimulation)
    set({ profile })
  },

  async savePrefs(patch) {
    const prefs = { ...get().prefs, ...patch }
    await db.prefs.put(prefs)
    if (patch.haptics !== undefined) setHapticsEnabled(prefs.haptics)
    if (patch.reducedStimulation !== undefined) applyTheme(get().profile.theme, prefs.reducedStimulation)
    set({ prefs })
  },

  async setEnergy(energy) {
    await get().savePrefs({ currentEnergy: energy, energySetAt: Date.now() })
  },

  async addNode({ title, parentId, minutes, autoBreak = true }) {
    const parent = get().map[parentId] ?? get().map[ROOT_ID]
    const breakdown = autoBreak && get().profile.autoBreakdown ? decompose(title) : null
    const node = makeNode({
      title,
      parentId: parent.id,
      area: parent.area,
      estimatedMinutes: minutes ?? breakdown?.minutes ?? get().profile.defaultTaskMinutes,
      steps: breakdown?.steps,
    })
    if (breakdown) {
      node.stepsAutoGenerated = true
      if (breakdown.goodEnough) node.goodEnoughNote = breakdown.goodEnough
      // Only a genuinely long job gets the extra weight. Having a breakdown at
      // all no longer distinguishes anything, since every task gets one now,
      // and adding a point to all of them just makes the head look fuller than
      // it is.
      if ((breakdown.minutes ?? 0) >= 30) {
        node.mentalWeight = Math.min(5, node.mentalWeight + 1) as LoopNode['mentalWeight']
      }
    }
    const updatedParent = { ...parent, childIds: [...parent.childIds, node.id], updatedAt: Date.now() }
    await putNodes([node, updatedParent])
    const nodes = [...get().nodes.map((n) => (n.id === parent.id ? updatedParent : n)), node]
    set({ nodes, map: toMap(nodes) })
    return node
  },

  /**
   * Turn routines she named into loops that come back.
   *
   * Three things are deliberate here.
   *
   * Every one gets scheduledDate = today. Without a date, closing a recurring
   * loop reopens it on the spot, so ticking "Tøm skraldespanden" would hand it
   * straight back. With one, closing it moves it to the next occurrence and it
   * is genuinely gone for the day, which is the entire promise.
   *
   * They get no auto-decomposition. Steps on "Red sengen" is the app being
   * silly at somebody who has done it ten thousand times, and it is the kind of
   * thing that makes a tool feel like it thinks you are stupid.
   *
   * They get the cue if there is one, so the plan reads "når jeg har tørret
   * køkkenbordet af, tager jeg min medicin" rather than naming a time.
   */
  async addHabits(habits, cue) {
    if (!habits.length) return []
    const { map, nodes: existing } = get()
    const areas = existing.filter((n) => n.isArea && n.id !== ROOT_ID && n.status !== 'done')
    const today = isoDate(new Date())

    const made: LoopNode[] = []
    const parentPatch = new Map<string, LoopNode>()

    for (const h of habits) {
      const home = areas.find((a) => a.area === h.area) ?? map[ROOT_ID]
      const node = makeNode({
        title: h.title,
        parentId: home.id,
        area: h.area,
        estimatedMinutes: h.minutes,
        mentalWeight: 1,
        energyRequired: h.minutes <= 5 ? 10 : 30,
      })
      node.repeat = h.cadence.unit
      node.repeatEvery = h.cadence.every
      node.scheduledDate = today
      // The cue only makes sense on something that happens every time the cue
      // does. A weekly loop hung on a daily anchor fires on the six wrong days.
      if (cue && h.cadence.unit === 'day' && h.cadence.every === 1) node.cue = cue
      made.push(node)

      const current = parentPatch.get(home.id) ?? home
      parentPatch.set(home.id, { ...current, childIds: [...current.childIds, node.id], updatedAt: Date.now() })
    }

    const parents = [...parentPatch.values()]
    await putNodes([...made, ...parents])
    const nodes = [...existing.map((n) => parentPatch.get(n.id) ?? n), ...made]
    set({ nodes, map: toMap(nodes) })
    return made
  },

  /**
   * Fix today's shortlist, once, and leave it alone.
   *
   * Called when the day screen opens. If the stored list is from today it is
   * kept exactly as it is, minus anything closed since; only a new day, or an
   * empty list, picks fresh. That is the whole fix for "det er ret random
   * hvilken task den putter ind": nothing reshuffles between two glances at the
   * screen, so the order can be argued with instead of just endured.
   */
  async ensureFocus() {
    const state = get()
    const today = isoDate(new Date())
    const focus = buildFocus({
      map: state.map,
      ctx: {
        energy: state.prefs.currentEnergy,
        now: new Date(),
        profile: state.profile,
        goodEnoughMode: state.prefs.goodEnoughMode,
      },
      prefs: state.prefs,
      skipped: state.skipped,
    })
    const ids = focus.shortlist.slice(0, SHORTLIST_SIZE).map((t) => t.node.id)
    const same =
      state.prefs.focusDate === today &&
      (state.prefs.focusIds ?? []).length === ids.length &&
      (state.prefs.focusIds ?? []).every((id, i) => id === ids[i])
    if (same) return
    await get().savePrefs({ focusDate: today, focusIds: ids })
  },

  async updateNode(id, patch) {
    const current = get().map[id]
    if (!current) return
    const next = { ...current, ...patch, updatedAt: Date.now() }
    await putNode(next)
    const nodes = get().nodes.map((n) => (n.id === id ? next : n))
    set({ nodes, map: toMap(nodes) })
  },

  /**
   * Move a loop into a different circle.
   *
   * Refuses to move something into itself or into one of its own children,
   * which would cut that whole branch loose from the tree and make it
   * unreachable from anywhere. A silent no is better than a lost branch.
   */
  async moveNode(id, newParentId) {
    const { map } = get()
    const node = map[id]
    const target = map[newParentId]
    if (!node || !target || id === newParentId || node.parentId === newParentId) return false

    let cursor: string | null | undefined = newParentId
    while (cursor) {
      if (cursor === id) return false
      cursor = map[cursor]?.parentId
    }

    const oldParent = node.parentId ? map[node.parentId] : undefined
    const now = Date.now()
    const next: LoopNode[] = [
      { ...node, parentId: newParentId, area: target.area, updatedAt: now },
      { ...target, childIds: [...target.childIds.filter((c) => c !== id), id], updatedAt: now },
    ]
    if (oldParent && oldParent.id !== newParentId) {
      next.push({ ...oldParent, childIds: oldParent.childIds.filter((c) => c !== id), updatedAt: now })
    }
    await putNodes(next)
    const nodes = get().nodes.map((n) => next.find((x) => x.id === n.id) ?? n)
    set({ nodes, map: toMap(nodes) })
    return true
  },

  async renameNode(id, title) {
    await get().updateNode(id, { title: title.trim() })
  },

  async deleteNode(id) {
    if (id === ROOT_ID) return
    const { map, nodes } = get()
    const doomed = new Set<string>([id])
    const stack = [...(map[id]?.childIds ?? [])]
    while (stack.length) {
      const cid = stack.pop()!
      if (doomed.has(cid)) continue
      doomed.add(cid)
      stack.push(...(map[cid]?.childIds ?? []))
    }
    const parentId = map[id]?.parentId
    const remaining = nodes.filter((n) => !doomed.has(n.id))
    const updated: LoopNode[] = []
    if (parentId && map[parentId]) {
      const p = { ...map[parentId], childIds: map[parentId].childIds.filter((c) => c !== id), updatedAt: Date.now() }
      updated.push(p)
    }
    await db.nodes.bulkDelete([...doomed])
    if (updated.length) await putNodes(updated)
    const nextNodes = remaining.map((n) => updated.find((u) => u.id === n.id) ?? n)
    set({ nodes: nextNodes, map: toMap(nextNodes), overlay: { kind: 'none' } })
  },

  async completeNode(id, via, opts) {
    await closeLoop(get, set, id, 'done', via, opts?.actualMinutes)
  },

  async dropNode(id) {
    await closeLoop(get, set, id, 'dropped', 'manual')
    await get().award('decision-made')
  },

  async delegateNode(id) {
    await closeLoop(get, set, id, 'delegated', 'manual')
  },

  async startNode(id) {
    const node = get().map[id]
    if (!node || node.status === 'active') return
    await get().updateNode(id, { status: 'active', startedAt: Date.now() })
    await get().award('task-started', { nodeId: id })
    haptic('tap')
  },

  async parkNode(id, until) {
    await get().updateNode(id, { status: 'parked', parkedUntil: until })
    haptic('soft')
  },

  async unparkNode(id) {
    await get().updateNode(id, { status: 'open', parkedUntil: undefined })
  },

  async postponeNode(id) {
    const node = get().map[id]
    if (!node) return
    await get().updateNode(id, {
      avoidanceCount: node.avoidanceCount + 1,
      frictionScore: node.frictionScore + 1,
    })
    set({ skipped: [...get().skipped, id] })
  },

  async toggleStep(nodeId, stepId) {
    const node = get().map[nodeId]
    if (!node) return
    const steps = node.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s))
    await get().updateNode(nodeId, { steps })
    haptic('step')
  },

  /**
   * A step she asked for herself, added at the bottom.
   *
   * At the bottom on purpose: dropping a new step into the middle of a list
   * she is halfway through moves the goalposts while she is looking at them.
   */
  async addStep(nodeId, title) {
    const node = get().map[nodeId]
    const text = title.trim()
    if (!node || !text) return
    if (node.steps.some((s) => s.title.trim().toLowerCase() === text.toLowerCase())) return
    await get().updateNode(nodeId, { steps: [...node.steps, toStep(text, node.steps.length)] })
    haptic('step')
  },

  async captureStep(nodeId, stepId, text) {
    const node = get().map[nodeId]
    if (!node) return
    const steps = node.steps.map((s) => (s.id === stepId ? { ...s, captured: text } : s))
    await get().updateNode(nodeId, { steps })
  },

  async addNote(text, nodeId) {
    const note: Note = { id: uid('note'), text: text.trim(), createdAt: Date.now(), nodeId }
    if (!note.text) return
    await db.notes.put({ ...note, text: await sealText(note.text) })
    set({ notes: [note, ...get().notes] })
  },

  async deleteNote(id) {
    await db.notes.delete(id)
    set({ notes: get().notes.filter((n) => n.id !== id) })
  },

  async breakDown(nodeId, granularity) {
    const node = get().map[nodeId]
    if (!node) return false
    const breakdown = decompose(node.title, granularity ? { granularity } : {})
    if (!breakdown) return false

    // Sliding the detail up or down should *change* the list, not stack a new
    // one on top of the old. But never at the cost of work she has already
    // done: if she has ticked something off, we only add what is missing.
    const touched = node.steps.some((s) => s.done)
    if (node.stepsAutoGenerated && !touched) {
      const rebuilt = breakdown.steps.map((t, i) => toStep(t, i))
      if (!rebuilt.length) return false
      await get().updateNode(nodeId, {
        steps: rebuilt,
        stepsAutoGenerated: true,
        goodEnoughNote: node.goodEnoughNote ?? breakdown.goodEnough,
      })
      return true
    }

    const existing = new Set(node.steps.map((s) => s.title.toLowerCase()))
    const fresh = breakdown.steps.filter((s) => !existing.has(s.toLowerCase())).map((t, i) => toStep(t, node.steps.length + i))
    if (!fresh.length) return false
    await get().updateNode(nodeId, {
      steps: [...node.steps, ...fresh],
      stepsAutoGenerated: true,
      goodEnoughNote: node.goodEnoughNote ?? breakdown.goodEnough,
    })
    return true
  },

  async setGoodEnough(nodeId, note) {
    await get().updateNode(nodeId, { goodEnoughNote: note })
  },

  async schedule(nodeId, date, part) {
    await get().updateNode(nodeId, { scheduledDate: date, scheduledPart: part })
  },

  async setDue(nodeId, date, time, kind) {
    if (!date) return
    const [y, m, d] = date.split('-').map(Number)
    const [hh, mm] = time ? time.split(':').map(Number) : [23, 59]
    const when = new Date(y, m - 1, d, hh, mm, 0, 0)
    const node = { ...get().map[nodeId], dueAt: when.getTime(), dueKind: kind, dueHasTime: !!time }
    await get().updateNode(nodeId, {
      dueAt: when.getTime(),
      dueKind: kind,
      dueHasTime: !!time,
      // Urgency is derived, never typed in, one source of truth for "haster".
      urgency: urgencyFor(node),
      scheduledDate: isoDate(when),
    })
  },

  async commitBrainDump(raw, parsed) {
    const { map } = get()
    const nodesById: NodeMap = { ...map }
    const created: LoopNode[] = []
    const touched = new Set<string>()

    const ensurePath = (path: string[]): string => {
      let parentId = ROOT_ID
      for (const title of path) {
        const parent = nodesById[parentId]
        const existing = parent.childIds
          .map((c) => nodesById[c])
          .find((c) => c && c.title.toLowerCase() === title.toLowerCase())
        if (existing) {
          parentId = existing.id
          continue
        }
        const node = makeNode({ title, parentId, area: parent.area, isArea: true, estimatedMinutes: 0, mentalWeight: 1 })
        nodesById[node.id] = node
        created.push(node)
        nodesById[parentId] = { ...parent, childIds: [...parent.childIds, node.id], updatedAt: Date.now() }
        touched.add(parentId)
        parentId = node.id
      }
      return parentId
    }

    // Tasks first, so a note can be attached to the loop it was written beside.
    const createdByIndex: Array<LoopNode | null> = []

    for (const item of parsed) {
      if (item.kind === 'note') {
        createdByIndex.push(null)
        continue
      }
      const parentId = ensurePath(item.path)
      const parent = nodesById[parentId]
      const node = makeNode({
        title: item.title,
        parentId,
        area: item.area,
        estimatedMinutes: item.estimatedMinutes,
        mentalWeight: item.mentalWeight,
        energyRequired: item.energyRequired,
        steps: item.steps,
        description: item.aside,
      })
      node.urgency = item.urgency
      node.scheduledDate = item.scheduledDate
      node.scheduledPart = item.scheduledPart
      node.goodEnoughNote = item.goodEnough
      node.stepsAutoGenerated = item.steps.length > 0
      node.repeat = item.repeat
      node.repeatEvery = item.repeatEvery
      if (item.due) {
        node.dueAt = item.due.at
        node.dueKind = item.due.kind
        node.dueHasTime = item.due.hasTime
        node.urgency = urgencyFor(node)
      }
      nodesById[node.id] = node
      created.push(node)
      createdByIndex.push(node)
      nodesById[parentId] = { ...parent, childIds: [...parent.childIds, node.id], updatedAt: Date.now() }
      touched.add(parentId)
    }

    // Notes never become loops, they carry no mental load and cannot be
    // "done". They hang off the task they belong with, or stand alone.
    const noteRecords: Note[] = []
    parsed.forEach((item, i) => {
      if (item.kind !== 'note') return
      const host = item.attachTo !== undefined ? createdByIndex[item.attachTo] : null
      noteRecords.push({
        id: uid('note'),
        text: item.title,
        createdAt: Date.now() + i,
        nodeId: host?.id,
      })
    })

    const touchedNodes = [...touched].map((id) => nodesById[id]).filter((n) => !created.includes(n))
    await putNodes([...created, ...touchedNodes])

    if (noteRecords.length) {
      await db.notes.bulkPut(
        await Promise.all(noteRecords.map(async (n) => ({ ...n, text: await sealText(n.text) }))),
      )
    }

    const entry: BrainDumpEntry = {
      id: uid('d'),
      raw,
      createdAt: Date.now(),
      createdNodeIds: created.map((n) => n.id),
      processed: true,
    }
    await db.dumps.put({ ...entry, raw: await sealText(entry.raw) })

    const nextNodes = Object.values(nodesById)
    set({
      nodes: nextNodes,
      map: toMap(nextNodes),
      dumps: [entry, ...get().dumps],
      notes: [...noteRecords, ...get().notes],
    })
    await get().award('brain-dump')
    haptic('success')
    return created.filter((n) => !n.isArea).length
  },

  async award(kind, opts = {}) {
    const xp = opts.xp ?? REWARD_XP[kind]
    if (xp <= 0 && kind !== 'loop-closed') return
    const event: RewardEvent = {
      id: uid('r'),
      kind,
      xp,
      label: opts.label ?? rewardLine(kind),
      createdAt: Date.now(),
      nodeId: opts.nodeId,
    }
    await db.rewards.put(event)
    const prefs = { ...get().prefs, totalXP: get().prefs.totalXP + xp }
    await db.prefs.put(prefs)
    set({ prefs, rewards: [event, ...get().rewards].slice(0, 200) })
  },

  async declareDayDone() {
    await get().savePrefs({ doneForDay: isoDate(new Date()) })
    haptic('success')
  },

  async wantMoreToday() {
    // Never a lock. Asking for one more raises today's bar by one and clears
    // the "finished" flag, clearing the flag alone would do nothing, since
    // the goal she already reached would immediately close the day again.
    const today = isoDate(new Date())
    const { prefs } = get()
    const extra = prefs.extraTodayDate === today ? (prefs.extraToday ?? 0) : 0
    await get().savePrefs({ doneForDay: undefined, extraToday: extra + 1, extraTodayDate: today })
    set({ skipped: [] })
  },

  async setRewardGoal(storeId, amountDKK) {
    const goal: RewardGoal = {
      storeId,
      amountDKK,
      xpTarget: xpTargetFor(amountDKK),
      startedAt: Date.now(),
    }
    await get().savePrefs({ rewardGoal: goal })
  },

  async clearRewardGoal() {
    await get().savePrefs({ rewardGoal: undefined })
  },

  async claimReward() {
    const { prefs } = get()
    const goal = prefs.rewardGoal
    if (!goal) return null
    const available = prefs.totalXP - prefs.spentXP
    if (available < goal.xpTarget) return null
    const claim: ClaimedReward = {
      id: uid('c'),
      storeId: goal.storeId,
      amountDKK: goal.amountDKK,
      xpSpent: goal.xpTarget,
      claimedAt: Date.now(),
    }
    await db.claimed.put(claim)
    await get().savePrefs({ spentXP: prefs.spentXP + goal.xpTarget, rewardGoal: undefined })
    set({ claimed: [claim, ...get().claimed] })
    haptic('success')
    return claim
  },

  async addCoachMessage(m) {
    const message: CoachMessage = { ...m, id: uid('m'), createdAt: Date.now() }
    await db.coachMessages.put({ ...message, text: await sealText(message.text) })

    // Keep the session index current so history stays findable and resumable.
    const session = get().coachSessions.find((c) => c.id === m.sessionId)
    if (session) {
      const updated: CoachSession = {
        ...session,
        updatedAt: message.createdAt,
        messageCount: session.messageCount + 1,
        // The first thing *she* says names the conversation. Not the message
        // count, the coach opens with a greeting, so by the time she writes
        // anything the count is already 1 and every session stayed "Ny samtale".
        title:
          session.title === NEW_SESSION_TITLE && m.role === 'user'
            ? m.text.slice(0, 60)
            : session.title,
      }
      await db.coachSessions.put({ ...updated, title: await sealText(updated.title) })
      set({
        coachSessions: [updated, ...get().coachSessions.filter((c) => c.id !== updated.id)],
      })
    }

    set({ coachMessages: [...get().coachMessages, message].slice(-400) })
    return message
  },

  async startCoachSession(title) {
    const session: CoachSession = {
      id: uid('cs'),
      startedAt: Date.now(),
      updatedAt: Date.now(),
      title: title ?? NEW_SESSION_TITLE,
      messageCount: 0,
      outcome: 'open',
    }
    await db.coachSessions.put({ ...session, title: await sealText(session.title) })
    set({ coachSessions: [session, ...get().coachSessions], activeSessionId: session.id })
    return session.id
  },

  openCoachSession(id) {
    set({ activeSessionId: id })
  },

  async renameCoachSession(id, title) {
    const session = get().coachSessions.find((c) => c.id === id)
    if (!session) return
    const updated = { ...session, title }
    await db.coachSessions.put({ ...updated, title: await sealText(title) })
    set({ coachSessions: get().coachSessions.map((c) => (c.id === id ? updated : c)) })
  },

  async deleteCoachSession(id) {
    await db.coachMessages.where('sessionId').equals(id).delete()
    await db.coachSessions.delete(id)
    set({
      coachSessions: get().coachSessions.filter((c) => c.id !== id),
      coachMessages: get().coachMessages.filter((m) => m.sessionId !== id),
      activeSessionId: get().activeSessionId === id ? null : get().activeSessionId,
    })
  },

  async rememberObservations(observations) {
    const existing = new Map(get().memories.map((m) => [m.id, m]))
    const next: CoachMemory[] = []
    for (const o of observations) {
      const prior = existing.get(o.id)
      next.push({
        id: o.id,
        kind: o.kind,
        text: o.text,
        evidence: o.evidence,
        createdAt: prior?.createdAt ?? Date.now(),
        // Strength is how many times the app has seen the pattern hold.
        strength: (prior?.strength ?? 0) + 1,
        dismissed: prior?.dismissed,
      })
    }
    if (!next.length) return
    await db.memories.bulkPut(
      await Promise.all(next.map(async (m) => ({ ...m, text: await sealText(m.text) }))),
    )
    const merged = [...next, ...get().memories.filter((m) => !next.some((n) => n.id === m.id))]
    set({ memories: merged })
  },

  async dismissMemory(id) {
    const memory = get().memories.find((m) => m.id === id)
    if (!memory) return
    const updated = { ...memory, dismissed: true }
    await db.memories.put({ ...updated, text: await sealText(updated.text) })
    set({ memories: get().memories.map((m) => (m.id === id ? updated : m)) })
  },

  async clearCoach() {
    await db.coachMessages.clear()
    await db.coachSessions.clear()
    set({ coachMessages: [], coachSessions: [], activeSessionId: null })
  },

  async createLock(password, name) {
    if (!isStrongEnough(password)) return { ok: false, error: 'Koden opfylder ikke kravene endnu.' }
    const salt = newSalt()
    const key = await deriveKey(password, salt)
    const verifier = await verifierFor(key)

    setSessionKey(key)
    // Re-write everything through the encryption boundary. Existing rows are
    // plaintext, and sealText is a no-op on anything already sealed.
    const [nodes, dumps, messages, completions, notes] = await Promise.all([
      db.nodes.toArray(), db.dumps.toArray(), db.coachMessages.toArray(), db.completions.toArray(),
      db.notes.toArray(),
    ])
    await putNodes(nodes)
    await db.dumps.bulkPut(await Promise.all(dumps.map(async (d) => ({ ...d, raw: await sealText(d.raw) }))))
    await db.coachMessages.bulkPut(await Promise.all(messages.map(async (m) => ({ ...m, text: await sealText(m.text) }))))
    await db.completions.bulkPut(await Promise.all(completions.map(async (c) => ({ ...c, title: await sealText(c.title) }))))
    await db.notes.bulkPut(await Promise.all(notes.map(async (n) => ({ ...n, text: await sealText(n.text) }))))

    await db.auth.put({ id: 'auth', name: name?.trim() || undefined, salt, iterations: 250_000, verifier, createdAt: Date.now() })
    set({ authState: 'unlocked', authName: name?.trim() || undefined })
    return { ok: true }
  },

  async unlock(password) {
    const row = await db.auth.get('auth')
    if (!row) return { ok: false, error: 'Der er ingen kode på den her telefon.' }
    const key = await deriveKey(password, row.salt, row.iterations)
    if (!sameVerifier(await verifierFor(key), row.verifier)) {
      return { ok: false, error: 'Koden passer ikke. Prøv igen.' }
    }
    setSessionKey(key)
    await get().init()
    return { ok: true }
  },

  async removeLock(password) {
    const row = await db.auth.get('auth')
    if (!row) return { ok: true }
    const key = await deriveKey(password, row.salt, row.iterations)
    if (!sameVerifier(await verifierFor(key), row.verifier)) {
      return { ok: false, error: 'Koden passer ikke.' }
    }

    // Decrypt with the key, then write back in the clear.
    const [nodes, dumps, messages, completions, notes] = await Promise.all([
      db.nodes.toArray(), db.dumps.toArray(), db.coachMessages.toArray(), db.completions.toArray(),
      db.notes.toArray(),
    ])
    const plainNodes = await Promise.all(nodes.map((n) => openNode(n, key)))
    const plainDumps = await Promise.all(dumps.map(async (d) => ({ ...d, raw: await openText(d.raw, key) })))
    const plainMessages = await Promise.all(messages.map(async (m) => ({ ...m, text: await openText(m.text, key) })))
    const plainCompletions = await Promise.all(completions.map(async (c) => ({ ...c, title: await openText(c.title, key) })))
    const plainNotes = await Promise.all(notes.map(async (n) => ({ ...n, text: await openText(n.text, key) })))

    setSessionKey(null)
    await db.nodes.bulkPut(plainNodes)
    await db.dumps.bulkPut(plainDumps)
    await db.coachMessages.bulkPut(plainMessages)
    await db.completions.bulkPut(plainCompletions)
    await db.notes.bulkPut(plainNotes)
    await db.auth.delete('auth')

    set({ authState: 'none', authName: undefined })
    await get().reload()
    return { ok: true }
  },

  lockNow() {
    setSessionKey(null)
    set({
      authState: 'locked',
      nodes: [], map: {}, completions: [], rewards: [], dumps: [], claimed: [], coachMessages: [], notes: [],
      coachSessions: [], memories: [], activeSessionId: null,
      overlay: { kind: 'none' }, screen: 'home', focusId: ROOT_ID,
    })
  },

  async loadDemoData() {
    const existing = get().nodes
    if (existing.some((n) => n.demo)) return
    const all = buildDemoTree(existing)
    await putNodes(all)
    set({ nodes: all, map: toMap(all) })
  },

  async removeDemoData() {
    const { nodes } = get()
    const demoIds = new Set(nodes.filter((n) => n.demo).map((n) => n.id))
    if (!demoIds.size) return
    const remaining = nodes
      .filter((n) => !demoIds.has(n.id))
      .map((n) => ({ ...n, childIds: n.childIds.filter((c) => !demoIds.has(c)) }))
    await db.nodes.bulkDelete([...demoIds])
    await putNodes(remaining)
    set({ nodes: remaining, map: toMap(remaining), focusId: ROOT_ID })
  },

  async reload() {
    const data = await loadAll()
    set({
      nodes: data.nodes,
      map: toMap(data.nodes),
      profile: data.profile,
      prefs: data.prefs,
      completions: data.completions,
      rewards: data.rewards,
      dumps: data.dumps,
      claimed: data.claimed,
      coachMessages: data.coachMessages,
      notes: data.notes,
      coachSessions: data.coachSessions,
      memories: data.memories,
    })
  },
}))

/**
 * How long it really took, when that is knowable.
 *
 * Only counts when she started it and finished in the same sitting. A task
 * started on Monday and closed on Thursday tells us nothing about how long the
 * work takes, and letting it into the average would make every future estimate
 * worse rather than better.
 */
function measuredMinutes(node: LoopNode, now: number): number | undefined {
  if (!node.startedAt) return undefined
  const minutes = (now - node.startedAt) / 60_000
  if (minutes <= 0 || minutes > MAX_CREDIBLE_MINUTES) return undefined
  return Math.round(minutes * 10) / 10
}

/** Shared path for done / dropped / delegated, all of them close a loop. */
/**
 * The next time a recurring loop is due.
 *
 * Always forward from the occurrence that was just closed, never from today, so
 * paying the rent four days late still puts the next one on the first of the
 * month. And always at least tomorrow, so closing something twice in one day
 * does not leave it sitting there apparently due again this afternoon.
 */
function nextOccurrence(from: Date, repeat: 'day' | 'week' | 'month', every = 1): Date {
  const step = Math.max(1, Math.round(every))
  const d = new Date(from)
  const tomorrow = new Date()
  tomorrow.setHours(0, 0, 0, 0)
  tomorrow.setDate(tomorrow.getDate() + 1)
  let guard = 0
  do {
    if (repeat === 'day') d.setDate(d.getDate() + step)
    else if (repeat === 'week') d.setDate(d.getDate() + 7 * step)
    else {
      const day = d.getDate()
      d.setDate(1)
      d.setMonth(d.getMonth() + step)
      // The 31st in a 30-day month lands on the last day of that month rather
      // than sliding into the next one.
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      d.setDate(Math.min(day, last))
    }
  } while (d < tomorrow && guard++ < 400)
  return d
}

async function closeLoop(
  get: () => State,
  set: (partial: Partial<State>) => void,
  id: string,
  kind: Completion['kind'],
  via: Completion['via'],
  /**
   * Measured time, when the caller actually timed it.
   *
   * Start Mode adds up the seconds spent on each step, which is a truer number
   * than "startedAt until now": that one keeps counting while the phone is in
   * a pocket, and one forgotten task left open over lunch would poison the
   * calibration that every duration in the app is put through.
   */
  measured?: number,
): Promise<void> {
  const state = get()
  const node = state.map[id]
  if (!node || node.parentId === null) return

  const now = Date.now()
  const ctx = {
    energy: state.prefs.currentEnergy,
    now: new Date(),
    profile: state.profile,
    goodEnoughMode: state.prefs.goodEnoughMode,
  }
  const score = scoreTask(node, state.map, ctx).score
  const xp = kind === 'done' ? xpFor(node, score) : Math.round(xpFor(node, score) * 0.6)

  const closing: LoopNode[] = []

  if (node.repeat && kind === 'done') {
    // A loop that comes back does not close, it turns over. The completion is
    // logged and the points are paid exactly as normal, and then it reopens
    // for next time with its steps unticked.
    //
    // Nothing accumulates, and that is the design: there is no record of the
    // ones that were missed, no backlog and no broken streak. Only the next one
    // exists. A recurring task that keeps score is a machine for making guilt,
    // and guilt is what stops her opening the app at all.
    closing.push({
      ...node,
      status: 'open',
      completedAt: undefined,
      startedAt: undefined,
      avoidanceCount: 0,
      steps: node.steps.map((st) => ({ ...st, done: false, captured: undefined })),
      dueAt: node.dueAt ? nextOccurrence(new Date(node.dueAt), node.repeat, node.repeatEvery).getTime() : undefined,
      scheduledDate: node.scheduledDate
        ? isoDate(nextOccurrence(parseIso(node.scheduledDate), node.repeat, node.repeatEvery))
        : undefined,
      updatedAt: now,
    })
  } else {
    // Closing a container closes what is left inside it, the whole branch stops
    // costing mental load, which is the point.
    const stack = [id]
    const seen = new Set<string>()
    while (stack.length) {
      const cid = stack.pop()!
      if (seen.has(cid)) continue
      seen.add(cid)
      const n = state.map[cid]
      if (!n) continue
      if (n.status === 'done' || n.status === 'dropped' || n.status === 'delegated') continue
      closing.push({
        ...n,
        status: cid === id ? (kind === 'done' ? 'done' : kind) : 'done',
        completedAt: now,
        updatedAt: now,
      })
      stack.push(...n.childIds)
    }
  }

  const completion: Completion = {
    id: uid('done'),
    nodeId: id,
    title: node.title,
    completedAt: now,
    kind,
    xp,
    via,
    minutes: node.estimatedMinutes,
    actualMinutes: measured ?? measuredMinutes(node, now),
    area: areaOf(state.map, node),
    wasAvoided: node.avoidanceCount >= 2,
    valueDKK: node.valueDKK,
  }

  await putNodes(closing)
  await db.completions.put({ ...completion, title: await sealText(completion.title) })

  const nodes = state.nodes.map((n) => closing.find((c) => c.id === n.id) ?? n)

  // Streak: consecutive days with at least one closed loop. Gaps are silent.
  const today = isoDate(new Date())
  let streak = state.prefs.streak
  if (state.prefs.streakUpdatedAt !== today) {
    const yesterday = isoDate(new Date(Date.now() - 86_400_000))
    streak = state.prefs.streakUpdatedAt === yesterday ? streak + 1 : 1
  }

  const prefs = { ...state.prefs, totalXP: state.prefs.totalXP + xp, streak, streakUpdatedAt: today }
  await db.prefs.put(prefs)

  const wasAvoided = node.avoidanceCount >= 2
  const line =
    kind === 'dropped'
      ? rewardLine('decision-made')
      : wasAvoided
        ? rewardLine('avoided-task')
        : rewardLine('loop-closed')

  const closedTodayBefore = state.completions.filter((c) => isoDate(new Date(c.completedAt)) === today).length

  set({
    nodes,
    map: toMap(nodes),
    prefs,
    completions: [completion, ...state.completions],
    celebration: {
      id: completion.id,
      title: node.title,
      line,
      xp,
      big: wasAvoided || closedTodayBefore === 0 || node.mentalWeight >= 4,
    },
    skipped: state.skipped.filter((s) => s !== id),
  })

  haptic('success')
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function useMentalLoad(): MentalLoad {
  const nodes = useStore((s) => s.nodes)
  const map = useStore((s) => s.map)
  return computeMentalLoad(nodes, map)
}

export function useRanked(): ScoredTask[] {
  const map = useStore((s) => s.map)
  const prefs = useStore((s) => s.prefs)
  const profile = useStore((s) => s.profile)
  const leaves = actionableLeaves(map)
  return rankTasks(map, leaves, {
    energy: prefs.currentEnergy,
    now: new Date(),
    profile,
    goodEnoughMode: prefs.goodEnoughMode,
  })
}

/**
 * The day's shortlist, the one thing to do now, and why that one.
 *
 * Everything the day screen and the what-now sheet lead with comes from here,
 * so they cannot disagree with each other about what matters, which they used
 * to whenever a render landed on a different minute.
 */
export function useFocus(): Focus {
  const map = useStore((s) => s.map)
  const prefs = useStore((s) => s.prefs)
  const profile = useStore((s) => s.profile)
  const skipped = useStore((s) => s.skipped)
  return buildFocus({
    map,
    ctx: {
      energy: prefs.currentEnergy,
      now: new Date(),
      profile,
      goodEnoughMode: prefs.goodEnoughMode,
    },
    prefs,
    skipped,
  })
}

export function useNextTask(): ScoredTask | null {
  return useFocus().now
}

export function useParked(): LoopNode[] {
  const nodes = useStore((s) => s.nodes)
  const now = Date.now()
  return nodes.filter((n) => isParkedNow(n, now)).sort((a, b) => (a.parkedUntil ?? 0) - (b.parkedUntil ?? 0))
}

export function useClosedToday(): number {
  const completions = useStore((s) => s.completions)
  const today = isoDate(new Date())
  return completions.filter((c) => isoDate(new Date(c.completedAt)) === today).length
}

/**
 * The personal time factor. Every duration shown anywhere in the app is put
 * through this, so "2 min" means two of her minutes, not two ideal ones.
 */
export function useCalibration(): Calibration {
  const completions = useStore((s) => s.completions)
  return completions.length ? calibrationFrom(completions) : NEUTRAL
}

export function useAvailableXP(): number {
  const prefs = useStore((s) => s.prefs)
  return Math.max(0, prefs.totalXP - prefs.spentXP)
}

// A handle for end-to-end tests to drive the store directly. Read-only usage;
// the app itself never touches this.
declare global {
  interface Window {
    __loopsStore?: typeof useStore
  }
}
if (typeof window !== 'undefined') window.__loopsStore = useStore
