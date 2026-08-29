/**
 * Brain dump parsing, the heart of "the user should not have to organise".
 *
 * The user types one messy Danish paragraph. We split it into loops, guess
 * where each one belongs, rewrite it as a concrete action, estimate its size
 * and pre-break it down. Everything is local: regex, a Danish lexicon and
 * heuristics. No API, no cost, works offline.
 *
 * We are allowed to be wrong. The confirm screen ("Ser det rigtigt ud?") is
 * the safety net, but being wrong quietly is far better than asking the user
 * to fill in eight fields.
 */

import type { EnergyLevel, LifeArea, MentalWeight, TimePart, Urgency } from '@/db/types'
import { cadenceIn } from './habits'
import { decompose, DEFAULT_GRANULARITY, type Granularity } from './decompose'
import { analyse, BROKEN, hasAction, toImperativeSentence } from './language'

export interface ParsedTime {
  at: number
  hasTime: boolean
  kind: 'deadline' | 'appointment'
}

/**
 * Not everything in a brain dump is a task.
 *
 * "Ved ikke hvor det bliver af… ved heller ikke hvordan jeg skal kontakte dem"
 * is context, not an action. Turning it into a loop is actively harmful: it
 * adds to the mental load number, it shows up as something to start, and it
 * cannot be finished, you cannot "do" a worry. So the parser classifies each
 * fragment, and anything that is information gets kept as a note attached to
 * the task it belongs with.
 */
export type ParsedKind = 'task' | 'note'

export interface ParsedLoop {
  kind: ParsedKind
  /** For a note: the index of the task it belongs to, if any. */
  attachTo?: number
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
  /** A remark that came in brackets after the action; kept as the description. */
  aside?: string
  /** 0–1, how sure we are that this is a task rather than a note. */
  confidence: number
  /** Whether a category rule actually recognised it, or it fell to Løst og fast. */
  placed: boolean
  /** "Betal husleje hver måned" comes back on its own. */
  repeat?: 'day' | 'week' | 'month'
  /** Every n-th of that unit: 3 with 'day' is "hver tredje dag". */
  repeatEvery?: number
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
  // Before the shop rules: "en ansøgning til jobbet i Netto" is about work, and
  // matching the shop name would file a job application under groceries.
  { match: /\bjobans[øo]g[\wæøåÆØÅ]*|\bjobopslag[\wæøåÆØÅ]*|\bans[øo]gning[\wæøåÆØÅ]*\s+til\s+jobbet\b|\bcv\b|\bjobsamtale[\wæøåÆØÅ]*|\bs[øo]ge? job\b/i, path: ['Arbejde'], area: 'work', minutes: 60, energy: 100 },
  { match: /\bkunde[\wæøåÆØÅ]*|\btilbud\b|\bfaktura[\wæøåÆØÅ]*|\btilbudsgivning\b/i, path: ['Arbejde', 'Kunder'], area: 'work', minutes: 25, energy: 60 },
  { match: /\bm[øo]de\b|\bdeadline\b|\brapport[\wæøåÆØÅ]*|pr[æa]sentation|\bprojekt\b(?!.*hjem)/i, path: ['Arbejde'], area: 'work', minutes: 40, energy: 60 },
  { match: /\bbogf[øo]r[\wæøåÆØÅ]*|\bmoms\b|\bregnskab[\wæøåÆØÅ]*|administration/i, path: ['Arbejde', 'Administration'], area: 'admin', minutes: 40, energy: 60 },
  { match: /\barbejde\b|\bjob\b|\bchef\b|\bkollega[\wæøåÆØÅ]*/i, path: ['Arbejde'], area: 'work', minutes: 30, energy: 60 },

  { match: /\bskat\b|selvangivel|[åa]rsopg[øo]rel|forskudsopg[øo]rel/i, path: ['Økonomi', 'Skat'], area: 'money', minutes: 45, energy: 100 },
  { match: /\bregning[\wæøåÆØÅ]*|\bbetal[\wæøåÆØÅ]*|\brykker[\wæøåÆØÅ]*|\bnetbank[\wæøåÆØÅ]*|\bgiro\b/i, path: ['Økonomi', 'Regninger'], area: 'money', minutes: 10, energy: 60 },
  { match: /\bbudget[\wæøåÆØÅ]*|\bopsparing[\wæøåÆØÅ]*|\bl[åa]n\b|\bbank[\wæøåÆØÅ]*|\bpension[\wæøåÆØÅ]*|\bforsikring[\wæøåÆØÅ]*|\babonnement[\wæøåÆØÅ]*|\bops[iy]g[\wæøåÆØÅ]*/i, path: ['Økonomi'], area: 'money', minutes: 25, energy: 60 },
  // Public benefits: officialdom, forms and a portal, reliably heavy, and
  // reliably about money, whatever the form is called.
  { match: /\bboligst[øo]tte[\wæøåÆØÅ]*|\bkontanthj[æa]lp[\wæøåÆØÅ]*|\bSU\b|\bsygedagpeng[\wæøåÆØÅ]*|\bbarselsdagpeng[\wæøåÆØÅ]*|\bb[øo]rnepeng[\wæøåÆØÅ]*|\bb[øo]rne(?:check|tilskud)[\wæøåÆØÅ]*|udbetaling danmark|\bfriplads[\wæøåÆØÅ]*|\btilskud\b/i, path: ['Økonomi', 'Det offentlige'], area: 'admin', minutes: 35, energy: 100 },

