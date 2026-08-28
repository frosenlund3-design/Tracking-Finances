import type { RewardKind, UserProfile } from '@/db/types'

export interface Level {
  level: number
  title: string
  xpInto: number
  xpForNext: number
  progress: number
}

const LEVEL_TITLES = [
  'Første skridt',
  'I gang',
  'Momentum',
  'Rytme',
  'Klart hoved',
  'Flow',
  'Rolig kraft',
  'Overblik',
  'Let i hovedet',
  'Din egen takt',
]

/** Gentle curve: early levels come fast, later ones settle down. */
export function levelFor(totalXP: number): Level {
  const level = Math.floor(Math.sqrt(Math.max(0, totalXP) / 40)) + 1
  const floor = (level - 1) ** 2 * 40
  const ceil = level ** 2 * 40
  const xpInto = totalXP - floor
  const xpForNext = ceil - floor
  return {
    level,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    xpInto,
    xpForNext,
    progress: Math.max(0, Math.min(1, xpInto / xpForNext)),
  }
}

export const REWARD_XP: Record<RewardKind, number> = {
  'loop-closed': 0, // computed per task by scoring.xpFor
  'task-started': 4,
  'brain-dump': 6,
  'procrastination-broken': 10,
  'return-after-break': 8,
  'good-enough': 6,
  'avoided-task': 12,
  'daily-first': 5,
  'decision-made': 5,
}

const LINES: Record<RewardKind, string[]> = {
  'loop-closed': ['Loop lukket.', 'Den er ude af hovedet.', 'Færdig. Videre.', 'Sådan. Én mindre at holde på.'],
  'task-started': [
    'Du startede. Det er den svære del.',
    'I gang. Resten er nemmere.',
    'Start registreret. Den tæller lige så meget som en afslutning.',
  ],
  'brain-dump': [
    'Ude af hovedet, ind i appen.',
    'Godt. Nu behøver du ikke huske det.',
    'Det ligger her nu. Ikke i dig.',
  ],
  'procrastination-broken': [
    'Du brød loopet. Det er stort.',
    'Fra scroll til handling. Flot.',
    'Du kom ud af det. Det tæller.',
  ],
  'return-after-break': ['Velkommen tilbage 💛', 'Godt du kom forbi igen.', 'Vi starter herfra.'],
  'good-enough': ['Godt nok er færdigt.', 'Det tæller fuldt ud.', '80% er stadig gjort.'],
  'avoided-task': [
    'Det var en af dem, du har undgået.',
    'Den har ligget og fyldt længe. Nu er den væk.',
    'Den sværeste slags. Godt gået.',
  ],
  'daily-first': ['Første loop i dag.', 'Dagen er åbnet.', 'Sådan, en start.'],
  'decision-made': [
    'At beslutte "ikke det her" er også at lukke et loop.',
    'Fravalg tæller. Det er stadig ro i hovedet.',
    'Godt valgt fra.',
  ],
}

export function rewardLine(kind: RewardKind, seed = Math.random()): string {
  const arr = LINES[kind]
  return arr[Math.floor(seed * arr.length) % arr.length]
}

/**
 * Occasional extra warmth, but rarely, and never as a slot machine.
 * Roughly one in seven closes gets a personal line on top.
 */
export function shouldSurprise(prefs: { celebrationLevel: 'quiet' | 'normal'; reducedStimulation: boolean }): boolean {
  if (prefs.reducedStimulation || prefs.celebrationLevel === 'quiet') return false
  return Math.random() < 0.14
}

/** Streaks that never punish. There is no "you lost your streak" state. */
export function streakLine(streak: number, daysAway: number): string {
  if (daysAway >= 7) return 'Velkommen tilbage 💛 Vi starter herfra.'
  if (daysAway >= 2) return 'Godt du er her igen. Ingen optælling af det du missede.'
  if (streak >= 14) return `${streak} dage i træk med mindst ét lukket loop.`
  if (streak >= 3) return `${streak} dage i træk. Stille og roligt.`
  return ''
}

export function toneWrap(text: string, tone: UserProfile['tone']): string {
  switch (tone) {
    case 'blunt':
      return text.replace(/\s*💛/g, '')
    case 'humor':
      return text
    default:
      return text
  }
}
