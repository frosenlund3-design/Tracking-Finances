import { analyse, BROKEN, type Analysis } from './language'

/**
 * Turning a task into the steps you would actually take.
 *
 * The old version looked up a template by keyword, which produced answers that
 * were not merely unhelpful but wrong: "Køb vaskemiddel" was told to fill the
 * washing machine, because "vask" sits inside "vaskemiddel". Being confidently
 * wrong is much worse than being generic, she stops trusting the steps, and
 * the steps are the whole product.
 *
 * So steps are generated from what the sentence actually says. The verb decides
 * the shape of the work ("ring" always means: get the number, know what to say,
 * dial, write down what was agreed) and the object is substituted in, so the
 * result is about her thing rather than about a category. Domain knowledge sits
 * on top for the handful of jobs where the real world has specific steps worth
 * knowing, the tax site, the MOT, a package at the post office.
 *
 * Every generator returns a full, fine-grained chain. `granularity` then picks
 * how much of it she wants to see.
 */

/** How finely to break a task down. Six choices, roughly 1 to 20 steps. */
export const GRANULARITIES = [1, 3, 5, 8, 12, 20] as const
export type Granularity = (typeof GRANULARITIES)[number]

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  1: 'Bare én ting',
  3: 'Groft',
  5: 'Normalt',
  8: 'Detaljeret',
  12: 'Meget småt',
  20: 'Så småt som muligt',
}

export const DEFAULT_GRANULARITY: Granularity = 5

export interface Decomposition {
  steps: string[]
  minutes?: number
  goodEnough?: string
  /** What the generator recognised, for debugging and for the review screen. */
  recognised: string
}

interface Step {
  text: string
  /** Lower rank survives coarser granularity. 0 is always kept. */
  rank: number
}

const s = (text: string, rank = 1): Step => ({ text, rank })

/**
 * Domain knowledge: the handful of jobs where the real world has specific
 * steps, and knowing them is the difference between help and filler.
 * Matched on the analysed object, never on a loose substring.
 */
interface Domain {
  id: string
  /** Tested against the object stem and the target, not the whole sentence. */
  test: (a: Analysis, full: string) => boolean
  steps: (a: Analysis) => Step[]
  minutes: number
  goodEnough?: string
  /**
   * The verbs this domain is allowed to override.
   *
   * Domain knowledge beats the generic verb shape, except when the verb is
   * the whole point. "Betal regningen fra tandlægen" mentions a dentist, but
   * she is not booking anything; giving her the dentist's booking steps is
   * exactly the kind of not-reading-the-task that makes the app useless. When
   * this list is set, the domain only applies if the sentence has no verb or
   * its verb is on the list.
   */
  verbs?: string[]
}