  { match: /\btandl[æa]ge[\wæøåÆØÅ]*/i, path: ['Mig', 'Tandlæge'], area: 'health', minutes: 8, energy: 60 },
  { match: /\bl[æa]ge[\wæøåÆØÅ]*|\bpsykolog[\wæøåÆØÅ]*|\bfysioterap[\wæøåÆØÅ]*|\bspeciall[æa]ge[\wæøåÆØÅ]*|sundhed\.dk|\brecept[\wæøåÆØÅ]*|\bmedicin[\wæøåÆØÅ]*|\bblodpr[øo]ve[\wæøåÆØÅ]*|\bpr[øo]vesvar[\wæøåÆØÅ]*|\bhenvisning[\wæøåÆØÅ]*|\bscanning[\wæøåÆØÅ]*|\bvaccin[\wæøåÆØÅ]*/i, path: ['Mig', 'Sundhed'], area: 'health', minutes: 10, energy: 60 },
  { match: /\btr[æa]n[\wæøåÆØÅ]*|\bl[øo]betur[\wæøåÆØÅ]*|\byoga\b|\bmotion\b|\bg[åa]tur\b|\bfitness\b|\bsv[øo]mme[\wæøåÆØÅ]*/i, path: ['Mig', 'Krop'], area: 'health', minutes: 40, energy: 60 },
  { match: /\bfris[øo]r[\wæøåÆØÅ]*|\bnegle[\wæøåÆØÅ]*|\bmassage\b|\bwellness\b|\bmig selv\b|\bpause\b|\bhvile\b/i, path: ['Mig', 'Aftaler'], area: 'personal', minutes: 15, energy: 30 },
  { match: /\bferie[\wæøåÆØÅ]*|\brejse[\wæøåÆØÅ]*|\bfly\b|\bhotel\b|\bsommerhus[\wæøåÆØÅ]*/i, path: ['Mig', 'Ferie'], area: 'personal', minutes: 45, energy: 60 },

  { match: /\bposthus[\wæøåÆØÅ]*|\bpakkeshop[\wæøåÆØÅ]*|\bpakke[nr]?\b|\bafhentningssted[\wæøåÆØÅ]*|\bgenbrugsplads[\wæøåÆØÅ]*|\bbibliotek[\wæøåÆØÅ]*|\bapotek[\wæøåÆØÅ]*|\brenseri[\wæøåÆØÅ]*|\bskomager[\wæøåÆØÅ]*|\bflaskeautomat[\wæøåÆØÅ]*|\bafleveres?\s+p[åa]\b/i, path: ['Hjem', 'Ærinder'], area: 'home', minutes: 20, energy: 30 },
  { match: /\bindk[øo]b[\wæøåÆØÅ]*|\bk[øo]b[\wæøåÆØÅ]*\s+ind\b|\bhandle\s+ind\b|\bnetto\b|\bf[øo]tex\b|\bbilka\b|\brema\b|\blidl\b|\bsuper[\wæøåÆØÅ]*|vaskemid[\wæøåÆØÅ]*|\bshampoo\b|\btandpasta\b|\bm[æa]lk\b|\bbr[øo]d\b|\btoiletpapir\b/i, path: ['Hjem', 'Indkøb'], area: 'home', minutes: 25, energy: 30 },
  { match: /\bopvask[\wæøåÆØÅ]*|\bk[øo]kken[\wæøåÆØÅ]*|\btallerken[\wæøåÆØÅ]*|\bmadpakke[\wæøåÆØÅ]*|\bmadplan[\wæøåÆØÅ]*|\baftensmad\b|\bservice\b/i, path: ['Hjem', 'Køkken'], area: 'home', minutes: 15, energy: 30 },
  // Anchored deliberately: bare "vask" also lives inside "vaskemiddel" and
  // "opvask", and matching those put shopping and dishes into the laundry.
  { match: /\bvasket[øo]j\b|\bvaskemaskin[\wæøåÆØÅ]*|\bvaske?\s+t[øo]j\b|\bt[øo]rretumbler\b|\bstrygning\b|\bt[øo]rre\s+t[øo]j\b/i, path: ['Hjem', 'Vasketøj'], area: 'home', minutes: 10, energy: 30 },
  { match: /\breng[øo]r[\wæøåÆØÅ]*|\bst[øo]vsug[\wæøåÆØÅ]*|\bg[øo]re rent\b|\bryd op\b|\boprydning\b|\bgulv[\wæøåÆØÅ]*|\bbadev[æa]rels[\wæøåÆØÅ]*|\bst[øo]v\b|\bskrald\b|\baffald\b/i, path: ['Hjem', 'Rengøring'], area: 'home', minutes: 20, energy: 30 },
  { match: /\bbil(?:en|er|erne)?\b|\bv[æa]rksted[\wæøåÆØÅ]*|\bd[æa]k(?:ket|kene)?\b|\bsyn(?:et)?\b|\bbenzin\b|\bcykel[\wæøåÆØÅ]*|\bnummerplade[\wæøåÆØÅ]*|\bbilsyn[\wæøåÆØÅ]*/i, path: ['Hjem', 'Praktisk'], area: 'home', minutes: 20, energy: 60 },
  { match: /\bhaven\b|\bhavearbejde\b|\bplante[\wæøåÆØÅ]*|\bmale\b|\bmaling\b|\breparer[\wæøåÆØÅ]*|\bh[åa]ndv[æa]rker[\wæøåÆØÅ]*|\bskur\b|\bloftet\b|\bk[æa]lderen\b/i, path: ['Hjem', 'Praktisk'], area: 'home', minutes: 45, energy: 60 },
  { match: /\bhjem[\wæøåÆØÅ]*|\bboligen\b|\blejlighed[\wæøåÆØÅ]*|\bhus(?:et)?\b/i, path: ['Hjem'], area: 'home', minutes: 25, energy: 30 },

