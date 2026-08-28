import type { SelfDescription } from '@/db/types'
import type { CoachReply, CoachState } from './types'
import { respond } from './engine'
import type { Observation } from './memory'

/**
 * Coach adapter seam.
 *
 * The app ships with the local rule engine and is fully functional without any
 * network. If a real model is ever added (self-hosted, on-device, or a paid
 * API the user opts into), implement this interface and register it, nothing
 * in the UI changes.
 */
export interface CoachInput {
  text: string
  state: CoachState
  closedToday: number
  self?: SelfDescription
  observations?: Observation[]
  usedConcepts?: string[]
  usedTriggers?: string[]
  /** Earlier turns, oldest first, so an adapter can hold the thread. */
  history?: Array<{ role: 'user' | 'coach'; text: string }>
}

export interface CoachAdapter {
  id: string
  /** True when the adapter can answer right now (network, key, model loaded). */
  available(): boolean
  reply(input: CoachInput): Promise<CoachReply>
}

export const localAdapter: CoachAdapter = {
  id: 'local-rules',
  available: () => true,
  async reply({ text, state, closedToday, self, observations, usedConcepts, usedTriggers }) {
    return respond({ text, state, closedToday, self, observations, usedConcepts, usedTriggers })
  },
}

let active: CoachAdapter = localAdapter

export function setCoachAdapter(adapter: CoachAdapter): void {
  active = adapter.available() ? adapter : localAdapter
}

export async function askCoach(input: CoachInput): Promise<CoachReply> {
  try {
    return await active.reply(input)
  } catch {
    // Never leave the user without an answer because an adapter failed.
    return localAdapter.reply(input)
  }
}