const DOMAINS: Domain[] = [
  {
    id: 'skat',
    test: (a, full) => /\b(skat|skat\.dk|[åa]rsopg[øo]relse|forskudsopg[øo]relse|selvangivelse)\b/i.test(full) && !/\bskatte?kort\b/i.test(a.object),
    verbs: ['ordn', 'tjek', 'lav', 'kig', 'se', 'find-ud-af', 'få-styr-på', 'udfyld', 'ret'],
    minutes: 45,
    goodEnough: 'Bare log ind og kig på tallene. Det tæller.',
    steps: () => [
      s('Find MitID frem', 0),
      s('Åbn skat.dk i browseren', 0),
      s('Log ind med MitID', 1),
      s('Klik ind på årsopgørelsen', 1),
      s('Kig listen igennem for noget der ser forkert ud', 2),
      s('Find de papirer du mangler tal fra', 2),
      s('Ret de felter der skal rettes', 1),
      s('Læs det igennem én gang', 3),
      s('Tryk godkend', 0),
      s('Luk computeren og lav noget andet', 3),
    ],
  },
  {
    id: 'syn',
    test: (_a, full) => /\b(syn|synshal|bilsyn)\w*\b/i.test(full) && /\bbil\w*|\bsyn\w*/i.test(full),
    verbs: ['book', 'bestil', 'ring', 'aftal', 'kontakt', 'find-ud-af', 'få-styr-på', 'tjek'],
    minutes: 15,
    steps: () => [
      s('Find bilens nummerplade frem', 0),
      s('Søg efter en synshal i nærheden', 1),
      s('Vælg en dag hvor du har tid til at køre derhen', 1),
      s('Book tiden online eller ring', 0),
      s('Sæt tiden i kalenderen', 2),
      s('Læg registreringsattesten i bilen med det samme', 2),
    ],
  },
  {
    id: 'dæk',
    test: (a, full) => /\bd[æa]k(?:ket|kene|skifte?)?\b|\bvinterd[æa]k\w*|\bsommerd[æa]k\w*/i.test(full) && !/\bd[æa]kke\b/i.test(a.object),
    minutes: 30,
    goodEnough: 'At have booket tiden er hele opgaven. Selve skiftet er ikke dit arbejde.',
    steps: () => [
      s('Find ud af om du har dækkene selv, eller de står på hotel', 0),
      s('Find bilens nummerplade frem', 1),
      s('Ring til værkstedet, eller book online', 0),
      s('Book en tid. Gør det tidligt, de fyldes op i sæsonen', 0),
      s('Sæt tiden i kalenderen', 1),
      s('Læg dækkene i bilen aftenen før, hvis du selv har dem', 2),
      s('Sæt en påmindelse dagen før', 3),
    ],
  },
  {
    id: 'flytning',
    test: (_a, full) => /\bflytning\b|\badresse[æa]ndring[\wæøåÆØÅ]*|\bmeld[e]? flytning\b|\bny adresse\b/i.test(full),
    minutes: 20,
    goodEnough: 'Selve flytteanmeldelsen er hele opgaven. Resten kan tages en anden dag.',
    steps: () => [
      s('Find MitID frem', 0),
      s('Åbn borger.dk og søg på flytning', 0),
      s('Skriv den nye adresse og datoen ind', 0),
      s('Send den', 0),
      s('Bestil eftersendelse af post, den flytter ikke af sig selv', 2),
      s('Skriv ned hvem der ellers skal vide det: bank, forsikring, abonnementer', 3),
    ],
  },
  {
    id: 'pakke',
    test: (a, full) => /\b(pakke|pakken|posthus|pakkeshop|returner|retur)\w*\b/i.test(full) && (a.verb === 'aflever' || a.verb === 'send' || a.verb === 'hent' || /retur/i.test(full)),
    minutes: 20,
    steps: (a) => [
      s('Find pakken frem', 0),
      s('Tjek at label eller stregkode sidder på', 1),
      s(`Slå op hvor nærmeste ${/posthus/i.test(a.target ?? '') ? 'posthus' : 'pakkeshop'} er`, 1),
      s('Læg pakken ved døren, så du ikke glemmer den', 2),
      s('Tag den med næste gang du alligevel skal ud', 0),
      s('Gem kvitteringen', 3),
    ],
  },
  {
    id: 'lån',
    test: (_a, full) => /\b(l[åa]n|rente|afdrag|realkredit|bank)\w*\b/i.test(full),
    verbs: ['ring', 'kontakt', 'skriv', 'spørg', 'book', 'aftal', 'tjek', 'find-ud-af', 'få-styr-på'],
    minutes: 20,
    steps: (a) => [
      s(`Find det du vil spørge ${a.target ?? 'banken'} om, skriv det i én sætning`, 0),
      s('Find dit kontonummer eller lånenummer frem', 1),
      s('Find åbningstiden og nummeret', 1),
      s('Ring, eller skriv i netbankens beskedfunktion hvis det er nemmere', 0),
      s('Skriv ned hvad I aftalte, mens du husker det', 2),
    ],
    goodEnough: 'At skrive spørgsmålet ned tæller. Opkaldet kan komme bagefter.',
  },
  {
    id: 'forsikring',
    test: (_a, full) => /\bforsikring\w*|\bskadesanmeldelse\b/i.test(full),
    verbs: ['ring', 'kontakt', 'skriv', 'send', 'spørg', 'meld', 'anmeld', 'tjek', 'find-ud-af', 'få-styr-på'],
    minutes: 25,
    steps: (a) => [
      s('Find policenummeret, det står i appen eller på en mail', 0),
      s(`Skriv i tre linjer hvad du vil have ${a.target ?? 'dem'} til`, 0),
      s('Find selskabets kontaktside', 1),
      s('Send beskeden eller ring', 0),
      s('Notér sagsnummeret du får', 2),
    ],
  },
  {
    id: 'læge',
    test: (_a, full) => /\b(l[æa]ge|tandl[æa]ge|fysioterapeut|psykolog|speciall[æa]ge)\w*\b/i.test(full),
    verbs: ['ring', 'kontakt', 'book', 'bestil', 'aftal', 'skriv', 'spørg', 'meld', 'find-ud-af', 'få-styr-på'],
    minutes: 10,
    steps: (a) => {
      const who = a.target ?? a.object ?? 'lægen'
      return [
        s(`Find ${who}s nummer eller booking-link`, 0),
        s('Skriv i én linje hvad det handler om', 1),
        s('Kig i kalenderen efter to dage der kunne passe', 1),
        s('Ring eller book online', 0),
        s('Sæt tiden i kalenderen med det samme', 2),
      ]
    },
  },
  {
    id: 'opvask',
    test: (a) => /^opvask/.test(a.objectStem) || /opvaskemaskin/.test(a.object.toLowerCase()),
    minutes: 10,
    goodEnough: 'Øverste hylde er også en sejr.',
    steps: () => [
      s('Gå ud i køkkenet', 0),
      s('Åbn maskinen', 1),
      s('Tøm den øverste hylde', 0),
      s('Tøm den nederste hylde', 1),
      s('Sæt bestikket på plads', 2),
      s('Sæt det snavsede ind med det samme', 2),
    ],
  },
  {
    id: 'vasketøj',
    test: (a, full) =>
      (a.verb === 'vask' && /\bt[øo]j\b|vasket[øo]j/i.test(full)) ||
      /^vaskemaskin/.test(a.objectStem) ||
      /^vaskt[øo]j$/.test(a.objectStem) ||
      /\bvasket[øo]j\b/i.test(a.object),
    minutes: 10,
    steps: () => [
      s('Gå hen til vasketøjskurven', 0),
      s('Tag den største bunke, sortér ikke i dag', 1),
      s('Fyld maskinen', 0),
      s('Kom sæbe i', 1),
      s('Tryk start', 0),
      s('Sæt en påmindelse om at hænge op', 2),
    ],
  },
  {
    id: 'køkken',
    test: (a) => /^k[øo]kken/.test(a.objectStem),
    minutes: 20,
    goodEnough: 'Gør køkkenet 20% bedre. Ikke perfekt.',
    steps: () => [
      s('Gå ud i køkkenet', 0),
      s('Tag alt der ikke hører til, og sæt det ét sted', 1),
      s('Fyld opvaskemaskinen', 0),
      s('Smid det åbenlyse skrald ud', 1),
      s('Tør bordet af', 1),
      s('Stop her, resten er ikke i dag', 2),
    ],
  },
]

