/**
 * What the coach says when a new conversation starts.
 *
 * It used to pick one of three greetings at random and offer the same three
 * buttons every time. After a week that is not a conversation, it is a
 * doorbell: she reads the same sentence, taps the same chip, and the whole
 * thing stops feeling like anybody is there.
 *
 * So an opening is chosen from what is actually true right now, and the same
 * one is never used twice in a row. Most of these are questions she cannot
 * answer with a chip, which is the point: a question that makes you think for
 * two seconds is a conversation starting, and a greeting is not.
 */

import type { LoopNode } from '@/db/types'
import type { Observation } from './memory'
import type { Tone } from './types'

export interface OpeningContext {
  tone: Tone
  /** How many loops she closed today, and yesterday. */
  closedToday: number
  closedYesterday: number
  /** 10 to 100. */
  energy: number
  openLoops: number
  /** Something that has been sitting far too long, if there is one. */
  stale: LoopNode | null
  /** Patterns found in her own data. */
  observations: Observation[]
  /** How long since the last conversation, in days. Null on the first ever. */
  daysSinceLastChat: number | null
  /** Ids used before, most recent first, so nothing repeats. */
  recent: string[]
}

export interface Opening {
  id: string
  lines: string[]
  options: string[]
}

/** Openings that only make sense when something specific is true. */
function situational(c: OpeningContext): Opening[] {
  const out: Opening[] = []

  if (c.closedToday > 0) {
    out.push({
      id: 'after-progress',
      lines: [
        `Du har lukket ${c.closedToday} i dag.`,
        'Skal vi tage én mere, eller skal vi kigge på noget der er sværere end det?',
      ],
      options: ['Én mere', 'Noget svært', 'Jeg vil bare snakke'],
    })
  }

  if (c.closedToday === 0 && c.closedYesterday >= 2) {
    out.push({
      id: 'yesterday-worked',
      lines: [
        `I går lukkede du ${c.closedYesterday}. I dag er der ikke sket noget endnu.`,
        'Det er ikke en anklage, det er et spørgsmål: er der noget andet i dag, eller er det bare i dag?',
      ],
      options: ['Bare i dag', 'Der er noget andet', 'Hjælp mig i gang'],
    })
  }

  if (c.energy <= 30) {
    out.push({
      id: 'low-energy',
      lines: [
        `Du har sat den til ${c.energy}%.`,
        'Skal vi finde noget, der passer til det, eller skal vi rydde noget væk i stedet, så der er mindre?',
      ],
      options: ['Noget der passer', 'Ryd noget væk', 'Jeg vil hellere snakke'],
    })
  }

  if (c.stale) {
    const days = Math.floor((Date.now() - c.stale.createdAt) / 86_400_000)
    out.push({
      id: 'stale',
      lines: [
        `"${c.stale.title}" har ligget i ${days} dage.`,
        'Jeg gætter ikke på hvorfor. Hvad sker der, når du kommer til den?',
      ],
      options: ['Jeg ved ikke hvor jeg skal starte', 'Den føles for stor', 'Den er kedelig'],
    })
  }

  if (c.observations[0]) {
    out.push({
      id: `observation-${c.observations[0].id}`,
      lines: [c.observations[0].text, c.observations[0].evidence, 'Passer det?'].filter(
        Boolean,
      ) as string[],
      options: ['Det passer', 'Det passer ikke', 'Hvad gør jeg ved det?'],
    })
  }

  if (c.openLoops >= 15) {
    out.push({
      id: 'a-lot-open',
      lines: [
        `Der ligger ${c.openLoops} åbne loops.`,
        'Nogle af dem skal du sandsynligvis aldrig lave. Skal vi finde dem og smide dem ud?',
      ],
      options: ['Ja, luk nogle', 'Nej, de skal alle sammen laves', 'Bare find én ting til mig'],
    })
  }

  if (c.daysSinceLastChat !== null && c.daysSinceLastChat >= 4) {
    out.push({
      id: 'been-a-while',
      lines: [
        `Det er ${c.daysSinceLastChat} dage siden sidst.`,
        'Der er ikke noget at indhente. Hvor er du henne nu?',
      ],
      options: ['Det har været hårdt', 'Det er gået fint', 'Hjælp mig i gang'],
    })
  }

  return out
}

