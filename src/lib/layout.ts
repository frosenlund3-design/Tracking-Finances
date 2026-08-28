import type { LoopNode } from '@/db/types'
import { branchWeight, type NodeMap } from './nodes'

export interface Placed {
  id: string
  node: LoopNode | null
  x: number
  y: number
  r: number
  ring: number
  /** Direction from the centre, so decorations can walk outward. */
  angle: number
  /** Overflow bucket: "+7 flere". */
  overflow?: LoopNode[]
}

export interface LayoutResult {
  center: Placed
  children: Placed[]
  /** Everything the ring could not show. */
  hidden: LoopNode[]
}

export interface LayoutOptions {
  width: number
  height: number
  /** How many circles we are willing to show at once. */
  maxVisible: number
  /** Breathing room between the outermost circle edge and the viewport. */
  edgePad?: number
}

const GAP = 16
/**
 * Each child trails a chain of ever-smaller circles pointing away from centre.
 * The ring has to sit far enough in that the chain still fits on screen, so the
 * layout budgets for the whole comet, not just its head.
 */
export const CHAIN_REACH = 1.95
const MIN_CHILD_R = 27
const MAX_CHILD_R = 62

/**
 * Deterministic radial layout.
 *
 * The constraints are solved rather than tweaked, because the failure modes
 * are exactly the ones the brief forbids: circles must never overlap, never
 * leave the viewport, never shrink below a tappable size, and must land in the
 * same place every time so the map becomes a place you remember.
 *
 * Solving order, given N children:
 *   1. centre radius from branch weight (a flat curve, a big project must not
 *      become a big threat)
 *   2. the largest child radius that still leaves room for the centre circle,
 *      the gap and the child itself inside the viewport
 *   3. ring radius pushed out to the viewport edge
 *   4. an angular check: neighbours on a ring must clear each other; if they
 *      don't, every child shrinks by the same factor and we solve again
 */
export function layoutRadial(
  map: NodeMap,
  centerId: string,
  children: LoopNode[],
  opts: LayoutOptions,
): LayoutResult {
  const { width, height, maxVisible } = opts
  const edgePad = opts.edgePad ?? 12
  const cx = width / 2
  const cy = height / 2
  const centerNode = map[centerId] ?? null

  const half = Math.min(width, height) / 2
  const availableR = Math.max(80, half - edgePad)

  const centerWeight = centerNode ? branchWeight(map, centerId) : 3
  const centerR = clamp(50 + Math.sqrt(centerWeight) * 7, 54, half * 0.30)

  let visible = children
  let hidden: LoopNode[] = []
  if (children.length > maxVisible) {
    visible = children.slice(0, maxVisible - 1)
    hidden = children.slice(maxVisible - 1)
  }

  const slots = visible.length + (hidden.length ? 1 : 0)
  const center: Placed = { id: centerId, node: centerNode, x: cx, y: cy, r: centerR, ring: 0, angle: 0 }
  if (slots === 0) return { center, children: [], hidden: [] }

  // Desired radius per slot, from each child's own branch weight.
  const desired = visible.map((c) => clamp(26 + Math.sqrt(branchWeight(map, c.id)) * 6.5, MIN_CHILD_R, MAX_CHILD_R))
  if (hidden.length) desired.push(MIN_CHILD_R + 3)

  // Try every sensible ring split and keep the one that leaves the circles
  // biggest. Splitting into two rings costs radial budget, so for small counts
  // a single ring almost always wins, doing it eagerly was what made labels
  // shrink to "Skri v…".
  const candidates = slots <= 5 ? [[slots]] : [[slots], splitRings(slots)]
  let best: Solution | null = null
  for (const rings of candidates) {
    const solution = solve(rings, desired, centerR, availableR)
    if (!best || solution.childR > best.childR) best = solution
  }
  const { rings, scale, radii } = best!

  const placed: Placed[] = []
  let index = 0
  for (let ri = 0; ri < rings.length; ri++) {
    const count = rings[ri]
    const ringR = radii[ri]
    const step = (Math.PI * 2) / count
    // Start at the top; offset the outer ring by half a step so nothing sits
    // directly behind an inner circle.
    const offset = -Math.PI / 2 + (ri === 1 ? step / 2 : 0) + (count === 2 ? step / 2 : 0)

    for (let i = 0; i < count; i++) {
      const angle = offset + step * i
      const r = clamp(desired[index] * scale, MIN_CHILD_R * 0.86, MAX_CHILD_R)
      const node = visible[index] ?? null
      placed.push({
        id: node ? node.id : '__overflow__',
        node,
        x: cx + Math.cos(angle) * ringR,
        y: cy + Math.sin(angle) * ringR,
        r,
        ring: ri,
        angle,
        overflow: node ? undefined : hidden,
      })
      index++
    }
  }

  return { center, children: placed, hidden }
}

