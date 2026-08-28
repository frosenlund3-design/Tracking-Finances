import { create } from 'zustand'
import { db, defaultPrefs, defaultProfile, loadAll, openNode, putNode, putNodes, ROOT_ID, uid } from '@/db/db'
import { buildBaseTree, buildDemoTree } from '@/db/seed'
import type {
  BrainDumpEntry,
  ClaimedReward,
  CoachMessage,
  Completion,
  EnergyLevel,
  LoopNode,
  RewardEvent,
  RewardGoal,
  RewardKind,
  UserPreferences,
  UserProfile,
} from '@/db/types'
import { actionableLeaves, areaOf, canFocus, isParkedNow, makeNode, toMap, toStep, type NodeMap } from '@/lib/nodes'
import { computeMentalLoad, type MentalLoad } from '@/lib/mentalLoad'
import { rankTasks, scoreTask, xpFor, type ScoredTask } from '@/lib/scoring'
import { decompose } from '@/lib/decompose'
import type { ParsedLoop } from '@/lib/brainDump'
import { REWARD_XP, rewardLine } from '@/lib/rewards'
import { haptic, setHapticsEnabled } from '@/lib/haptics'
import { isoDate } from '@/lib/time'
import { xpTargetFor } from '@/lib/giftcards'
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
  updateNode: (id: string, patch: Partial<LoopNode>) => Promise<void>
  renameNode: (id: string, title: string) => Promise<void>
  deleteNode: (id: string) => Promise<void>
  completeNode: (id: string, via: Completion['via']) => Promise<void>
  dropNode: (id: string) => Promise<void>
  delegateNode: (id: string) => Promise<void>
  startNode: (id: string) => Promise<void>
  parkNode: (id: string, until: number) => Promise<void>
  unparkNode: (id: string) => Promise<void>
  postponeNode: (id: string) => Promise<void>
  toggleStep: (nodeId: string, stepId: string) => Promise<void>
  breakDown: (nodeId: string) => Promise<boolean>
  setGoodEnough: (nodeId: string, note: string) => Promise<void>
  schedule: (nodeId: string, date?: string, part?: LoopNode['scheduledPart']) => Promise<void>

  commitBrainDump: (raw: string, parsed: ParsedLoop[]) => Promise<number>
  award: (kind: RewardKind, opts?: { xp?: number; label?: string; nodeId?: string }) => Promise<void>

  declareDayDone: () => Promise<void>
  wantMoreToday: () => Promise<void>

  setRewardGoal: (storeId: string, amountDKK: 50 | 100 | 200) => Promise<void>
  clearRewardGoal: () => Promise<void>
  claimReward: () => Promise<ClaimedReward | null>

  addCoachMessage: (m: Omit<CoachMessage, 'id' | 'createdAt'>) => Promise<CoachMessage>
  clearCoach: () => Promise<void>

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
      node.mentalWeight = Math.min(5, node.mentalWeight + 1) as LoopNode['mentalWeight']
    }
    const updatedParent = { ...parent, childIds: [...parent.childIds, node.id], updatedAt: Date.now() }
    await putNodes([node, updatedParent])
    const nodes = [...get().nodes.map((n) => (n.id === parent.id ? updatedParent : n)), node]
    set({ nodes, map: toMap(nodes) })
    return node
  },

  async updateNode(id, patch) {
    const current = get().map[id]
    if (!current) return
    const next = { ...current, ...patch, updatedAt: Date.now() }
    await putNode(next)
    const nodes = get().nodes.map((n) => (n.id === id ? next : n))
    set({ nodes, map: toMap(nodes) })
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

  async completeNode(id, via) {
    await closeLoop(get, set, id, 'done', via)
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

  async breakDown(nodeId) {
    const node = get().map[nodeId]
    if (!node) return false
    const breakdown = decompose(node.title)
    if (!breakdown) return false
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

    for (const item of parsed) {
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
      })
      node.urgency = item.urgency
      node.scheduledDate = item.scheduledDate
      node.scheduledPart = item.scheduledPart
      node.goodEnoughNote = item.goodEnough
      node.stepsAutoGenerated = item.steps.length > 0
      nodesById[node.id] = node
      created.push(node)
      nodesById[parentId] = { ...parent, childIds: [...parent.childIds, node.id], updatedAt: Date.now() }
      touched.add(parentId)
    }

    const touchedNodes = [...touched].map((id) => nodesById[id]).filter((n) => !created.includes(n))
    await putNodes([...created, ...touchedNodes])

    const entry: BrainDumpEntry = {
      id: uid('d'),
      raw,
      createdAt: Date.now(),
      createdNodeIds: created.map((n) => n.id),
      processed: true,
    }
    await db.dumps.put({ ...entry, raw: await sealText(entry.raw) })

    const nextNodes = Object.values(nodesById)
    set({ nodes: nextNodes, map: toMap(nextNodes), dumps: [entry, ...get().dumps] })
    await get().award('brain-dump')
    haptic('success')
    return parsed.length
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
    // the "finished" flag — clearing the flag alone would do nothing, since
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
    set({ coachMessages: [...get().coachMessages, message].slice(-200) })
    return message
  },

  async clearCoach() {
    await db.coachMessages.clear()
    set({ coachMessages: [] })
  },

  async createLock(password, name) {
    if (!isStrongEnough(password)) return { ok: false, error: 'Koden opfylder ikke kravene endnu.' }
    const salt = newSalt()
    const key = await deriveKey(password, salt)
    const verifier = await verifierFor(key)

    setSessionKey(key)
    // Re-write everything through the encryption boundary. Existing rows are
    // plaintext, and sealText is a no-op on anything already sealed.
    const [nodes, dumps, messages, completions] = await Promise.all([
      db.nodes.toArray(), db.dumps.toArray(), db.coachMessages.toArray(), db.completions.toArray(),
    ])
    await putNodes(nodes)
    await db.dumps.bulkPut(await Promise.all(dumps.map(async (d) => ({ ...d, raw: await sealText(d.raw) }))))
    await db.coachMessages.bulkPut(await Promise.all(messages.map(async (m) => ({ ...m, text: await sealText(m.text) }))))
    await db.completions.bulkPut(await Promise.all(completions.map(async (c) => ({ ...c, title: await sealText(c.title) }))))

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
    const [nodes, dumps, messages, completions] = await Promise.all([
      db.nodes.toArray(), db.dumps.toArray(), db.coachMessages.toArray(), db.completions.toArray(),
    ])
    const plainNodes = await Promise.all(nodes.map((n) => openNode(n, key)))
    const plainDumps = await Promise.all(dumps.map(async (d) => ({ ...d, raw: await openText(d.raw, key) })))
    const plainMessages = await Promise.all(messages.map(async (m) => ({ ...m, text: await openText(m.text, key) })))
    const plainCompletions = await Promise.all(completions.map(async (c) => ({ ...c, title: await openText(c.title, key) })))

    setSessionKey(null)
    await db.nodes.bulkPut(plainNodes)
    await db.dumps.bulkPut(plainDumps)
    await db.coachMessages.bulkPut(plainMessages)
    await db.completions.bulkPut(plainCompletions)
    await db.auth.delete('auth')

    set({ authState: 'none', authName: undefined })
    await get().reload()
    return { ok: true }
  },

  lockNow() {
    setSessionKey(null)
    set({
      authState: 'locked',
      nodes: [], map: {}, completions: [], rewards: [], dumps: [], claimed: [], coachMessages: [],
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
    })
  },
}))

/** Shared path for done / dropped / delegated — all of them close a loop. */
async function closeLoop(
  get: () => State,
  set: (partial: Partial<State>) => void,
  id: string,
  kind: Completion['kind'],
  via: Completion['via'],
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

  // Closing a container closes what is left inside it — the whole branch stops
  // costing mental load, which is the point.
  const closing: LoopNode[] = []
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

  const completion: Completion = {
    id: uid('done'),
    nodeId: id,
    title: node.title,
    completedAt: now,
    kind,
    xp,
    via,
    minutes: node.estimatedMinutes,
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

export function useNextTask(): ScoredTask | null {
  const ranked = useRanked()
  const skipped = useStore((s) => s.skipped)
  const fresh = ranked.filter((t) => !skipped.includes(t.node.id))
  return fresh[0] ?? ranked[0] ?? null
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
