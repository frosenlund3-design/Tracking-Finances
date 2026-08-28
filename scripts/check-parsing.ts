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

const NOW = new Date('2026-08-28T10:00:00')
let failures = 0

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
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

console.log(failures ? `\n${failures} FAILED\n` : '\nalt passerer\n')
process.exit(failures ? 1 : 0)
