/**
 * Assertions for the part of Loops that has to be right or the whole thing is
 * untrustworthy: reading what she wrote.
 *
 * A task filed as a note disappears from the plan. A note filed as a task can
 * never be closed. Steps that belong to a different task than the one on screen
 * are worse than no steps at all. So these are locked down here, and every one
 * of them is a bug that actually shipped once.
 *
 * Run with: npm run check
 */
import { cleanFragment, parseBrainDump, CERTAIN } from '../src/lib/brainDump'
import { decompose } from '../src/lib/decompose'
import { analyse, toImperativeSentence } from '../src/lib/language'
import { handleAgentRequest } from '../src/lib/coach/agent'
import { detectCaptures } from '../src/lib/coach/capture'
import { matchTriggers } from '../src/lib/coach/triggers'
import { observe } from '../src/lib/coach/memory'
import type { Completion } from '../src/db/types'
import type { LoopNode } from '../src/db/types'

const NOW = new Date('2026-08-28T10:00:00')
let failures = 0

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail ? `: ${detail}` : ''}`)
  }
}

function one(text: string) {
  const items = parseBrainDump(text, { now: NOW, granularity: 5 })
  return items[0]
}

console.log('\nsætningen bliver læst')
const imperative = (t: string) => toImperativeSentence(cleanFragment(t))
check('perfect form becomes an instruction',
  imperative('skal have booket en tid') === 'Book en tid',
  imperative('skal have booket en tid'))
check('the target stops at the next preposition',
  analyse('ring til banken om mit lån').target === 'banken')
check('a particle is not the object',
  analyse('ryd op i garagen').object === 'garagen',
  analyse('ryd op i garagen').object)
check('a trailing particle is not the object either',
  analyse('print billetterne ud').object === 'billetterne',
  analyse('print billetterne ud').object)
check('"få styr på" survives the ASCII word boundary',
  analyse('få styr på min pension').verb === 'få-styr-på',
  String(analyse('få styr på min pension').verb))
check('her own wording is kept in the title',
  imperative('ordn mit rod') === 'Ordn mit rod',
  imperative('ordn mit rod'))

console.log('\nopgave eller note')
const cases: Array<[string, 'task' | 'note']> = [
  ['Skal have booket en tid til synet af bilen', 'task'],
  ['Jeg er så træt af at der er rod overalt', 'note'],
  ['Har du set hvor mine nøgler er?', 'note'],
  ['Lægen ringede', 'note'],
  ['Hun sagde at jeg skulle sende papirerne inden den 3 september', 'task'],
  ['Mors fødselsdag er 14. marts', 'task'],
  ['Vaskemaskinen larmer', 'task'],
  ['Betal elregningen senest på fredag', 'task'],
]
for (const [text, expected] of cases) {
  const item = one(text)
  check(`${expected === 'task' ? 'opgave' : 'note '}: "${text}"`, item?.kind === expected, item?.kind)
}

console.log('\nkategorier')
const paths: Array<[string, string]> = [
  ['Køb vaskemiddel', 'Hjem›Indkøb'],
  ['Vask tøj', 'Hjem›Vasketøj'],
  ['Aflever pakken på posthuset', 'Hjem›Ærinder'],
  ['Aflever bøgerne på biblioteket', 'Hjem›Ærinder'],
  ['Ansøg om boligstøtte', 'Økonomi›Det offentlige'],
  ['Spørg om blodprøven', 'Mig›Sundhed'],
  ['Book tid til synet af bilen', 'Hjem›Praktisk'],
]
for (const [text, expected] of paths) {
  const item = one(text)
  check(`"${text}" → ${expected}`, item?.path.join('›') === expected, item?.path.join('›'))
}

console.log('\nsteps hører til opgaven')
const steps: Array<[string, RegExp, RegExp?]> = [
  // [task, must contain, must NOT contain]
  ['Køb vaskemiddel', /indk[øo]bssedlen|k[øo]b det/i, /vaskemaskin|s[æa]be i/i],
  ['Betal regningen fra tandlægen', /netbank|MobilePay/i, /booking-link|kalenderen efter to dage/i],
  ['Vaskemaskinen larmer', /m[æa]rke og model/i, /fyld maskinen/i],
  ['Ryd op i garagen', /garagen/i, /\bop\b(?!rydning)/i],
  ['Aflever pakken på posthuset', /posthuset|pakken/i, /instagram|opslag/i],
  ['Få styr på min pension', /svare p[åa]/i, /valget om/i],
  ['Skift dæk', /nummerplade|d[æa]kkene/i],
]
for (const [text, must, mustNot] of steps) {
  const d = decompose(imperative(text), { granularity: 5 })
  const joined = (d?.steps ?? []).join(' | ')
  check(`"${text}" gets its own steps`, !!joined && must.test(joined), joined || '(ingen)')
  if (mustNot) check(`"${text}" gets nobody else's`, !mustNot.test(joined), joined)
}

