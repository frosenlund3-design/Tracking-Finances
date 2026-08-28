/**
 * Auto-decomposition.
 *
 * A vague task is where ADHD paralysis lives. "Ordne skat" is not one action,
 * it is a fog. This module turns fog into a first physical move.
 *
 * All of it runs locally — pattern matching over a Danish lexicon, no API.
 * The first step in every template is deliberately almost insultingly small,
 * because Start Mode shows only that one.
 */

export interface Template {
  id: string
  /** Words that must appear (any of them) for this template to fire. */
  match: RegExp
  steps: string[]
  minutes?: number
  /** Suggested wording for "good enough". */
  goodEnough?: string
}

export const TEMPLATES: Template[] = [
  {
    id: 'tax',
    match: /\b(skat|selvangivel|årsopgørel|forskudsopgørel|skat\.dk)\w*/i,
    steps: [
      'Find de papirer du skal bruge',
      'Log ind på skat.dk',
      'Find tallene',
      'Udfyld felterne',
      'Tryk send',
    ],
    minutes: 40,
    goodEnough: 'Bare log ind og kig. Det tæller.',
  },
  {
    id: 'dishes',
    match: /\b(opvask|opvaskemaskin|tallerken|service)\w*/i,
    steps: [
      'Gå ud i køkkenet',
      'Tag én tallerken',
      'Fyld maskinen',
      'Tænd den',
      'Tør bordet af',
    ],
    minutes: 12,
    goodEnough: 'Halvt fyldt maskine er også en sejr.',
  },
  {
    id: 'kitchen',
    match: /\b(køkken|ryd op i køkken)\w*/i,
    steps: [
      'Gå ud i køkkenet',
      'Tag glas og tallerkener fra bordet',
      'Fyld opvaskemaskinen',
      'Smid affaldet ud',
      'Tør bordet af',
    ],
    minutes: 20,
    goodEnough: 'Gør køkkenet 20% bedre. Ikke perfekt.',
  },
  {
    id: 'laundry',
    match: /\b(vask|vasketøj|tørretumbler|vaskemaskin)\w*/i,
    steps: ['Gå hen til kurven', 'Fyld maskinen', 'Kom sæbe i', 'Tryk start'],
    minutes: 8,
  },
  {
    id: 'clean',
    match: /\b(reng[øo]r|st[øo]vsug|g[øo]re rent|ryd op|oprydning|st[øo]v)\w*/i,
    steps: [
      'Rejs dig op',
      'Sæt en timer på 10 minutter',
      'Ryd ét bord',
      'Smid det åbenlyse skrald ud',
      'Stop når timeren ringer',
    ],
    minutes: 15,
    goodEnough: 'Ti minutter. Så er du færdig, uanset hvordan der ser ud.',
  },
  {
    id: 'call',
    match: /\b(ring|opkald|telefon|kontakt)\w*/i,
    steps: [
      'Find nummeret',
      'Skriv de 2 ting du vil sige',
      'Tryk ring',
      'Notér hvad I aftalte',
    ],
    minutes: 6,
    goodEnough: 'Bare find nummeret. Resten kan vente.',
  },
  {
    id: 'dentist',
    match: /\b(tandl[æa]ge|l[æa]ge|fysioterap|psykolog|speciall[æa]ge|sundhed\.dk)\w*/i,
    steps: ['Find nummeret eller booking-linket', 'Vælg en dato du kan overskue', 'Book tiden', 'Sæt den i telefonen'],
    minutes: 8,
  },
  {
    id: 'bills',
    match: /\b(regning|betal|faktura|rykker|netbank|budget|[øo]konomi)\w*/i,
    steps: ['Åbn netbanken', 'Find regningen', 'Godkend betalingen', 'Luk computeren'],
    minutes: 10,
    goodEnough: 'Åbn netbanken. Bare det.',
  },
  {
    id: 'email',
    match: /\b(mail|e-?mail|skriv til|besvar|svar p[åa]|indbakke)\w*/i,
    steps: ['Åbn mailen', 'Skriv 3 linjer — ikke mere', 'Læs den én gang', 'Send'],
    minutes: 10,
    goodEnough: 'Tre linjer er et fint svar.',
  },
  {
    id: 'shopping',
    match: /\b(k[øo]b|indk[øo]b|handle|super|netto|f[øo]tex|bilka|rema)\w*/i,
    steps: ['Skriv de 3 vigtigste ting på listen', 'Tag taske og nøgler', 'Gå ud af døren'],
    minutes: 25,
  },
  {
    id: 'content',
    match: /\b(reel|video|opslag|content|post|tiktok|instagram|some|story|stories)\w*/i,
    steps: ['Find én idé', 'Skriv en hook', 'Optag', 'Rediger', 'Post'],
    minutes: 45,
    goodEnough: 'Postet slår perfekt. Hver gang.',
  },
  {
    id: 'gift',
    match: /\b(gave|f[øo]dselsdag|jul|bryllup|konfirmation)\w*/i,
    steps: ['Beslut et beløb', 'Vælg én idé', 'Bestil den', 'Sæt datoen i kalenderen'],
    minutes: 20,
  },
  {
    id: 'car',
    match: /\b(bil|v[æa]rksted|d[æa]k|syn|service p[åa] bilen)\w*/i,
    steps: ['Beskriv problemet i én sætning', 'Find værkstedets nummer', 'Ring og book', 'Sæt datoen ind'],
    minutes: 15,
  },
  {
    id: 'travel',
    match: /\b(ferie|rejse|fly|hotel|booking|sommerhus)\w*/i,
    steps: ['Beslut hvilke datoer', 'Find 2 muligheder', 'Vis dem til nogen', 'Book den ene'],
    minutes: 60,
  },
  {
    id: 'application',
    match: /\b(ans[øo]g|ans[øo]gning|cv|jobs[øo]g|blanket|formular)\w*/i,
    steps: ['Åbn dokumentet', 'Udfyld kun det første felt', 'Skriv resten groft', 'Læs igennem én gang', 'Send'],
    minutes: 45,
    goodEnough: 'Et groft udkast er nok i dag.',
  },
  {
    id: 'paperwork',
    match: /\b(papir|post|dokument|kontrakt|forsikring|opsig|abonnement)\w*/i,
    steps: ['Saml bunken ét sted', 'Åbn kun det øverste', 'Beslut: handling eller væk', 'Tag næste'],
    minutes: 20,
  },
  {
    id: 'plan',
    match: /\b(planl[æa]g|struktur|styr p[åa]|overblik|organiser|f[åa] styr)\w*/i,
    steps: [
      'Skriv ned hvad det egentlig handler om',
      'Vælg de 3 vigtigste ting',
      'Lav den første af dem lille',
      'Læg resten væk',
    ],
    minutes: 20,
  },
  {
    id: 'move',
    match: /\b(flyt|flytning|kasser|pakke ned)\w*/i,
    steps: ['Tag én kasse', 'Fyld den', 'Skriv på den hvad der er i', 'Stil den ved døren'],
    minutes: 30,
  },
  {
    id: 'exercise',
    match: /\b(tr[æa]n|l[øo]betur|motion|yoga|g[åa]tur|fitness)\w*/i,
    steps: ['Tag tøjet på', 'Gå ud af døren', 'Gå/løb i 10 minutter'],
    minutes: 30,
    goodEnough: 'Ti minutter tæller fuldt ud.',
  },
]

