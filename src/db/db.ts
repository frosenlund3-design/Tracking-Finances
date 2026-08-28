import Dexie, { type Table } from 'dexie'
import type {
  AuthRecord,
  BrainDumpEntry,
  Note,
  ClaimedReward,
  CoachMemory,
  CoachMessage,
  CoachSession,
  Completion,
  LoopNode,
  RewardEvent,
  UserPreferences,
  UserProfile,
} from './types'
import { openText, sealText } from '@/lib/vault'

/**
 * Everything lives in the browser. No server, no account, no sync.
 * This is a promise made to the user in the UI, so it must stay true here.
 */
export class LoopsDB extends Dexie {
  nodes!: Table<LoopNode, string>
  dumps!: Table<BrainDumpEntry, string>
  coachMessages!: Table<CoachMessage, string>
  coachSessions!: Table<CoachSession, string>
  completions!: Table<Completion, string>
  rewards!: Table<RewardEvent, string>
  claimed!: Table<ClaimedReward, string>
  profile!: Table<UserProfile, string>
  prefs!: Table<UserPreferences, string>
  auth!: Table<AuthRecord, string>
  notes!: Table<Note, string>
  memories!: Table<CoachMemory, string>

  constructor() {
    super('loops')
    this.version(1).stores({
      nodes: 'id, parentId, status, area, scheduledDate, updatedAt',
      dumps: 'id, createdAt, processed',
      coachMessages: 'id, sessionId, createdAt',
      coachSessions: 'id, startedAt',
      completions: 'id, nodeId, completedAt',
      rewards: 'id, createdAt, kind',
      claimed: 'id, claimedAt',
      profile: 'id',
      prefs: 'id',
    })
    // v2 adds the local profile lock. Nothing existing is migrated: the app
    // works exactly the same until a password is actually set.
    this.version(2).stores({
      nodes: 'id, parentId, status, area, scheduledDate, updatedAt',
      dumps: 'id, createdAt, processed',
      coachMessages: 'id, sessionId, createdAt',
      coachSessions: 'id, startedAt',
      completions: 'id, nodeId, completedAt',
      rewards: 'id, createdAt, kind',
      claimed: 'id, claimedAt',
      profile: 'id',
      prefs: 'id',
      auth: 'id',
    })
    // v3 adds notes: the parts of a brain dump that are information rather
    // than actions, kept out of the loop tree entirely.
    this.version(3).stores({
      nodes: 'id, parentId, status, area, scheduledDate, updatedAt',
      dumps: 'id, createdAt, processed',
      coachMessages: 'id, sessionId, createdAt',
      coachSessions: 'id, startedAt',
      completions: 'id, nodeId, completedAt',
      rewards: 'id, createdAt, kind',
      claimed: 'id, claimedAt',
      profile: 'id',
      prefs: 'id',
      auth: 'id',
      notes: 'id, createdAt, nodeId',
    })
    // v4 gives the coach a memory and real, resumable conversations.
    this.version(4).stores({
      nodes: 'id, parentId, status, area, scheduledDate, updatedAt',
      dumps: 'id, createdAt, processed',
      coachMessages: 'id, sessionId, createdAt',
      coachSessions: 'id, startedAt, updatedAt',
      completions: 'id, nodeId, completedAt',
      rewards: 'id, createdAt, kind',
      claimed: 'id, claimedAt',
      profile: 'id',
      prefs: 'id',
      auth: 'id',
      notes: 'id, createdAt, nodeId',
      memories: 'id, createdAt, kind',
    })
  }
}

export const db = new LoopsDB()

export const ROOT_ID = 'root'