console.log('\ndetaljegrad')
for (const text of ['Ryd op i garagen', 'Find ud af hvad jeg skal med den gamle bil', 'Betal regningen']) {
  const few = decompose(text, { granularity: 1 })?.steps.length ?? 0
  const many = decompose(text, { granularity: 20 })?.steps.length ?? 0
  check(`"${text}" 1 < 20`, few === 1 && many > few, `${few} → ${many}`)
}

console.log('\ndem der kommer igen')
for (const [text, every, title] of [
  ['Betal husleje hver måned', 'month', 'Betal husleje'],
  ['Tag medicin hver dag', 'day', 'Tag medicin'],
  ['Tøm skraldespanden hver mandag', 'week', 'Tøm skraldespanden'],
  ['Ring til mor', undefined, 'Ring til mor'],
] as Array<[string, string | undefined, string]>) {
  const item = one(text)
  check(`"${text}" -> ${every ?? 'engang'} / "${title}"`, item?.repeat === every && item?.title === title,
    `${item?.repeat ?? 'engang'} / ${item?.title}`)
}

console.log('\nrigtige datoer')
const bday = one('Mors fødselsdag er 14. marts')
check('14. marts stays one loop', bday?.title === 'Mors fødselsdag', bday?.title)
check('and becomes a real date', bday?.scheduledDate === '2027-03-14', String(bday?.scheduledDate))
const appt = one('Tandlæge torsdag kl 14')
check('an already-booked appointment gets no booking checklist', (appt?.steps.length ?? 0) === 0,
  appt?.steps.join(' | '))

console.log('\nlister')
const list = parseBrainDump('købe ind - mælk, brød, kaffe', { now: NOW })
check('a shopping list is one task, not four', list.length === 1, `${list.length}: ${list.map((l) => l.title).join(', ')}`)
check('and the list is kept', /mælk/.test(list[0]?.aside ?? ''), list[0]?.aside)

console.log('\ns-passiv')
for (const [text, expected] of [
  ['Der skal betales en regning inden fredag', 'Betal en regning'],
  ['Bilen skal synes inden længe', 'Syn bilen inden længe'],
  ['Regningen skal betales inden fredag', 'Betal regningen'],
  ['Papirerne skal udfyldes', 'Udfyld papirerne'],
] as Array<[string, string]>) {
  const item = one(text)
  check(`"${text}" -> "${expected}"`, item?.kind === 'task' && item.title === expected, `${item?.kind}: ${item?.title}`)
}

console.log('\ntvivl er synlig')
check('a clear task is not flagged', (one('Ring til tandlægen')?.confidence ?? 0) >= CERTAIN)
check('an unknown category does not fake doubt about kind',
  (one('Print billetterne ud')?.confidence ?? 0) >= CERTAIN && one('Print billetterne ud')?.placed === false)

/* ------------------------------------------------------------------ *
 * The coach must not act on things she did not ask it to act on.
 * ------------------------------------------------------------------ */

const TASK = {
  id: 'n1',
  title: 'Ordn skat',
  steps: [{ id: 's1', title: 'Find MitID frem', done: false }],
  estimatedMinutes: 45,
  status: 'open',
} as unknown as LoopNode

console.log('\ncoachen holder fingrene fra almindelig snak')
for (const text of [
  'Jeg er så træt',
  'Der er alt for meget',
  'Det hele er for meget lige nu',
  'Ikke lige nu',
  'Jeg kan ikke overskue det',
  'Jeg hader det her',
  'Jeg føler mig dum',
  'Hej',
]) {
  const r = handleAgentRequest({ text, task: TASK })
  check(`"${text}" er ikke en kommando`, r === null || !r.effect, r?.lines[0])
  check(`"${text}" bliver ikke til en opgave`, !detectCaptures(text, {})?.items.length)
}

