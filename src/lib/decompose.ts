import { analyse, BROKEN, IMPERATIVE, INFINITIVE, type Analysis } from './language'

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
  /**
   * Looking for something.
   *
   * It was landing in the sorting shape, which asked what should be thrown out
   * of the insurance papers she is trying to find. Searching has its own
   * failure mode: it expands until the whole flat has been turned over. So it
   * gets a time limit and a stated plan B, because "jeg kan ikke finde den" is
   * an answer, and acting on it beats another hour of looking.
   */
  find: (a) => {
    const thing = a.object || a.target || 'det'
    return [
      s(`Skriv de 3 steder ned, hvor ${thing} sandsynligvis er`, 0),
      s('Sæt en timer på ti minutter', 0),
      s('Kig det første sted. Kun der', 0),
      s('Kig de to andre', 1),
      s('Stop når timeren ringer', 0),
      s(`Fandt du den ikke: skriv ned hvem der kan sende ${thing} igen, og spørg dem`, 1),
      s('Læg den et sted, hvor du leder næste gang', 3),
    ]
  },
  /** Cash comes from a machine, not from MitID. */
  hæv: (a) => [
    s(`Beslut hvor meget du skal bruge til ${a.target ?? a.object ?? 'det'}`, 0),
    s('Find kortet frem', 0),
    s('Hæv dem næste gang du alligevel er ude', 0),
    s('Læg dem det sted, de skal bruges', 2),
  ],
  /**
   * Selling something. Almost never an errand: the thing that stops it is the
   * photograph and the price, both of which are decisions, and both of which
   * are five minutes when they are separated from each other.
   */
  sælg: (a) => {
    const thing = a.object || 'den'
    return [
      s(`Stil ${thing} et sted med lys og tag tre billeder`, 0),
      s('Slå op hvad andre tager for en tilsvarende', 0),
      s('Vælg en pris. Lidt for lav er bedre end at den står der i et halvt år', 1),
      s('Skriv tre linjer: hvad det er, hvor gammelt, hvad der fejler', 0),
      s(`Læg annoncen op ${a.target ? `på ${a.target}` : ''}`.trim(), 0),
      s('Beslut på forhånd hvordan den bliver hentet, så du slipper for at aftale det bagefter', 2),
    ]
  },
  /** Practising is repetition, not a first draft. */
  øv: (a) => {
    const thing = a.object || a.target || 'det'
    return [
      s(`Vælg det ene stykke af ${thing}, der er sværest`, 0),
      s('Sæt en timer på femten minutter', 0),
      s('Kør det igennem én gang uden at stoppe, selvom det går galt', 0),
      s('Kør kun det svære stykke igen, tre gange', 1),
      s('Kør det hele igennem én gang til', 1),
      s('Stop. Mere i dag gør det ikke bedre', 2),
    ]
  },
  /** "Se den serie færdig", "kig på tallene": look at it, take one thing away. */
  kig: (a) => {
    const thing = a.object || a.target || 'det'
    return [
      s(`Åbn ${thing}`, 0),
      s('Sæt en timer, hvis der er noget bagefter, du skal nå', 2),
      s(`Kig på ${thing}. Lad være med at rette noget imens`, 0),
      s('Skriv den ene ting ned, du tog med derfra', 1),
    ]
  },
  /**
   * Helping somebody is not a phone call, and it is not a chore either. The
   * part that goes wrong is scope: it starts as twenty minutes of homework and
   * becomes the whole evening, so it gets a stated end before it starts.
   */
  hjælp: (a) => {
    const who = a.object || a.target || 'dem'
    const what = a.target && a.object ? ` med ${a.target}` : ''
    return [
      s(`Spørg ${who} hvad der helt præcis er svært${what}. Ikke hele opgaven, det ene sted`, 0),
      s('Aftal hvor lang tid I bruger, før I går i gang', 0),
      s('Sæt en timer på den tid', 1),
      s('Lav det første stykke sammen, og lad dem tage det næste selv', 0),
      s('Stop når timeren ringer, også selvom I ikke er færdige', 0),
      s('Aftal hvornår I tager resten, hvis der er mere', 2),
    ]
  },
  /**
   * Planning something big. The reason it never happens is that "planlæg
   * sommerferien" is twelve decisions wearing one name, and the first one is
   * not obvious. So the chain names the decisions and orders them so each one
   * makes the next smaller.
   */
  planlæg: (a) => {
    const thing = a.object || a.target || 'det'
    return [
      s(`Skriv de 3 ting ned, der skal besluttes om ${thing}. Ikke flere`, 0),
      s('Skriv hvornår det skal være besluttet. En dato, ikke "snart"', 0),
      s('Tag kun den første beslutning. De to andre bliver nemmere af den', 0),
      s('Find den ene oplysning, du mangler for at kunne tage den', 1),
      s('Beslut', 0),
      s('Skriv den ned, så du ikke tager den om', 1),
      s('Skriv den næste beslutning ind som sin egen opgave', 2),
    ]
  },
  /**
   * "Forbered oplægget" and "klargør bilen til vinter" are the same verb and
   * completely different jobs, so it branches on whether she is preparing a
   * thing or preparing something she is going to say.
   */
  forbered: (a) => {
    const thing = a.object || a.target || 'det'
    if (/\b(opl[æa]g|tale|pr[æa]sentation|m[øo]de|samtale|eksamen|pr[øo]ve|interview)\w*\b/i.test(thing)) {
      return [
        s(`Skriv de 3 ting ned, de skal huske fra ${thing}. Kun tre`, 0),
        s('Skriv den første sætning ordret, så du har noget at starte på', 0),
        s('Sæt en timer på tyve minutter', 1),
        s('Byg resten groft op om de tre ting', 0),
        s('Sig det højt én gang. Det er øvelsen, ikke at læse det igennem', 0),
        s('Skriv ned hvad du glemte, og ret kun det', 2),
      ]
    }
    return [
      s(`Skriv i én linje hvad ${thing} skal kunne bagefter`, 0),
      s('Skriv ned hvad du mangler at have hjemme', 0),
      s('Køb eller find det du mangler', 1),
      s('Sæt en timer på tyve minutter', 2),
      s(`Klargør ${thing}`, 0),
      s('Ryd op efter dig, så det ikke bliver en ny opgave', 3),
    ]
  },
  /**
   * "Lav mad", "lav madplan", "lav en aftale". One verb, three different jobs,
   * so it branches on what she is making rather than pretending they are the
   * same. The cooking one is the interesting case: the wall is almost never
   * the cooking, it is deciding what to cook while standing up and hungry.
   */
  lav: (a) => {
    const thing = a.object || 'det'
    if (/\b(madplan|ugeplan|indk[øo]bsseddel|plan)\b/i.test(thing)) {
      return [
        s('Skriv de 5 retter ned, I altid ender med at spise alligevel', 0),
        s('Sæt dem på hver sin dag. Rækkefølgen er ligegyldig', 0),
        s('Skriv det ned, der mangler, i én liste', 1),
        s('Hæng planen et sted, du kigger i forvejen', 2),
      ]
    }
    if (/\b(mad|aftensmad|morgenmad|frokost|madpakke[rn]?|middag)\b/i.test(thing)) {
      return [
        s('Beslut hvad det bliver. Vælg det, du har lavet før', 0),
        s('Tjek om du har det hjemme, før du går i gang', 0),
        s('Stil det frem, du skal bruge', 1),
        s('Lav det', 0),
        s('Sæt resten i køleskabet med det samme, så er i morgen løst', 2),
      ]
    }
    return [
      s(`Skriv i én linje hvad "færdig" betyder for ${thing}`, 0),
      s('Find det frem, du skal bruge', 0),
      s('Sæt en timer på femten minutter', 1),
      s(`Lav ${thing}. Første udgave må gerne være grim`, 0),
      s('Stop når timeren ringer, eller når den er god nok', 0),
    ]
  },
  /**
   * "Tag medicin", "tag skraldet ud", "tag en beslutning". Nearly always a
   * small physical act that fails on remembering, not on doing, so the chain
   * is about making it impossible to forget rather than about the act.
   */
  tag: (a) => {
    const thing = a.object || 'det'
    return [
      s(`Find ${thing} frem og stil det, hvor du falder over det`, 0),
      s(`Tag ${thing}`, 0),
      s('Hæng den på noget, du allerede gør hver dag, så du slipper for at huske den', 1),
      s('Sæt tingene tilbage, hvor de stod', 3),
    ]
  },
  sæt: (a) => {
    const thing = a.object || 'det'
    return [
      s(`Find ud af hvor ${thing} sættes op: app, hjemmeside eller kasse`, 0),
      s('Find det frem, du skal bruge: login, kode, ledning, papirer', 0),
      s('Sæt en timer på femten minutter, så det ikke bliver hele aftenen', 1),
      s(`Sæt ${thing} op så det virker. Ikke pænt, bare virker`, 0),
      s('Prøv det én gang, så du ved det virker', 1),
      s('Ryd op efter dig', 3),
    ]
  },
  /**
   * "Bliv bedre til at lave mad." A wish, not a task, and the usual advice is
   * to tell her to be more specific, which she already knows and which is not
   * the problem. The problem is that there is no single act that finishes it.
   * So it gets turned into the smallest repeatable version, hung on something
   * that already happens, and done once today. That is a thing that can end.
   */
  'blive-bedre': (a) => {
    const thing = shorten(a.rest || a.object || 'det', 34)
    return [
      s(`Skriv den mindste udgave af "${thing}", der stadig tæller. Pinligt lille`, 0),
      s('Skriv hvor tit. En gang om ugen er et rigtigt svar', 1),
      s('Hæng den på noget, du allerede gør, i stedet for et klokkeslæt', 0),
      s('Find det frem, du skal bruge, så det står klar', 2),
      s('Gør den mindste udgave én gang i dag', 0),
      s('Skriv ned at du gjorde det. Ikke hvor godt det gik', 3),
    ]
  },
  gåtur: () => [
    s('Tag sko og jakke på. Ikke andet endnu', 0),
    s('Gå ud af døren', 0),
    s('Gå til det første hjørne. Så må du vende om', 0),
    s('Gå videre hvis du har lyst', 2),
  ],
  'ryd-ud': (a) => {
    // "Rydde ud i tøjet" leaves the preposition on the front of the rest, and
    // "hvad ryger ud af i tøjet" is the sort of sentence that makes a person
    // stop reading.
    const thing = stripLeadingPreposition(a.rest || a.object || 'det')
    return [
      s(`Beslut reglen først: hvad bliver, og hvad ryger ud af ${thing}?`, 0),
      s('Find en sæk og en kasse frem', 0),
      s('Sæt en timer på ti minutter', 1),
      s('Tag én ting ad gangen. Ingen "måske"-bunke, den bliver aldrig sorteret', 0),
      s('Stop når timeren ringer', 0),
      s('Kør sækken ud, eller stil kassen i bilen. Nu, ikke senere', 1),
    ]
  },
  bag: (a) => {
    const thing = a.object || 'kagen'
    return [
      s(`Find opskriften på ${thing} frem og læg den, hvor du kan se den`, 0),
      s('Læs den igennem og skriv kun det, du mangler, på sedlen', 0),
      s('Køb det du mangler', 1),
      s('Stil alle ingredienserne frem, før du går i gang', 0),
      s('Tænd ovnen', 1),
      s('Bag den', 0),
      s('Sæt en timer, og vask op mens den er i ovnen', 2),
    ]
  },
  spar: (a) => {
    const thing = a.target || a.object || 'det'
    return [
      s(`Beslut ét beløb til ${thing}. Et lille et, du ikke mærker`, 0),
      s('Åbn netbanken', 0),
      s('Opret en konto til det, hvis du ikke har en', 1),
      s('Sæt en fast overførsel op, så du aldrig skal huske det igen', 0),
      s('Skriv beløbet ned, så du kan se det vokse', 3),
    ]
  },
  mød: (a) => {
    const who = a.target ?? a.object ?? 'dem'
    return [
      s(`Skriv den ene ting ned, du gerne vil have ud af mødet med ${who}`, 0),
      s('Tjek tid og sted, og læg det i kalenderen med en alarm', 0),
      s('Find det frem, du skal have med', 1),
      s('Beslut hvornår du tager hjemmefra, ikke hvornår du skal være der', 0),
      s('Skriv ned hvad I aftalte, mens du husker det', 2),
    ]
  },
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

