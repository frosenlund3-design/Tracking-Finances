/**
 * Spilkataloget.
 *
 * Seksti spil, men kun seks motorer. Det er hele arkitekturen: en `kind`
 * afgør hvilken motor der kører spillet, og alt andet — navn, farver, trin,
 * sværhedsgrad — er indhold. Sådan bliver "et helt katalog" til noget der
 * kan vedligeholdes, i stedet for tres halvfærdige skærme.
 *
 * Alt tekst er på dansk. Figurnavne får lov at være det de er.
 */

export type GameKind =
  /** Trin i rigtig rækkefølge, med afhængigheder. Langt de fleste spil. */
  | 'steps'
  /** Kameraet tændt, rummet scannes i sektorer. */
  | 'sweep'
  /** Tæl op til et mål: glas vand, skridt, beskeder. */
  | 'count'
  /** Sortér ting i den rigtige spand. */
  | 'sort'
  /** Ét greb, ét tryk, ét point. Til de helt små vaner. */
  | 'tap';

export type Difficulty = 'let' | 'mellem' | 'svaer';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  let: 'Let',
  mellem: 'Mellem',
  svaer: 'Svær',
};

/** Hvor meget tid hver sværhedsgrad giver, som andel af det normale. */
export const DIFFICULTY_TIME: Record<Difficulty, number> = {
  let: 1.6,
  mellem: 1,
  svaer: 0.65,
};

/** Og hvad den betaler ekstra. Svær er en beslutning, ikke en straf. */
export const DIFFICULTY_BONUS: Record<Difficulty, number> = {
  let: 1,
  mellem: 1.25,
  svaer: 1.6,
};

export type CategoryId =
  | 'sovevaerelse'
  | 'koekken'
  | 'rengoering'
  | 'toej'
  | 'krop'
  | 'traening'
  | 'hoved'
  | 'arbejde'
  | 'penge'
  | 'beskeder'
  | 'ting'
  | 'indkoeb';

export interface Category {
  id: CategoryId;
  label: string;
  /** Kort linje under rækkens overskrift. */
  blurb: string;
  emoji: string;
  /** Rækkens farve. Bruges til fliserne i den. */
  hue: number;
}

export const CATEGORIES: Category[] = [
  { id: 'rengoering', label: 'Rengøring', blurb: 'Det der tager tyve minutter og føles som to timer', emoji: '🧹', hue: 152 },
  { id: 'sovevaerelse', label: 'Soveværelse', blurb: 'Hvor dagen begynder og slutter', emoji: '🛏️', hue: 265 },
  { id: 'koekken', label: 'Køkken', blurb: 'Mad, opvask, og hvad der står i køleskabet', emoji: '🍳', hue: 30 },
  { id: 'toej', label: 'Tøj & vask', blurb: 'Bunken på stolen har et navn nu', emoji: '👕', hue: 200 },
  { id: 'krop', label: 'Krop & pleje', blurb: 'De to minutter der afgør resten af dagen', emoji: '🪥', hue: 330 },
  { id: 'traening', label: 'Bevægelse', blurb: 'Ud ad døren er det svære. Resten går af sig selv', emoji: '👟', hue: 12 },
  { id: 'hoved', label: 'Hoved & ro', blurb: 'Pauser, skærmfri tid, og at lukke en åben løkke', emoji: '🧠', hue: 285 },
  { id: 'arbejde', label: 'Arbejde & fokus', blurb: 'Fra "jeg burde" til "det er i gang"', emoji: '💻', hue: 220 },
  { id: 'penge', label: 'Penge & papir', blurb: 'Regninger, kvitteringer, e-Boks', emoji: '💰', hue: 95 },
  { id: 'beskeder', label: 'Beskeder', blurb: 'Indbakken behøver ikke være tom. Bare mindre', emoji: '💬', hue: 190 },
  { id: 'ting', label: 'Ting & steder', blurb: 'Skuffer, skabe, doom piles', emoji: '📦', hue: 42 },
  { id: 'indkoeb', label: 'Indkøb', blurb: 'Listen, turen, og det man glemte', emoji: '🛒', hue: 340 },
];

const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function category(id: string): Category | undefined {
  return CATEGORY_BY_ID.get(id as CategoryId);
}

/**
 * Et trin i et spil.
 *
 * `after` er det der gør appen klogere end mavefornemmelsen: den siger hvilke
 * trin der skal være færdige først. `background` markerer et trin der kører
 * videre af sig selv — vaskemaskinen, ovnen, gulvet der tørrer — og som
 * derfor skal sættes i gang så tidligt som overhovedet muligt.
 */
export interface Step {
  id: string;
  text: string;
  /** Trin-id'er der skal være færdige før dette giver mening. */
  after?: string[];
  /** Kører videre uden dig, når det først er sat i gang. */
  background?: boolean;
  /**
   * Hvor mange sekunder trinnet varer.
   *
   * For et baggrundstrin er det hvor længe det kører — vaskemaskinens
   * halvanden time — ikke hvor længe du står med det. Det er `handsOn`.
   */
  seconds?: number;
  /**
   * Hvor mange sekunder trinnet optager dig.
   *
   * Kun nødvendig på baggrundstrin, hvor de to tal er vidt forskellige. For
   * alt andet er det det samme som `seconds`.
   */
  handsOn?: number;
  /** Hvorfor rækkefølgen er sådan. Vises når appen flytter et trin op. */
  why?: string;
}

export interface Game {
  id: string;
  /** Dansk navn. Kort nok til at stå på en flise. */
  name: string;
  /** Én linje. Skal give lyst til at trykke. */
  tagline: string;
  category: CategoryId;
  kind: GameKind;
  /** Hovedmotivet på fliserne. Hentes som Noto-SVG. */
  emoji: string;
  /** Andre motiver spredt i baggrunden. */
  props?: string[];
  /** Basispoint for at gennemføre. Ganges med sværhedsgraden. */
  xp: number;
  /** Normal varighed i sekunder. */
  seconds: number;
  /** Kun til `count`: hvad der tælles op til. */
  target?: number;
  targetUnit?: string;
  /** Kun til `steps`. */
  steps?: Step[];
  /** Søgeord ud over navnet. */
  tags?: string[];
  /** Skiller de få spil ud der er værd at prøve først. */
  featured?: boolean;
  /**
   * Spil der har deres egen skærm.
   *
   * Kataloget er stadig indgangen — flisen ser ud som alle andre — men
   * motoren kører dem ikke, for de har regler den ikke kender.
   */
  route?: string;
}

/* ------------------------------------------------------------------ spil */

