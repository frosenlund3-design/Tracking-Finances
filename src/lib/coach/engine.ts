/**
 * The ADHD coach's brain.
 *
 * This is a rule/decision engine, not a language model. It classifies what the
 * user said, reads the state of their actual task tree, picks a strategy that
 * fits, and renders a short reply from a variation bank.
 *
 * It runs entirely offline and costs nothing. `adapter.ts` defines the seam
 * where a real LLM can be dropped in later without touching the UI.
 *
 * It is a coach, not a clinician: it never diagnoses, never claims authority,
 * never tells the user to pull themselves together.
 */

import type { LoopNode } from '@/db/types'
import { CLOSERS, GREETINGS, RESPONSES, STEP_ACKS } from './responses'
import type { CoachAction, CoachReply, CoachState, Intent, Strategy, Tone } from './types'

const PATTERNS: Array<[Intent, RegExp]> = [
  ['thanks', /\b(tak|tusind tak|thanks)\b/i],
  ['done', /\b(f[æa]rdig|gjort|done|klaret|jeg gjorde det|nu er den lavet|check)\b/i],
  ['progress-report', /^\s*(der|jeg er der|st[åa]r op|jeg st[åa]r|ok(?:ay)?|jep|jeg er i gang)\s*[.!]?\s*$/i],
  ['scrolling', /\b(scroll\w*|tiktok|instagram|telefonen|doomscroll\w*|kan ikke stoppe med at kigge)\b/i],
  ['cant-start', /\b(kan ikke komme i gang|kan ikke starte|kommer ikke i gang|f[åa]r ikke gjort|sidder fast|starter ikke|jeg ved godt hvad jeg skal)\b/i],
  ['overwhelmed', /\b(overv[æa]ldet|for meget|kaos|alt for mange|hovedet er fyldt|jeg drukner|panik|ved ikke hvor jeg skal starte|uoverskuelig\w*)\b/i],
  ['too-many-steps', /\b(for mange (?:steps|trin|ting)|(?:alt |f[øo]les )?for stor|kompliceret|uendelig)\b/i],
  ['forgetful', /\b(glemmer|glemte|husker (?:den )?ikke|falder ud af hovedet)\b/i],
  ['dont-know-what', /\b(hvad skal jeg (?:g[øo]re|lave)|ved ikke hvad jeg skal|hj[æa]lp mig med at v[æa]lge|hvad nu)\b/i],
  ['cant-decide', /\b(kan ikke bestemme|kan ikke v[æa]lge|beslutning\w*|ved ikke hvilken)\b/i],
  ['no-energy', /\b(tr[æa]t|udmattet|ingen energi|flad|drænet|orker ikke|kan ikke mere|udbr[æa]ndt|burnout)\b/i],
  ['boring', /\b(kedelig\w*|k[øo]nnu|gider ikke|d[øo]dkedelig\w*|ulidelig\w*)\b/i],
  ['perfectionism', /\b(perfekt\w*|god nok|bange for at lave (?:det )?forkert|skal v[æa]re rigtigt|detaljer)\b/i],
  ['anxious', /\b(angst|nerv[øo]s|bange|ubehag|frygt|stress\w*|ked af det)\b/i],
  ['self-critical', /\b(doven|dum|elendig|d[åa]rlig til|jeg dur ikke|jeg er h[åa]bl[øo]s|skammer mig|d[åa]rlig samvittighed)\b/i],
  ['body-double', /\b(bliv hos mig|v[æa]r her|selskab|sammen med mig|body ?double)\b/i],
  ['stuck-mid-task', /\b(g[åa]et i st[åa]|mistede tr[åa]den|blev afbrudt|glemte hvor jeg var)\b/i],
  ['greeting', /^\s*(hej|halloj|hey|yo|godmorgen|god morgen|hallo)\b/i],
  ['affirmative', /^\s*(ja|jep|yes|okay|ok|k[øo]r|gerne|please)\s*[.!]?\s*$/i],
  ['negative', /^\s*(nej|n[åa]h|nope|ikke lige nu|ellers tak)\s*[.!]?\s*$/i],
]

