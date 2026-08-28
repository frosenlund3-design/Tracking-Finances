/**
 * Brain dump parsing — the heart of "the user should not have to organise".
 *
 * The user types one messy Danish paragraph. We split it into loops, guess
 * where each one belongs, rewrite it as a concrete action, estimate its size
 * and pre-break it down. Everything is local: regex, a Danish lexicon and
 * heuristics. No API, no cost, works offline.
 *
 * We are allowed to be wrong. The confirm screen ("Ser det rigtigt ud?") is
 * the safety net — but being wrong quietly is far better than asking the user
 * to fill in eight fields.
 */

import type { EnergyLevel, LifeArea, MentalWeight, TimePart, Urgency } from '@/db/types'
import { decompose } from './decompose'

export interface ParsedTime {
  at: number
  hasTime: boolean
  kind: 'deadline' | 'appointment'
}

export interface ParsedLoop {
  key: string
  /** Cleaned, imperative title. */
  title: string
  /** Original fragment, kept so the user can see what they actually wrote. */
  raw: string
  /** Worlds from the root down, e.g. ['Arbejde', 'SOME', 'Instagram']. */
  path: string[]
  area: LifeArea
  estimatedMinutes: number
  mentalWeight: MentalWeight
  energyRequired: EnergyLevel
  urgency: Urgency
  scheduledDate?: string
  scheduledPart?: TimePart
  /** Only set when the text really named a time. */
  due?: ParsedTime
  steps: string[]
  goodEnough?: string
  /** 0–1, how sure we are about the placement. Low confidence lands in Løst og fast. */
  confidence: number
}

interface Rule {
  match: RegExp
  path: string[]
  area: LifeArea
  minutes?: number
  energy?: EnergyLevel
  weight?: MentalWeight
  confidence?: number
}

export const WORLD_LOOSE = 'Løst og fast'

/**
 * Order matters: the first rule that matches wins, so the specific ones
 * (Instagram) must come before the general ones (arbejde).
 */