export const GAMES: Game[] = [
  /* --- Rengøring ------------------------------------------------------- */
  {
    id: 'rumsweep',
    name: 'Rum-scanner',
    tagline: 'Kameraet tændt. Scan rummet, og få at vide hvad der mangler.',
    category: 'rengoering',
    kind: 'sweep',
    emoji: '📸',
    props: ['✨', '🧹', '🛋️'],
    xp: 60,
    seconds: 240,
    tags: ['kamera', 'ar', '3d', 'scan', 'live'],
    featured: true,
    route: '/scan',
  },
  {
    id: 'ryd-rum',
    name: 'Ryd et rum',
    tagline: 'Fem trin i den rækkefølge der faktisk virker.',
    category: 'rengoering',
    kind: 'steps',
    emoji: '🧹',
    props: ['✨', '🪣'],
    xp: 40,
    seconds: 600,
    featured: true,
    steps: [
      { id: 'vindue', text: 'Åbn et vindue', background: true, seconds: 900, handsOn: 15, why: 'Luften skal skiftes mens du arbejder — ikke bagefter.' },
      { id: 'flader', text: 'Alt på flader: væk eller på plads', seconds: 180 },
      { id: 'stoev', text: 'Tør støv af', after: ['flader'], seconds: 120, why: 'Der er ingen grund til at støve rundt om ting der skal væk alligevel.' },
      { id: 'stoevsug', text: 'Støvsug', after: ['stoev'], seconds: 180, why: 'Støvet falder ned. Derfor gulvet efter fladerne.' },
      { id: 'gulv', text: 'Vask gulv hvis det trænger', after: ['stoevsug'], seconds: 180, why: 'Vand på et gulv med støv på laver mudder.' },
    ],
  },
  {
    id: 'stoevsug',
    name: 'Støvsugning',
    tagline: 'Kanterne først. Så går midten hurtigt.',
    category: 'rengoering',
    kind: 'steps',
    emoji: '🧽',
    props: ['💨'],
    xp: 25,
    seconds: 420,
    steps: [
      { id: 'gulvet', text: 'Løft det der står på gulvet op på et bord', seconds: 90 },
      { id: 'kanter', text: 'Kanter og hjørner', after: ['gulvet'], seconds: 120 },
      { id: 'midten', text: 'Midten af gulvet', after: ['kanter'], seconds: 120, why: 'Kanterne først, ellers samler du det samme støv op to gange.' },
      { id: 'tilbage', text: 'Sæt tingene tilbage', after: ['midten'], seconds: 60 },
    ],
  },
  {
    id: 'vaske-gulv',
    name: 'Vaske gulv',
    tagline: 'Fra det fjerneste hjørne mod døren.',
    category: 'rengoering',
    kind: 'steps',
    emoji: '🪣',
    props: ['💧'],
    xp: 30,
    seconds: 480,
    steps: [
      { id: 'vand', text: 'Sæt spanden i gang med varmt vand', background: true, seconds: 240, handsOn: 60 },
      { id: 'ryd', text: 'Ryd gulvet helt', seconds: 120 },
      { id: 'sug', text: 'Støvsug eller fej', after: ['ryd'], seconds: 120, why: 'Vand på løst støv bliver til mudder.' },
      { id: 'vask', text: 'Vask fra det fjerneste hjørne mod døren', after: ['sug', 'vand'], seconds: 180, why: 'Ellers står du i et hjørne på et vådt gulv.' },
    ],
  },
  {
    id: 'badevaerelse',
    name: 'Badeværelset',
    tagline: 'Sæt rensen i gang først. Den arbejder mens du gør andet.',
    category: 'rengoering',
    kind: 'steps',
    emoji: '🚽',
    props: ['🧼', '✨'],
    xp: 45,
    seconds: 720,
    featured: true,
    steps: [
      { id: 'spray', text: 'Spray rens i bruser og toilet', background: true, seconds: 600, handsOn: 60, why: 'Rens skal have ti minutter. Sæt det i gang først og du sparer al skrubningen.' },
      { id: 'hylder', text: 'Ryd hylder og kanter', seconds: 120 },
      { id: 'spejl', text: 'Spejl og vask', after: ['hylder'], seconds: 120 },
      { id: 'bruser', text: 'Skrub bruseren', after: ['spray', 'spejl'], seconds: 180, why: 'Nu har rensen virket, og du skrubber en tiendedel så meget.' },
      { id: 'toilet', text: 'Toilettet til sidst', after: ['bruser'], seconds: 120, why: 'Til sidst, så kluden ikke skal tilbage til vasken bagefter.' },
      { id: 'gulv', text: 'Gulv og håndklæder', after: ['toilet'], seconds: 120 },
    ],
  },
  {
    id: 'fejlplaceret',
    name: 'Ting på afveje',
    tagline: 'Ti ting der ikke hører til hvor de står.',
    category: 'rengoering',
    kind: 'count',
    emoji: '🛋️',
    props: ['🔑', '📚'],
    xp: 20,
    seconds: 300,
    target: 10,
    targetUnit: 'ting',
    tags: ['oprydning', 'hurtig'],
  },
  {
    id: 'skrald',
    name: 'Ud med skraldet',
    tagline: 'Alle spande, ikke bare køkkenets.',
    category: 'rengoering',
    kind: 'steps',
    emoji: '🗑️',
    props: ['♻️'],
    xp: 18,
    seconds: 300,
    steps: [
      { id: 'saml', text: 'Saml poser fra alle rum', seconds: 90 },
      { id: 'ny', text: 'Ny pose i hver spand med det samme', after: ['saml'], seconds: 60, why: 'Nu, mens du står der. Ellers står den tom i tre dage.' },
      { id: 'ud', text: 'Ud til containeren', after: ['saml'], seconds: 120 },
    ],
  },

  /* --- Soveværelse ----------------------------------------------------- */
  {
    id: 'rede-seng',
    name: 'Rede sengen',
    tagline: 'Halvfems sekunder. Resten af dagen ser anderledes ud.',
    category: 'sovevaerelse',
    kind: 'steps',
    emoji: '🛏️',
    props: ['☀️'],
    xp: 15,
    seconds: 120,
    featured: true,
    steps: [
      { id: 'luft', text: 'Slå dynen tilbage og lad sengen lufte', background: true, seconds: 600, handsOn: 10, why: 'Ti minutters luft, og sengen er tør når du reder den.' },
      { id: 'lagen', text: 'Ret lagnet ud', seconds: 30 },
      { id: 'dyne', text: 'Ryst dynen og læg den på', after: ['lagen', 'luft'], seconds: 40 },
      { id: 'pude', text: 'Puderne på plads', after: ['dyne'], seconds: 20 },
    ],
  },
  {
    id: 'sengetoej',
    name: 'Skifte sengetøj',
    tagline: 'Vaskemaskinen i gang før du river af.',
    category: 'sovevaerelse',
    kind: 'steps',
    emoji: '🧺',
    props: ['🛏️', '✨'],
    xp: 30,
    seconds: 600,
    steps: [
      { id: 'rent', text: 'Find det rene sæt frem først', seconds: 60, why: 'Find det først. Ellers står du med en bar madras og ingen plan.' },
      { id: 'af', text: 'Riv det gamle af', after: ['rent'], seconds: 90 },
      { id: 'maskine', text: 'Sæt maskinen i gang', after: ['af'], background: true, seconds: 5400, handsOn: 60, why: 'I gang med det samme — den vasker mens du reder.' },
      { id: 'paa', text: 'Læg det rene på', after: ['af'], seconds: 240 },
    ],
  },
  {
    id: 'i-seng',
    name: 'I seng til tiden',
    tagline: 'Nedtælling, ikke alarm.',
    category: 'sovevaerelse',
    kind: 'steps',
    emoji: '🌙',
    props: ['⭐', '😴'],
    xp: 25,
    seconds: 1800,
    steps: [
      { id: 'telefon', text: 'Læg telefonen til opladning uden for soveværelset', seconds: 60 },
      { id: 'tand', text: 'Tænder og hudpleje', after: ['telefon'], seconds: 300 },
      { id: 'lys', text: 'Sluk det store lys', after: ['tand'], seconds: 20 },
      { id: 'seng', text: 'I seng', after: ['lys'], seconds: 60 },
    ],
  },
  {
    id: 'staa-op',
    name: 'Op af sengen',
    tagline: 'Fødderne på gulvet inden hovedet begynder at forhandle.',
    category: 'sovevaerelse',
    kind: 'steps',
    emoji: '⏰',
    props: ['☀️', '💧'],
    xp: 20,
    seconds: 600,
    steps: [
      { id: 'foedder', text: 'Begge fødder på gulvet', seconds: 10, why: 'Først. Alt andet er lettere når du står op.' },
      { id: 'gardin', text: 'Gardiner op', after: ['foedder'], seconds: 20 },
      { id: 'vand', text: 'Et glas vand', after: ['foedder'], seconds: 60 },
      { id: 'seng', text: 'Red sengen', after: ['gardin'], seconds: 90 },
    ],
  },

  /* --- Køkken ---------------------------------------------------------- */
  {
    id: 'opvask',
    name: 'Opvasken',
    tagline: 'Tøm maskinen først. Ellers er der ingen steder at gøre af det.',
    category: 'koekken',
    kind: 'steps',
    emoji: '🍽️',
    props: ['🫧', '💧'],
    xp: 25,
    seconds: 600,
    featured: true,
    steps: [
      { id: 'toem', text: 'Tøm opvaskemaskinen', seconds: 180, why: 'Først. En fuld ren maskine er grunden til at bordet er fyldt.' },
      { id: 'blod', text: 'Sæt det brændte i blød', after: ['toem'], background: true, seconds: 900, handsOn: 60, why: 'I blød med det samme, så skrubber du ikke om ti minutter.' },
      { id: 'fyld', text: 'Fyld maskinen', after: ['toem'], seconds: 180 },
      { id: 'start', text: 'Start maskinen', after: ['fyld'], background: true, seconds: 7200, handsOn: 20 },
      { id: 'haand', text: 'Vask resten i hånden', after: ['blod', 'fyld'], seconds: 180 },
      { id: 'bord', text: 'Tør bordet af', after: ['haand'], seconds: 60 },
    ],
  },
  {
    id: 'koeleskab',
    name: 'Rydde køleskabet',
    tagline: 'Hylde for hylde. Ingen hopper over grøntsagsskuffen.',
    category: 'koekken',
    kind: 'steps',
    emoji: '🧊',
    props: ['🥕', '🥛'],
    xp: 35,
    seconds: 900,
    steps: [
      { id: 'pose', text: 'Hent en pose til det der skal ud', seconds: 30 },
      { id: 'doer', text: 'Døren: tjek datoer', after: ['pose'], seconds: 120 },
      { id: 'hylder', text: 'Hylderne, oppefra og ned', after: ['doer'], seconds: 300, why: 'Oppefra. Det der drypper, drypper nedad.' },
      { id: 'skuffe', text: 'Grøntsagsskuffen', after: ['hylder'], seconds: 180 },
      { id: 'toer', text: 'Tør hylderne af', after: ['skuffe'], seconds: 120 },
    ],
  },
  {
    id: 'lave-mad',
    name: 'Lave aftensmad',
    tagline: 'Ovn og vand på først. Alt andet venter på dem.',
    category: 'koekken',
    kind: 'steps',
    emoji: '🍳',
    props: ['🥘', '🔥'],
    xp: 40,
    seconds: 1800,
    steps: [
      { id: 'ovn', text: 'Tænd ovnen / sæt vand over', background: true, seconds: 720, handsOn: 30, why: 'Det tager tolv minutter at varme op. Start det, og du får tiden forærende.' },
      { id: 'find', text: 'Find alle ingredienser frem', seconds: 180 },
      { id: 'snit', text: 'Snit og forbered', after: ['find'], seconds: 480 },
      { id: 'lav', text: 'Lav maden', after: ['snit', 'ovn'], seconds: 600 },
      { id: 'ryd', text: 'Ryd op mens det står og passer sig selv', after: ['lav'], seconds: 300, why: 'Mens det simrer. Ellers venter et helt køkken efter maden.' },
    ],
  },
  {
    id: 'meal-prep',
    name: 'Meal prep',
    tagline: 'Én gang kogt, fire gange spist.',
    category: 'koekken',
    kind: 'steps',
    emoji: '🥡',
    props: ['🍚', '🥦'],
    xp: 55,
    seconds: 3600,
    steps: [
      { id: 'plan', text: 'Beslut hvad du laver', seconds: 300 },
      { id: 'ovn', text: 'Ovn på, ris/pasta i gryde', after: ['plan'], background: true, seconds: 1800, handsOn: 60, why: 'Det der tager længst, i gang først.' },
      { id: 'gront', text: 'Snit alt grønt', after: ['plan'], seconds: 600 },
      { id: 'protein', text: 'Steg eller bag proteinen', after: ['gront', 'ovn'], seconds: 900 },
      { id: 'baks', text: 'Fordel i bakker', after: ['protein'], seconds: 300 },
      { id: 'koel', text: 'Køl af inden låg på', after: ['baks'], seconds: 600, why: 'Låg på varm mad giver kondens, og kondens giver dårlig mad på torsdag.' },
    ],
  },
  {
    id: 'vand',
    name: 'Drikke nok vand',
    tagline: 'Otte glas. Tryk hver gang.',
    category: 'koekken',
    kind: 'count',
    emoji: '💧',
    props: ['🥤'],
    xp: 16,
    seconds: 0,
    target: 8,
    targetUnit: 'glas',
    tags: ['vane', 'dagligt'],
  },

  /* --- Tøj & vask ------------------------------------------------------ */
  {
    id: 'vasketoej',
    name: 'Vasketøj',
    tagline: 'Maskinen i gang før alt andet. Den kører uden dig.',
    category: 'toej',
    kind: 'steps',
    emoji: '🧺',
    props: ['👕', '🫧'],
    xp: 35,
    seconds: 1200,
    featured: true,
    steps: [
      { id: 'sorter', text: 'Sortér i to bunker: mørkt og lyst', seconds: 180 },
      { id: 'start', text: 'Sæt den første maskine i gang', after: ['sorter'], background: true, seconds: 5400, handsOn: 60, why: 'Nu. Maskinen kører halvanden time uden dig — alt andet kan vente på den, den kan ikke vente på dig.' },
      { id: 'tomt', text: 'Tøm lommer i bunke to', after: ['sorter'], seconds: 120 },
      { id: 'toerre', text: 'Hæng den første maskine op', after: ['start'], seconds: 240 },
      { id: 'anden', text: 'Anden maskine i gang', after: ['toerre'], background: true, seconds: 5400, handsOn: 30 },
    ],
  },
  {
    id: 'folde',
    name: 'Folde tøj',
    tagline: 'Sortér mens du folder, så det ikke skal sorteres bagefter.',
    category: 'toej',
    kind: 'steps',
    emoji: '👕',
    props: ['🧦', '👖'],
    xp: 25,
    seconds: 900,
    steps: [
      { id: 'bunker', text: 'Lav en bunke pr. sted det skal hen', seconds: 60, why: 'Sortér mens du folder. Ellers folder du én gang og sorterer bagefter.' },
      { id: 'fold', text: 'Fold alt', after: ['bunker'], seconds: 600 },
      { id: 'baer', text: 'Bær hver bunke hen på sin plads', after: ['fold'], seconds: 240 },
    ],
  },
  {
    id: 'rent-toej',
    name: 'Tage rent tøj på',
    tagline: 'Ét tryk. Det tæller.',
    category: 'toej',
    kind: 'tap',
    emoji: '👚',
    props: ['✨'],
    xp: 10,
    seconds: 0,
    tags: ['vane', 'dagligt'],
  },
  {
    id: 'garderobe',
    name: 'Rydde ud i tøjet',
    tagline: 'Tre bunker. Ingen fjerde.',
    category: 'toej',
    kind: 'steps',
    emoji: '👗',
    props: ['♻️', '📦'],
    xp: 50,
    seconds: 2400,
    steps: [
      { id: 'alt', text: 'Alt ud af skabet og op på sengen', seconds: 300, why: 'Alt ud. Et halvtomt skab bliver aldrig ryddet — det bliver omrokeret.' },
      { id: 'tre', text: 'Tre bunker: beholde, videre, ud', after: ['alt'], seconds: 900 },
      { id: 'ind', text: '"Beholde" tilbage i skabet', after: ['tre'], seconds: 600 },
      { id: 'vaek', text: '"Videre" i en pose ved døren', after: ['tre'], seconds: 180, why: 'Ved døren, ikke i kælderen. En pose i kælderen bliver stående i to år.' },
    ],
  },

  /* --- Krop & pleje ---------------------------------------------------- */
  {
    id: 'taender',
    name: 'To minutter',
    tagline: 'Fire felter, tredive sekunder hver. Timeren styrer.',
    category: 'krop',
    kind: 'steps',
    emoji: '🪥',
    props: ['🦷', '✨'],
    xp: 12,
    seconds: 120,
    featured: true,
    tags: ['tandbørstning', 'vane', 'dagligt'],
    steps: [
      { id: 'oq1', text: 'Øverst højre — 30 sekunder', seconds: 30 },
      { id: 'oq2', text: 'Øverst venstre — 30 sekunder', after: ['oq1'], seconds: 30 },
      { id: 'nq1', text: 'Nederst venstre — 30 sekunder', after: ['oq2'], seconds: 30 },
      { id: 'nq2', text: 'Nederst højre — 30 sekunder', after: ['nq1'], seconds: 30 },
    ],
  },
  {
    id: 'bad',
    name: 'I bad',
    tagline: 'Fra "jeg skal snart" til "det er gjort".',
    category: 'krop',
    kind: 'steps',
    emoji: '🚿',
    props: ['🧴', '💧'],
    xp: 20,
    seconds: 900,
    steps: [
      { id: 'handklaede', text: 'Læg et rent håndklæde frem', seconds: 30, why: 'Først. Det er det der ellers holder folk fra at gå i gang.' },
      { id: 'ind', text: 'Ind under vandet', after: ['handklaede'], seconds: 300 },
      { id: 'vask', text: 'Vask hår og krop', after: ['ind'], seconds: 300 },
      { id: 'toer', text: 'Tør dig og hæng håndklædet op', after: ['vask'], seconds: 120 },
    ],
  },
  {
    id: 'hudpleje',
    name: 'Hudpleje',
    tagline: 'Tyndest først, tykkest sidst. Ellers trænger intet ind.',
    category: 'krop',
    kind: 'steps',
    emoji: '🧴',
    props: ['✨', '💧'],
    xp: 15,
    seconds: 300,
    steps: [
      { id: 'rens', text: 'Rens', seconds: 60 },
      { id: 'serum', text: 'Serum — det tyndeste', after: ['rens'], seconds: 30, why: 'Tyndest først. En creme under et serum lukker serummet ude.' },
      { id: 'creme', text: 'Creme', after: ['serum'], seconds: 30 },
      { id: 'spf', text: 'Solcreme, hvis det er morgen', after: ['creme'], seconds: 30, why: 'Altid øverst, og altid sidst.' },
    ],
  },
  {
    id: 'makeup',
    name: 'Makeup',
    tagline: 'Base, øjne, læber. I den rækkefølge.',
    category: 'krop',
    kind: 'steps',
    emoji: '💄',
    props: ['✨', '🪞'],
    xp: 18,
    seconds: 900,
    steps: [
      { id: 'hud', text: 'Hudpleje og primer', seconds: 120, why: 'Under alt andet. En base på tør hud sætter sig i pletter.' },
      { id: 'base', text: 'Foundation eller concealer', after: ['hud'], seconds: 180 },
      { id: 'oejne', text: 'Øjne', after: ['base'], seconds: 300, why: 'Øjne før basen sættes, så drys kan tørres væk uden at ødelægge noget.' },
      { id: 'kinder', text: 'Kinder', after: ['oejne'], seconds: 120 },
      { id: 'laeber', text: 'Læber', after: ['kinder'], seconds: 60 },
    ],
  },
  {
    id: 'medicin',
    name: 'Medicin & vitaminer',
    tagline: 'Ét tryk, og dagen er registreret.',
    category: 'krop',
    kind: 'tap',
    emoji: '💊',
    props: ['✅'],
    xp: 10,
    seconds: 0,
    tags: ['vane', 'dagligt', 'helbred'],
  },

  /* --- Bevægelse ------------------------------------------------------- */
  {
    id: 'traening',
    name: 'Træning',
    tagline: 'Skoene på er halvdelen af arbejdet.',
    category: 'traening',
    kind: 'steps',
    emoji: '🏋️',
    props: ['💪', '🔥'],
    xp: 45,
    seconds: 3600,
    featured: true,
    steps: [
      { id: 'toej', text: 'Træningstøj på', seconds: 180, why: 'Tøjet på først. Beslutningen er taget i det øjeblik.' },
      { id: 'ud', text: 'Ud ad døren eller ned på gulvet', after: ['toej'], seconds: 120 },
      { id: 'varm', text: 'Varm op i fem minutter', after: ['ud'], seconds: 300 },
      { id: 'traen', text: 'Træn', after: ['varm'], seconds: 2400 },
      { id: 'straek', text: 'Stræk ud', after: ['traen'], seconds: 300 },
    ],
  },
  {
    id: 'gaatur',
    name: 'En tur udenfor',
    tagline: 'Ti minutter væk, ti minutter hjem.',
    category: 'traening',
    kind: 'steps',
    emoji: '🚶',
    props: ['🌳', '☀️'],
    xp: 25,
    seconds: 1200,
    steps: [
      { id: 'sko', text: 'Sko og jakke på', seconds: 120 },
      { id: 'ud', text: 'Ud ad døren', after: ['sko'], seconds: 30 },
      { id: 'ti', text: 'Gå ti minutter i én retning', after: ['ud'], seconds: 600, why: 'Ti minutter væk. Så er hjemturen ikke en beslutning mere.' },
      { id: 'hjem', text: 'Og hjem igen', after: ['ti'], seconds: 600 },
    ],
  },
  {
    id: 'skridt',
    name: 'Dagens skridt',
    tagline: 'Tæl turene, ikke skridtene.',
    category: 'traening',
    kind: 'count',
    emoji: '👟',
    props: ['📍'],
    xp: 20,
    seconds: 0,
    target: 4,
    targetUnit: 'ture',
    tags: ['vane', 'dagligt'],
  },
  {
    id: 'straek',
    name: 'Stræk ud',
    tagline: 'Fem stræk. Fem minutter.',
    category: 'traening',
    kind: 'steps',
    emoji: '🧘',
    props: ['✨'],
    xp: 15,
    seconds: 300,
    steps: [
      { id: 'nakke', text: 'Nakke og skuldre', seconds: 60 },
      { id: 'ryg', text: 'Ryg', after: ['nakke'], seconds: 60 },
      { id: 'hofte', text: 'Hofter', after: ['ryg'], seconds: 60 },
      { id: 'ben', text: 'Baglår', after: ['hofte'], seconds: 60 },
      { id: 'aande', text: 'Ti dybe vejrtrækninger', after: ['ben'], seconds: 60 },
    ],
  },

  /* --- Hoved & ro ------------------------------------------------------ */
  {
    id: 'pause',
    name: 'Ti minutters pause',
    tagline: 'Uden skærm. Det er hele reglen.',
    category: 'hoved',
    kind: 'steps',
    emoji: '☕',
    props: ['🌿'],
    xp: 15,
    seconds: 600,
    steps: [
      { id: 'vaek', text: 'Læg telefonen i et andet rum', seconds: 30, why: 'I et andet rum. På bordet med skærmen nedad er ikke en pause.' },
      { id: 'rejs', text: 'Rejs dig og gå to minutter', after: ['vaek'], seconds: 120 },
      { id: 'vand', text: 'Et glas vand', after: ['rejs'], seconds: 60 },
      { id: 'sid', text: 'Sid ned uden at lave noget', after: ['vand'], seconds: 300 },
    ],
  },
  {
    id: 'telefon-vaek',
    name: 'Telefonen væk',
    tagline: 'En time. Læg den i en skuffe.',
    category: 'hoved',
    kind: 'tap',
    emoji: '📵',
    props: ['🔕'],
    xp: 20,
    seconds: 0,
    tags: ['fokus', 'skærmtid'],
  },
  {
    id: 'aaben-loekke',
    name: 'Luk en åben løkke',
    tagline: 'Den ene ting du har tænkt på i tre uger.',
    category: 'hoved',
    kind: 'steps',
    emoji: '🧠',
    props: ['🔓', '✅'],
    xp: 40,
    seconds: 900,
    featured: true,
    steps: [
      { id: 'skriv', text: 'Skriv den ned. Præcis som den lyder i hovedet', seconds: 60 },
      { id: 'foerste', text: 'Hvad er det allerførste fysiske skridt?', after: ['skriv'], seconds: 120, why: '"Ringe til tandlægen" er ikke et skridt. "Finde nummeret" er.' },
      { id: 'goer', text: 'Gør kun det ene skridt', after: ['foerste'], seconds: 300 },
      { id: 'naeste', text: 'Skriv det næste skridt ned og stop', after: ['goer'], seconds: 60, why: 'Stop her. Løkken er lukket i dag — resten er i morgen.' },
    ],
  },
  {
    id: 'froeen',
    name: 'Spis frøen',
    tagline: 'Dagens mest irriterende opgave. Først.',
    category: 'hoved',
    kind: 'steps',
    emoji: '🐸',
    props: ['🔥', '✅'],
    xp: 50,
    seconds: 1800,
    featured: true,
    steps: [
      { id: 'vaelg', text: 'Skriv den ned du helst vil undgå', seconds: 60 },
      { id: 'timer', text: 'Sæt fem minutter på uret', after: ['vaelg'], seconds: 20, why: 'Fem minutter. Aftalen er at du må stoppe bagefter — det er derfor du begynder.' },
      { id: 'start', text: 'Begynd', after: ['timer'], seconds: 300 },
      { id: 'fortsaet', text: 'Fortsæt hvis den er i gang', after: ['start'], seconds: 1200 },
    ],
  },
  {
    id: 'fem-min',
    name: 'Fem minutter',
    tagline: 'På noget du har udskudt. Bare fem.',
    category: 'hoved',
    kind: 'count',
    emoji: '⏱️',
    props: ['✨'],
    xp: 18,
    seconds: 300,
    target: 1,
    targetUnit: 'ting',
  },

  /* --- Arbejde & fokus -------------------------------------------------- */
  {
    id: 'start-opgave',
    name: 'Kom i gang',
    tagline: 'Åbn filen. Det er hele målet.',
    category: 'arbejde',
    kind: 'steps',
    emoji: '💻',
    props: ['⚡'],
    xp: 25,
    seconds: 900,
    steps: [
      { id: 'luk', text: 'Luk alt der ikke handler om den', seconds: 60 },
      { id: 'aabn', text: 'Åbn filen eller dokumentet', after: ['luk'], seconds: 30, why: 'Kun åbne. Ikke arbejde. At åbne er der modstanden sidder.' },
      { id: 'linje', text: 'Skriv eller ret én linje', after: ['aabn'], seconds: 120 },
      { id: 'ti', text: 'Bliv siddende i ti minutter', after: ['linje'], seconds: 600 },
    ],
  },
  {
    id: 'afslut-opgave',
    name: 'Gør en opgave færdig',
    tagline: 'Ikke en ny. Den der ligger og er 80% færdig.',
    category: 'arbejde',
    kind: 'steps',
    emoji: '✅',
    props: ['🏁'],
    xp: 40,
    seconds: 1800,
    steps: [
      { id: 'vaelg', text: 'Vælg den der er tættest på færdig', seconds: 120, why: 'Tættest på færdig, ikke vigtigst. Én afsluttet ting vejer mere end tre halve.' },
      { id: 'mangler', text: 'Skriv hvad der mangler', after: ['vaelg'], seconds: 120 },
      { id: 'goer', text: 'Gør det', after: ['mangler'], seconds: 1200 },
      { id: 'send', text: 'Send, gem eller aflever', after: ['goer'], seconds: 180 },
    ],
  },
  {
    id: 'kalender',
    name: 'Tjek kalenderen',
    tagline: 'Tredive sekunder nu, ingen overraskelser i morgen.',
    category: 'arbejde',
    kind: 'tap',
    emoji: '🗓️',
    props: ['👀'],
    xp: 10,
    seconds: 0,
    tags: ['vane', 'dagligt'],
  },
  {
    id: 'plan-i-morgen',
    name: 'Planlæg i morgen',
    tagline: 'Tre ting. Ikke ti.',
    category: 'arbejde',
    kind: 'steps',
    emoji: '📋',
    props: ['✍️'],
    xp: 20,
    seconds: 300,
    steps: [
      { id: 'kalender', text: 'Kig i kalenderen', seconds: 60 },
      { id: 'tre', text: 'Skriv tre ting ned. Kun tre', after: ['kalender'], seconds: 120, why: 'Tre. En liste på ti bliver ikke lavet, den bliver læst med dårlig samvittighed.' },
      { id: 'foerst', text: 'Sæt en stjerne ved den der skal først', after: ['tre'], seconds: 30 },
    ],
  },
  {
    id: 'laese',
    name: 'Læse eller studere',
    tagline: 'Femogtyve minutter. Så pause.',
    category: 'arbejde',
    kind: 'steps',
    emoji: '📚',
    props: ['☕', '🔖'],
    xp: 30,
    seconds: 1500,
    steps: [
      { id: 'sted', text: 'Sæt dig et sted uden skærm', seconds: 60 },
      { id: 'telefon', text: 'Telefonen i en anden lomme', after: ['sted'], seconds: 20 },
      { id: 'laes', text: 'Læs i femogtyve minutter', after: ['telefon'], seconds: 1500 },
    ],
  },
  {
    id: 'skrivebord',
    name: 'Ryd skrivebordet',
    tagline: 'Både det fysiske og det på skærmen.',
    category: 'arbejde',
    kind: 'steps',
    emoji: '🖥️',
    props: ['🗂️', '☕'],
    xp: 25,
    seconds: 600,
    steps: [
      { id: 'kopper', text: 'Alle kopper og glas ud i køkkenet', seconds: 60 },
      { id: 'papir', text: 'Papir i én bunke', after: ['kopper'], seconds: 120 },
      { id: 'kabler', text: 'Kabler samlet', after: ['papir'], seconds: 120 },
      { id: 'faner', text: 'Luk de faner du ikke læser', after: ['kabler'], seconds: 120 },
      { id: 'toer', text: 'Tør bordet af', after: ['faner'], seconds: 60, why: 'Til sidst, når der endelig er et bord at tørre af.' },
    ],
  },
  {
    id: 'filer',
    name: 'Ryd op i filerne',
    tagline: 'Én mappe ad gangen. Ikke hele disken.',
    category: 'arbejde',
    kind: 'count',
    emoji: '🗂️',
    props: ['📸', '💾'],
    xp: 30,
    seconds: 1200,
    target: 20,
    targetUnit: 'filer',
  },

  /* --- Penge & papir ---------------------------------------------------- */
  {
    id: 'regninger',
    name: 'Betal regninger',
    tagline: 'Alle på én gang, så det ikke ligger og larmer.',
    category: 'penge',
    kind: 'steps',
    emoji: '💰',
    props: ['🧾', '✅'],
    xp: 35,
    seconds: 900,
    steps: [
      { id: 'saml', text: 'Saml alt der skal betales', seconds: 180 },
      { id: 'forfald', text: 'Sortér efter forfaldsdato', after: ['saml'], seconds: 120, why: 'Efter dato, ikke beløb. Den der forfalder først koster mest hvis den glemmes.' },
      { id: 'betal', text: 'Betal dem', after: ['forfald'], seconds: 480 },
      { id: 'arkiv', text: 'Gem kvitteringerne ét sted', after: ['betal'], seconds: 120 },
    ],
  },
  {
    id: 'kvitteringer',
    name: 'Ordne kvitteringer',
    tagline: 'Fotografér, sortér, smid væk.',
    category: 'penge',
    kind: 'count',
    emoji: '🧾',
    props: ['📸'],
    xp: 25,
    seconds: 900,
    target: 15,
    targetUnit: 'kvitteringer',
  },
  {
    id: 'tjek-oekonomi',
    name: 'Tjek økonomien',
    tagline: 'To minutter. Ingen regneark.',
    category: 'penge',
    kind: 'tap',
    emoji: '💳',
    props: ['📊'],
    xp: 12,
    seconds: 0,
    tags: ['vane', 'ugentligt'],
  },
  {
    id: 'abonnementer',
    name: 'Afmeld abonnementer',
    tagline: 'De to du ikke har brugt i tre måneder.',
    category: 'penge',
    kind: 'count',
    emoji: '🔄',
    props: ['✂️', '💸'],
    xp: 40,
    seconds: 900,
    target: 2,
    targetUnit: 'abonnementer',
    featured: true,
  },
  {
    id: 'eboks',
    name: 'Tjek e-Boks & post',
    tagline: 'Åbn det. Selv det brune.',
    category: 'penge',
    kind: 'steps',
    emoji: '📬',
    props: ['✉️'],
    xp: 18,
    seconds: 600,
    steps: [
      { id: 'aabn', text: 'Åbn alt uåbnet', seconds: 180, why: 'Alt. Et uåbnet brev fylder mere i hovedet end et åbnet der siger noget kedeligt.' },
      { id: 'tre', text: 'Tre bunker: handling, gem, væk', after: ['aabn'], seconds: 240 },
      { id: 'vaek', text: 'Smid "væk"-bunken ud nu', after: ['tre'], seconds: 60 },
      { id: 'handling', text: 'Skriv handlingerne på din liste', after: ['tre'], seconds: 120 },
    ],
  },

  /* --- Beskeder --------------------------------------------------------- */
  {
    id: 'svar-beskeder',
    name: 'Svar på beskeder',
    tagline: 'Fem stykker. Korte svar tæller.',
    category: 'beskeder',
    kind: 'count',
    emoji: '💬',
    props: ['📱', '⚡'],
    xp: 25,
    seconds: 600,
    target: 5,
    targetUnit: 'beskeder',
    featured: true,
  },
  {
    id: 'svar-mails',
    name: 'Ryd indbakken',
    tagline: 'Under to minutter? Svar nu. Over? Sæt den på listen.',
    category: 'beskeder',
    kind: 'steps',
    emoji: '📧',
    props: ['📥', '✅'],
    xp: 35,
    seconds: 1200,
    steps: [
      { id: 'slet', text: 'Slet alt der ikke skal læses', seconds: 180 },
      { id: 'hurtig', text: 'Svar på alt der tager under to minutter', after: ['slet'], seconds: 480, why: 'Under to minutter: nu. At sætte det på en liste tager længere tid end at svare.' },
      { id: 'liste', text: 'Sæt resten på listen med en dato', after: ['hurtig'], seconds: 300 },
      { id: 'arkiv', text: 'Arkivér det færdige', after: ['liste'], seconds: 180 },
    ],
  },
  {
    id: 'opkald',
    name: 'Tag opkaldet',
    tagline: 'Det ene du har udskudt.',
    category: 'beskeder',
    kind: 'steps',
    emoji: '📞',
    props: ['☎️'],
    xp: 30,
    seconds: 600,
    steps: [
      { id: 'skriv', text: 'Skriv tre punkter du vil sige', seconds: 120, why: 'Tre punkter. Så er det ikke længere et opkald, det er en liste.' },
      { id: 'ring', text: 'Ring', after: ['skriv'], seconds: 300 },
      { id: 'noter', text: 'Skriv ned hvad I aftalte', after: ['ring'], seconds: 120 },
    ],
  },
  {
    id: 'book-tid',
    name: 'Book en tid',
    tagline: 'Læge, tandlæge, frisør. Den du har udskudt længst.',
    category: 'beskeder',
    kind: 'steps',
    emoji: '📅',
    props: ['🦷', '✂️'],
    xp: 35,
    seconds: 600,
    steps: [
      { id: 'nummer', text: 'Find nummeret eller linket', seconds: 120 },
      { id: 'book', text: 'Book', after: ['nummer'], seconds: 300 },
      { id: 'kalender', text: 'I kalenderen med det samme', after: ['book'], seconds: 60, why: 'Med det samme. En tid der kun findes i en sms er en tid der bliver glemt.' },
    ],
  },

  /* --- Ting & steder ---------------------------------------------------- */
  {
    id: 'doom-pile',
    name: 'Doom pile',
    tagline: 'Bunken der har stået siden marts. Fire kasser, ingen femte.',
    category: 'ting',
    kind: 'steps',
    emoji: '📦',
    props: ['🗑️', '♻️'],
    xp: 50,
    seconds: 1800,
    featured: true,
    steps: [
      { id: 'kasser', text: 'Fire kasser: hører til, skraldes, gives væk, ved ikke', seconds: 120 },
      { id: 'sorter', text: 'Alt i bunken ned i en kasse. Uden at tænke', after: ['kasser'], seconds: 900, why: '"Ved ikke" findes netop for at du ikke skal stå og tænke. Læg den i og gå videre.' },
      { id: 'skrald', text: 'Skraldespanden ud nu', after: ['sorter'], seconds: 120 },
      { id: 'hjem', text: '"Hører til" på plads', after: ['sorter'], seconds: 480 },
      { id: 'ved-ikke', text: '"Ved ikke" i en kasse med dato på', after: ['sorter'], seconds: 120, why: 'Dato på. Er den ikke åbnet om et halvt år, ved du svaret.' },
    ],
  },
  {
    id: 'skuffe',
    name: 'Én skuffe',
    tagline: 'Kun én. Det er hele pointen.',
    category: 'ting',
    kind: 'steps',
    emoji: '🗄️',
    props: ['✨'],
    xp: 25,
    seconds: 600,
    steps: [
      { id: 'toem', text: 'Tøm skuffen helt', seconds: 60 },
      { id: 'sorter', text: 'Sortér i beholde og væk', after: ['toem'], seconds: 300 },
      { id: 'toer', text: 'Tør skuffen af', after: ['sorter'], seconds: 60 },
      { id: 'ind', text: 'Læg det tilbage — det du bruger mest forrest', after: ['toer'], seconds: 180 },
    ],
  },
  {
    id: 'kasser',
    name: 'Gamle kasser',
    tagline: 'Åbn dem. Der er sjældent noget i.',
    category: 'ting',
    kind: 'count',
    emoji: '📦',
    props: ['🔍'],
    xp: 35,
    seconds: 1800,
    target: 3,
    targetUnit: 'kasser',
  },
  {
    id: 'noegler',
    name: 'Nøgler & pung på plads',
    tagline: 'Samme sted hver gang. Det er hele systemet.',
    category: 'ting',
    kind: 'tap',
    emoji: '🔑',
    props: ['👛'],
    xp: 8,
    seconds: 0,
    tags: ['vane', 'dagligt'],
  },
  {
    id: 'taske',
    name: 'Pak tasken',
    tagline: 'I aften, ikke i morgen tidlig.',
    category: 'ting',
    kind: 'steps',
    emoji: '🎒',
    props: ['📱', '🔋'],
    xp: 15,
    seconds: 300,
    steps: [
      { id: 'toem', text: 'Tøm den for i dag', seconds: 60 },
      { id: 'pak', text: 'Pak til i morgen', after: ['toem'], seconds: 180 },
      { id: 'doer', text: 'Stil den ved døren', after: ['pak'], seconds: 30, why: 'Ved døren. En pakket taske i soveværelset bliver stadig glemt.' },
    ],
  },
  {
    id: 'fiks',
    name: 'Fiks noget',
    tagline: 'Den løse skruestik. Den pære. Det hængsel.',
    category: 'ting',
    kind: 'steps',
    emoji: '🔧',
    props: ['🔩', '💡'],
    xp: 35,
    seconds: 1200,
    steps: [
      { id: 'vaelg', text: 'Vælg én ting', seconds: 60 },
      { id: 'vaerktoej', text: 'Find værktøjet frem', after: ['vaelg'], seconds: 180 },
      { id: 'fiks', text: 'Fiks den', after: ['vaerktoej'], seconds: 600 },
      { id: 'vaek', text: 'Værktøjet på plads igen', after: ['fiks'], seconds: 120, why: 'Nu. Ellers ligger skruetrækkeren på bordet i tre uger.' },
    ],
  },
  {
    id: 'fyld-op',
    name: 'Fyld op',
    tagline: 'Toiletpapir, sæbe, opvasketabs.',
    category: 'ting',
    kind: 'count',
    emoji: '🧻',
    props: ['🧼', '🫧'],
    xp: 15,
    seconds: 300,
    target: 4,
    targetUnit: 'steder',
  },
  {
    id: 'returner',
    name: 'Returnér pakken',
    tagline: 'Den ligger stadig i entreen.',
    category: 'ting',
    kind: 'steps',
    emoji: '📮',
    props: ['📦'],
    xp: 30,
    seconds: 900,
    steps: [
      { id: 'label', text: 'Print eller hent returlabel', seconds: 300 },
      { id: 'pak', text: 'Pak den', after: ['label'], seconds: 180 },
      { id: 'doer', text: 'Stil den ved døren', after: ['pak'], seconds: 30 },
      { id: 'aflever', text: 'Aflever den', after: ['doer'], seconds: 600 },
    ],
  },

  /* --- Indkøb ----------------------------------------------------------- */
  {
    id: 'indkoebsliste',
    name: 'Lav indkøbslisten',
    tagline: 'Kig i køleskabet først. Ikke i hukommelsen.',
    category: 'indkoeb',
    kind: 'steps',
    emoji: '📝',
    props: ['🥕', '🛒'],
    xp: 20,
    seconds: 600,
    steps: [
      { id: 'koel', text: 'Kig i køleskabet og skabene', seconds: 180, why: 'Kig. Hukommelsen køber en tredje pakke smør.' },
      { id: 'uge', text: 'Hvad skal I spise i ugen?', after: ['koel'], seconds: 180 },
      { id: 'skriv', text: 'Skriv listen i butikkens rækkefølge', after: ['uge'], seconds: 240, why: 'I butikkens rækkefølge. Så går du én vej igennem i stedet for fire.' },
    ],
  },
  {
    id: 'handle-ind',
    name: 'Handle ind',
    tagline: 'Listen i hånden, køl til sidst.',
    category: 'indkoeb',
    kind: 'steps',
    emoji: '🛒',
    props: ['🥦', '🥛'],
    xp: 30,
    seconds: 2400,
    steps: [
      { id: 'liste', text: 'Hav listen fremme', seconds: 60 },
      { id: 'toert', text: 'Tørvarer først', after: ['liste'], seconds: 600 },
      { id: 'koel', text: 'Køl og frost til sidst', after: ['toert'], seconds: 300, why: 'Til sidst. Isen skal ikke stå og smelte mens du vælger pasta.' },
      { id: 'ind', text: 'Alt på plads hjemme — frost først', after: ['koel'], seconds: 600 },
    ],
  },
  {
    id: 'koeb-mangler',
    name: 'Køb det du mangler',
    tagline: 'Den ene ting du har manglet i to uger.',
    category: 'indkoeb',
    kind: 'tap',
    emoji: '🛍️',
    props: ['✅'],
    xp: 15,
    seconds: 0,
  },
  {
    id: 'sortering',
    name: 'Sorter!',
    tagline: 'Ti ting, ti spande. Du lærer noget.',
    category: 'rengoering',
    kind: 'sort',
    emoji: '♻️',
    props: ['🗑️', '📦'],
    xp: 40,
    seconds: 180,
    featured: true,
    tags: ['affald', 'quiz', 'sortering'],
    route: '/sort',
  },
  {
    id: 'sprint',
    name: 'To-minutters sprint',
    tagline: 'Vælg et rum, få tre ting, og et ur der ikke skælder ud.',
    category: 'rengoering',
    kind: 'steps',
    emoji: '⏱️',
    props: ['🧹', '✨'],
    xp: 18,
    seconds: 120,
    featured: true,
    tags: ['hurtig', 'timer', 'sprint'],
    route: '/sprint',
  },
  {
    id: 'udloeb',
    name: 'Udløbsjagt',
    tagline: 'Svirp gennem køleskabet før det bliver til kompost.',
    category: 'koekken',
    kind: 'steps',
    emoji: '⏳',
    props: ['🧊', '🥕'],
    xp: 25,
    seconds: 180,
    featured: true,
    tags: ['køleskab', 'dato', 'mad'],
    route: '/kitchen/expiry',
  },
  {
    id: 'aftensmad',
    name: 'Middagsroulette',
    tagline: 'Drej, og lad køkkenet vælge ud fra det du faktisk har.',
    category: 'koekken',
    kind: 'steps',
    emoji: '🎰',
    props: ['🍳', '🥘'],
    xp: 30,
    seconds: 120,
    featured: true,
    tags: ['aftensmad', 'opskrift', 'roulette'],
    route: '/dinner',
  },
  {
    id: 'stregkode',
    name: 'Scan varen ind',
    tagline: 'Hold kameraet på en stregkode. Resten udfylder sig selv.',
    category: 'koekken',
    kind: 'steps',
    emoji: '📷',
    props: ['🥛', '🧊'],
    xp: 20,
    seconds: 60,
    tags: ['stregkode', 'scan', 'køleskab'],
    route: '/kitchen/scan',
  },
  {
    id: 'spande',
    name: 'Spandene derhjemme',
    tagline: 'Hvilke af de ti har du? Og hvilke mangler du?',
    category: 'rengoering',
    kind: 'steps',
    emoji: '🗑️',
    props: ['♻️', '🏠'],
    xp: 25,
    seconds: 300,
    tags: ['sortering', 'affald', 'kommune'],
    route: '/sort/bins',
  },
];

const GAME_BY_ID = new Map(GAMES.map((g) => [g.id, g]));

export function game(id: string): Game | undefined {
  return GAME_BY_ID.get(id);
}

export function isGame(id: string): boolean {
  return GAME_BY_ID.has(id);
}

export function gamesInCategory(id: CategoryId): Game[] {
  return GAMES.filter((g) => g.category === id);
}

/** Alle emoji kataloget bruger, til at hente kunsten med. */
export function allEmoji(): string[] {
  const set = new Set<string>();
  for (const c of CATEGORIES) set.add(c.emoji);
  for (const g of GAMES) {
    set.add(g.emoji);
    for (const p of g.props ?? []) set.add(p);
  }
  return [...set];
}