export function detectIntent(text: string): Intent {
  const t = text.trim()
  if (!t) return 'unknown'
  for (const [intent, re] of PATTERNS) if (re.test(t)) return intent
  return 'unknown'
}

/** Which strategies are plausible for an intent, in preference order. */
const STRATEGY_MAP: Record<Intent, Strategy[]> = {
  greeting: ['pick-for-you', 'externalise'],
  'cant-start': ['micro-step', 'five-second-launch', 'environmental-cue', 'body-doubling', 'timer'],
  overwhelmed: ['reduce-scope', 'micro-step', 'park-it', 'externalise', 'compassionate-reset'],
  'dont-know-what': ['pick-for-you', 'micro-step', 'timer'],
  'no-energy': ['reduce-scope', 'micro-step', 'park-it', 'compassionate-reset'],
  boring: ['novelty', 'challenge', 'timer', 'immediate-reward'],
  perfectionism: ['remove-perfectionism', 'reduce-scope', 'timer'],
  scrolling: ['compassionate-reset', 'environmental-cue', 'five-second-launch', 'micro-step'],
  anxious: ['compassionate-reset', 'micro-step', 'body-doubling'],
  'body-double': ['body-doubling', 'micro-step'],
  'progress-report': ['micro-step', 'body-doubling'],
  done: ['visual-progress', 'immediate-reward', 'pick-for-you'],
  'stuck-mid-task': ['micro-step', 'visual-progress', 'timer'],
  'cant-decide': ['pick-for-you', 'park-it', 'challenge'],
  'self-critical': ['compassionate-reset', 'visual-progress', 'micro-step'],
  'too-many-steps': ['micro-step', 'reduce-scope'],
  forgetful: ['externalise', 'environmental-cue', 'immediate-reward'],
  affirmative: ['micro-step', 'five-second-launch'],
  negative: ['reduce-scope', 'park-it', 'pick-for-you'],
  thanks: ['visual-progress'],
  unknown: ['micro-step', 'pick-for-you', 'externalise'],
}

/** Profile answers bias the coach permanently, not just per message. */
function profileBias(state: CoachState, strategies: Strategy[]): Strategy[] {
  const reasons = state.personalityProfile.procrastinationReasons
  const boost: Strategy[] = []
  if (reasons.includes('dont-know-where-to-start')) boost.push('micro-step', 'pick-for-you')
  if (reasons.includes('too-many-steps')) boost.push('reduce-scope', 'micro-step')
  if (reasons.includes('boring')) boost.push('novelty', 'challenge')
  if (reasons.includes('perfectionism')) boost.push('remove-perfectionism')
  if (reasons.includes('no-energy')) boost.push('reduce-scope', 'park-it')
  if (reasons.includes('forget')) boost.push('externalise', 'environmental-cue')
  if (state.personalityProfile.motivators.includes('cheering')) boost.push('body-doubling')
  if (state.personalityProfile.motivators.includes('progress')) boost.push('visual-progress')
  if (state.personalityProfile.motivators.includes('rewards')) boost.push('immediate-reward')

  const ordered = [...strategies]
  ordered.sort((a, b) => {
    const ai = boost.includes(a) ? -1 : 0
    const bi = boost.includes(b) ? -1 : 0
    return ai - bi
  })
  return ordered
}

function pickStrategy(state: CoachState, intent: Intent): Strategy {
  let candidates = profileBias(state, STRATEGY_MAP[intent] ?? STRATEGY_MAP.unknown)

  // Low energy should never be met with a challenge.
  if (state.userEnergy <= 30) candidates = candidates.filter((s) => s !== 'challenge')
  // "Cut it down to 20%" is absurd advice about a six-minute phone call.
  if (state.taskComplexity === 'micro' || state.taskComplexity === 'small') {
    candidates = candidates.filter((s) => s !== 'reduce-scope')
  }
  // Don't offer body doubling when there is nothing concrete to double on.
  if (!state.currentTask) candidates = candidates.filter((s) => s !== 'body-doubling' && s !== 'park-it')

  const unused = candidates.filter((s) => !state.usedStrategies.includes(s))
  return unused[0] ?? candidates[0] ?? 'micro-step'
}