const RULES: Rule[] = [
  { match: /\binstagram|\big\b|reels?\b/i, path: ['Arbejde', 'SOME', 'Instagram'], area: 'work', minutes: 30, energy: 60 },
  { match: /\btiktok\b/i, path: ['Arbejde', 'SOME', 'TikTok'], area: 'work', minutes: 45, energy: 60 },
  { match: /\bfacebook\b|\blinkedin\b|\byoutube\b/i, path: ['Arbejde', 'SOME'], area: 'work', minutes: 30, energy: 60 },
  { match: /\bsome\b|sociale medier|\bcontent\b|opslag|\bposte?\b|\bstor(?:y|ies)\b|f[øo]lgere/i, path: ['Arbejde', 'SOME'], area: 'work', minutes: 30, energy: 60 },
  { match: /\bkunde\w*|\btilbud\b|\bfaktura\w*|\btilbudsgivning\b/i, path: ['Arbejde', 'Kunder'], area: 'work', minutes: 25, energy: 60 },
  { match: /\bm[øo]de\b|\bdeadline\b|\brapport\w*|pr[æa]sentation|\bprojekt\b(?!.*hjem)/i, path: ['Arbejde'], area: 'work', minutes: 40, energy: 60 },
  { match: /\bbogf[øo]r\w*|\bmoms\b|\bregnskab\w*|administration/i, path: ['Arbejde', 'Administration'], area: 'admin', minutes: 40, energy: 60 },
  { match: /\barbejde\b|\bjob\b|\bchef\b|\bkollega\w*/i, path: ['Arbejde'], area: 'work', minutes: 30, energy: 60 },

  { match: /\bskat\b|selvangivel|[åa]rsopg[øo]rel|forskudsopg[øo]rel/i, path: ['Økonomi', 'Skat'], area: 'money', minutes: 45, energy: 100 },
  { match: /\bregning\w*|\bbetal\w*|\brykker\w*|\bnetbank\w*|\bgiro\b/i, path: ['Økonomi', 'Regninger'], area: 'money', minutes: 10, energy: 60 },
  { match: /\bbudget\w*|\bopsparing\w*|\bl[åa]n\b|\bbank\w*|\bpension\w*|\bforsikring\w*|\babonnement\w*|\bops[iy]g\w*/i, path: ['Økonomi'], area: 'money', minutes: 25, energy: 60 },

  { match: /\btandl[æa]ge\w*/i, path: ['Mig', 'Tandlæge'], area: 'health', minutes: 8, energy: 60 },
  { match: /\bl[æa]ge\w*|\bpsykolog\w*|\bfysioterap\w*|\bspeciall[æa]ge\w*|sundhed\.dk|\brecept\w*|\bmedicin\w*/i, path: ['Mig', 'Sundhed'], area: 'health', minutes: 10, energy: 60 },
  { match: /\btr[æa]n\w*|\bl[øo]betur\w*|\byoga\b|\bmotion\b|\bg[åa]tur\b|\bfitness\b|\bsv[øo]mme\w*/i, path: ['Mig', 'Krop'], area: 'health', minutes: 40, energy: 60 },
  { match: /\bfris[øo]r\w*|\bnegle\w*|\bmassage\b|\bwellness\b|\bmig selv\b|\bpause\b|\bhvile\b/i, path: ['Mig', 'Aftaler'], area: 'personal', minutes: 15, energy: 30 },
  { match: /\bferie\w*|\brejse\w*|\bfly\b|\bhotel\b|\bsommerhus\w*/i, path: ['Mig', 'Ferie'], area: 'personal', minutes: 45, energy: 60 },

  { match: /\bindk[øo]b\w*|\bnetto\b|\bf[øo]tex\b|\bbilka\b|\brema\b|\blidl\b|\bsuper\w*|vaskemid\w*|\bshampoo\b|\btandpasta\b|\bm[æa]lk\b|\bbr[øo]d\b|\btoiletpapir\b/i, path: ['Hjem', 'Indkøb'], area: 'home', minutes: 25, energy: 30 },
  { match: /\bopvask\w*|\bk[øo]kken\w*|\btallerken\w*|\bmadpakke\w*|\bmadplan\w*|\baftensmad\b/i, path: ['Hjem', 'Køkken'], area: 'home', minutes: 15, energy: 30 },
  { match: /\bvasket[øo]j\b|\bvask\w*|\bt[øo]rretumbler\b|\bstrygning\b|\bt[øo]j\b/i, path: ['Hjem', 'Vasketøj'], area: 'home', minutes: 10, energy: 30 },
  { match: /\breng[øo]r\w*|\bst[øo]vsug\w*|\bg[øo]re rent\b|\bryd op\b|\boprydning\b|\bgulv\w*|\bbadev[æa]rels\w*|\bst[øo]v\b|\bskrald\b|\baffald\b/i, path: ['Hjem', 'Rengøring'], area: 'home', minutes: 20, energy: 30 },
  { match: /\bbil\b|\bv[æa]rksted\w*|\bd[æa]k\b|\bsyn\b|\bbenzin\b|\bcykel\w*/i, path: ['Hjem', 'Praktisk'], area: 'home', minutes: 20, energy: 60 },
  { match: /\bhave\w*|\bplante\w*|\bmal\w*|\breparer\w*|\bh[åa]ndv[æa]rker\w*|\bskur\b|\bloft\b|\bkælder\b/i, path: ['Hjem', 'Praktisk'], area: 'home', minutes: 45, energy: 60 },
  { match: /\bhjem\w*|\bboligen\b|\blejlighed\w*|\bhus(?:et)?\b/i, path: ['Hjem'], area: 'home', minutes: 25, energy: 30 },

  { match: /\bmor\b|\bfar\b|\bs[øo]ster\b|\bbror\b|\bsvigermor\b|\bsvigerfar\b|\bfamilie\w*|\bmormor\b|\bfarmor\b/i, path: ['Familie'], area: 'family', minutes: 15, energy: 30 },
  { match: /\bb[øo]rn\w*|\bskole\w*|\bb[øo]rnehave\w*|\bvuggestue\w*|\blektier\b|\bforældrem[øo]de\b|\bdatter\w*|\bs[øo]n(?:nen)?\b/i, path: ['Familie', 'Børn'], area: 'family', minutes: 20, energy: 60 },
  { match: /\bgave\w*|\bf[øo]dselsdag\w*|\bjul\b|\bbryllup\w*|\bkonfirmation\w*|\bfest\b/i, path: ['Familie', 'Mærkedage'], area: 'family', minutes: 25, energy: 60 },

  { match: /\bmail\w*|\be-?mail\w*|\bindbakke\w*|\bsvar p[åa]\b/i, path: ['Løst og fast'], area: 'admin', minutes: 10, energy: 60, confidence: 0.5 },
  { match: /\bpapir\w*|\bdokument\w*|\bblanket\w*|\bkontrakt\w*|\bans[øo]g\w*|\bborger\.dk\b|\bmitid\b|\be-?boks\b/i, path: ['Løst og fast'], area: 'admin', minutes: 25, energy: 60, confidence: 0.5 },
]

