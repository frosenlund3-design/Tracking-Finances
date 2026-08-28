import type { InfoDensity, ProcrastinationReason, UserProfile } from '@/db/types'

export interface BrainProfile {
  id: string
  title: string
  /** 2–4 short lines describing how it feels from the inside. */
  body: string[]
  /** What Loops will therefore do. */
  promises: string[]
  density: InfoDensity
  defaultTaskMinutes: number
  autoBreakdown: boolean
}

export const BRAIN_PROFILES: Record<string, BrainProfile> = {
  'momentum-brain': {
    id: 'momentum-brain',
    title: 'The Momentum Brain',
    body: [
      'Du mangler sjældent motivation.',
      'Det svære er overgangen fra tanke til handling.',
    ],
    promises: [
      'vise én ting ad gangen',
      'gøre første skridt ekstremt lille',
      'skjule resten mens du arbejder',
      'belønne starts lige så meget som afslutninger',
    ],
    density: 'minimal',
    defaultTaskMinutes: 8,
    autoBreakdown: true,
  },
  'fog-brain': {
    id: 'fog-brain',
    title: 'The Fog Brain',
    body: [
      'Opgaverne er ikke for svære — de er for uklare.',
      'Når du ikke kan se det første skridt, går alting i stå.',
    ],
    promises: [
      'aldrig give dig en vag opgave',
      'automatisk dele store ting op',
      'altid fortælle dig præcis hvad du gør nu',
      'lade dig se resten først når du beder om det',
    ],
    density: 'minimal',
    defaultTaskMinutes: 10,
    autoBreakdown: true,
  },
  'overload-brain': {
    id: 'overload-brain',
    title: 'The Overload Brain',
    body: [
      'Der er ikke for lidt struktur. Der er for meget input.',
      'Lange lister lukker dig ned frem for at hjælpe.',
    ],
    promises: [
      'kun vise få ting ad gangen',
      'gøre det nemt at parkere ting',
      'holde mental load synlig, men roligt',
      'aldrig råbe med røde tal',
    ],
    density: 'minimal',
    defaultTaskMinutes: 12,
    autoBreakdown: true,
  },
  'spark-brain': {
    id: 'spark-brain',
    title: 'The Spark Brain',
    body: [
      'Din hjerne kører på interesse, ikke på vigtighed.',
      'Kedelige ting er ikke svære at ville — de er svære at kunne.',
    ],
    promises: [
      'tilbyde tidspres og små udfordringer',
      'gøre kedelige opgaver kortere',
      'bruge nyhed i stedet for disciplin',
      'fejre det du faktisk gjorde',
    ],
    density: 'balanced',
    defaultTaskMinutes: 10,
    autoBreakdown: true,
  },
  'careful-brain': {
    id: 'careful-brain',
    title: 'The Careful Brain',
    body: [
      'Du udsætter ikke fordi du er ligeglad.',
      'Du udsætter fordi det skal være rigtigt.',
    ],
    promises: [
      'foreslå "godt nok" som mål',
      'gøre det legitimt at aflevere halvt',
      'sætte tidsrammer, så det ikke bliver uendeligt',
      'tælle den grimme version som færdig',
    ],
    density: 'balanced',
    defaultTaskMinutes: 15,
    autoBreakdown: true,
  },
  'low-fuel-brain': {
    id: 'low-fuel-brain',
    title: 'The Low Fuel Brain',
    body: [
      'Det er ikke viljen, der mangler. Det er brændstoffet.',
      'Systemer, der kræver energi, koster mere end de giver.',
    ],
    promises: [
      'spørge hvor meget du har i tanken',
      'finde opgaver, der passer til det',
      'foreslå at parkere frem for at presse',
      'aldrig give dig dårlig samvittighed for en pause',
    ],
    density: 'minimal',
    defaultTaskMinutes: 6,
    autoBreakdown: true,
  },
  'quiet-brain': {
    id: 'quiet-brain',
    title: 'The Quiet Brain',
    body: ['Du vil bare have ro i hovedet.', 'Ikke et system mere at passe.'],
    promises: [
      'holde alting så småt som muligt',
      'organisere for dig i stedet for at spørge',
      'vise ét skridt ad gangen',
      'lade dig lukke appen hurtigt igen',
    ],
    density: 'minimal',
    defaultTaskMinutes: 10,
    autoBreakdown: true,
  },
}

/** Maps onboarding answers to a profile. Deliberately not a clinical test. */
export function deriveBrainProfile(
  answers: Pick<UserProfile, 'procrastinationReasons' | 'listReaction' | 'motivators'>,
): BrainProfile {
  const r = answers.procrastinationReasons
  const has = (x: ProcrastinationReason) => r.includes(x)

  if (has('perfectionism')) return BRAIN_PROFILES['careful-brain']
  if (has('no-energy')) return BRAIN_PROFILES['low-fuel-brain']
  if (has('too-many-steps') || answers.listReaction === 'shutdown') return BRAIN_PROFILES['overload-brain']
  if (has('dont-know-where-to-start')) return BRAIN_PROFILES['fog-brain']
  if (has('boring')) return BRAIN_PROFILES['spark-brain']
  if (has('forget')) return BRAIN_PROFILES['quiet-brain']
  return BRAIN_PROFILES['momentum-brain']
}
