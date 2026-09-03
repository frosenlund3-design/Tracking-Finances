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
import { decompose, looksLikeAnAppointment } from '../src/lib/decompose'
import { analyse, toImperativeSentence } from '../src/lib/language'
import { handleAgentRequest } from '../src/lib/coach/agent'
import { detectCaptures } from '../src/lib/coach/capture'
import { matchTriggers } from '../src/lib/coach/triggers'
import { observe } from '../src/lib/coach/memory'
import { chooseOpening, type OpeningContext } from '../src/lib/coach/opening'
import { understand, namedTopic } from '../src/lib/coach/understand'
import { cadenceIn, cadenceLabel, readHabits, spotHabits } from '../src/lib/habits'
import { buildFocus, tierOf } from '../src/lib/focus'
import { scoreTask } from '../src/lib/scoring'
import { toMap } from '../src/lib/nodes'
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

console.log('\ncoachen åbner med noget nyt hver gang')
{
  const base: OpeningContext = {
    tone: 'calm', closedToday: 0, closedYesterday: 0, energy: 60, openLoops: 4,
    stale: null, observations: [], daysSinceLastChat: 1, recent: [],
  }
  const ids: string[] = []
  let recent: string[] = []
  for (let i = 0; i < 8; i++) {
    const o = chooseOpening({ ...base, recent })
    ids.push(o.id)
    recent = [o.id, ...recent].slice(0, 6)
  }
  check('otte samtaler i træk gentager ikke sig selv',
    new Set(ids.slice(0, 6)).size === 6, ids.join(', '))
  check('og hver åbning stiller et spørgsmål',
    chooseOpening(base).lines.join(' ').includes('?'))

  check('lav energi bliver nævnt',
    chooseOpening({ ...base, energy: 10 }).id === 'low-energy')
  check('en god gårsdag uden en god i dag bliver nævnt',
    chooseOpening({ ...base, closedYesterday: 4 }).id === 'yesterday-worked')
  check('fremgang i dag bliver nævnt',
    chooseOpening({ ...base, closedToday: 3 }).id === 'after-progress')
  check('en meget lang liste bliver nævnt',
    chooseOpening({ ...base, openLoops: 22 }).id === 'a-lot-open')
  check('og en lang pause bliver nævnt',
    chooseOpening({ ...base, daysSinceLastChat: 9 }).id === 'been-a-while')
  check('men ikke den samme to gange i træk',
    chooseOpening({ ...base, energy: 10, recent: ['low-energy'] }).id !== 'low-energy')
}

/* ------------------------------------------------------------------ *
 * Reading the message before acting on a piece of it.
 *
 * Every case here comes from one conversation that went badly.
 * ------------------------------------------------------------------ */

console.log('\ncoachen læser hele beskeden')
{
  const HELP =
    'Jeg har brug for hjælp til at sortere mine taks, og derefter prioritere de top 3-5 vigtigste, ' +
    'og også brug for hjælp til økonomi og hvordan jeg skal skaffe penge til husleje..'
  const u = understand(HELP)
  check('den hører alle tre ting, ikke kun den første',
    u.asks.map((a) => a.topic).join(',') === 'sort,prioritise,money', u.asks.map((a) => a.topic).join(','))
  check('og den ved at det er en anmodning', u.isRequest)
  check('så den bliver ALDRIG til en opgave', !detectCaptures(HELP, {})?.items.length,
    detectCaptures(HELP, {})?.items.map((i) => i.title).join(', '))

  check('"skulle du ikke være terapeut?" er et spørgsmål om coachen',
    understand('Skulle du ikke være terapeut?').meta === 'are-you-a-therapist')
  check('og agenten holder fingrene fra det',
    handleAgentRequest({ text: 'Skulle du ikke være terapeut?', task: TASK }) === null)
  check('"er du et menneske?" ligeså', understand('Er du et menneske?').meta === 'are-you-real')
  check('"hvad kan du?" ligeså', understand('Hvad kan du?').meta === 'what-can-you-do')

  check('"nej bare hjælp mig nuu" er et råb om hjælp, ikke et nej til noget',
    understand('Nej bare hjælp mig nuu').asks[0]?.topic === 'start' &&
      understand('Nej bare hjælp mig nuu').urgent)

  check('"og hvad så med rækkefølgen" peger på rækkefølgen',
    namedTopic('Okay. Og hvad så med rækkefølgen?', ['sort', 'prioritise']) === 'prioritise')

  check('almindelige opgaver er stadig opgaver',
    !understand('Jeg skal huske at ringe til tandlægen').isRequest &&
      !!detectCaptures('Jeg skal huske at ringe til tandlægen', {})?.items.length)
}