/** Verbs that make a fragment stand on its own when splitting on "og". */
const ACTION_VERBS =
  /\b(ring|ringe|k[øo]b|k[øo]be|skriv|skrive|send|sende|betal|betale|book|booke|bestil|bestille|vask|vaske|ryd|rydde|ordn|ordne|find|finde|lav|lave|tag|tage|hent|hente|aflever|aflevere|post|poste|optag|optage|rediger|redigere|planl[æa]g|planl[æa]gge|svar|svare|sp[øo]rg|sp[øo]rge|husk|huske|t[øo]m|t[øo]mme|fyld|fylde|tr[æa]n|tr[æa]ne|l[æa]s|l[æa]se|meld|melde|ops[iy]g|opsige|skift|skifte|print|printe|aftal|aftale|kontakt|kontakte|unders[øo]g|unders[øo]ge|g[øo]r|g[øo]re|start|starte|afslut|afslutte|ret|rette|s[øo]g|s[øo]ge|flyt|flytte|saml|samle|pak|pakke|reng[øo]r|reng[øo]re|st[øo]vsug|st[øo]vsuge|arranger|arrangere|f[åa]|hj[æa]lp|male|mal|kigge|kig|tjek|tjekke|snak|snakke|tal|tale)\b/i

const INFINITIVE_TO_IMPERATIVE: Record<string, string> = {
  ringe: 'Ring', købe: 'Køb', kobe: 'Køb', skrive: 'Skriv', sende: 'Send', betale: 'Betal',
  booke: 'Book', bestille: 'Bestil', vaske: 'Vask', rydde: 'Ryd', ordne: 'Ordn', finde: 'Find',
  lave: 'Lav', tage: 'Tag', hente: 'Hent', aflevere: 'Aflever', poste: 'Post', optage: 'Optag',
  redigere: 'Rediger', planlægge: 'Planlæg', svare: 'Svar', spørge: 'Spørg', huske: 'Husk',
  tømme: 'Tøm', fylde: 'Fyld', træne: 'Træn', læse: 'Læs', melde: 'Meld', opsige: 'Opsig',
  skifte: 'Skift', printe: 'Print', scanne: 'Scan', aftale: 'Aftal', kontakte: 'Kontakt',
  undersøge: 'Undersøg', gøre: 'Gør', starte: 'Start', afslutte: 'Afslut', rette: 'Ret',
  søge: 'Søg', flytte: 'Flyt', samle: 'Saml', pakke: 'Pak', rengøre: 'Rengør',
  støvsuge: 'Støvsug', arrangere: 'Arranger', male: 'Mal', kigge: 'Kig', tjekke: 'Tjek',
  snakke: 'Snak', tale: 'Tal', hjælpe: 'Hjælp',
}

/** Filler that carries no task information. */
const LEAD_FILLER =
  /^(?:og\s+|s[åa]\s+|men\s+|ogs[åa]\s+|jeg\s+|man\s+|der\s+|vi\s+|det\s+|lige\s+|desuden\s+|derudover\s+|plus\s+at\s+|dertil\s+)/i

