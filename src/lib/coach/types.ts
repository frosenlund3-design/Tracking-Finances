import type { EnergyLevel, LoopNode, ToneChoice, UserProfile } from '@/db/types'

export type Intent =
  | 'greeting'
  | 'cant-start'
  | 'overwhelmed'
  | 'dont-know-what'
  | 'no-energy'
  | 'boring'
  | 'perfectionism'
  | 'scrolling'
  | 'anxious'
  | 'body-double'
  | 'progress-report'
  | 'done'
  | 'stuck-mid-task'
  | 'cant-decide'
  | 'self-critical'
  | 'too-many-steps'
  | 'forgetful'
  | 'affirmative'
  | 'negative'
  | 'thanks'
  | 'unknown'

export type Strategy =
  | 'micro-step'
  | 'body-doubling'
  | 'reduce-scope'
  | 'five-second-launch'
  | 'remove-perfectionism'
  | 'novelty'
  | 'challenge'
  | 'timer'
  | 'compassionate-reset'
  | 'environmental-cue'
  | 'visual-progress'
  | 'immediate-reward'
  | 'externalise'
  | 'pick-for-you'
  | 'park-it'

export interface CoachState {
  userMood: 'flat' | 'anxious' | 'frustrated' | 'okay' | 'good'
  userEnergy: EnergyLevel
  avoidanceReason: Intent | null
  currentTask: LoopNode | null
  taskComplexity: 'micro' | 'small' | 'medium' | 'large'
  /** Minutes since the user first looked at this task today, if known. */
  procrastinationDuration: number
  previouslyCompletedSteps: number
  personalityProfile: Pick<UserProfile, 'tone' | 'procrastinationReasons' | 'motivators' | 'energyPeak'>
  /** Strategies already used this session, so the coach does not repeat itself. */
  usedStrategies: Strategy[]
  openLoops: number
  mentalLoadPercent: number
}

export interface CoachReply {
  /** 1–4 very short lines. */
  lines: string[]
  strategy: Strategy
  /** Tap-able quick replies. */
  options?: string[]
  /** Optional action the UI can offer. */
  action?: CoachAction
}

export type CoachAction =
  | { type: 'start-task'; nodeId: string }
  | { type: 'open-body-double'; nodeId?: string }
  | { type: 'open-what-now' }
  | { type: 'park-task'; nodeId: string }
  | { type: 'break-down'; nodeId: string }
  | { type: 'complete-step'; nodeId: string }
  | { type: 'scroll-rescue' }
  | { type: 'brain-dump' }
  | { type: 'good-enough'; nodeId: string }

export type Tone = ToneChoice