/**
 * Verb generators: the shape the work takes, whatever it is about.
 * These are what make "Aflever pakken" produce steps about a package rather
 * than about whatever category a keyword happened to hit.
 */
const BY_VERB: Record<string, (a: Analysis) => Step[]> = {
  ring: (a) => [
    s(`Find ${a.target ?? a.object ?? 'nummeret'}s nummer`, 0),
    s('Skriv de to ting du vil sige eller spørge om', 0),
    s('Tjek at de har åbent nu', 2),
    s('Tryk ring', 0),
    s('Skriv ned hvad I aftalte', 1),
  ],
  kontakt: (a) => [
    s(`Beslut om det er nemmest at ringe eller skrive til ${a.target ?? a.object}`, 1),
    s('Skriv i tre linjer hvad du vil have', 0),
    s('Find kontaktoplysningerne', 0),
    s('Send det', 0),
    s('Notér hvornår du kan forvente svar', 2),
  ],
  køb: (a) => [
    s(`Tjek om du allerede har ${a.object || 'det'}`, 2),
    s(`Skriv ${a.object || 'det'} på indkøbssedlen`, 0),
    s('Tag taske og kort med', 1),
    s(`Køb ${a.object || 'det'}`, 0),
  ],
  aflever: (a) => [
    s(`Find ${a.object || 'det'} frem`, 0),
    s(`Læg ${a.object || 'det'} ved døren`, 0),
    s(`Slå op hvornår ${a.target ?? 'de'} har åbent`, 1),
    s('Tag det med næste gang du skal ud', 0),
  ],
  hent: (a) => [
    s(`Find ud af hvor ${a.object || 'det'} ligger`, 0),
    s('Tjek åbningstiden', 1),
    s('Find kvittering eller kode frem', 1),
    s('Hent det', 0),
  ],
  book: (a) => [
    s(`Find ud af hvor man booker ${a.object || 'det'}`, 0),
    s('Kig i kalenderen efter to dage der kunne passe', 1),
    s('Book tiden', 0),
    s('Sæt den i kalenderen med det samme', 1),
  ],
  betal: (a) => [
    s('Åbn netbanken eller MobilePay', 0),
    s(`Find ${a.object || 'regningen'} frem`, 0),
    s('Tjek beløb og konto', 1),
    s('Godkend betalingen', 0),
    s('Læg regningen væk', 2),
  ],
  skriv: (a) =>
    a.target
      ? [
          s(`Skriv i én linje hvad du vil have ${a.target} til`, 0),
          s('Skriv resten groft, det skal ikke være pænt', 0),
          s('Læs det igennem én gang', 1),
          s('Send det', 0),
        ]
      : [
          s(`Skriv i én linje hvad ${a.object || 'det'} skal handle om`, 0),
          s('Skriv en grim første udgave, den skal ikke være god', 0),
          s('Læs den igennem én gang', 1),
          s('Send eller gem den', 0),
        ],
  send: (a) => [
    s(`Find ${a.object || 'det'} frem`, 0),
    s('Tjek at det rigtige er vedhæftet', 1),
    s(`Skriv to linjer til ${a.target ?? 'modtageren'}`, 1),
    s('Tryk send', 0),
  ],
  svar: (a) => [
    s(`Åbn beskeden fra ${a.target ?? a.object ?? 'dem'}`, 0),
    s('Læs den én gang, kun én', 1),
    s('Skriv tre linjer tilbage', 0),
    s('Send', 0),
  ],
  udfyld: (a) => [
    s(`Åbn ${a.object || 'blanketten'}`, 0),
    s('Udfyld kun det første felt', 0),
    s('Find de oplysninger du mangler', 1),
    s('Udfyld resten groft', 1),
    s('Læs igennem og send', 0),
  ],
  ansøg: () => [
    s('Åbn ansøgningen', 0),
    s('Skriv de tre ting de skal vide om dig', 0),
    s('Skriv et groft udkast, grimt er fint', 1),
    s('Læs igennem én gang', 2),
    s('Send den', 0),
  ],
  opsig: (a) => [
    s(`Find hvor man opsiger ${a.object || 'det'}`, 0),
    s('Find kundenummer eller aftalenummer', 1),
    s('Send opsigelsen skriftligt', 0),
    s('Gem bekræftelsen', 2),
  ],
  tøm: (a) => [
    s(`Gå hen til ${a.object || 'den'}`, 0),
    s('Tag den første halvdel', 0),
    s('Tag resten', 1),
    s('Luk den igen', 2),
  ],
  ryd: (a) => [
    s(`Gå ind til ${a.object || 'det'}`, 0),
    s('Sæt en timer på ti minutter', 0),
    s('Tag alt der ikke hører til, og saml det ét sted', 1),
    s('Smid det åbenlyse skrald ud', 1),
    s('Stop når timeren ringer', 0),
  ],
  rengør: (a) => [
    s(`Gå ind i ${a.object || 'rummet'}`, 0),
    s('Sæt en timer på ti minutter', 0),
    s('Tør den flade overflade af', 1),
    s('Stop når timeren ringer', 0),
  ],
  støvsug: (a) => [
    s('Find støvsugeren frem', 0),
    s('Flyt de to største ting på gulvet', 1),
    s(`Støvsug ${a.object || 'midt i rummet'}, kanterne behøver du ikke`, 0),
    s('Sæt den væk igen', 2),
  ],
  skift: (a) => {
    const thing = a.object || a.target || 'den'
    return [
      s(`Find ud af hvad ${thing} skal skiftes til, og hvad du skal bruge`, 0),
      s('Tjek om du har det hjemme', 1),
      s('Køb eller bestil det du mangler', 0),
      s(`Skift ${thing}`, 0),
      s('Læg det gamle et sted, hvor det kommer ud af huset', 2),
    ]
  },
  underskriv: (a) => {
    const thing = a.object || a.target || 'papiret'
    return [
      s(`Find ${thing} frem, digitalt eller på papir`, 0),
      s('Læs kun det, du skal skrive under på. Ikke det hele', 1),
      s('Skriv under, med MitID eller med en pen', 0),
      s('Send den tilbage eller aflever den', 0),
      s('Gem en kopi et sted du kan finde den', 2),
    ]
  },
  bestil: (a) => {
    const thing = a.object || a.target || 'det'
    return [
      s(`Find ud af hvor man bestiller ${thing}`, 0),
      s('Find det frem, du skal bruge for at bestille: MitID, kortnummer eller kundenummer', 1),
      s(`Bestil ${thing}`, 0),
      s('Skriv ned hvornår den kommer', 2),
    ]
  },
  aflys: (a) => {
    // Rebuild what she wrote: "min tid hos frisøren", not the bare noun "tid".
    const thing = [a.object, a.targetPreposition, a.target].filter(Boolean).join(' ') || 'aftalen'
    return [
      s(`Find ud af hvor ${thing} er booket, mail, sms eller app`, 0),
      s('Aflys skriftligt, hvis du kan. Så slipper du for at forklare dig', 0),
      s('Skriv én linje: navn, tidspunkt, "jeg må desværre aflyse"', 1),
      s('Slet den fra kalenderen, så den ikke ligger og larmer', 2),
      s('Book en ny med det samme, hvis der skal være en', 2),
    ]
  },
  hæng: (a) => {
    const thing = a.object || 'tøjet'
    return [
      s(`Tag ${thing} ud af maskinen`, 0),
      s('Ryst det, så det ikke skal stryges bagefter', 2),
      s(`Hæng ${thing} op`, 0),
      s('Sæt en påmindelse om at tage det ned igen', 3),
    ]
  },
  rens: (a) => {
    const thing = a.object || a.target || 'det'
    return [
      s('Find kluden og det du gør rent med frem', 0),
      s('Sæt en timer på ti minutter', 0),
      s(`Tag kun én overflade i ${thing}`, 1),
      s('Stop når timeren ringer, uanset hvordan der ser ud', 0),
    ]
  },
  læs: (a) => {
    const thing = a.object || 'den'
    return [
      s(`Find ${thing} frem og læg telefonen et andet sted`, 0),
      s('Sæt en timer på ti minutter', 0),
      s('Læs. Du må stoppe når den ringer', 0),
      s('Sæt et bogmærke, så du ved hvor du kom til', 2),
    ]
  },
  'spar-op': (a) => {
    const thing = a.target || a.object || 'det'
    return [
      s(`Beslut ét beløb til ${thing}. Et lille et, du ikke mærker`, 0),
      s('Åbn netbanken', 0),
      s('Opret en konto til det, hvis du ikke har en', 1),
      s('Sæt en fast overførsel op, så du aldrig skal huske det igen', 0),
      s('Skriv beløbet ned, så du kan se det vokse', 3),
    ]
  },
  print: (a) => [
    s(`Find ${a.object || 'filen'} frem`, 0),
    s('Tjek at der er papir i printeren', 1),
    s('Print', 0),
  ],
  flyt: (a) => [s(`Find ${a.object || 'det'}`, 0), s('Beslut hvor det skal hen', 0), s('Flyt det', 0)],
  pak: (a) => [
    s('Tag én kasse', 0),
    s(`Fyld den med ${a.object || 'det der skal med'}`, 0),
    s('Skriv på kassen hvad der er i', 1),
    s('Stil den ved døren', 2),
  ],
  post: (a) => [
    s('Find én idé', 0),
    s('Skriv en hook, den første linje', 0),
    s('Lav opslaget', 0),
    s(`Post det på ${a.target ?? 'kanalen'}`, 0),
  ],
  optag: () => [
    s('Find et sted med ordentligt lys', 1),
    s('Skriv de tre ting du vil sige', 0),
    s('Optag én take, den behøver ikke være god', 0),
    s('Gem den', 1),
  ],
  træn: () => [s('Tag tøjet på', 0), s('Gå ud af døren', 0), s('Ti minutter, så må du stoppe', 0)],
  tjek: (a) => [s(`Åbn der hvor ${a.object || 'det'} står`, 0), s('Kig efter det ene tal du skal bruge', 0), s('Skriv det ned', 1)],
  beslut: (a) => [
    s(`Skriv de to muligheder for ${a.object || 'det'} ned`, 0),
    s('Skriv én ting der taler for hver', 1),
    s('Vælg den du helst vil slippe for at tænke på igen', 0),
    s('Skriv valget ned, så du ikke tager det om', 2),
  ],
  spørg: (a) => [
    s(`Skriv spørgsmålet til ${a.target ?? 'dem'} i én sætning`, 0),
    s('Send det', 0),
  ],
  meld: (a) => [s(`Find tilmeldingen til ${a.object || 'det'}`, 0), s('Udfyld den', 0), s('Sæt datoen i kalenderen', 1)],
}