  { match: /\bmor\b|\bfar\b|\bs[øo]ster\b|\bbror\b|\bsvigermor\b|\bsvigerfar\b|\bfamilie[\wæøåÆØÅ]*|\bmormor\b|\bfarmor\b/i, path: ['Familie'], area: 'family', minutes: 15, energy: 30 },
  { match: /\bb[øo]rn[\wæøåÆØÅ]*|\bskole[\wæøåÆØÅ]*|\bb[øo]rnehave[\wæøåÆØÅ]*|\bvuggestue[\wæøåÆØÅ]*|\blektier\b|\bforældrem[øo]de\b|\bdatter[\wæøåÆØÅ]*|\bs[øo]n(?:nen)?\b/i, path: ['Familie', 'Børn'], area: 'family', minutes: 20, energy: 60 },
  { match: /\bgave[\wæøåÆØÅ]*|\bf[øo]dselsdag[\wæøåÆØÅ]*|\bjul\b|\bbryllup[\wæøåÆØÅ]*|\bkonfirmation[\wæøåÆØÅ]*|\bfest\b/i, path: ['Familie', 'Mærkedage'], area: 'family', minutes: 25, energy: 60 },

  { match: /\bmail[\wæøåÆØÅ]*|\be-?mail[\wæøåÆØÅ]*|\bindbakke[\wæøåÆØÅ]*|\bsvar p[åa](?=\s|$)/i, path: ['Løst og fast'], area: 'admin', minutes: 10, energy: 60, confidence: 0.5 },
  { match: /\bpapir[\wæøåÆØÅ]*|\bdokument[\wæøåÆØÅ]*|\bblanket[\wæøåÆØÅ]*|\bkontrakt[\wæøåÆØÅ]*|\bans[øo]g[\wæøåÆØÅ]*|\bborger\.dk\b|\bmitid\b|\be-?boks\b/i, path: ['Løst og fast'], area: 'admin', minutes: 25, energy: 60, confidence: 0.5 },
]

/** Anything that opens with a verb we recognise is an instruction. */
const STARTS_WITH_ACTION =
  /^(?:Ring|Kontakt|K[øo]b|Skriv|Send|Svar|Betal|Book|Aflever|Hent|Vask|T[øo]m|Fyld|Ryd|Reng[øo]r|St[øo]vsug|Find|Ordn|Lav|Planl[æa]g|Print|Udfyld|Ans[øo]g|Opsig|Skift|Flyt|Pak|Post|Optag|Rediger|Tr[æa]n|L[æa]s|Tjek|Beslut|Sp[øo]rg|Mal|Reparér|Sortér|H[æa]ng|F[åa]|G[åa]|Tag|[ÅA]bn|Luk|Meld)\b/

/** Feeling words. A sentence that is mostly one of these is not an errand. */
const FEELING =
  /\b(tr[æa]t af|stresset|irriteret|overv[æa]ldet|ked af|bange for|nerv[øo]s|flov|skyldig|forvirret|orker ikke|hader|elsker|savner|f[øo]ler|synes)\b/i

/**
 * Something that already happened.
 *
 * "Lægen ringede" is context, not an instruction, but it sits right next to
 * the task it explains ("…jeg skal spørge om blodprøven"), so a splitter will
 * hand it over on its own. Filed as a task it becomes an item she can never
 * close, which is exactly the kind of thing that makes her stop trusting the
 * list. The verbs here are past forms that cannot double as imperatives.
 */