const MODALS =
  /^(?:skal(?:\s+lige)?(?:\s+ogs[åa])?|mangler(?:\s+ogs[åa])?|b[øo]r|vil\s+gerne|vil|har\s+brug\s+for|er\s+n[øo]dt\s+til|n[øo]dt\s+til|trænger\s+til|skulle|kunne|burde|husk(?:e)?\s+p[åa]?|husk(?:e)?)\s*(?:at\s+)?/i

const URGENT_WORDS = /\b(haster|akut|i dag|idag|senest|deadline|inden|nu|hurtigst muligt|asap)\b/i

/** "kl. 14", "klokken 9.30", "kl 14:15" */
const CLOCK = /\bkl(?:\.|okken)?\s*(\d{1,2})(?:[.:](\d{2}))?\b/i

/**
 * Things that happen at a time whether or not you did anything: you show up.
 * These become appointments rather than deadlines, and the what-now engine
 * leaves them alone.
 */
const APPOINTMENT_WORDS =
  /\b(tid hos|l[æa]getid|tandl[æa]getid|aftale|m[øo]de|eksamen|pr[øo]ve|samtale|konsultation|fris[øo]rtid|termin|vaccination|scanning|unders[øo]gelse|forældrem[øo]de|koncert|fly|tog|afgang)\b/i

/** Wording that means "be finished before", not "be there at". */
const DEADLINE_WORDS = /\b(senest|inden|deadline|frist|afleveres|skal v[æa]re klar|forfalder)\b/i
const SOON_WORDS = /\b(i morgen|imorgen|denne uge|i n[æa]ste uge|snart|p[åa] fredag|i weekenden)\b/i

const WEEKDAYS: Record<string, number> = {
  søndag: 0, mandag: 1, tirsdag: 2, onsdag: 3, torsdag: 4, fredag: 5, lørdag: 6,
}

const PART_WORDS: Array<[RegExp, TimePart]> = [
  [/\bmorgen(?:en)?\b(?!\s*dag)/i, 'morning'],
  [/\bformiddag\w*/i, 'midday'],
  [/\beftermiddag\w*/i, 'afternoon'],
  [/\baften\w*/i, 'evening'],
]

/**
 * Danish abbreviations whose full stop is not a sentence ending. Without this,
 * "Lægetid på fredag kl. 9" splits into "…kl" and "9", and the time — the one
 * piece of information that actually mattered — is thrown away.
 */
function normaliseAbbreviations(text: string): string {
  return text
    .replace(/\bkl\.\s*/gi, 'kl ')
    .replace(/\bca\.\s*/gi, 'ca ')
    .replace(/\bfx\.\s*/gi, 'fx ')
    .replace(/\bevt\.\s*/gi, 'evt ')
    .replace(/\bdvs\.\s*/gi, 'dvs ')
    .replace(/\bbl\.\s*a\.\s*/gi, 'bla ')
}

/** Splits a messy paragraph into separate loops. */
export function splitSegments(raw: string): string[] {
  const lines = normaliseAbbreviations(raw)
    .split(/\r?\n|[•·]|(?:^|\s)[-–—*]\s+/g)
    .map((l) => l.trim())
    .filter(Boolean)

  const out: string[] = []
  for (const line of lines) {
    // Hard separators first — these are unambiguous.
    // A full stop followed by a digit is a date or a time, not a sentence end.
    const hard = line
      .split(/[.;!?]+\s+(?![0-9])|,\s+|\s+samt\s+|\s+og\s+ogs[åa]\s+|\s+og\s+s[åa]\s+|\s+ogs[åa]\s+at\s+/i)
      .map((s) => s.trim())
      .filter(Boolean)

    for (const chunk of hard) {
      // " og " is only a separator when what follows can stand alone.
      const parts = chunk.split(/\s+og\s+/i)
      if (parts.length === 1) {
        out.push(chunk)
        continue
      }
      let buffer = parts[0]
      for (let i = 1; i < parts.length; i++) {
        const next = parts[i]
        if (standsAlone(next)) {
          out.push(buffer.trim())
          buffer = next
        } else {
          buffer = `${buffer} og ${next}`
        }
      }
      out.push(buffer.trim())
    }
  }

  return out
    .map((s) => s.replace(/[.,;!?\s]+$/g, '').trim())
    .filter((s) => s.length > 1)
}