/**
 * The fallback, for tasks that name no recognised verb. It is deliberately
 * about deciding what the thing even is, because a task you cannot name is
 * a task you cannot start, and that is the actual blocker.
 */
/**
 * The fallback for a task that names a wish rather than an action.
 *
 * The unhelpful move here is to hand back the same vagueness in list form.
 * What actually unblocks an unspecific task is turning it into a *specific*
 * one, so these steps do that work explicitly: define done, list what stands
 * between here and there, pick one, shrink it until it is embarrassingly
 * small, and start. The longer versions add the parts a specific task gets
 * for free, where it happens, what you need in front of you, when it stops.
 */
function vagueSteps(a: Analysis, title: string): Step[] {
  const thing = shorten(a.object || title)
  return [
    s(`Skriv i én sætning hvad "${thing}" ville betyde, når det er færdigt`, 0),
    s('Skriv de 3 ting der skal ske for at komme dertil', 0),
    s('Sæt ring om den nemmeste af dem', 1),
    s('Skriv den om, så den starter med et udsagnsord: hvad gør du helt konkret?', 2),
    s('Gør den mindre, indtil den tager under 10 minutter', 2),
    s('Find det frem, du skal bruge: papir, kode, nummer, nøgler', 3),
    s('Beslut hvor du sidder eller står, mens du gør det', 4),
    s('Sæt en timer, så der er en slutning', 3),
    s('Lav kun den ene', 0),
    s('Skriv den næste ned, så du ikke skal finde ud af det igen', 4),
    s('Beslut om resten skal parkeres', 2),
  ]
}