/**
 * The ones that always work. Questions rather than greetings, because "hej,
 * hvad fylder?" has no answer she has not already given.
 */
const GENERAL: Array<Omit<Opening, 'id'> & { id: string }> = [
  {
    id: 'one-thing',
    lines: ['Hvis der kun blev lavet én ting i dag, hvilken ville du helst have det var?'],
    options: ['Jeg ved det ikke', 'Vælg for mig', 'Der er for meget'],
  },
  {
    id: 'whats-loudest',
    lines: ['Hvad er højest i hovedet lige nu?', 'Ikke det vigtigste. Det højeste.'],
    options: ['Der er for meget', 'Jeg kan ikke komme i gang', 'Noget der ikke er en opgave'],
  },
  {
    id: 'avoided',
    lines: ['Hvad er der, som du ved du undgår?', 'Vi skal ikke lave den. Jeg spørger bare.'],
    options: ['Jeg ved godt hvad det er', 'Ingenting lige nu', 'Vælg for mig'],
  },
  {
    id: 'body',
    lines: ['Før vi kigger på noget: har du spist og drukket noget i dag?'],
    options: ['Ja', 'Nej', 'Kom nu videre'],
  },
  {
    id: 'yesterday-self',
    lines: ['Hvad ville du ønske, at du havde gjort i går, som ville gøre i dag nemmere?'],
    options: ['Det ved jeg godt', 'Ingenting', 'Hjælp mig i gang'],
  },
  {
    id: 'permission',
    lines: [
      'Er der noget på listen, du i virkeligheden gerne vil have lov til at droppe?',
      'Det er også at få hovedet tilbage.',
    ],
    options: ['Ja, faktisk', 'Nej, de skal laves', 'Hvad skal jeg lave?'],
  },
  {
    id: 'what-kind',
    lines: ['Er det uklart hvad du skal, eller er det helt klart og alligevel umuligt?'],
    options: ['Uklart', 'Klart, men umuligt', 'Begge dele'],
  },
  {
    id: 'time-of-day',
    lines: ['Hvad plejer at være det bedste tidspunkt for dig på sådan en dag her?'],
    options: ['Nu', 'Senere', 'Der er ikke noget godt tidspunkt'],
  },
  {
    id: 'smallest',
    lines: ['Hvad er det mindste, der ville gøre resten af dagen lidt lettere?'],
    options: ['Vælg for mig', 'Jeg ved det godt', 'Der er for meget'],
  },
  {
    id: 'straight-to-it',
    lines: ['Jeg springer høflighederne over. Hvad skal der ske?'],
    options: ['Vælg noget for mig', 'Jeg kan ikke komme i gang', 'Der er for meget'],
  },
]

/**
 * Pick one, avoiding anything used recently.
 *
 * Situational openings win when there is one, because they are about her rather
 * than about conversations in general. The general ones rotate underneath.
 */
export function chooseOpening(c: OpeningContext): Opening {
  const fresh = (list: Opening[]) => list.filter((o) => !c.recent.includes(o.id))

  const situations = situational(c)
  const unusedSituations = fresh(situations)
  if (unusedSituations.length) {
    // Deterministic within a conversation, varied across them.
    return unusedSituations[c.recent.length % unusedSituations.length]
  }

  const generals = fresh(GENERAL as Opening[])
  const pool = generals.length ? generals : (GENERAL as Opening[])
  return pool[Math.floor(Math.random() * pool.length)]
}

/** How many openings back to remember. Enough that nothing feels like a loop. */
export const OPENING_MEMORY = 6