interface Solution {
  rings: number[]
  scale: number
  radii: number[]
  /** The radius the largest child actually ends up with. */
  childR: number
}

/**
 * Solves one ring split: how big can the children be, and where do the rings
 * sit? Two constraints bind, radial budget (everything must fit between the
 * centre circle and the viewport edge) and angular spacing (neighbours on a
 * ring must clear each other). Shrinking pushes the rings outward, which
 * loosens the angular constraint, so we iterate twice.
 */
function solve(rings: number[], desired: number[], centerR: number, availableR: number): Solution {
  const ringCount = rings.length
  const maxDesired = Math.max(...desired)
  // The outer ring's chain eats into the same budget as the circles.
  const budget = availableR - centerR - GAP * ringCount

  // Note this can be > 1: with only a few children, the circles should grow to
  // fill the screen rather than float as small dots with clipped labels. The
  // MAX_CHILD_R cap keeps that from turning into balloons.
  let scale = Math.min(
    budget / (2 * ringCount + (CHAIN_REACH - 1)) / maxDesired,
    MAX_CHILD_R / maxDesired,
  )

  for (let pass = 0; pass < 2; pass++) {
    const radii = ringRadii(centerR, availableR, maxDesired * scale, ringCount === 2)
    let worst = 1
    for (let ri = 0; ri < ringCount; ri++) {
      const n = rings[ri]
      if (n < 2) continue
      const rMax = maxInRing(desired, rings, ri) * scale
      const allowed = radii[ri] * Math.sin(Math.PI / n) - GAP / 2
      if (allowed > 0 && allowed < rMax) worst = Math.min(worst, allowed / rMax)
    }
    if (worst >= 0.999) break
    scale *= worst
  }

  scale = Math.max(scale, 0.4)
  const childR = clamp(maxDesired * scale, MIN_CHILD_R * 0.86, MAX_CHILD_R)
  return { rings, scale, radii: ringRadii(centerR, availableR, childR, ringCount === 2), childR }
}

/**
 * Ring radii, outermost first pinned to the viewport edge.
 * Guaranteed: inner edge of ring 0 clears the centre circle by GAP, and the
 * two rings clear each other by GAP.
 */
function ringRadii(centerR: number, availableR: number, childR: number, twoRings: boolean): number[] {
  const outer = Math.max(centerR + GAP + childR, availableR - childR * CHAIN_REACH)
  if (!twoRings) return [outer]
  const inner = Math.max(centerR + GAP + childR, outer - 2 * childR - GAP)
  return [inner, outer]
}

function maxInRing(desired: number[], rings: number[], ringIndex: number): number {
  let start = 0
  for (let i = 0; i < ringIndex; i++) start += rings[i]
  const slice = desired.slice(start, start + rings[ringIndex])
  return slice.length ? Math.max(...slice) : MIN_CHILD_R
}

/** Up to 6 on the inner ring; the rest go outside. */
function splitRings(total: number): number[] {
  if (total <= 6) return [total]
  const inner = Math.min(6, Math.ceil(total / 2))
  return [inner, total - inner]
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** Circles per screen, tuned by the density the onboarding picked. */
export function maxVisibleFor(density: 'minimal' | 'balanced' | 'detailed'): number {
  return density === 'minimal' ? 7 : density === 'balanced' ? 9 : 12
}