const PAST_STATEMENT =
  /\b(ringede|sagde|skrev|kom|var|havde|fik|sendte|blev|har\s+ringet|har\s+sagt|har\s+skrevet|har\s+sendt|er\s+kommet|nævnte|fortalte|spurgte|mailede|afleverede|meldte)\b/i


/**
 * Past tense wrapped around a live instruction: "hun sagde at jeg skulle sende
 * papirerne". The reporting verb is history; the thing she has to do is not.
 * Without this the whole line was filed as a note and the deadline vanished.
 */
const REPORTED_TASK = /\b(?:jeg|vi|man)\s+(?:skulle|skal|m[åa]|b[øo]r|burde|er\s+n[øo]dt\s+til\s+at)\b/i

/**
 * Wording that means "here is something I know", not "here is something to do".
 * Uncertainty, feelings, states, questions and running commentary.
 */
const NOTE_OPENERS =
  /^(?:ved\s+(?:heller\s+)?ikke|jeg\s+ved\s+(?:heller\s+)?ikke|jeg\s+tror|jeg\s+f[øo]ler|jeg\s+er\s|jeg\s+har\s+det|det\s+f[øo]les|det\s+er\s|problemet\s+er|jeg\s+kan\s+ikke\s+finde\s+ud|jeg\s+orker|jeg\s+hader|jeg\s+elsker|jeg\s+savner|jeg\s+bliver|allerede|husk\s+at\s+jeg|i\s+[øo]vrigt|bare\s+s[åa]|synes)/i

/**
 * Decides whether a fragment is something to do or something to remember.
 *
 * The bias is deliberate: when in doubt it is a task, because a note that
 * should have been a task is easy to promote in the review screen, while a
 * worry that became a task quietly inflates the mental load number and can
 * never be closed.
 */
export interface Classification {
  kind: ParsedKind
  /** 0–1. Anything below CERTAIN is flagged for her to glance at. */
  confidence: number
}

/** Below this, the review screen highlights the row and invites a second look. */
export const CERTAIN = 0.75

/**
 * Things that come back.
 *
 * Read by the same function the coach uses, so "hver tredje dag" written into
 * a brain dump means the same thing as "hver tredje dag" said out loud. Two
 * readers for one phrase is two things to keep in step, and they never stay in
 * step.
 */
function detectRepeat(text: string): { repeat: 'day' | 'week' | 'month'; every: number } | undefined {
  const c = cadenceIn(text)
  return c ? { repeat: c.unit, every: c.every } : undefined
}

/**
 * A fragment carrying an actual date or clock time. Month names appear without
 * their ordinal full stop because normaliseAbbreviations has already removed it.
 */
const DATED =
  /\b(?:\d{1,2}\s+(?:januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)|\d{1,2}[./]\d{1,2}|kl\s*\d{1,2}|i\s*morgen|i\s*overmorgen|p[åa]\s+(?:mandag|tirsdag|onsdag|torsdag|fredag|l[øo]rdag|s[øo]ndag))\b/i

/**
 * Task or note.
 *
 * This has to be judged on the *action form* of the fragment, not the raw
 * words. "Skal have booket en tid til synet af bilen" contains no imperative
 * and reads like prose, so a raw check called it a note, while it is plainly
 * a task. Converting to the imperative first ("Book en tid til synet af
 * bilen") makes the verb visible.
 *
 * A local classifier cannot be perfect, and getting this wrong in either
 * direction is expensive: a worry turned into a task can never be closed, and
 * a task filed as a note silently disappears from the plan. So this returns a
 * confidence as well, every row carries a one-tap task/note switch, and
 * anything uncertain is marked for her to look at. The guarantee is not that
 * the guess is always right, it is that a wrong guess is always visible and
 * always one tap from fixed.
 */