export function uid(prefix = 'n'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}_${rand}`
}

export const defaultProfile = (): UserProfile => ({
  id: 'me',
  createdAt: Date.now(),
  onboarded: false,
  procrastinationReasons: [],
  listReaction: 'shutdown',
  energyPeak: 'varies',
  motivators: ['quiet-head'],
  tone: 'calm',
  brainProfileId: 'quiet-brain',
  density: 'minimal',
  defaultTaskMinutes: 10,
  autoBreakdown: true,
  theme: 'warm',
})

export const defaultPrefs = (): UserPreferences => ({
  id: 'prefs',
  reducedStimulation: false,
  haptics: true,
  goodEnoughMode: false,
  showXP: true,
  celebrationLevel: 'normal',
  lastOpenedAt: Date.now(),
  streak: 0,
  totalXP: 0,
  spentXP: 0,
  currentEnergy: 60,
  energySetAt: 0,
})

/**
 * Encryption boundary.
 *
 * Only free text is sealed — the words she wrote. Structure (ids, parents,
 * status, timestamps) stays in the clear so Dexie's indexes keep working and
 * so the app can still count her loops before it has the key.
 */
export async function sealNode(node: LoopNode): Promise<LoopNode> {
  return {
    ...node,
    title: await sealText(node.title),
    description: node.description ? await sealText(node.description) : node.description,
    goodEnoughNote: node.goodEnoughNote ? await sealText(node.goodEnoughNote) : node.goodEnoughNote,
    steps: await Promise.all(
      node.steps.map(async (s) => ({
        ...s,
        title: await sealText(s.title),
        captured: s.captured ? await sealText(s.captured) : s.captured,
      })),
    ),
  }
}

export async function openNode(node: LoopNode, key?: CryptoKey | null): Promise<LoopNode> {
  return {
    ...node,
    title: await openText(node.title, key),
    description: node.description ? await openText(node.description, key) : node.description,
    goodEnoughNote: node.goodEnoughNote ? await openText(node.goodEnoughNote, key) : node.goodEnoughNote,
    steps: await Promise.all(
      node.steps.map(async (s) => ({
        ...s,
        title: await openText(s.title, key),
        captured: s.captured ? await openText(s.captured, key) : s.captured,
      })),
    ),
  }
}

/** Writes nodes through the encryption boundary. Every write goes through here. */
export async function putNodes(nodes: LoopNode[]): Promise<void> {
  await db.nodes.bulkPut(await Promise.all(nodes.map(sealNode)))
}

export async function putNode(node: LoopNode): Promise<void> {
  await db.nodes.put(await sealNode(node))
}

/** Reads the whole database into memory. It is small by design (personal scale). */
export async function loadAll() {
  const [
    nodes, profileRow, prefsRow, completions, rewards, dumps, claimed, coachMessages, notes,
    coachSessions, memories,
  ] = await Promise.all([
      db.nodes.toArray(),
      db.profile.get('me'),
      db.prefs.get('prefs'),
      db.completions.orderBy('completedAt').reverse().limit(200).toArray(),
      db.rewards.orderBy('createdAt').reverse().limit(200).toArray(),
      db.dumps.orderBy('createdAt').reverse().limit(50).toArray(),
      db.claimed.toArray(),
      db.coachMessages.orderBy('createdAt').reverse().limit(400).toArray(),
      db.notes.orderBy('createdAt').reverse().limit(200).toArray(),
      db.coachSessions.orderBy('updatedAt').reverse().limit(50).toArray(),
      db.memories.orderBy('createdAt').reverse().limit(100).toArray(),
    ])

  return {
    nodes: await Promise.all(nodes.map((n) => openNode(n))),
    profile: profileRow ?? defaultProfile(),
    prefs: prefsRow ?? defaultPrefs(),
    completions: await Promise.all(completions.map(async (c) => ({ ...c, title: await openText(c.title) }))),
    rewards,
    dumps: await Promise.all(dumps.map(async (d) => ({ ...d, raw: await openText(d.raw) }))),
    claimed,
    coachMessages: await Promise.all(coachMessages.map(async (m) => ({ ...m, text: await openText(m.text) }))),
    notes: await Promise.all(notes.map(async (n) => ({ ...n, text: await openText(n.text) }))),
    coachSessions: await Promise.all(
      coachSessions.map(async (c) => ({ ...c, title: await openText(c.title) })),
    ),
    memories: await Promise.all(memories.map(async (m) => ({ ...m, text: await openText(m.text) }))),
  }
}
