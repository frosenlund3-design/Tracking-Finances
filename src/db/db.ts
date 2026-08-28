import Dexie, { type Table } from 'dexie'
import type {
  BrainDumpEntry,
  ClaimedReward,
  CoachMessage,
  CoachSession,
  Completion,
  LoopNode,
  RewardEvent,
  UserPreferences,
  UserProfile,
} from './types'

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

/** Reads the whole database into memory. It is small by design (personal scale). */
export async function loadAll() {
  const [nodes, profileRow, prefsRow, completions, rewards, dumps, claimed, coachMessages] =
    await Promise.all([
      db.nodes.toArray(),
      db.profile.get('me'),
      db.prefs.get('prefs'),
      db.completions.orderBy('completedAt').reverse().limit(200).toArray(),
      db.rewards.orderBy('createdAt').reverse().limit(200).toArray(),
      db.dumps.orderBy('createdAt').reverse().limit(50).toArray(),
      db.claimed.toArray(),
      db.coachMessages.orderBy('createdAt').limit(200).toArray(),
    ])

  return {
    nodes,
    profile: profileRow ?? defaultProfile(),
    prefs: prefsRow ?? defaultPrefs(),
    completions,
    rewards,
    dumps,
    claimed,
    coachMessages,
  }
}
