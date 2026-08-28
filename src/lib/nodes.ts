import { ROOT_ID, uid } from '@/db/db'
import type { EnergyLevel, LifeArea, LoopNode, MentalWeight, MicroStep, NodeStatus } from '@/db/types'

export interface NewNodeInput {
  title: string
  parentId: string | null
  area?: LifeArea
  estimatedMinutes?: number
  mentalWeight?: MentalWeight
  energyRequired?: EnergyLevel
  steps?: string[]
  description?: string
  isArea?: boolean
  demo?: boolean
  tags?: string[]
  id?: string
}

export function makeNode(input: NewNodeInput): LoopNode {
  const now = Date.now()
  return {
    id: input.id ?? uid(),
    title: input.title.trim(),
    description: input.description,
    parentId: input.parentId,
    childIds: [],
    status: 'open',
    createdAt: now,
    updatedAt: now,
    estimatedMinutes: input.estimatedMinutes ?? 10,
    mentalWeight: input.mentalWeight ?? 2,
    energyRequired: input.energyRequired ?? 30,
    frictionScore: 0,
    avoidanceCount: 0,
    urgency: 'none',
    tags: input.tags ?? [],
    area: input.area ?? 'other',
    rewardXP: 0,
    steps: (input.steps ?? []).map(toStep),
    isArea: input.isArea,
    demo: input.demo,
  }
}

export function toStep(title: string, index = 0): MicroStep {
  return { id: uid('s'), title, done: false, physical: index === 0 }
}

/** Loops that still take up space in the head. */
export const OPEN_STATUSES: NodeStatus[] = ['open', 'active']

export function isOpen(n: LoopNode): boolean {
  return n.status === 'open' || n.status === 'active'
}

export function isClosed(n: LoopNode): boolean {
  return n.status === 'done' || n.status === 'dropped' || n.status === 'delegated'
}

/** A parked loop wakes up on its own once the date passes. */
export function isParkedNow(n: LoopNode, now = Date.now()): boolean {
  return n.status === 'parked' && (n.parkedUntil ?? 0) > now
}

export type NodeMap = Record<string, LoopNode>

export function toMap(nodes: LoopNode[]): NodeMap {
  const map: NodeMap = {}
  for (const n of nodes) map[n.id] = n
  return map
}

export function childrenOf(map: NodeMap, id: string): LoopNode[] {
  const parent = map[id]
  if (!parent) return []
  return parent.childIds.map((cid) => map[cid]).filter(Boolean)
}

/** Children that should be drawn — closed and parked ones leave the canvas. */
export function visibleChildren(map: NodeMap, id: string, now = Date.now()): LoopNode[] {
  return childrenOf(map, id).filter((c) => !isClosed(c) && !isParkedNow(c, now))
}

export function ancestorsOf(map: NodeMap, id: string): LoopNode[] {
  const chain: LoopNode[] = []
  let current = map[id]
  let guard = 0
  while (current?.parentId && guard++ < 64) {
    const parent = map[current.parentId]
    if (!parent) break
    chain.unshift(parent)
    current = parent
  }
  return chain
}

export function pathOf(map: NodeMap, id: string): LoopNode[] {
  const node = map[id]
  if (!node) return []
  return [...ancestorsOf(map, id), node]
}

/** Every descendant, depth-first. Guarded against cycles. */
export function descendantsOf(map: NodeMap, id: string): LoopNode[] {
  const out: LoopNode[] = []
  const seen = new Set<string>([id])
  const stack = [...(map[id]?.childIds ?? [])]
  while (stack.length) {
    const cid = stack.pop()!
    if (seen.has(cid)) continue
    seen.add(cid)
    const node = map[cid]
    if (!node) continue
    out.push(node)
    stack.push(...node.childIds)
  }
  return out
}

export function openDescendantCount(map: NodeMap, id: string): number {
  return descendantsOf(map, id).filter(isOpen).length
}

/** Leaves are the only things you can actually *do*. */
export function isLeaf(map: NodeMap, n: LoopNode): boolean {
  return visibleChildren(map, n.id).length === 0
}

export function actionableLeaves(map: NodeMap, rootId = ROOT_ID, now = Date.now()): LoopNode[] {
  return descendantsOf(map, rootId).filter(
    (n) => isOpen(n) && !isParkedNow(n, now) && !n.isArea && isLeaf(map, n),
  )
}

/**
 * Mental weight of a branch: its own weight plus a damped sum of its children.
 * Damped so a big project never explodes the number and stresses the user.
 */
export function branchWeight(map: NodeMap, id: string): number {
  const node = map[id]
  if (!node || !isOpen(node)) return 0
  const kids = visibleChildren(map, id)
  if (!kids.length) return node.mentalWeight
  const childSum = kids.reduce((acc, c) => acc + branchWeight(map, c.id), 0)
  return node.mentalWeight + Math.sqrt(childSum) * 1.6
}

export function areaOf(map: NodeMap, node: LoopNode): LifeArea {
  if (node.area !== 'other') return node.area
  for (const a of ancestorsOf(map, node.id).reverse()) {
    if (a.area !== 'other') return a.area
  }
  return 'other'
}