/**
 * "Find ud af X" is a decision, not a chore.
 *
 * The question form matters for the wording: "find ud af hvad jeg skal med
 * bilen" already contains its own question, and wrapping it in another one
 * ("hvad valget om hvad jeg skal…") reads like the app didn't parse the
 * sentence, which is exactly the impression that loses trust.
 */
const QUESTION_FORM = /^(?:hvad|hvem|hvor|hvorn[åa]r|hvorfor|hvilke[nt]?|om)\b/i

const DECIDE: (a: Analysis) => Step[] = (a) => {
  const rest = a.rest.trim()
  const opener = !rest
    ? s('Skriv ned hvad valget egentlig står imellem', 0)
    : QUESTION_FORM.test(rest)
      ? s(`Skriv "${shorten(rest, 48)}" øverst på et stykke papir`, 0)
      : s(`Skriv ned hvad valget om ${shorten(rest, 40)} egentlig står imellem`, 0)
  return [
    opener,
    s('Skriv de 2–3 muligheder ned, der faktisk findes', 0),
    s('Find den ene oplysning du mangler for at kunne vælge', 0),
    s('Sæt en grænse: hvor længe må du undersøge, før du vælger alligevel?', 3),
    s('Spørg én person, hvis det er hurtigere end at google', 2),
    s('Vælg', 0),
    s('Skriv valget ned', 1),
    s('Skriv den første ting, valget betyder du skal gøre', 2),
  ]
}