function pickVariation(strategy: Strategy, tone: Tone, seed: number): string[] {
  const bank = RESPONSES[strategy]
  const list = bank[tone] ?? bank.default
  const pool = list.length ? list : bank.default
  return pool[seed % pool.length]
}

/** The single smallest next physical action for a task. */
export function nextMicroStep(task: LoopNode | null): string {
  if (!task) return 'Skriv én ting ned, du går rundt og husker på'
  const pending = task.steps.find((s) => !s.done)
  if (pending) return pending.title
  if (task.estimatedMinutes <= 5) return task.title
  return `Åbn eller find det du skal bruge til "${task.title}"`
}

/**
 * Danish words that carry no signal when matching a message to a task.
 * Kept small on purpose — over-filtering loses the actual noun.
 */
const STOPWORDS = new Set([
  'jeg', 'kan', 'ikke', 'komme', 'i', 'gang', 'med', 'at', 'det', 'den', 'de', 'og', 'er', 'en', 'et',
  'til', 'for', 'på', 'af', 'som', 'har', 'skal', 'vil', 'min', 'mit', 'mine', 'der', 'du', 'jo',
  'lige', 'nu', 'bare', 'men', 'så', 'om', 'hvad', 'hvor', 'gøre', 'lave', 'få', 'noget', 'helt',
])

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zæøå0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
}

/**
 * Finds the task the user is actually talking about.
 *
 * Danish glues definite articles onto nouns ("opvask" -> "opvasken"), so we
 * match on a shared prefix rather than on equality. Without this the coach
 * happily answers a question about the dishes with advice about online
 * banking, which destroys trust faster than any wrong tone would.
 */