/* ------------------------------------------------------------------ *
 * Vaner.
 *
 * The message below is verbatim what she dictated, transcription errors and
 * all. The coach's answer to it was bookkeeping about an unrelated task,
 * because something downstream matched the words "hver dag" in the middle of
 * six hundred characters. Every assertion here is that failure, pinned down.
 * ------------------------------------------------------------------ */

console.log('\ncoachen forstår en rutine, sagt i én køre')
{
  const DUMP =
    'Jeg har nogle vaner til hverdag men for eksempel sådan at jeg tørrer køkkenbordet af hver dag ' +
    'jeg putter mit pant i pant posen jeg tømmer mine skraldepose både mad skraldespanden og restaffald ' +
    'overflade af og så støvsuger jeg og så vil jeg også godt have en maling vaske gulv hver tredjedagen ' +
    'og ja så skal være bedre til at sådan både tømme og fylde opvaskemaskinen og Restart forskellige ting ' +
    'og så skal det faktisk også være en del af en vane at pille altså sertralin jeg tager 50 mg . ' +
    'Undskyld hvis du ikke forstod noget af det jeg lige sagde jeg mente bare at jeg tager piller hver dag eller bare en'

  const r = readHabits(DUMP)
  const doing = (r?.doing ?? []).map((h) => h.title)
  const wanted = (r?.wanted ?? []).map((h) => h.title)

  check('den hører at det handler om vaner', r?.aboutHabits === true)
  check('den hører det hun allerede gør',
    doing.includes('Tør køkkenbordet af') && doing.includes('Støvsug'), doing.join(', '))
  check('og holder det adskilt fra det hun gerne vil i gang med',
    wanted.includes('Vask gulv') && wanted.includes('Tag medicin') && !doing.includes('Tag medicin'),
    wanted.join(', '))
  check('"både tømme og fylde opvaskemaskinen" er én vane, ikke to',
    wanted.includes('Tøm og fyld opvaskemaskinen') &&
      !wanted.includes('Tøm opvaskemaskinen') && !wanted.includes('Fyld opvaskemaskinen'),
    wanted.join(', '))
  check('"hver tredjedagen" bliver hver tredje dag, ikke hver dag',
    r?.wanted.find((h) => h.title === 'Vask gulv')?.cadence.every === 3)
  check('og den kadence smitter ikke af på resten',
    r?.wanted.every((h) => h.title === 'Vask gulv' || h.cadence.every === 1) === true,
    (r?.wanted ?? []).map((h) => `${h.title}=${cadenceLabel(h.cadence)}`).join(', '))
  check('den hører undskyldningen', r?.apologised === true)

  // The actual bug: a fragment of this message setting a repeat on whatever
  // task happened to be in focus, and being announced as if she had asked.
  check('agenten rører ikke en urelateret opgave',
    handleAgentRequest({ text: DUMP, task: TASK, namedTask: true }) === null,
    JSON.stringify(handleAgentRequest({ text: DUMP, task: TASK, namedTask: true })?.effect))
  check('og den bliver ikke til en opgave om at have vaner',
    !detectCaptures(DUMP, {})?.items.some((i) => /vane/i.test(i.title)))

  check('"hver dag" er stadig en gentagelse i en kort besked',
    handleAgentRequest({ text: 'Den skal være hver dag', task: TASK })?.effect?.kind === 'repeat')

  check('kadence uden ordenstal', cadenceIn('hver uge')?.unit === 'week')
  check('kadence med tal', cadenceIn('hver 4. dag')?.every === 4)
  check('ingen kadence er ingen kadence', cadenceIn('jeg skal ringe til lægen') === null)
}

console.log('\nvaner der ligger på listen som opgaver')
{
  const chore = (title: string): LoopNode => ({ ...TASK, id: title, title })
  const found = spotHabits([chore('Tøm opvaskemaskinen'), chore('Ring til kommunen'), chore('Vask gulv hver tredje dag')])
  const titles = found.map((h) => h.node.title)
  check('en opvaskemaskine er en vane', titles.includes('Tøm opvaskemaskinen'), titles.join(', '))
  check('et opkald til kommunen er ikke', !titles.includes('Ring til kommunen'))
  check('og hendes egen "hver tredje dag" bliver læst som den er',
    found.find((h) => h.node.title.startsWith('Vask gulv'))?.cadence.every === 3)
  check('en opgave der allerede gentager sig bliver ikke foreslået igen',
    spotHabits([{ ...chore('Tøm opvaskemaskinen'), repeat: 'day' }]).length === 0)
}

/* ------------------------------------------------------------------ *
 * Hvorfor lige den opgave.
 *
 * "jeg føler det er ret random hvilken task den putter ind som den jeg skal
 * lave nu". It was: twenty loops with no deadline scored within a few points
 * of each other and the top one moved with the clock.
 * ------------------------------------------------------------------ */