/* ------------------------------------------------------------------ *
 * Kinds of work
 * ------------------------------------------------------------------ *
 *
 * A third of ordinary Danish tasks used to get no steps at all: the verb was
 * real, it just had no hand-written chain, and `decompose` returned null. From
 * the outside that is a button that does nothing, which is worse than generic
 * steps, because generic steps at least move.
 *
 * Writing a bespoke chain for every verb in Danish is not the answer either.
 * There are only a handful of genuinely different *shapes* of work, and the
 * shape is what determines where a task stalls. So every verb belongs to one,
 * and the shape carries the scaffolding that shape needs:
 *
 *  contact   the wall is the sentence, not the call. Decide what you want
 *            first, and the talking is the easy part.
 *  online    the wall is the login and not knowing which page. Get those
 *            first, then it is three clicks.
 *  physical  no defined end, so a timer gives it one. Never "do it all".
 *  errand    the expensive part is the transition out of the door, so it gets
 *            hung on a trip that was happening anyway.
 *  produce   the wall is the blank page. A deliberately bad first version, one
 *            pass, done. Perfectionism is the mechanism here, not laziness.
 *  sort      the wall is deciding, over and over, for every single item. So
 *            the rule is decided once, up front, and then it is just hands.
 *
 * Every chain starts with something physical and small enough that not doing
 * it would feel silly, and ends with something that closes the loop, so it is
 * clear when to stop.
 */