export function classifySegment(fragment: string): Classification {
  const cleaned = cleanFragment(fragment)
  if (!cleaned) return { kind: 'note', confidence: 1 }

  const action = toImperativeSentence(cleaned)
  const analysis = analyse(action)
  const words = cleaned.split(/\s+/).length

  // --- unambiguous notes ---------------------------------------------------
  if (/\?\s*$/.test(fragment.trim())) return { kind: 'note', confidence: 0.95 }
  if (/^(?:hvordan|hvorn[åa]r|hvorfor|hvad|hvem|hvor)\b/i.test(cleaned) && !hasAction(cleaned)) {
    return { kind: 'note', confidence: 0.9 }
  }
  if (NOTE_OPENERS.test(cleaned) && !STARTS_WITH_ACTION.test(action)) {
    return { kind: 'note', confidence: 0.9 }
  }
  // "Jeg er så træt af at der er rod", a feeling, even though "rod" is a thing.
  if (FEELING.test(cleaned) && !analysis.verb) return { kind: 'note', confidence: 0.88 }
  // "Lægen ringede", "posten kom i går", "hun sagde at…", something that has
  // already happened. It may be why a task exists, but it is not the task, and
  // filing it as one puts an impossible item on her list.
  if (PAST_STATEMENT.test(cleaned) && !STARTS_WITH_ACTION.test(action) && !REPORTED_TASK.test(cleaned)) {
    return { kind: 'note', confidence: 0.85 }
  }

  // Something is wrong with a thing. It is a task, but not the task the noun
  // suggests: "vaskemaskinen larmer" is a repair, and handing back a
  // wash-the-clothes checklist is exactly the kind of not-reading-it that makes
  // the whole list untrustworthy. Marked here so decompose can route it.
  if (BROKEN.test(cleaned) && !analysis.verb) return { kind: 'task', confidence: 0.8 }

  // --- unambiguous tasks ---------------------------------------------------
  // A recognised verb in first position is as clear as it gets.
  if (analysis.verb) return { kind: 'task', confidence: 0.95 }
  // Something with a date on it is a commitment, even when it is written as a
  // flat statement: "Mors fødselsdag er 14 marts", "Tandlæge på torsdag kl 9".
  // Nobody writes a date down for the fun of it, there is something to do
  // before it, and a note cannot carry a deadline.
  if (DATED.test(cleaned)) return { kind: 'task', confidence: 0.85 }
  // "En tid skal bookes", the verb is late but the sentence is still an action.
  if (hasAction(cleaned) && words <= 12) return { kind: 'task', confidence: 0.8 }

  // --- genuinely unsure ----------------------------------------------------
  // A short noun phrase is nearly always a task written as shorthand:
  // "tandlæge", "vaskemiddel", "mors fødselsdag".
  if (words <= 4) return { kind: 'task', confidence: 0.65 }

  // Long, verbless prose is nearly always commentary.
  return { kind: 'note', confidence: 0.6 }
}

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

/** Adverbs that survive the modal strip and turn "skal snart købe ind" into nonsense. */
const LEAD_ADVERBS =
  /^(?:snart|lige|ogs[åa]|vist|nok|m[åa]ske|altid|tit|ofte|stadig|endelig|virkelig|bare|godt|vel|egentlig|faktisk|jo|da|mon|alts[åa]|vist\s*nok|helst|gerne)\s+/i

/** Filler that carries no task information. */
const LEAD_FILLER =
  /^(?:og\s+|s[åa]\s+|men\s+|ogs[åa]\s+|eller\s+|jeg\s+|man\s+|der\s+|vi\s+|det\s+|lige\s+|desuden\s+|derudover\s+|plus\s+at\s+|dertil\s+|(?:hvorn[åa]r|hvordan|hvorfor|hvad|hvem|hvor)\s+(?=skal|kan|b[øo]r|skulle|m[åa]))/i

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
  [/\bformiddag[\wæøåÆØÅ]*/i, 'midday'],
  [/\beftermiddag[\wæøåÆØÅ]*/i, 'afternoon'],
  [/\baften[\wæøåÆØÅ]*/i, 'evening'],
]

/**
 * Danish abbreviations whose full stop is not a sentence ending. Without this,
 * "Lægetid på fredag kl. 9" splits into "…kl" and "9", and the time, the one
 * piece of information that actually mattered, is thrown away.
 */
function normaliseAbbreviations(text: string): string {
  return text
    .replace(/\bkl\.\s*/gi, 'kl ')
    .replace(/\bca\.\s*/gi, 'ca ')
    .replace(/\bfx\.\s*/gi, 'fx ')
    .replace(/\bevt\.\s*/gi, 'evt ')
    .replace(/\bdvs\.\s*/gi, 'dvs ')
    .replace(/\bbl\.\s*a\.\s*/gi, 'bla ')
    // "14. marts", the full stop is an ordinal marker, not a sentence end.
    // Without this, "Mors fødselsdag er 14. marts" becomes two loops, one of
    // which is called "Marts". Written without a lookbehind on purpose: those
    // are still missing on older iOS Safari, and this has to work on her phone.
    .replace(/(\d{1,2})\.\s+(?=[a-zæøå])/g, '$1 ')
}

/**
 * A line that is one action followed by the things it applies to:
 * "køb ind: mælk, brød, kaffe", "pak - toilettaske, oplader, bog".
 * The head has to name an action, or every comma-separated thought would
 * qualify.
 */
const LIST_LINE = /^(.{2,40}?)\s*(?::|\s[-–,]\s)\s*([^,]{1,30}(?:\s*,\s*[^,]{1,30}){1,})$/