function standsAlone(fragment: string): boolean {
  const f = fragment.trim()
  if (!f) return false
  const stripped = f.replace(LEAD_FILLER, '').replace(MODALS, '')
  if (ACTION_VERBS.test(stripped.split(/\s+/).slice(0, 3).join(' '))) return true
  if (/^(?:jeg|man|vi|der)\b/i.test(f)) return true
  return false
}

/** Removes "jeg skal huske at ..." style scaffolding. */
export function cleanFragment(fragment: string): string {
  let s = fragment.trim()
  for (let i = 0; i < 4; i++) {
    const before = s
    s = s.replace(LEAD_FILLER, '').replace(MODALS, '').trim()
    if (s === before) break
  }
  return s
}

/** "ringe til tandlægen" -> "Ring til tandlægen". */
export function toImperative(text: string): string {
  const s = text.trim()
  if (!s) return s
  const [first, ...rest] = s.split(/\s+/)
  const key = first.toLowerCase().replace(/[^a-zæøå]/gi, '')
  const imperative = INFINITIVE_TO_IMPERATIVE[key]
  const head = imperative ?? first.charAt(0).toUpperCase() + first.slice(1)
  return [head, ...rest].join(' ')
}

function matchRule(text: string): Rule | null {
  for (const rule of RULES) if (rule.match.test(text)) return rule
  return null
}

function detectUrgency(text: string): Urgency {
  if (URGENT_WORDS.test(text)) return 'today'
  if (SOON_WORDS.test(text)) return 'soon'
  return 'none'
}

/**
 * A real time, only when the text actually names one.
 *
 * Guessing deadlines is how a calm system turns back into the stressful
 * calendar she already refuses to use, so this stays deliberately literal: a
 * clock time, or wording that plainly means a deadline. Everything else just
 * becomes a loose day.
 */
function detectDue(text: string, date: string | undefined, now: Date): ParsedTime | undefined {
  const clock = CLOCK.exec(text)
  const isAppointment = APPOINTMENT_WORDS.test(text)
  const isDeadline = DEADLINE_WORDS.test(text)
  if (!clock && !isDeadline && !isAppointment) return undefined
  // Without a day we have nothing to hang the time on.
  if (!date) return undefined

  const [y, m, d] = date.split('-').map(Number)
  const hours = clock ? Math.min(23, Number(clock[1])) : 23
  const minutes = clock?.[2] ? Math.min(59, Number(clock[2])) : clock ? 0 : 59
  const at = new Date(y, m - 1, d, hours, minutes, 0, 0)
  if (at.getTime() < now.getTime() - 3_600_000) return undefined

  return {
    at: at.getTime(),
    hasTime: !!clock,
    // A named clock time on an appointment-ish thing is an appointment;
    // deadline wording wins when it is explicitly present.
    kind: isDeadline && !isAppointment ? 'deadline' : clock || isAppointment ? 'appointment' : 'deadline',
  }
}

function detectSchedule(text: string, now = new Date()): { date?: string; part?: TimePart } {
  let date: string | undefined
  const lower = text.toLowerCase()

  if (/\b(i dag|idag)\b/.test(lower)) date = isoDate(now)
  else if (/\b(i morgen|imorgen)\b/.test(lower)) date = isoDate(addDays(now, 1))
  else if (/\b(i overmorgen)\b/.test(lower)) date = isoDate(addDays(now, 2))
  else {
    for (const [name, dow] of Object.entries(WEEKDAYS)) {
      if (new RegExp(`\\b(?:p[åa]\\s+)?${name}\\b`, 'i').test(lower)) {
        date = isoDate(nextWeekday(now, dow))
        break
      }
    }
  }

  let part: TimePart | undefined
  for (const [re, p] of PART_WORDS) {
    if (re.test(lower)) {
      part = p
      break
    }
  }
  return { date, part }
}

/**
 * Removes the time expression from a title once we have captured it as a
 * schedule. "Betal elregningen på fredag" becomes "Betal elregningen" — the
 * Friday is already stored in scheduledDate, and repeating it in the title
 * makes the card noisy.
 */
