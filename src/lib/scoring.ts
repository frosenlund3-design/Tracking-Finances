/**
 * "Hvad skal jeg gøre nu?" — the executive function engine.
 *
 * Every actionable loop gets a score from 0–100 saying how good an idea it is
 * to do *right now*. The score is shown to the user as points, and the XP a
 * task pays out is derived from it, so the reward economy and the advice agree
 * with each other: the app never suggests something and then pays badly for it.
 *
 * The output the user sees is deliberately reduced to ONE task. The list
 * exists, but the screen doesn't lead with it.
 */

import type { EnergyLevel, LoopNode, TimePart, UserProfile } from '@/db/types'
import { isLeaf, isOpen, isParkedNow, type NodeMap } from './nodes'

export interface ScoreBreakdown {
  urgency: number
  quickWin: number
  unblocks: number
  energyMatch: number
  timeOfDay: number
  longAvoided: number
  relief: number
  alreadyStarted: number
}

export interface ScoredTask {
  node: LoopNode
  /** 0–100 */
  score: number
  /** Points the user earns for closing it, derived from the score. */
  xp: number
  breakdown: ScoreBreakdown
  /** Short human reasons, max 2 shown. */
  reasons: string[]
}

export interface ScoreContext {
  energy: EnergyLevel
  now: Date
  profile: Pick<UserProfile, 'energyPeak' | 'procrastinationReasons'>
  goodEnoughMode: boolean
}

export function currentPart(now: Date): TimePart {
  const h = now.getHours()
  if (h < 10) return 'morning'
  if (h < 13) return 'midday'
  if (h < 18) return 'afternoon'
  return 'evening'
}

function energyDistance(required: EnergyLevel, available: EnergyLevel): number {
  return Math.abs(required - available)
}

export function scoreTask(node: LoopNode, map: NodeMap, ctx: ScoreContext): ScoredTask {
  const b: ScoreBreakdown = {
    urgency: 0,
    quickWin: 0,
    unblocks: 0,
    energyMatch: 0,
    timeOfDay: 0,
    longAvoided: 0,
    relief: 0,
    alreadyStarted: 0,
  }
  const reasons: string[] = []

  // --- urgency (max 20) ------------------------------------------------
  if (node.urgency === 'overdue') b.urgency = 20
  else if (node.urgency === 'today') b.urgency = 17
  else if (node.urgency === 'soon') b.urgency = 9
  if (node.dueAt) {
    const days = (node.dueAt - ctx.now.getTime()) / 86_400_000
    if (days < 0) b.urgency = 20
    else if (days < 1) b.urgency = Math.max(b.urgency, 18)
    else if (days < 3) b.urgency = Math.max(b.urgency, 12)
  }
  if (node.scheduledDate === isoOf(ctx.now)) b.urgency = Math.max(b.urgency, 14)
  if (b.urgency >= 14) reasons.push('Den er aktuel i dag')

  // --- quick win (max 16) ----------------------------------------------
  const m = node.estimatedMinutes
  b.quickWin = m <= 2 ? 16 : m <= 5 ? 14 : m <= 15 ? 10 : m <= 30 ? 5 : 1
  if (m <= 5) reasons.push(`Den tager ca. ${m} min`)

  // --- unblocks other things (max 12) ----------------------------------
  const parent = node.parentId ? map[node.parentId] : null
  if (parent) {
    const siblings = parent.childIds.map((id) => map[id]).filter(Boolean)
    const openSiblings = siblings.filter((s) => isOpen(s))
    const isFirstOpen = openSiblings[0]?.id === node.id
    if (isFirstOpen && openSiblings.length > 1) {
      b.unblocks = 12
      reasons.push('Den åbner resten af ' + shorten(parent.title))
    } else if (openSiblings.length > 1) {
      b.unblocks = 4
    }
  }

  // --- energy match (max 18) -------------------------------------------
  const dist = energyDistance(node.energyRequired, ctx.energy)
  if (node.energyRequired <= ctx.energy) {
    b.energyMatch = 18 - Math.min(dist / 10, 6)
  } else {
    b.energyMatch = Math.max(0, 12 - dist / 4)
  }
  if (ctx.energy <= 30 && node.energyRequired <= 30) reasons.push('Den passer til din energi lige nu')

  // --- time of day (max 10) --------------------------------------------
  const part = currentPart(ctx.now)
  if (node.scheduledPart === part) {
    b.timeOfDay = 10
  } else if (peakMatches(ctx.profile.energyPeak, part) && node.energyRequired >= 60) {
    b.timeOfDay = 8
  } else if (part === 'evening' && node.energyRequired >= 100) {
    b.timeOfDay = -6
  } else {
    b.timeOfDay = 3
  }

  // --- long avoided (max 15) -------------------------------------------
  // Not a punishment: doing the thing you have been circling is worth more,
  // and the app says so out loud.
  b.longAvoided = Math.min(node.avoidanceCount * 4, 12) + Math.min(node.frictionScore / 2, 3)
  const ageDays = (Date.now() - node.createdAt) / 86_400_000
  if (ageDays > 14 && node.avoidanceCount === 0) b.longAvoided += 3
  if (node.avoidanceCount >= 2) reasons.push('Du har cirklet om den her et stykke tid')

  // --- relief (max 10) --------------------------------------------------
  b.relief = Math.min(node.mentalWeight * 2, 10)

  // --- already started (max 10) ----------------------------------------
  const doneSteps = node.steps.filter((s) => s.done).length
  if (node.status === 'active') {
    b.alreadyStarted = 10
    reasons.unshift('Du er allerede i gang')
  } else if (doneSteps > 0) {
    b.alreadyStarted = 7
    reasons.unshift(`${doneSteps} af ${node.steps.length} steps er klaret`)
  }

  // Good Enough Mode softens anything big so the engine stops pointing at
  // mountains when the user has already said "I just need something done".
  const geAdjust = ctx.goodEnoughMode && m > 30 ? -8 : 0

  const raw =
    b.urgency + b.quickWin + b.unblocks + b.energyMatch + b.timeOfDay + b.longAvoided + b.relief + b.alreadyStarted + geAdjust

  const score = Math.max(0, Math.min(100, Math.round(raw)))
  return { node, score, xp: xpFor(node, score), breakdown: b, reasons: reasons.slice(0, 2) }
}