/** Splits a messy paragraph into separate loops. */
export function splitSegments(raw: string): string[] {
  const lines = normaliseAbbreviations(raw)
    .split(/\r?\n|[•·]/g)
    // A list marker only starts a line. Stripping it per line matters: a
    // regex anchored with ^ across the whole blob only ever matches the very
    // first bullet, which is how "- hold hjem rent" became a task title.
    .map((l) => l.replace(/^\s*[-–,*+]\s*/, '').trim())
    // A dash usually separates two thoughts, but not when what follows it is a
    // comma list belonging to what precedes it ("køb ind - mælk, brød, kaffe").
    .flatMap((l) => (LIST_LINE.test(l) ? [l] : l.split(/\s+[-–,]\s+/)))
    .map((l) => l.trim())
    .filter(Boolean)

  const out: string[] = []
  for (const line of lines) {
    // "købe ind - mælk, brød, kaffe" is one task with a list attached, not four
    // tasks called Køb, Mælk, Brød and Kaffe. Splitting it produced three items
    // she could never close and one that had lost its point.
    const list = line.match(LIST_LINE)
    if (list && hasAction(list[1])) {
      out.push(`${list[1].trim()} (${list[2].trim()})`)
      continue
    }

    // Hard separators first, these are unambiguous.
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
  // "Hun sagde at jeg skulle sende papirerne", who said it is context; what
  // she has to do is the task. Left in, the title read as reported speech and
  // the step generator had no verb to work with.
  //
  // The stray bracket matters too. A parenthesis whose partner was lost when
  // the line was split turned "(eller bruge håndklæde faktisk)" into a loop
  // called "Eller bruge håndklæde faktisk)".
  const trimmed = fragment.trim()
  const unbalanced = (trimmed.match(/\)/g) ?? []).length > (trimmed.match(/\(/g) ?? []).length
  let s = trimmed
    .replace(/^\s*[-–,*+]\s*/, '')
    .replace(/^\s*[)\]}]+\s*/, '')
  if (unbalanced) s = s.replace(/\s*[)\]}]+\s*$/, '')
  s = s.replace(REPORTED_PREFIX, '')
  for (let i = 0; i < 5; i++) {
    const before = s
    s = s.replace(LEAD_FILLER, '').replace(MODALS, '').replace(LEAD_ADVERBS, '').trim()
    if (s === before) break
  }
  return s
}

/** "hun sagde at ", "lægen skrev at ", "de bad mig om at ", up to the instruction. */
const REPORTED_PREFIX =
  /^.{0,40}?\b(?:sagde|skrev|n[æa]vnte|fortalte|spurgte|bad\s+mig\s+om|mindede\s+mig\s+om|har\s+sagt|har\s+skrevet)\s+(?:at\s+)?(?=(?:jeg|vi|man)\s+(?:skal|skulle|m[åa]|b[øo]r|burde))/i

/**
 * Splits off a trailing aside. "hold hjem rent (allerede ret god til det)" is
 * one action plus one remark; keeping the remark in the title makes the circle
 * unreadable, and throwing it away loses something she chose to write down.
 */
export function splitAside(text: string): { main: string; aside?: string } {
  const match = text.match(/^(.*?)\s*\(([^)]{3,})\)\s*(.*)$/)
  if (!match) return { main: text }
  const main = `${match[1]} ${match[3]}`.replace(/\s{2,}/g, ' ').trim()
  if (main.length < 3) return { main: text }
  return { main, aside: match[2].trim() }
}

/**
 * Danish perfect forms that survive the modal strip: "skal have købt ind" comes
 * out of cleanFragment as "have købt ind", which is not something you can do.
 */
const PARTICIPLE_TO_IMPERATIVE: Record<string, string> = {
  købt: 'Køb', ringet: 'Ring', skrevet: 'Skriv', sendt: 'Send', betalt: 'Betal',
  booket: 'Book', bestilt: 'Bestil', vasket: 'Vask', ryddet: 'Ryd', ordnet: 'Ordn',
  fundet: 'Find', lavet: 'Lav', taget: 'Tag', hentet: 'Hent', afleveret: 'Aflever',
  tømt: 'Tøm', fyldt: 'Fyld', støvsuget: 'Støvsug', planlagt: 'Planlæg', gjort: 'Gør',
  svaret: 'Svar', spurgt: 'Spørg', læst: 'Læs', skiftet: 'Skift', flyttet: 'Flyt',
}

/** "ringe til tandlægen" -> "Ring til tandlægen". */
export function toImperative(text: string): string {
  let s = text.trim()
  if (!s) return s

  // "have købt ind" -> "Køb ind";  "have styr på X" -> "Få styr på X"
  const perfect = s.match(/^have\s+([a-zæøå]+)\b\s*(.*)$/i)
  if (perfect) {
    const imperative = PARTICIPLE_TO_IMPERATIVE[perfect[1].toLowerCase()]
    if (imperative) return `${imperative} ${perfect[2]}`.trim()
    s = `få ${perfect[1]} ${perfect[2]}`.trim()
  }
  const [first, ...rest] = s.split(/\s+/)
  const key = first.toLowerCase().replace(/[^a-zæøå]/gi, '')
  const imperative = INFINITIVE_TO_IMPERATIVE[key]
  const head = imperative ?? first.charAt(0).toUpperCase() + first.slice(1)
  return [head, ...rest].join(' ')
}