/**
 * Verbs that name an intention rather than an action. They pass every "is this
 * a task?" test and then leave you standing exactly where you started.
 */
const VAGUE_VERBS = new Set(['ordn', 'lav', 'gør', 'få', 'klar', 'tag', 'se', 'kig', 'styr', 'håndter'])

/**
 * "Få styr på pensionen" is not a decision and not a chore, it is a missing
 * overview, and the reason it never happens is that it has no end. So these
 * steps give it one: decide what you want to be able to answer, go to the one
 * place that answers it, write the answer down, and split off any action that
 * falls out as its own task. Then it is finished, and it stays finished.
 */
const OVERVIEW: (a: Analysis) => Step[] = (a) => {
  const thing = shorten(a.object || a.target || 'det', 32)
  return [
    s(`Skriv i én linje hvad du gerne vil kunne svare på om ${thing}`, 0),
    s('Find det ene sted, hvor svaret ligger: brev, app, hjemmeside eller mappe', 0),
    s('Find login eller papirer frem, før du åbner noget', 2),
    s('Åbn det, og lad være med at rette noget endnu', 1),
    s('Skriv de 2–3 tal eller datoer ned, du faktisk skal bruge', 0),
    s('Skriv ned hvad der ser forkert ud eller mangler', 1),
    s('Beslut: skal der gøres noget, eller ville du bare vide det?', 0),
    s('Skriv den ene handling ned som sin egen opgave', 2),
    s('Gem noten et sted du kan finde den igen', 3),
  ]
}

