/**
 * What the coach actually knows.
 *
 * Written for someone who has already read the popular material. The bar for
 * every entry is: would a well-informed adult with ADHD find this *new*, or at
 * least a sharper framing than the one they carry? "Break it into smaller
 * steps" fails that bar. "The wall you hit is emotional residue from previous
 * attempts, and it sits in front of the task rather than in it" passes.
 *
 * Each entry separates the *insight* from the *move*, because giving advice
 * before naming the mechanism is how a coach ends up sounding like a poster in
 * a waiting room. Name the thing, then say what follows from it.
 *
 * Nothing here diagnoses anything, and nothing here contradicts her. Where the
 * research is genuinely contested, the entry says so rather than picking a
 * side and sounding certain.
 */

export interface Concept {
  id: string
  /** What in her message or data brings this up. */
  triggers: RegExp
  /** The mechanism, named precisely. One or two sentences. */
  insight: string
  /** What follows from it, concretely. */
  move: string
  /** Only offered when she has said this applies to her. */
  requires?: string[]
  /** Higher wins when several match. */
  weight: number
}

export const CONCEPTS: Concept[] = [
  {
    id: 'wall-of-awful',
    triggers: /\b(kan ikke|orker ikke|undg[åa]r|udsat|udsætter|ligget|ulækkert|blokeret|væmmes|væmmelig)\b/i,
    insight:
      'Det, der står foran opgaven, er sjældent opgaven. Det er laget af tidligere gange, hvor den gik skævt — hver udsættelse lægger en mursten. Derfor føles en femminutters ting tungere end en time, du aldrig har fejlet i.',
    move:
      'Muren skal ikke igennem, den skal rundt om. Gør det til en helt anden opgave end den, du har fejlet i før: ring til et andet nummer, skriv i stedet for at ringe, eller lad en anden trykke send.',
    weight: 90,
  },
  {
    id: 'four-motivators',
    triggers: /\b(kedelig|gider ikke|ligegyldig|uinteressant|ingen motivation|kan ikke tage mig sammen)\b/i,
    insight:
      'Din opmærksomhed styres ikke af vigtighed. Den styres af interesse, nyhed, konkurrence og hastende pres — og hvis ingen af de fire er til stede, findes opgaven nærmest ikke, uanset hvor meget du ved den betyder.',
    move:
      'Spørgsmålet er ikke hvordan du tvinger dig selv. Det er hvilken af de fire du kan låne: en makker på telefonen, en timer der er lidt for kort, eller at gøre den bevidst dårligt for at se hvad der sker.',
    weight: 85,
  },
  {
    id: 'transitions',
    triggers: /\b(skifte|afbrudt|midt i|glemte hvor|kan ikke stoppe|kommer ikke videre|hænger fast)\b/i,
    insight:
      'Det dyre er ikke at arbejde, og heller ikke at starte. Det er overgangen — at slippe én tilstand og gå ind i en anden. Derfor er både det at komme i gang og det at stoppe svært, og det er den samme mekanisme begge veje.',
    move:
      'Læg en bro i stedet for et spring: skriv den næste sætning ned, før du stopper, så du starter midt i noget i stedet for foran noget.',
    weight: 80,
  },
  {
    id: 'monotropism',
    triggers: /\b(hyperfokus|fordybelse|forstyrret|afbryd|kan ikke slippe|dybt inde)\b/i,
    requires: ['autisme', 'asperger', 'autistiske træk'],
    insight:
      'Når opmærksomheden er monotropisk, er den ikke bare rettet ét sted — den er et sted. En afbrydelse koster ikke sekunder, den koster hele opbygningen, og kroppen reagerer på afbrydelsen som på et tab.',
    move:
      'Beskyt indgangen frem for at forkorte tiden: aftal på forhånd hvornår du er tilgængelig igen, i stedet for at prøve at arbejde i korte stykker.',
    weight: 88,
  },
  {
    id: 'demand-avoidance',
    triggers: /\b(skal ikke|nægter|modstand|presser|tvang|krav|burde|pligt)\b/i,
    insight:
      'Nogle gange er modstanden ikke mod opgaven, men mod at den er et krav. Så er det ikke motivation, der mangler — det er selvbestemmelse, og enhver opfordring gør det værre, også dine egne.',
    move:
      'Giv valget tilbage: to muligheder, hvor den ene er "ikke i dag". Et ægte valg fjerner det, der bliver kæmpet imod.',
    weight: 82,
  },
  {
    id: 'perfectionism-is-evaluation',
    triggers: /\b(perfekt|godt nok|rigtigt|forkert|fejl|flov|dumme|d[åa]rligt)\b/i,
    insight:
      'Perfektionisme her handler sjældent om at ville have et flot resultat. Den handler om at udskyde det øjeblik, hvor noget kan bedømmes — så længe det ikke er færdigt, er det ikke blevet vurderet.',
    move:
      'Lav den version, der aldrig skal ses af nogen. Ikke et udkast, du senere gør pænt — en udgave, der er aftalt at være til skraldespanden.',
    weight: 84,
  },
  {
    id: 'rsd',
    triggers: /\b(afvist|kritik|sagde noget|s[åa]ret|pinligt|de synes|dømmer|skuffe)\b/i,
    insight:
      'Reaktionen på det, der ligner afvisning, kommer før tanken om det. Det er ikke en overreaktion, du kan tale dig fra — den er i gang, inden du når at vurdere om den passer.',
    move:
      'Behandl den som en bølge, ikke som information: udsæt enhver beslutning, der er truffet i den, til i morgen. Bølgen har ingen holdning i morgen.',
    weight: 86,
  },
  {
    id: 'interoception',
    triggers: /\b(tr[æa]t|udkørt|crash|kollaps|glemt at spise|hovedpine|udmattet|for meget)\b/i,
    insight:
      'Signalerne om sult, træthed og for meget input kommer ofte først, når de er kritiske. Det er ikke manglende disciplin — det er, at måleren først lyser, når tanken er tom.',
    move:
      'Sæt uret i stedet for at mærke efter. Kroppen melder for sent, og et tidspunkt er mere pålideligt end en fornemmelse.',
    weight: 78,
  },
  {
    id: 'time-blindness',
    triggers: /\b(tid|for sent|glemte tiden|to minutter|hvor lang tid|nåede ikke)\b/i,
    insight:
      'Tid opleves som nu og ikke-nu, uden meget imellem. Derfor er problemet sjældent at huske en aftale, men at fornemme afstanden til den — og en aftale, der ikke er nu, er reelt ikke til stede.',
    move:
      'Gør tiden synlig frem for husket: et ur der kører, eller en ting du kan se. Appen måler i øvrigt selv, hvor lang tid dine opgaver faktisk tager, og retter tallene efter dig.',
    weight: 76,
  },
  {
    id: 'externalise',
    triggers: /\b(glemmer|husker ikke|falder ud af hovedet|mister overblik)\b/i,
    insight:
      'Arbejdshukommelsen holder færre ting ad gangen, og de ting den holder, koster hele tiden strøm. Det, du går og husker på, er ikke gemt — det bliver holdt oppe.',
    move:
      'Alt der skal huskes, skal ud af hovedet og ind et sted, du falder over det. Ikke fordi du glemmer det, men fordi det koster at holde på det.',
    weight: 74,
  },
  {
    id: 'reward-flatness',
    triggers: /\b(f[øo]les tomt|ingen glæde|ligegyldigt bagefter|ikke stolt|mærker ikke)\b/i,
    insight:
      'At blive færdig giver ofte ikke det, det burde. Belønningssystemet reagerer kraftigt på det, der er ved at ske, og svagt på det, der er sket — så indsatsen føles stor og afslutningen flad.',
    move:
      'Læg belønningen ved starten i stedet for ved målstregen. Det er også derfor, appen giver point for at gå i gang.',
    weight: 70,
  },
  {
    id: 'sleep-phase',
    triggers: /\b(kan ikke sove|for sent i seng|nat|morgen er umulig|hverken op eller i seng)\b/i,
    insight:
      'Døgnrytmen er hos mange med ADHD forskudt biologisk, ikke vanemæssigt. Aftenen er tit den første tid på dagen, hvor hovedet er stille nok til at man kan noget — og det er derfor, den er svær at give slip på.',
    move:
      'Flyt det, du gerne vil have gjort, ind i aftentimerne i stedet for at kæmpe om morgenen. Det er lettere at flytte opgaven end at flytte rytmen.',
    weight: 72,
  },
  {
    id: 'body-double',
    triggers: /\b(alene|sammen med|nogen der|selskab|kan ikke selv)\b/i,
    insight:
      'Når en anden er til stede, låner du ydre struktur, som du ellers selv skal producere. Det virker også, når personen ikke gør noget som helst — det er tilstedeværelsen, ikke hjælpen.',
    move: 'Brug det bevidst frem for at vente på det: en video, et opkald der bare er åbent, eller den her app der bliver hos dig.',
    weight: 68,
  },
]