/** Jobs short enough that a ten-minute timer is longer than the work. */
const SMALL =
  /\b(blomster|planter|negle|t[æa]nder|seng|sengen|postkasse|kattebakke|vand|glas|kop|bord|k[øo]kkenbord)\w*\b/i

type WorkKind = 'contact' | 'online' | 'physical' | 'errand' | 'produce' | 'sort'

const WORK_OF: Record<string, WorkKind> = {
  ring: 'contact', kontakt: 'contact', spørg: 'contact', svar: 'contact', tal: 'contact',
  mød: 'contact', besøg: 'contact', anmeld: 'contact',

  opret: 'online', afmeld: 'online', overfør: 'online',
  slet: 'online', installer: 'online', meld: 'online', tjek: 'online', gem: 'online',
  udfyld: 'online', del: 'online', ansøg: 'online',

  vask: 'physical', klip: 'physical', vand: 'physical', mal: 'physical', bor: 'physical',
  saml: 'physical', strig: 'physical', red: 'physical', luft: 'physical', smid: 'physical',
  fyld: 'physical', klap: 'physical', mål: 'physical', kør: 'errand',

  aflever: 'errand', hent: 'errand', returner: 'errand', lån: 'errand',

  optag: 'produce', post: 'produce', rediger: 'produce', ret: 'produce',

  sorter: 'sort',
}