const TIME_PHRASES =
  /\s*\b(?:p[åa]\s+)?(?:i\s*dag|i\s*morgen|i\s*overmorgen|i\s*aften|i\s*weekenden|denne\s+uge|n[æa]ste\s+uge|s[øo]ndag|mandag|tirsdag|onsdag|torsdag|fredag|l[øo]rdag|om\s+morgenen|om\s+eftermiddagen|om\s+aftenen|senest|hurtigst\s+muligt|kl(?:\.|okken)?\s*\d{1,2}(?:[.:]\d{2})?)\b\s*/gi

export function stripTimePhrases(title: string): string {
  const stripped = title.replace(TIME_PHRASES, ' ').replace(/\s{2,}/g, ' ').trim()
  // Never strip a title down to nothing (e.g. a task literally called "I dag"),
  // but one solid word is a fine title: "Lægetid" beats "Lægetid på fredag kl 9".
  return stripped.length >= 3 ? stripped : title
}

export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

function nextWeekday(from: Date, dow: number): Date {
  const copy = new Date(from)
  const diff = (dow - copy.getDay() + 7) % 7 || 7
  copy.setDate(copy.getDate() + diff)
  return copy
}

function estimateWeight(minutes: number, stepCount: number, vague: boolean): MentalWeight {
  let w = 1
  if (minutes > 10) w = 2
  if (minutes > 30) w = 3
  if (minutes > 60) w = 4
  if (stepCount >= 5) w = Math.min(5, w + 1) as MentalWeight
  if (vague) w = Math.min(5, w + 1) as MentalWeight
  return w as MentalWeight
}

/** Parses a whole brain dump into placed, sized, pre-broken-down loops. */
export function parseBrainDump(raw: string, now = new Date()): ParsedLoop[] {
  const segments = splitSegments(raw)
  const seen = new Set<string>()
  const result: ParsedLoop[] = []

  for (const segment of segments) {
    const cleaned = cleanFragment(segment)
    if (cleaned.length < 2) continue
    const title = toImperative(cleaned)
    const dedupeKey = title.toLowerCase()
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const rule = matchRule(segment)
    const breakdown = decompose(title)
    const minutes = breakdown?.minutes ?? rule?.minutes ?? guessMinutes(title)
    const vague = /\b(styr p[åa]|ordne|overblik|planl[æa]g|organiser)\b/i.test(title)
    const schedule = detectSchedule(segment, now)
    const due = detectDue(segment, schedule.date, now)
    const finalTitle = schedule.date || schedule.part ? stripTimePhrases(title) : title

    result.push({
      key: `${dedupeKey}-${result.length}`,
      title: finalTitle,
      raw: segment,
      path: rule?.path ?? [WORLD_LOOSE],
      area: rule?.area ?? 'other',
      estimatedMinutes: minutes,
      mentalWeight: rule?.weight ?? estimateWeight(minutes, breakdown?.steps.length ?? 0, vague),
      energyRequired: rule?.energy ?? guessEnergy(title, minutes),
      urgency: detectUrgency(segment),
      scheduledDate: schedule.date,
      scheduledPart: schedule.part,
      due,
      steps: breakdown?.steps ?? [],
      goodEnough: breakdown?.goodEnough,
      confidence: rule ? (rule.confidence ?? 0.85) : 0.35,
    })
  }

  return result
}

function guessMinutes(title: string): number {
  if (/\b(ring|send|skriv|betal|book|bestil|tjek|find)\b/i.test(title)) return 8
  const words = title.split(/\s+/).length
  if (words <= 3) return 10
  if (words <= 6) return 20
  return 30
}

function guessEnergy(title: string, minutes: number): EnergyLevel {
  // Phone calls and officialdom are short but expensive for an ADHD brain.
  if (/\b(ring|opkald|kontakt|klage|aftal|ans[øo]g|skat|borger\.dk|mitid)\b/i.test(title)) return 60
  if (minutes <= 10) return 30
  if (minutes <= 30) return 60
  return 100
}