console.log('\ncoachen gør det den bliver bedt om')
for (const [text, kind] of [
  ['Flyt den til på fredag', 'schedule'],
  ['Parkér den', 'park'],
  ['Tilføj at jeg skal finde lønsedlerne', 'add-step'],
  ['Giv mig flere trin', 'resplit'],
  ['Kald den Skat 2026', 'rename'],
  ['Hæng den på når jeg har sat kaffe over', 'cue'],
  ['Slet den', 'delete'],
] as Array<[string, string]>) {
  const r = handleAgentRequest({ text, task: TASK })
  check(`"${text}" -> ${kind}`, r?.effect?.kind === kind, r?.effect?.kind ?? 'ingenting')
}
check('kun sletning spørger først', handleAgentRequest({ text: 'Slet den', task: TASK })?.confirm !== undefined)

console.log('\ntriggers')
const triggers = ['Hvis nogen virker sure på mig', 'Regninger og økonomi']
check('en trigger i hendes egne ord fanges',
  matchTriggers('Jeg tror min chef er sur på mig', triggers).length === 1)
check('og en anden, uafhængig trigger gør også',
  matchTriggers('Jeg tør ikke kigge på regningerne', triggers).length === 1)
check('almindelig tekst udløser ingenting',
  matchTriggers('Jeg skal vaske tøj i morgen', triggers).length === 0)
check('en fritekst-trigger matcher på hendes egne ord',
  matchTriggers('Jeg skal til tandlæge på torsdag', ['Tandlægen']).length === 1)

/* ------------------------------------------------------------------ *
 * Patterns in her own data, which is the only thing the coach knows
 * that she does not.
 * ------------------------------------------------------------------ */

console.log('\nmønstre den kan se, som man ikke selv kan')
{
  const day = 86_400_000
  const t0 = NOW.getTime()
  const mkNode = (title: string, ageDays: number, i: number) =>
    ({
      id: `x${i}`, parentId: 'root', childIds: [], title, isArea: false, status: 'open',
      createdAt: t0 - ageDays * day, updatedAt: t0 - ageDays * day, area: 'other',
      estimatedMinutes: 8, mentalWeight: 3, energyRequired: 60, urgency: 'none',
      steps: [], avoidanceCount: 0,
    }) as unknown as LoopNode

  const nodes = ([
    ['Ring til tandlægen', 40], ['Ring til banken', 35], ['Ring til kommunen', 44],
    ['Ring til forsikringen', 30], ['Køb mælk', 2], ['Vask tøj', 3],
    ['Ryd op i entreen', 6], ['Betal elregningen', 4],
  ] as Array<[string, number]>).map(([t, a], i) => mkNode(t, a, i))

  const root = {
    id: 'root', parentId: null, childIds: nodes.map((n) => n.id), title: 'Mit liv', isArea: true,
    status: 'open', createdAt: t0, updatedAt: t0, area: 'other', estimatedMinutes: 0,
    mentalWeight: 1, energyRequired: 30, urgency: 'none', steps: [], avoidanceCount: 0,
  } as unknown as LoopNode
  const map = Object.fromEntries([root, ...nodes].map((n) => [n.id, n]))

  const completions: Completion[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(t0 - i * day)
    d.setHours(20, 30, 0, 0)
    completions.push({
      id: `c${i}`, nodeId: `n${i}`, title: 'Vask tøj', completedAt: d.getTime(), kind: 'done',
      xp: 12, via: 'start-mode', minutes: 10, area: 'home', wasAvoided: false,
    })
  }

  const found = observe(nodes, map as never, completions, NOW)
  check('den ser hvilken slags opgave der rådner',
    found.some((o) => /Telefonopkald bliver liggende/.test(o.text)),
    found.map((o) => o.text).join(' | '))
  check('og hvornår hun rent faktisk lukker ting',
    found.some((o) => /lukker det meste aften/.test(o.text)))
  const thin = Object.fromEntries([root, ...nodes.slice(0, 2)].map((n) => [n.id, n]))
  check('men siger ingenting uden nok data',
    observe(nodes.slice(0, 2), thin as never, completions.slice(0, 2), NOW).length === 0,
    observe(nodes.slice(0, 2), thin as never, completions.slice(0, 2), NOW).map((o) => o.text).join(' | '))
}

console.log(failures ? `\n${failures} FAILED\n` : '\nalt passerer\n')
process.exit(failures ? 1 : 0)