/** Concepts that only apply when she has told the app they do. */
export function conceptsFor(
  text: string,
  self: { diagnoses: string[]; challenges: string[]; freeText?: string } | undefined,
): Concept[] {
  // Free text counts too: if she wrote "autistiske træk" in the open field
  // rather than ticking a chip, that is still her telling us.
  const said = [...(self?.diagnoses ?? []), ...(self?.challenges ?? []), self?.freeText ?? '']
    .join(' ')
    .toLowerCase()
  const scored = CONCEPTS.filter((c) => {
    if (!c.triggers.test(text)) return false
    if (c.requires && !c.requires.some((r) => said.includes(r.toLowerCase()))) return false
    return true
  }).map((c) => ({ c, hits: countMatches(text, c.triggers), gated: c.requires ? 1 : 0 }))

  // Ranking, in order:
  //  1. A concept she has told us applies to her beats a general one. It was
  //     unlocked by something she wrote on her profile, so it is about her.
  //  2. Then how much of the message it actually explains. "Kan ikke slippe det
  //     jeg laver når nogen afbryder mig" matches the wall of awful on the two
  //     words "kan ikke", and monotropy on three phrases — and monotropy is
  //     plainly what she is describing. Weight alone picked the wrong one.
  //  3. Then the standing weight, as a tie-break.
  return scored
    .sort((a, b) => b.gated - a.gated || b.hits - a.hits || b.c.weight - a.c.weight)
    .map((x) => x.c)
}