/**
 * Category matching, on both the raw fragment and its cleaned action form.
 *
 * Rules are ordered specific-before-general and every pattern is anchored on
 * word boundaries, because the whole class of bug here is a pattern matching
 * inside another word, "vask" inside "vaskemiddel", "post" inside
 * "posthuset". A rule that fires on a fragment of a word puts the task in the
 * wrong world and gives it the wrong steps, and she has no way to tell why.
 */
function matchRule(segment: string, title: string): Rule | null {
  for (const rule of RULES) {
    if (rule.match.test(segment) || rule.match.test(title)) return rule
  }
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

const MONTHS: Record<string, number> = {
  januar: 0, februar: 1, marts: 2, april: 3, maj: 4, juni: 5,
  juli: 6, august: 7, september: 8, oktober: 9, november: 10, december: 11,
}

/** "14 marts", "den 3 juni", the ordinal full stop is already normalised away. */
function monthDate(lower: string, now: Date): string | undefined {
  const m = lower.match(
    /\b(?:den\s+)?(\d{1,2})\s+(januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)\b/,
  )
  if (!m) return undefined
  const day = Number(m[1])
  if (day < 1 || day > 31) return undefined
  const month = MONTHS[m[2]]
  let year = now.getFullYear()
  const candidate = new Date(year, month, day)
  // A date that has already passed this year means next year, nobody writes
  // down a birthday that was three months ago as something to prepare for.
  if (candidate.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
    year += 1
  }
  const final = new Date(year, month, day)
  if (final.getMonth() !== month) return undefined // 31 februar
  return isoDate(final)
}

function detectSchedule(text: string, now = new Date()): { date?: string; part?: TimePart } {
  let date: string | undefined
  const lower = text.toLowerCase()

  if (/\b(i dag|idag)\b/.test(lower)) date = isoDate(now)
  else if (/\b(i morgen|imorgen)\b/.test(lower)) date = isoDate(addDays(now, 1))
  else if (/\b(i overmorgen)\b/.test(lower)) date = isoDate(addDays(now, 2))
  else if (monthDate(lower, now)) date = monthDate(lower, now)
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
 * schedule. "Betal elregningen på fredag" becomes "Betal elregningen", the
 * Friday is already stored in scheduledDate, and repeating it in the title
 * makes the card noisy.
 */
const TIME_PHRASES =
  /\s*\b(?:p[åa]\s+)?(?:i\s*dag|i\s*morgen|i\s*overmorgen|i\s*aften|i\s*weekenden|denne\s+uge|n[æa]ste\s+uge|s[øo]ndag|mandag|tirsdag|onsdag|torsdag|fredag|l[øo]rdag|om\s+morgenen|om\s+eftermiddagen|om\s+aftenen|senest|hurtigst\s+muligt|kl(?:\.|okken)?\s*\d{1,2}(?:[.:]\d{2})?|(?:den\s+)?\d{1,2}\s+(?:januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)|(?:den\s+)?\d{1,2}\.?\s+i\s+hver\s+m[åa]ned|hver\s+(?:(?:anden|andet|tredje|fjerde|femte|sjette|syvende|ottende|tiende|fjortende|\d{1,2}\.?)\s*)?(?:dagen|dag|ugen|uge|m[åa]neden|m[åa]ned|mandag|tirsdag|onsdag|torsdag|fredag|l[øo]rdag|s[øo]ndag)|dagligt|ugentligt|m[åa]nedligt)\b\s*/gi

/**
 * Words left hanging when the time phrase they introduced is removed.
 * "Mors fødselsdag er 14 marts" must not become "Mors fødselsdag er".
 */
const DANGLING = /\s+\b(?:er|var|bliver|den|det|d|p[åa]|til|om|i|kl|fra|inden|hver)\b[\s.,]*$/i

export function stripTimePhrases(title: string): string {
  let stripped = title.replace(TIME_PHRASES, ' ').replace(/\s{2,}/g, ' ').trim()
  let guard = 0
  while (DANGLING.test(stripped) && guard++ < 3) stripped = stripped.replace(DANGLING, '').trim()
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
export interface ParseOptions {
  now?: Date
  granularity?: Granularity
}

export function parseBrainDump(raw: string, options: Date | ParseOptions = {}): ParsedLoop[] {
  const opts: ParseOptions = options instanceof Date ? { now: options } : options
  const now = opts.now ?? new Date()
  const granularity = opts.granularity ?? DEFAULT_GRANULARITY
  const segments = splitSegments(raw)
  const seen = new Set<string>()
  const result: ParsedLoop[] = []

  for (const segment of segments) {
    const classification = classifySegment(segment)

    if (classification.kind === 'note') {
      // Attach to the task just above it, that is nearly always what the note
      // is about, or keep it standalone for the "Hovedet" list.
      const lastTask = belongsWithPreviousTask(segment, result)
      result.push({
        kind: 'note',
        attachTo: lastTask >= 0 ? lastTask : undefined,
        key: `note-${result.length}`,
        title: sentenceCase(segment.trim()),
        raw: segment,
        path: lastTask >= 0 ? result[lastTask].path : [WORLD_LOOSE],
        area: lastTask >= 0 ? result[lastTask].area : 'other',
        estimatedMinutes: 0,
        mentalWeight: 1,
        energyRequired: 30,
        urgency: 'none',
        steps: [],
        confidence: classification.confidence,
        placed: lastTask >= 0,
      })
      continue
    }

    const cleaned = cleanFragment(segment)
    if (cleaned.length < 2) continue
    const { main, aside } = splitAside(cleaned)
    const title = toImperativeSentence(main)
    const dedupeKey = title.toLowerCase()
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const rule = matchRule(segment, title)
    const schedule = detectSchedule(segment, now)
    const due = detectDue(segment, schedule.date, now)
    const recurrence = detectRepeat(segment)
    const finalTitle = schedule.date || schedule.part || recurrence ? stripTimePhrases(title) : title

    // Break down the *cleaned* title. Running it on the raw one produced steps
    // like "Find elregningen senest frem" and "Find Tandlæge torsdag kl 14s
    // nummer", the time words were still sitting inside the object.
    //
    // And an appointment gets no steps at all: "Tandlæge torsdag kl 14" is
    // already booked. Handing her a checklist for booking it is the app not
    // reading what she wrote.
    const breakdown = due?.kind === 'appointment' ? null : decompose(finalTitle, { granularity })
    const minutes = breakdown?.minutes ?? rule?.minutes ?? guessMinutes(finalTitle)
    const vague = /\b(styr p[åa]|ordne|overblik|planl[æa]g|organiser)\b/i.test(finalTitle)

    result.push({
      kind: 'task',
      key: `${dedupeKey}-${result.length}`,
      title: finalTitle,
      aside,
      raw: segment,
      path: rule?.path ?? [WORLD_LOOSE],
      area: rule?.area ?? 'other',
      estimatedMinutes: minutes,
      mentalWeight: rule?.weight ?? estimateWeight(minutes, breakdown?.steps.length ?? 0, vague),
      energyRequired: rule?.energy ?? guessEnergy(finalTitle, minutes),
      urgency: detectUrgency(segment),
      scheduledDate: schedule.date,
      scheduledPart: schedule.part,
      due,
      steps: breakdown?.steps ?? [],
      goodEnough: breakdown?.goodEnough,
      // Only how sure we are that this is a task rather than a note. Whether we
      // also worked out *where* it belongs is a separate question, a task with
      // no matching category is still unmistakably a task, and flagging it as
      // doubtful would teach her to ignore the flag that actually matters.
      confidence: classification.confidence,
      placed: rule ? (rule.confidence ?? 0.85) >= 0.75 : false,
      repeat: recurrence?.repeat,
      repeatEvery: recurrence?.every,
    })
  }

  return result
}

function lastTaskIndex(items: ParsedLoop[]): number {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === 'task') return i
  return -1
}

/** Words that carry no topic, so they say nothing about what a note is about. */
const STOPWORDS = new Set([
  'jeg', 'du', 'han', 'hun', 'vi', 'de', 'den', 'det', 'der', 'som', 'og', 'at', 'er', 'var',
  'har', 'havde', 'skal', 'kan', 'vil', 'en', 'et', 'til', 'for', 'med', 'om', 'på', 'af', 'i',
  'så', 'men', 'ikke', 'min', 'mit', 'mine', 'lige', 'bare', 'meget', 'helt', 'også', 'nu',
  'hele', 'alt', 'noget', 'nogle', 'man', 'være', 'blive', 'fra', 'ved', 'over', 'efter',
])

function topicWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-zæøå0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w))
      .map((w) => w.replace(/(?:erne|ene|ens|ers|en|et|er|s)$/, '')),
  )
}

/**
 * Should this note hang under the task written just before it?
 *
 * Usually yes, "Ring til værkstedet. De har lukket mandag" is one thought.
 * But not always: "Aflever pakken. Jeg er så træt af at der er rod overalt" is
 * two, and filing the second under the first buries a real feeling inside an
 * errand where she will never see it again.
 *
 * So it only attaches when the note actually points back: either it opens with
 * a word that refers to something ("de", "den", "hun"), or it shares a topic
 * word with the task. Everything else stands on its own in Hovedet.
 */
const REFERS_BACK = /^(?:de[nt]?|dem|deres|han|hun|hans|hendes|det er|den er|de har|han har|hun har)\b/i

function belongsWithPreviousTask(segment: string, items: ParsedLoop[]): number {
  const i = lastTaskIndex(items)
  if (i < 0) return -1
  const note = segment.trim()
  if (REFERS_BACK.test(note)) return i

  const noteWords = topicWords(note)
  const taskWords = topicWords(items[i].title)
  for (const w of noteWords) if (taskWords.has(w)) return i
  return -1
}

function sentenceCase(text: string): string {
  const t = text.replace(/^\s*[-–,*+]\s*/, '').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
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
