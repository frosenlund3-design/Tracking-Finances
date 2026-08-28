import type { CoachReply, CoachState } from './types'
import { respond } from './engine'

/**
 * Coach adapter seam.
 *
 * The app ships with the local rule engine and is fully functional without any
 * network. If a real model is ever added (self-hosted, on-device, or a paid
 * API the user opts into), implement this interface and register it — nothing
 * in the UI changes.
 */
export interface CoachAdapter {
  id: string
  /** True when the adapter can answer right now (network, key, model loaded). */
  available(): boolean
  reply(input: { text: string; state: CoachState; closedToday: number }): Promise<CoachReply>
}

export const localAdapter: CoachAdapter = {
  id: 'local-rules',
  available: () => true,
  async reply({ text, state, closedToday }) {
    return respond({ text, state, closedToday })
  },
}

let active: CoachAdapter = localAdapter

export function setCoachAdapter(adapter: CoachAdapter): void {
  active = adapter.available() ? adapter : localAdapter
}

export async function askCoach(input: { text: string; state: CoachState; closedToday: number }): Promise<CoachReply> {
  try {
    return await active.reply(input)
  } catch {
    // Never leave the user without an answer because an adapter failed.
    return localAdapter.reply(input)
  }
}