/**
 * Something is broken.
 *
 * The real reason a broken thing sits for months is not the repair, it is the
 * unanswered question of who fixes it and what it costs. So the steps settle
 * that first, and put a decision point in the middle so it cannot turn into an
 * open-ended research project.
 */
const REPAIR: (title: string) => Step[] = (title) => {
  const thing = shorten(title.split(/\s+/)[0] ?? 'den', 24)
  return [
    s(`Skriv i én linje hvad ${thing} gør, og hvornår den gør det`, 0),
    s('Find mærke og model (det står som regel bagpå eller indeni lugen)', 0),
    s('Søg på mærke, model og det den gør. Brug 10 minutter, ikke mere', 1),
    s('Beslut: kan du selv, eller skal der en anden til?', 0),
    s('Tjek om der er garanti eller en serviceaftale', 2),
    s('Find ét sted der reparerer den slags', 1),
    s('Spørg om pris og ventetid, før du beslutter noget', 2),
    s('Book tiden, eller skriv i kalenderen hvornår du gør det selv', 0),
    s('Skriv ned hvad du må bruge på den, før det bedre kan betale sig at købe ny', 3),
  ]
}

function shorten(text: string, max = 30): string {
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text
}

/** Trims a full chain down to the requested number of steps, keeping rank order. */
function toGranularity(steps: Step[], granularity: Granularity): string[] {
  if (granularity >= steps.length) return steps.map((x) => x.text)
  if (granularity === 1) {
    const first = steps.find((x) => x.rank === 0) ?? steps[0]
    return [first.text]
  }
  const order = [...steps].map((x, i) => ({ ...x, i }))
  order.sort((a, b) => a.rank - b.rank || a.i - b.i)
  const kept = order.slice(0, granularity)
  kept.sort((a, b) => a.i - b.i)
  return kept.map((x) => x.text)
}