export function findTaskByText(text: string, candidates: LoopNode[]): LoopNode | null {
  const words = tokens(text)
  if (!words.length) return null

  let best: { node: LoopNode; score: number } | null = null
  for (const node of candidates) {
    const titleWords = tokens(node.title)
    let score = 0
    for (const w of words) {
      for (const t of titleWords) {
        const n = Math.min(w.length, t.length)
        if (n >= 4 && w.slice(0, n) === t.slice(0, n)) {
          score += n >= 6 ? 2 : 1
          break
        }
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { node, score }
  }
  // One weak prefix hit is noise; require either a long match or two hits.
  return best && best.score >= 2 ? best.node : null
}

function fill(line: string, state: CoachState, extra: Record<string, string | number> = {}): string {
  const task = state.currentTask
  return line
    .replace(/\{task\}/g, task?.title ?? 'det')
    .replace(/\{step\}/g, String(extra.step ?? nextMicroStep(task)))
    .replace(/\{minutes\}/g, String(extra.minutes ?? task?.estimatedMinutes ?? 10))
    .replace(/\{closed\}/g, String(extra.closed ?? 0))
}

function optionsFor(strategy: Strategy, state: CoachState): string[] {
  switch (strategy) {
    case 'micro-step':
      return ['Der', 'Det kan jeg ikke', 'Giv mig noget mindre']
    case 'five-second-launch':
      return ['Kør', 'Ikke nu']
    case 'body-doubling':
      return ['Klar', 'Jeg sidder fast']
    case 'reduce-scope':
      return ['Ja, skær den ned', 'Parkér den i stedet']
    case 'remove-perfectionism':
      return ['Okay', 'Det er svært']
    case 'timer':
      return ['Timeren kører', 'Nej']
    case 'pick-for-you':
      return state.currentTask ? ['Start den', 'Giv mig en anden'] : ['Vis mig noget', 'Jeg vil hellere skrive noget ned']
    case 'park-it':
      return ['Ja, parkér den', 'Nej, jeg tager den']
    case 'novelty':
      return ['Musik på', 'Sæt en timer']
    case 'compassionate-reset':
      return ['Jeg har lidt energi', 'Jeg har ingen energi']
    case 'environmental-cue':
      return ['Jeg er der', 'Jeg kan ikke rejse mig']
    case 'externalise':
      return ['Åbn brain dump', 'Ikke nu']
    case 'challenge':
      return ['5 minutter, kør', 'Nej tak']
    default:
      return ['Okay', 'Noget andet']
  }
}

function actionFor(strategy: Strategy, state: CoachState): CoachAction | undefined {
  const id = state.currentTask?.id
  switch (strategy) {
    case 'body-doubling':
      return id ? { type: 'open-body-double', nodeId: id } : undefined
    case 'pick-for-you':
      return id ? { type: 'start-task', nodeId: id } : { type: 'open-what-now' }
    case 'park-it':
      return id ? { type: 'park-task', nodeId: id } : undefined
    case 'reduce-scope':
      return id ? { type: 'good-enough', nodeId: id } : undefined
    case 'micro-step':
      return id ? { type: 'start-task', nodeId: id } : undefined
    case 'externalise':
      return { type: 'brain-dump' }
    case 'compassionate-reset':
      return undefined
    case 'five-second-launch':
      return id ? { type: 'start-task', nodeId: id } : undefined
    default:
      return undefined
  }
}

export interface RespondInput {
  text: string
  state: CoachState
  /** Injected for deterministic tests. */
  seed?: number
  closedToday?: number
}

export function respond({ text, state, seed = Math.floor(Math.random() * 1000), closedToday = 0 }: RespondInput): CoachReply {
  const intent = detectIntent(text)
  const tone = state.personalityProfile.tone

  // Short-circuits that deserve their own handling.
  if (intent === 'greeting' && !text.trim().includes(' ')) {
    return {
      lines: [GREETINGS[tone][seed % GREETINGS[tone].length]],
      strategy: 'pick-for-you',
      options: ['Jeg kan ikke komme i gang', 'Der er for meget', 'Hvad skal jeg lave?'],
    }
  }

  if (intent === 'progress-report' || intent === 'done') {
    const ack = STEP_ACKS[tone][seed % STEP_ACKS[tone].length]
    const step = nextMicroStep(state.currentTask)
    if (state.currentTask && state.currentTask.steps.some((s) => !s.done)) {
      return {
        lines: [ack, `Næste: ${step}.`, 'Kun den.'],
        strategy: 'micro-step',
        options: ['Der', 'Jeg stopper her'],
        action: { type: 'complete-step', nodeId: state.currentTask.id },
      }
    }
    return {
      lines: [ack, closedToday ? `Du har lukket ${closedToday} i dag.` : 'Det tæller.', CLOSERS[tone][seed % CLOSERS[tone].length]],
      strategy: 'visual-progress',
      options: ['Hvad så nu?', 'Jeg stopper her'],
      action: { type: 'open-what-now' },
    }
  }

  if (intent === 'thanks') {
    return {
      lines: ['Selv tak.', CLOSERS[tone][seed % CLOSERS[tone].length]],
      strategy: 'visual-progress',
      options: ['Hvad skal jeg lave nu?'],
    }
  }

  if (intent === 'self-critical') {
    // This one is never answered with a productivity tip first.
    const opening =
      tone === 'blunt'
        ? 'Du er ikke doven. Det er igangsætning, ikke karakter.'
        : 'Du er ikke doven — det er en igangsætningsting, ikke en karakterbrist.'
    const strategy = pickStrategy(state, intent)
    const lines = pickVariation(strategy, tone, seed).map((l) => fill(l, state, { closed: closedToday }))
    return { lines: [opening, ...lines].slice(0, 4), strategy, options: optionsFor(strategy, state), action: actionFor(strategy, state) }
  }

  if (intent === 'scrolling') {
    return {
      lines: ['Hej. Ingen dårlig samvittighed.', 'Vi skal bare bryde loopet.', 'Skal vi tage 5 sekunders reset?'],
      strategy: 'compassionate-reset',
      options: ['Ja, kør', 'Bare giv mig en lille ting'],
      action: { type: 'scroll-rescue' },
    }
  }

  const strategy = pickStrategy(state, intent)
  const lines = pickVariation(strategy, tone, seed).map((l) => fill(l, state, { closed: closedToday }))

  return {
    lines,
    strategy,
    options: optionsFor(strategy, state),
    action: actionFor(strategy, state),
  }
}

export function complexityOf(task: LoopNode | null): CoachState['taskComplexity'] {
  if (!task) return 'small'
  if (task.estimatedMinutes <= 3) return 'micro'
  if (task.estimatedMinutes <= 15) return 'small'
  if (task.estimatedMinutes <= 45) return 'medium'
  return 'large'
}