/** Words that signal a task is a fog rather than an action. */
const VAGUE = /\b(styr p[åa]|ordne|f[åa] lavet|f[åa] gjort|planl[æa]g|hele|alt det|overblik|organiser|s[øo]rge for|tage mig af|fikse)\b/i

const GENERIC_STEPS = (title: string): string[] => [
  `Skriv i én sætning hvad "${shorten(title)}" egentlig kræver`,
  'Find eller åbn det du skal bruge',
  'Lav de første 5 minutter',
  'Beslut om resten skal parkeres',
]

function shorten(s: string, max = 28): string {
  return s.length > max ? `${s.slice(0, max - 1).trim()}…` : s
}

export interface Decomposition {
  steps: string[]
  minutes?: number
  goodEnough?: string
  templateId?: string
}

/**
 * Returns micro-steps for a title, or null when the task is already small
 * and concrete enough that breaking it down would be condescending.
 */
export function decompose(title: string): Decomposition | null {
  const t = title.trim()
  if (!t) return null

  for (const tpl of TEMPLATES) {
    if (tpl.match.test(t)) {
      return { steps: tpl.steps, minutes: tpl.minutes, goodEnough: tpl.goodEnough, templateId: tpl.id }
    }
  }

  const words = t.split(/\s+/).length
  if (VAGUE.test(t) || words >= 5) {
    return { steps: GENERIC_STEPS(t), minutes: 25, templateId: 'generic' }
  }
  return null
}

/** True when the task looks big/vague enough that we should offer a breakdown. */
export function looksOverwhelming(title: string): boolean {
  return VAGUE.test(title) || title.trim().split(/\s+/).length >= 5
}