/** Where the thing is, said the way she would say it. */
function place(a: Analysis): string {
  return a.target ? `${a.targetPreposition ?? 'hos'} ${a.target}` : ''
}

const WORK_SHAPES: Record<WorkKind, (a: Analysis, imperative: string, infinitive: string) => Step[]> = {
  contact: (a, imp) => {
    const who = a.target ?? a.object ?? 'dem'
    return [
      s(`Skriv i én linje hvad du vil have ud af det med ${who}`, 0),
      s('Skriv det ned, du er bange for de siger, og hvad du så svarer', 3),
      s(`Find ${who}s nummer eller adresse frem`, 0),
      s('Tjek at de er der nu, hvis det er noget med åbningstid', 2),
      s(`${imp} ${who}`, 0),
      s('Skriv ned hvad I aftalte, mens du husker det', 1),
    ]
  },
  online: (a, imp, inf) => {
    const thing = a.object || a.target || 'det'
    return [
      s('Find MitID eller adgangskoden frem, før du åbner noget', 0),
      s(`Find ud af hvor du skal hen for at ${inf} ${thing}: app, hjemmeside eller brev`, 0),
      s('Log ind', 1),
      s('Find den rigtige side. Kig efter, lad være med at trykke endnu', 2),
      s(`${imp} ${thing}`, 0),
      s('Se efter en kvittering eller en bekræftelse, så du ved den gik igennem', 1),
      s('Gem bekræftelsen et sted du kan finde den', 3),
    ]
  },
  physical: (a, imp, inf) => {
    const thing = a.object || a.target || 'det'
    // Under a few minutes, the timer and the "stop when it rings" are more
    // ceremony than the job itself, and ceremony around a two-minute task is
    // its own reason not to start.
    if (SMALL.test(thing)) {
      return [
        s(`Find det frem, du skal bruge til at ${inf} ${thing}`, 0),
        s(`${imp} ${thing}`, 0),
        s('Sæt tingene tilbage, hvor de stod', 2),
      ]
    }
    return [
      s(`Find det frem, du skal bruge til at ${inf} ${thing}`, 0),
      s('Sæt en timer på ti minutter. Den er slutningen, ikke målet', 0),
      s(`Start med den mindste del af ${thing}`, 0),
      s('Tag resten, hvis du stadig er i gang', 2),
      s('Stop når timeren ringer, uanset hvordan der ser ud', 0),
      s('Sæt tingene på plads, så du ikke arver et nyt rod', 3),
    ]
  },
  errand: (a, imp) => {
    const thing = a.object || 'det'
    return [
      s(`Find ${thing} frem og læg det ved døren`, 0),
      s(`Slå åbningstiden op ${place(a) || 'der hvor du skal hen'}`, 1),
      s('Find det med, du skal have med: kvittering, kode, kort', 1),
      s('Kobl den på en tur du alligevel skal, i stedet for at lave en ekstra', 2),
      s(`${imp} ${thing}`, 0),
      s('Streg den, så snart du er ude ad døren igen', 3),
    ]
  },
  produce: (a) => {
    const thing = a.object || a.target || 'det'
    return [
      s(`Skriv i én linje hvad "færdig" betyder for ${thing}. Lavt sat`, 0),
      s('Find det frem, du skal bruge, og læg telefonen et andet sted', 0),
      s('Sæt en timer på femten minutter', 1),
      s('Lav en grim første udgave. Den må gerne være dårlig, det er meningen', 0),
      s('Hold pause. Lad være med at rette imens', 2),
      s('Kig den igennem én gang. Kun én', 1),
      s('Bliv færdig, eller skriv hvor du kom til', 0),
    ]
  },
  sort: (a) => {
    const thing = a.object || a.target || 'det'
    return [
      s(`Beslut reglen først: hvad bliver, og hvad ryger ud af ${thing}?`, 0),
      s('Find to bunker eller to kasser frem', 0),
      s('Sæt en timer på ti minutter', 1),
      s('Tag én ting ad gangen. Ingen "måske"-bunke, den bliver aldrig sorteret', 0),
      s('Stop når timeren ringer', 0),
      s('Få den ene bunke ud af huset med det samme', 2),
    ]
  },
}