export interface DecomposeOptions {
  granularity?: Granularity
}

export function decompose(title: string, opts: DecomposeOptions = {}): Decomposition | null {
  const t = title.trim()
  if (!t) return null
  const granularity = opts.granularity ?? DEFAULT_GRANULARITY
  const a = analyse(t)

  // "Vaskemaskinen larmer", something is broken. This has to be caught before
  // the domains, or the washing machine gets a laundry checklist.
  if (!a.verb && BROKEN.test(t)) {
    return { steps: toGranularity(REPAIR(t), granularity), minutes: 25, recognised: 'reparation' }
  }

  // Domain knowledge first, it beats the generic verb shape when it applies.
  for (const domain of DOMAINS) {
    if (!domain.test(a, t)) continue
    if (domain.verbs && a.verb && !domain.verbs.includes(a.verb)) continue
    return {
      steps: toGranularity(domain.steps(a), granularity),
      minutes: domain.minutes,
      goodEnough: domain.goodEnough,
      recognised: domain.id,
    }
  }

  if (a.verb === 'find-ud-af') {
    return { steps: toGranularity(DECIDE(a), granularity), minutes: 20, recognised: 'beslutning' }
  }

  if (a.verb === 'få-styr-på') {
    return { steps: toGranularity(OVERVIEW(a), granularity), minutes: 30, recognised: 'overblik' }
  }

  // "Ordn mit rod", "lav noget ved haven", a real verb that still says nothing
  // about what to do. It is the vague case, not a chore with known steps, so it
  // gets the make-it-concrete chain rather than nothing at all.
  if (a.verb && VAGUE_VERBS.has(a.verb) && !BY_VERB[a.verb]) {
    return { steps: toGranularity(vagueSteps(a, t), granularity), minutes: 25, recognised: 'uklar' }
  }

  if (a.verb && BY_VERB[a.verb]) {
    const chain = BY_VERB[a.verb](a)
    return { steps: toGranularity(chain, granularity), minutes: guessMinutes(a), recognised: a.verb }
  }

  // No verb we know: only break it down if it actually looks unmanageable.
  if (looksOverwhelming(t)) {
    return { steps: toGranularity(vagueSteps(a, t), granularity), minutes: 25, recognised: 'uklar' }
  }
  return null
}

function guessMinutes(a: Analysis): number {
  const quick = ['ring', 'send', 'betal', 'tjek', 'print', 'spørg', 'svar']
  const long = ['ryd', 'rengør', 'pak', 'flyt', 'ansøg', 'optag', 'træn', 'mal']
  if (a.verb && quick.includes(a.verb)) return 8
  if (a.verb && long.includes(a.verb)) return 30
  return 15
}

const VAGUE = /\b(styr p[åa]|ordne|f[åa] lavet|f[åa] gjort|planl[æa]g|hele|alt det|overblik|organiser|s[øo]rge for|tage mig af|fikse)\b/i

/** True when the task looks big or vague enough that a breakdown helps. */
export function looksOverwhelming(title: string): boolean {
  return VAGUE.test(title) || title.trim().split(/\s+/).length >= 5
}