console.log('\nrækkefølgen er til at forklare')
{
  const CTX = {
    energy: 30 as const,
    now: NOW,
    profile: { energyPeak: 'varies' as const, procrastinationReasons: [] },
    goodEnoughMode: false,
  }
  const loop = (id: string, patch: Partial<LoopNode> = {}): LoopNode => ({
    ...TASK, id, title: id, parentId: 'root', childIds: [], steps: [], ...patch,
  })
  const root: LoopNode = { ...TASK, id: 'root', title: 'Mit liv', parentId: null, isArea: true, childIds: [], steps: [] }

  const due = loop('Betal husleje', { dueAt: NOW.getTime() + 3 * 3_600_000 })
  const started = loop('Ryd skrivebordet', { status: 'active', startedAt: NOW.getTime() })
  const idle = loop('Find forsikringspapirer')
  const habit = loop('Tøm skraldespanden', { repeat: 'day' })
  const future = loop('Vask gulv', { repeat: 'day', repeatEvery: 3, scheduledDate: '2026-09-01' })
  const kids = [due, started, idle, habit, future]
  const map = toMap([{ ...root, childIds: kids.map((k) => k.id) }, ...kids])

  check('en rigtig frist ligger i sit eget lag',
    tierOf(scoreTask(due, map, CTX), CTX) === 'must')
  check('noget påbegyndt ligger over noget urørt',
    tierOf(scoreTask(started, map, CTX), CTX) === 'started' &&
      tierOf(scoreTask(idle, map, CTX), CTX) === 'rest')

  const focus = buildFocus({ map, ctx: CTX, prefs: {} })
  check('den øverste er den med fristen', focus.now?.node.id === 'Betal husleje', focus.now?.node.title)
  check('og der står hvorfor', /frist/i.test(focus.why), focus.why)
  check('listen er tre ting, ikke hele bunken', focus.shortlist.length <= 3, String(focus.shortlist.length))
  check('vaner ligger for sig selv', focus.routines.map((t) => t.node.id).join(',') === 'Tøm skraldespanden',
    focus.routines.map((t) => t.node.id).join(','))
  check('og en vane, der først er i morgen, er slet ikke med',
    ![...focus.shortlist, ...focus.routines, ...focus.rest].some((t) => t.node.id === 'Vask gulv'))

  // The whole point: the same data gives the same list, twice running.
  const again = buildFocus({ map, ctx: { ...CTX, now: new Date(NOW.getTime() + 2 * 3_600_000) }, prefs: {} })
  check('to timer senere er det stadig den samme',
    again.now?.node.id === focus.now?.node.id, again.now?.node.title)

  // And a list she was given this morning is not quietly replaced at noon.
  const kept = buildFocus({
    map, ctx: CTX,
    prefs: { focusDate: '2026-08-28', focusIds: ['Find forsikringspapirer'] },
  })
  check('den liste hun fik i morges bliver stående',
    kept.shortlist.some((t) => t.node.id === 'Find forsikringspapirer'),
    kept.shortlist.map((t) => t.node.id).join(', '))
}

/* ------------------------------------------------------------------ *
 * Hver opgave kan deles op.
 *
 * A third of ordinary Danish tasks used to get no steps at all, because the
 * verb was real and simply had no chain written for it. From her side that is
 * a button that does nothing, which is the one thing worse than generic steps.
 * ------------------------------------------------------------------ */

