import type { LoopNode } from '@/db/types'
import { isOpen, isParkedNow, type NodeMap } from './nodes'

export interface MentalLoad {
  /** 0–100. Never reaches 100 — the curve saturates on purpose. */
  percent: number
  /** Loops the brain is still holding. */
  openLoops: number
  /** Loops deliberately put down. */
  parked: number
  /** A calm sentence, never an accusation. */
  sentence: string
}

/** Roughly how many "weight units" feel like a full head. Tuned by feel. */
const CAPACITY = 42

export function computeMentalLoad(nodes: LoopNode[], map: NodeMap, now = Date.now()): MentalLoad {
  let total = 0
  let openLoops = 0
  let parked = 0

  for (const n of nodes) {
    if (n.parentId === null) continue
    if (isParkedNow(n, now)) {
      parked++
      // A parked loop still exists, but it costs almost nothing. That is the
      // entire point of parking.
      total += 0.15
      continue
    }
    if (!isOpen(n)) continue
    // The worlds (Hjem, Arbejde, ...) are furniture, not loops. An empty app
    // must read 0%, or the number is lying on day one.
    if (n.isArea) continue
    const hasChildren = n.childIds.some((c) => map[c] && isOpen(map[c]))
    // A container costs less than the things you actually have to do.
    const factor = hasChildren ? 0.45 : 1
    let w = n.mentalWeight * factor
    if (n.urgency === 'today') w *= 1.25
    if (n.urgency === 'overdue') w *= 1.35
    // Something you have been avoiding is louder in the head than its size.
    w += Math.min(n.avoidanceCount, 4) * 0.35
    total += w
    if (!hasChildren) openLoops++
  }

  const percent = Math.round(100 * (1 - Math.exp(-total / CAPACITY)))
  return { percent, openLoops, parked, sentence: loadSentence(percent, openLoops) }
}

function loadSentence(percent: number, openLoops: number): string {
  if (openLoops === 0) return 'Der er ikke noget, du behøver at holde fast i lige nu.'
  if (percent < 25) return `Din hjerne holder ca. ${openLoops} ting aktive. Der er god plads.`
  if (percent < 50) return `Din hjerne holder ca. ${openLoops} ting aktive. Det er til at overskue.`
  if (percent < 72) return `Din hjerne holder ca. ${openLoops} ting aktive. Vi tager én ad gangen.`
  return `Din hjerne holder ca. ${openLoops} ting aktive. Det er meget — lad os lukke noget eller parkere noget.`
}

/** Copy for the moment right after closing loops. Warm, never a scoreboard. */
export function loadDropSentence(closed: number): string {
  if (closed <= 0) return ''
  if (closed === 1) return '1 loop lukket. Lidt mere plads i hovedet.'
  return `${closed} loops lukket. Lidt mere plads i hovedet.`
}