/**
 * Steps for a verb we recognise but have written no chain for.
 *
 * Returns null only when the verb belongs to no shape at all, which is the
 * point at which saying nothing is more honest than guessing.
 */
function shapeFor(a: Analysis): Step[] | null {
  if (!a.verb) return null
  const kind = WORK_OF[a.verb]
  if (!kind) return null
  const imp = IMPERATIVE[a.verb] ?? a.verb
  return WORK_SHAPES[kind](a, imp, INFINITIVE[a.verb] ?? a.verb)
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
const VAGUE_VERBS = new Set(['ordn', 'lav', 'gør', 'få', 'klar', 'tag', 'se', 'styr', 'håndter'])

/**
 * Nouns that are as unspecific as the verb in front of them.
 *
 * The gate that was missing. "Tag medicin" and "Bage en kage til Idas
 * fødselsdag" were being handed "skriv i én sætning hvad medicin ville betyde,
 * når det er færdigt", which is the app being obtuse at somebody about the
 * most concrete thing in their day. A vague verb only makes a vague task when
 * the object is vague too.
 */
const VAGUE_OBJECT =
  /^(?:det|den|dem|noget|nogle|ting|tingene|sager|sagerne|rod|rodet|alt|alting|hele|resten|styr|orden|det hele)?$/i

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
const REPAIR: (title: string, a?: Analysis) => Step[] = (title, a) => {
  // The thing, not the verb. "Reparer cyklen" was producing "skriv i én linje
  // hvad Reparer gør", which reads as the app not having understood a two-word
  // sentence.
  const thing = shorten(a?.object || title.split(/\s+/)[0] || 'den', 24)
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

/** "i tøjet" -> "tøjet", so a step can put it after its own preposition. */
function stripLeadingPreposition(text: string): string {
  return text.trim().replace(/^(?:i|p[åa]|til|med|om|for|fra|ved|af|hos)\s+/i, '')
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
  // the domains, or the washing machine gets a laundry checklist. "Reparer
  // cyklen" lands here too: the repair itself is rarely the wall, the
  // unanswered question of who fixes it and what it costs is.
  if (BROKEN.test(t) || a.verb === 'reparer') {
    return { steps: toGranularity(REPAIR(t, a), granularity), minutes: 25, recognised: 'reparation' }
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

  // "Ordn mit rod", "lav noget ved haven": a real verb that still says nothing
  // about what to do. The object has to be vague as well, or this swallows
  // "Tag medicin" and hands back a philosophy exercise.
  if (a.verb && VAGUE_VERBS.has(a.verb) && !BY_VERB[a.verb] && VAGUE_OBJECT.test(a.object.trim())) {
    return { steps: toGranularity(vagueSteps(a, t), granularity), minutes: 25, recognised: 'uklar' }
  }

  if (a.verb && BY_VERB[a.verb]) {
    const chain = BY_VERB[a.verb](a)
    return { steps: toGranularity(chain, granularity), minutes: guessMinutes(a), recognised: a.verb }
  }

  // A verb we know, with no chain written for it. Rather than nothing, it gets
  // the shape its kind of work has: a phone call stalls in a different place
  // from a pile of laundry, and the shape is what carries that.
  const shape = shapeFor(a)
  if (shape) {
    return { steps: toGranularity(shape, granularity), minutes: guessMinutes(a), recognised: `${a.verb}` }
  }

  // Nothing recognised at all. An appointment is the one case where the right
  // answer is that there is nothing to break down, and saying so is a real
  // answer rather than a shrug.
  if (looksLikeAnAppointment(t)) return null

  // A named thing, even without a verb we know, is concrete. Handing back
  // "skriv i én sætning hvad det ville betyde, når det er færdigt" for
  // something she has already stated plainly reads as the app not having read
  // it, so that chain is kept for tasks that really are unspecific.
  if (!VAGUE_OBJECT.test((a.object || t).trim())) {
    return { steps: toGranularity(CONCRETE(a, t), granularity), minutes: guessMinutes(a), recognised: 'konkret' }
  }

  return { steps: toGranularity(vagueSteps(a, t), granularity), minutes: 25, recognised: 'uklar' }
}

/**
 * The last chain before giving up: a small job, named plainly.
 *
 * It cannot know what the work is, so it does not pretend to. What it can do
 * is supply the three things that are missing from every stalled small task
 * regardless of what it is: a physical first move, an end that arrives by
 * itself, and somewhere for the thing to go afterwards. That is worth more
 * than a philosophical prompt about what "færdig" means.
 */
function CONCRETE(a: Analysis, title: string): Step[] {
  const thing = shorten(a.object || title, 34)
  const imp = a.verb ? (IMPERATIVE[a.verb] ?? 'Lav') : 'Lav'
  return [
    s(`Find det frem, du skal bruge til "${thing}"`, 0),
    s('Beslut hvor du sidder eller står imens', 3),
    s('Sæt en timer på ti minutter. Den er slutningen, ikke målet', 0),
    s(`${imp} den mindste del af det`, 0),
    s('Tag resten, hvis du stadig er i gang', 2),
    s('Stop når timeren ringer', 0),
    s('Skriv hvor du kom til, hvis den ikke blev færdig', 1),
  ]
}

/**
 * A thing that happens at a time, rather than a thing to be done.
 *
 * "Tandlæge torsdag kl 14", "Fars fødselsdag", "Møde med Anne". There is no
 * first step: you show up. Offering to break it into five parts is the app
 * failing to understand what it is looking at, so it says so instead.
 */
export function looksLikeAnAppointment(title: string): boolean {
  const t = title.trim()
  if (analyse(t).verb) return false
  return (
    /\b(?:f[øo]dselsdag|jubil[æa]um|bryllup|begravelse|konfirmation|barnedåb|ferie|fri)\b/i.test(t) ||
    /\b(?:kl\.?\s*\d{1,2}|\d{1,2}[.:]\d{2})\b/i.test(t) ||
    /^(?:m[øo]de|aftale|tid)\b/i.test(t) ||
    /\b(?:mandag|tirsdag|onsdag|torsdag|fredag|l[øo]rdag|s[øo]ndag)\b/i.test(t)
  )
}

function guessMinutes(a: Analysis): number {
  const quick = ['ring', 'send', 'betal', 'tjek', 'print', 'spørg', 'svar', 'tag', 'vand', 'hæv', 'gem', 'smid']
  const long = ['ryd', 'rengør', 'pak', 'flyt', 'ansøg', 'optag', 'træn', 'mal', 'bag', 'saml', 'planlæg', 'ryd-ud', 'forbered']
  if (a.verb && quick.includes(a.verb)) return 8
  if (a.verb && long.includes(a.verb)) return 30
  // Otherwise the kind of work is a better guess than one number for
  // everything: an errand costs a trip out of the door, a login does not.
  const kind = a.verb ? WORK_OF[a.verb] : undefined
  if (kind === 'errand') return 25
  if (kind === 'produce' || kind === 'sort' || kind === 'physical') return 20
  if (kind === 'online' || kind === 'contact') return 10
  return 15
}