console.log('\nalt kan deles op')
{
  const EVERYDAY = [
    'Ring til tandlægen', 'Betal elregningen', 'Køb vaskemiddel', 'Støvsug stuen',
    'Tøm opvaskemaskinen', 'Vask tøj', 'Skriv til udlejer', 'Aflever pakken',
    'Find forsikringspapirer', 'Sorter posten', 'Klip neglene', 'Vand blomsterne',
    'Gå en tur', 'Tag medicin', 'Afmeld nyhedsbrevet', 'Opret en NemKonto',
    'Overfør penge til opsparing', 'Hæv kontanter', 'Sælg cyklen på DBA',
    'Saml den nye reol', 'Mal soveværelset', 'Reparer cyklen', 'Forbered oplægget',
    'Øv præsentationen', 'Rette CV', 'Planlægge sommerferien', 'Slette gamle billeder',
    'Rydde ud i tøjet', 'Sortere billeder', 'Hjælp Sofie med lektier', 'Klippe hækken',
    'Bage en kage til Idas fødselsdag', 'Lav mad til i aften', 'Lave madplan',
    'Klargør bilen til vinter', 'Bliv bedre til at lave mad', 'Tale med min mor om jul',
  ]
  const empty = EVERYDAY.filter((t) => !decompose(t)?.steps.length)
  check('hver eneste hverdagsopgave får trin', empty.length === 0, empty.join(', '))

  // The chain has to be about her task, not about a category it resembles.
  const steps = (t: string) => decompose(t, { granularity: 5 })?.steps ?? []
  check('en vane bliver hængt på noget, ikke på et klokkeslæt',
    steps('Tag medicin').some((x) => /h[æa]ng den p[åa]/i.test(x)), steps('Tag medicin').join(' | '))
  check('at bage handler om opskriften, ikke om en grim første udgave',
    steps('Bage en kage til Idas fødselsdag').some((x) => /opskrift/i.test(x)))
  check('at hjælpe nogen får en aftalt slutning',
    steps('Hjælp Sofie med lektier').some((x) => /hvor lang tid/i.test(x)))
  check('en reparation spørger hvem der fikser den, ikke hvordan',
    steps('Reparer cyklen').some((x) => /kan du selv/i.test(x)))
  check('og den navngiver tingen, ikke udsagnsordet',
    steps('Reparer cyklen')[0]?.includes('cyklen') === true, steps('Reparer cyklen')[0])
  check('at planlægge er beslutninger, ikke bunker',
    steps('Planlægge sommerferien').some((x) => /besluttes/i.test(x)))
  check('at rydde ud taber ikke sin forholdsord',
    !steps('Rydde ud i tøjet').some((x) => /ud af i /i.test(x)), steps('Rydde ud i tøjet')[0])

  // Grammar. A broken sentence in a step is the clearest possible signal that
  // nobody wrote this for her.
  const all = EVERYDAY.flatMap((t) => decompose(t, { granularity: 20 })?.steps ?? [])
  const broken = all.filter((x) => /\bfor at (?:meld|overf[øo]r|ret|klip|slet)(?![a-zæøå])/i.test(x) || /hvor man (?:meld|ret|overf[øo]r)\b/i.test(x))
  check('ingen trin med knækket grammatik', broken.length === 0, broken.slice(0, 2).join(' | '))

  // Every chain must open with something she can physically do.
  const firsts = EVERYDAY.map((t) => decompose(t, { granularity: 5 })?.steps[0] ?? '')
  check('hvert forløb starter med noget konkret',
    firsts.every((f) => f.length > 0 && /^[A-ZÆØÅ]/.test(f)), firsts.filter((f) => !/^[A-ZÆØÅ]/.test(f)).join(' | '))

  // The one thing that genuinely cannot be split.
  check('en aftale bliver genkendt som en aftale', looksLikeAnAppointment('Fars fødselsdag'))
  check('og får ingen trin', decompose('Fars fødselsdag') === null)
  check('men en rigtig opgave er ikke en aftale', !looksLikeAnAppointment('Ring til tandlægen'))

  // Shapes that were landing in the wrong kind of work entirely.
  check('at lede efter noget er ikke at sortere det',
    steps('Find forsikringspapirer').some((x) => /sandsynligvis er/i.test(x)), steps('Find forsikringspapirer')[0])
  check('kontanter kommer fra en automat, ikke fra MitID',
    !steps('Hæv kontanter').some((x) => /MitID/i.test(x)), steps('Hæv kontanter')[0])
  check('at sælge noget er ikke et ærinde',
    steps('Sælg cyklen på DBA').some((x) => /billeder/i.test(x)), steps('Sælg cyklen på DBA')[0])
  check('at øve sig er gentagelse, ikke et førsteudkast',
    steps('Øv præsentationen').some((x) => /igen, tre gange/i.test(x)))
  check('en lille opgave får ikke ti minutters stillads',
    steps('Vand blomsterne').length <= 3, steps('Vand blomsterne').join(' | '))
  check('og den bruger bydeform, ikke navnemåde',
    steps('Vand blomsterne').includes('Vand blomsterne'), steps('Vand blomsterne').join(' | '))
  check('tillægsordet mister ikke sin artikel',
    steps('Saml den nye reol')[0]?.includes('den nye reol') === true, steps('Saml den nye reol')[0])

  // The vague chain is for tasks that really are vague, and nothing else.
  check('"ordn mit rod" er uklar', decompose('Ordn mit rod')?.recognised === 'uklar')
  check('"tag medicin" er ikke', decompose('Tag medicin')?.recognised !== 'uklar')
  check('et spørgsmål er stadig en note',
    one('Har du set hvor mine nøgler er')?.kind === 'note')
}

console.log(failures ? `\n${failures} FAILED\n` : '\nalt passerer\n')
process.exit(failures ? 1 : 0)
