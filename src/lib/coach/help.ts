/**
 * Doing the things she asks for.
 *
 * The app already knew how to rank her tasks: `scoring.ts` scores every open
 * loop on urgency, size, what it unblocks, her energy and how long she has been
 * circling it. That engine drove the home screen and the what-now sheet, and
 * the coach could not reach it. So "hjælp mig med at prioritere de top 3-5
 * vigtigste" got an offer to file a to-do instead of the answer the app was
 * already holding.
 *
 * Everything in here is the coach reaching into what the app already knows.
 */

import type { LoopNode } from '@/db/types'
import type { NodeMap } from '@/lib/nodes'
import { actionableLeaves } from '@/lib/nodes'
import { rankTasks, type ScoreContext } from '@/lib/scoring'
import { necessaryToday, whenLabel } from '@/lib/deadlines'
import { humanMinutes } from '@/lib/time'
import { firstActionFor } from '@/lib/firstAction'
import { spotHabits } from '@/lib/habits'
import { habitsInListLine } from './routines'

export interface HelpAnswer {
  lines: string[]
  options: string[]
  /** A loop the reply is about, so a follow-up knows what "den" means. */
  focusId?: string
  /** Loops on the list that are really routines, so the caller can offer to fix them. */
  habitIds?: string[]
}

/**
 * The top few, with the reason for each.
 *
 * Reasons matter more than the order does. An ordered list she does not
 * believe is just another list; a list where each line says why it is there is
 * something she can disagree with, which is the point.
 */
export function prioritise(map: NodeMap, ctx: ScoreContext, count = 4): HelpAnswer {
  const ranked = rankTasks(map, actionableLeaves(map, undefined, ctx.now.getTime()), ctx)
  if (!ranked.length) {
    return {
      lines: ['Der er ikke noget åbent at prioritere lige nu.', 'Det er ikke en fejl. Det er sådan en dag.'],
      options: ['Jeg vil gerne lægge noget ind', 'Okay'],
    }
  }

  const must = necessaryToday(map, ctx.now.getTime())
  const top = ranked.slice(0, Math.min(count, 5))

  const lines: string[] = []
  if (must.length) {
    lines.push(
      `Først det, der ikke kan vente: ${must.map((n) => `"${n.title}" (${whenLabel(n, ctx.now.getTime())})`).join(', ')}.`,
    )
  }
  lines.push(
    must.length
      ? 'Og derefter, i den rækkefølge jeg ville tage dem:'
      : `Der er ${ranked.length} åbne. Sådan her ville jeg tage de øverste:`,
  )
  top.forEach((t, i) => {
    const why = t.reasons[0] ? `, ${t.reasons[0].toLowerCase()}` : ''
    lines.push(`${i + 1}. ${t.node.title} (${humanMinutes(t.node.estimatedMinutes)}${why})`)
  })
  lines.push(
    ranked.length > top.length
      ? `Resten af de ${ranked.length} behøver du ikke tænke på i dag.`
      : 'Det er hele listen.',
  )

  return {
    lines,
    focusId: top[0]?.node.id,
    options: ['Start den første', 'Fordel dem over ugen', 'Nummer 1 passer ikke'],
  }
}

/**
 * What is actually on the list, grouped, so it can be looked at without being
 * a wall. This is the "sortér mine tasks" answer.
 */
export function summarise(map: NodeMap, now = new Date()): HelpAnswer {
  const open = actionableLeaves(map, undefined, now.getTime())
  if (!open.length) {
    return { lines: ['Der ligger ikke noget åbent lige nu.'], options: ['Okay'] }
  }

  const byWorld = new Map<string, LoopNode[]>()
  for (const node of open) {
    // Walk up to the top-level circle, which is the grouping she recognises.
    let cursor: LoopNode | undefined = node
    let world = node
    while (cursor?.parentId) {
      const parent: LoopNode | undefined = map[cursor.parentId]
      if (!parent?.parentId) break
      world = parent
      cursor = parent
    }
    const list = byWorld.get(world.title) ?? []
    list.push(node)
    byWorld.set(world.title, list)
  }

  const sorted = [...byWorld.entries()].sort((a, b) => b[1].length - a[1].length)
  const quick = open.filter((n) => n.estimatedMinutes <= 5).length
  const heavy = open.filter((n) => n.estimatedMinutes >= 45).length

  // Routines sitting on the list pretending to be tasks.
  //
  // Worth saying before anything about order or size, because it changes what
  // the number at the top means. A list of twenty where six come back tomorrow
  // is not a list of twenty things to get through, and looking at it as if it
  // were is exactly what makes it feel bottomless.
  const habits = spotHabits(open)
  const habitLine = habitsInListLine(habits.slice(0, 4).map((h) => h.node.title))

  return {
    lines: [
      `Du har ${open.length} åbne loops. Sådan fordeler de sig:`,
      ...sorted.map(([world, list]) => `${world}: ${list.length}`),
      habitLine ?? '',
      quick ? `${quick} af dem tager under fem minutter.` : '',
      heavy ? `${heavy} er store nok til, at de nok skal deles op.` : '',
      'Skal jeg sætte dem i rækkefølge, eller skal vi smide nogle ud?',
    ].filter(Boolean),
    habitIds: habits.map((h) => h.node.id),
    options: habitLine
      ? ['Gør vanerne til gentagelser', 'Sæt dem i rækkefølge', 'Bare vælg én til mig']
      : ['Sæt dem i rækkefølge', 'Hjælp mig med at smide nogle ud', 'Bare vælg én til mig'],
  }
}