function peakMatches(peak: UserProfile['energyPeak'], part: TimePart): boolean {
  if (peak === 'varies') return true
  if (peak === 'morning') return part === 'morning' || part === 'midday'
  if (peak === 'midday') return part === 'midday' || part === 'afternoon'
  return part === 'evening'
}

/**
 * Points paid for closing a loop.
 *
 * Derived from the same score the advice engine uses, plus a genuine effort
 * component, so the hard, long-avoided phone call pays properly and a
 * two-minute win still pays something.
 */
export function xpFor(node: LoopNode, score: number): number {
  const base = 5
  const fromScore = Math.round(score / 7) // 0–14
  const effort = Math.round(node.mentalWeight * 1.5) // 1–8
  const avoided = Math.min(node.avoidanceCount * 3, 12)
  const size = node.estimatedMinutes >= 45 ? 4 : node.estimatedMinutes >= 20 ? 2 : 0
  return Math.max(3, base + fromScore + effort + avoided + size)
}

export function rankTasks(map: NodeMap, candidates: LoopNode[], ctx: ScoreContext): ScoredTask[] {
  const now = ctx.now.getTime()
  return candidates
    .filter((n) => isOpen(n) && !isParkedNow(n, now) && !n.isArea && isLeaf(map, n))
    .map((n) => scoreTask(n, map, ctx))
    .sort((a, b) => b.score - a.score || a.node.estimatedMinutes - b.node.estimatedMinutes)
}

/**
 * The one thing to show. Adds a little deliberate rotation so the same task
 * is not shoved in the user's face after they have just said "not now".
 */
export function pickOne(ranked: ScoredTask[], skipIds: string[] = []): ScoredTask | null {
  const fresh = ranked.filter((t) => !skipIds.includes(t.node.id))
  return fresh[0] ?? ranked[0] ?? null
}

function shorten(s: string, max = 22): string {
  return s.length > max ? `${s.slice(0, max - 1).trim()}…` : s
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Label for the points badge — plain, no hype. */
export function scoreLabel(score: number): string {
  if (score >= 70) return 'Rigtig god idé nu'
  if (score >= 55) return 'God idé nu'
  if (score >= 38) return 'Fin nok nu'
  return 'Kan sagtens vente'
}
