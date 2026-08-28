import type { LoopNode, ProcrastinationReason } from '@/db/types'
import { actionableLeaves, type NodeMap } from './nodes'

/**
 * Finds the things that have quietly been sitting there.
 *
 * This is not a nagging engine. It exists so the coach can ask *one* good
 * question about *one* thing — problem finding before problem solving. An app
 * that lists twelve overdue items has told the user something she already
 * knew and feels bad about; an app that asks "what happens when you get to
 * this one?" can actually find out why.
 */

export type AttentionReason = 'long-open' | 'often-postponed' | 'past-scheduled' | 'stalled'

export interface AttentionItem {
  node: LoopNode
  reason: AttentionReason
  days: number
  /** One plain sentence stating the observation, with no judgement in it. */
  headline: string
  score: number
}

const DAY = 86_400_000

/** Small things that sit for weeks say more than big things that sit for weeks. */
function ageThreshold(minutes: number): number {
  if (minutes <= 10) return 7
  if (minutes <= 30) return 14
  return 21
}

function daysWord(days: number): string {
  if (days >= 60) return `${Math.round(days / 30)} måneder`
  if (days >= 14) return `${Math.round(days / 7)} uger`
  if (days >= 7) return days >= 10 ? '1½ uge' : 'en uge'
  return `${days} dage`
}

export function scanAttention(map: NodeMap, now = Date.now()): AttentionItem[] {
  const items: AttentionItem[] = []

  for (const node of actionableLeaves(map, undefined, now)) {
    const ageDays = Math.floor((now - node.createdAt) / DAY)
    const threshold = ageThreshold(node.estimatedMinutes)

    let reason: AttentionReason | null = null
    let days = ageDays
    let score = 0

    if (node.avoidanceCount >= 2) {
      reason = 'often-postponed'
      score = 60 + node.avoidanceCount * 8
    } else if (node.scheduledDate && daysPast(node.scheduledDate, now) >= 2) {
      reason = 'past-scheduled'
      days = daysPast(node.scheduledDate, now)
      score = 50 + Math.min(days, 20)
    } else if (node.status === 'active' && node.startedAt && now - node.startedAt > 3 * DAY) {
      reason = 'stalled'
      days = Math.floor((now - node.startedAt) / DAY)
      score = 45 + Math.min(days, 20)
    } else if (ageDays >= threshold) {
      reason = 'long-open'
      score = 30 + Math.min(ageDays - threshold, 30)
    }

    if (!reason) continue

    // Don't raise the same thing again the same week.
    if (node.lastAskedAt && now - node.lastAskedAt < 7 * DAY) continue

    // A task she has already told us what's blocking is less urgent to ask
    // about again — we know, and the app should act rather than interview.
    if (node.blockReason) score -= 20

    items.push({ node, reason, days, headline: headlineFor(node, reason, days), score })
  }

  return items.sort((a, b) => b.score - a.score)
}

function headlineFor(node: LoopNode, reason: AttentionReason, days: number): string {
  switch (reason) {
    case 'often-postponed':
      return `"${node.title}" er blevet skubbet ${node.avoidanceCount} gange.`
    case 'past-scheduled':
      return `"${node.title}" lå til for ${daysWord(days)} siden.`
    case 'stalled':
      return `Du startede på "${node.title}" for ${daysWord(days)} siden.`
    default:
      return `"${node.title}" har ligget i ${daysWord(days)}.`
  }
}

function daysPast(iso: string, now: number): number {
  const [y, m, d] = iso.split('-').map(Number)
  const then = new Date(y, (m ?? 1) - 1, d ?? 1).getTime()
  return Math.floor((now - then) / DAY)
}

/** The answers offered when the coach asks what is actually in the way. */
export const BLOCK_ANSWERS: Array<{ label: string; reason: ProcrastinationReason }> = [
  { label: 'Jeg ved ikke hvor jeg skal starte', reason: 'dont-know-where-to-start' },
  { label: 'Den føles for stor', reason: 'too-many-steps' },
  { label: 'Den er kedelig', reason: 'boring' },
  { label: 'Jeg glemmer den', reason: 'forget' },
  { label: 'Jeg mangler energi', reason: 'no-energy' },
  { label: 'Den skal være perfekt', reason: 'perfectionism' },
]

/** Naming what it is — the sentence that makes it a problem instead of a flaw. */
export const BLOCK_NAMED: Record<ProcrastinationReason, string> = {
  'dont-know-where-to-start': 'Så er det ikke dovenskab. Det er et manglende første skridt.',
  'too-many-steps': 'Så er det ikke dovenskab. Opgaven er for stor til at holde i hovedet på én gang.',
  boring: 'Så er det ikke dovenskab. Din hjerne kører på interesse, ikke på vigtighed.',
  forget: 'Så er det ikke dovenskab. Den findes bare ikke, når du kigger.',
  'no-energy': 'Så er det ikke dovenskab. Der er ikke brændstof nok til den lige nu.',
  perfectionism: 'Så er det ikke dovenskab. Det er kravet til resultatet, der blokerer starten.',
}