/**
 * Too much at once.
 *
 * The answer to overwhelm is not a plan, it is subtraction. So this leads with
 * what she is allowed to stop looking at.
 */
export function triage(map: NodeMap, ctx: ScoreContext): HelpAnswer {
  const open = actionableLeaves(map, undefined, ctx.now.getTime())
  const must = necessaryToday(map, ctx.now.getTime())
  const ranked = rankTasks(map, open, ctx)
  const one = ranked[0]

  if (!open.length) {
    return { lines: ['Der ligger faktisk ikke noget. Det er ikke dig, der overser noget.'], options: ['Okay'] }
  }

  return {
    lines: [
      must.length
        ? `Af ${open.length} ting er der ${must.length}, der har en rigtig tid. Resten har ikke.`
        : `Der ligger ${open.length} ting, og ingen af dem har en frist i dag.`,
      'Det betyder, at der ikke er noget, du ødelægger ved at lade det ligge til i morgen.',
      one ? `Hvis du kun laver én ting: ${one.node.title}. ${humanMinutes(one.node.estimatedMinutes)}.` : '',
      'Resten må du gerne lade være med at kigge på.',
    ].filter(Boolean),
    focusId: one?.node.id,
    options: ['Start den', 'Vis mig de vigtigste', 'Jeg vil hellere snakke'],
  }
}

/**
 * "Bare hjælp mig nu."
 *
 * The hardest message to get right, and the one it got most wrong: after a
 * long answer about rent, "nej bare hjælp mig nuu" was met with a suggestion to
 * open the netbank for an unrelated electricity bill.
 *
 * What she is asking for is one thing to do, right now, and no framing around
 * it. So: one movement, small enough to be obviously possible, from whatever
 * we were actually talking about. Nothing else. If there is a subject on the
 * table, the movement comes from that subject, not from the ranking engine.
 */
export function rightNow(map: NodeMap, ctx: ScoreContext, subject?: string): HelpAnswer {
  if (subject) {
    return {
      lines: [subject, 'Ikke andet. Resten findes ikke lige nu.'],
      options: ['Gjort', 'Det kan jeg ikke lige nu', 'Noget andet'],
    }
  }

  const ranked = rankTasks(map, actionableLeaves(map, undefined, ctx.now.getTime()), ctx)
  const top = ranked[0]
  if (!top) {
    return {
      lines: ['Der er ikke noget åbent lige nu.', 'Så er svaret ingenting, og det er et rigtigt svar.'],
      options: ['Jeg vil lægge noget ind', 'Okay'],
    }
  }

  const action = firstActionFor(top.node)
  return {
    lines: [
      action ? action.text : top.node.title,
      action ? `${action.humanTime}. Ikke andet.` : 'Ikke andet.',
    ],
    focusId: top.node.id,
    options: ['Gjort', 'Det kan jeg ikke lige nu', 'Noget andet'],
  }
}

/** The one concrete thing to do first, per subject we might be discussing. */
export const FIRST_MOVE: Partial<Record<string, string>> = {
  money:
    'Skriv én besked til udlejer. Tre linjer: du kan ikke betale det hele til tiden, du kan betale et beløb den dato, og resten den dato. Ikke mere.',
  prioritise: 'Kig kun på nummer ét på listen. Luk øjnene for resten.',
  sort: 'Vælg én verden og kig kun i den. Ikke hele listen.',
  overwhelm: 'Sæt en timer på ti minutter og lav den mindste ting, du kan få øje på.',
}
