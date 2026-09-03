import type { LoopNode } from '@/db/types'

/**
 * The smallest true next move.
 *
 * The home screen must never lead with "Betal elregningen, 10 min". That is a
 * task, and a task is something you can dread. It leads with "Åbn netbanken,
 * 30 sekunder", which is a movement, small enough that not doing it feels
 * sillier than doing it.
 */
export interface FirstAction {
  /** What she actually does, right now. */
  text: string
  seconds: number
  /** "30 sekunder" / "ca. 2 minutter" */
  humanTime: string
  stepId?: string
  /** True when the task is already so small that it IS the first step. */
  isWholeTask: boolean
}

/**
 * Moves that are physically trivial: standing up, opening a thing, finding a
 * thing, stopping.
 *
 * The list matters more than it looks. The number next to the step is the one
 * she can check against the clock running beside it, and a step billed at a
 * minute that takes five seconds teaches her that the numbers are made up.
 */
const TRIVIAL =
  /^(g[åa]|rejs|[åa]bn|find|tag|t[æa]nd|s[æa]t|log ind|hent|skriv .{0,18} ned|kig|tjek|l[æa]g|saml|beslut|stop|start|stil|v[æa]lg|sig|gem|pr[øo]v|h[æa]ng|streg|luk|se efter|sl[åa] .{0,14} op)\b/i

/** Moves that involve other people, a shop, or a real chunk of work. */
const HEAVIER =
  /^(ring|send|udfyld|optag|rediger|post|betal|book|bestil|svar|k[øo]b|aftal|sp[øo]rg|meld|overf[øo]r|klarg[øo]r|byg|k[øo]r|bag|mal|st[øo]vsug|vask|aflever|ans[øo]g)\b/i

export function estimateStepSeconds(step: string): number {
  if (TRIVIAL.test(step.trim())) return 30
  if (HEAVIER.test(step.trim())) return 120
  return 60
}

export function humanSeconds(seconds: number): string {
  if (seconds <= 30) return '30 sekunder'
  if (seconds <= 60) return 'ca. 1 minut'
  if (seconds < 150) return 'ca. 2 minutter'
  return `ca. ${Math.round(seconds / 60)} minutter`
}

export function firstActionFor(node: LoopNode | null): FirstAction | null {
  if (!node) return null

  const pending = node.steps.find((s) => !s.done)
  if (pending) {
    const seconds = estimateStepSeconds(pending.title)
    return {
      text: pending.title,
      seconds,
      humanTime: humanSeconds(seconds),
      stepId: pending.id,
      isWholeTask: false,
    }
  }

  // No steps: if the task is already tiny, it is its own first action.
  const seconds = Math.max(30, node.estimatedMinutes * 60)
  if (node.estimatedMinutes <= 3) {
    return { text: node.title, seconds, humanTime: humanSeconds(seconds), isWholeTask: true }
  }

  // Otherwise the honest first move is to open or fetch what it needs.
  return {
    text: `Find det du skal bruge til "${node.title.toLowerCase()}"`,
    seconds: 60,
    humanTime: 'ca. 1 minut',
    isWholeTask: false,
  }
}