/** How many distinct trigger phrases the message hits. */
function countMatches(text: string, triggers: RegExp): number {
  const global = new RegExp(triggers.source, triggers.flags.includes('g') ? triggers.flags : `${triggers.flags}g`)
  return (text.match(global) ?? []).length
}

/**
 * Spørgsmål i stedet for råd.
 *
 * Til den, der allerede kender hele katalogget af gode råd. Et råd hun kan
 * remse op i søvne er ikke hjælp — det er støj, og det koster tillid. Et
 * spørgsmål hun ikke har stillet sig selv gør arbejdet.
 *
 * De er skrevet, så de aldrig sætter spørgsmålstegn ved, om det er svært.
 * De spørger ind til *hvilken slags* svært.
 */
export const PROBES: string[] = [
  'Hvad er det præcise sekund, hvor du plejer at falde fra? Ikke opgaven — sekundet.',
  'Hvis den her opgave var færdig i morgen tidlig, hvad ville så være anderledes i din dag? Hvis svaret er “ikke noget”, er det måske derfor, den ikke sker.',
  'Er det at gå i gang, der er tungt, eller er det at skulle stoppe igen bagefter?',
  'Hvem ville se resultatet? Der plejer at ligge noget der.',
  'Har du prøvet den her før og fejlet? Så er det ikke den samme opgave længere — så er det opgaven plus historien.',
  'Hvad ved du allerede virker for dig, som du bare ikke gør lige nu?',
  'Er det uklart hvad du skal, eller er det helt klart og alligevel umuligt? De to skal løses vidt forskelligt.',
  'Hvad ville du sige til en, du holder af, som sad med præcis det her?',
  'Hvornår på dagen har den her opgave sidst været realistisk? Ikke i teorien — faktisk.',
  'Er der noget, du er bange for at finde ud af, hvis du åbner den?',
]
