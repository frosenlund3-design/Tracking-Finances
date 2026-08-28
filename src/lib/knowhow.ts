/**
 * Practical knowledge about Danish everyday admin.
 *
 * The step generator says what to do. This says what you need in your hand
 * before you start, where the thing actually lives, what normally goes wrong,
 * and when you are allowed to call it finished. It exists because that is what
 * a person actually asks when they are standing in front of a task and cannot
 * start: not "what are the steps", but "hvad skal jeg bruge", "hvor er det
 * henne", "hvad nu hvis de ikke svarer".
 *
 * Two rules for everything written here.
 *
 * 1. It has to be true and stay true. Prices and rates change, so they are not
 *    in here. What is in here is the shape of the thing: which login, which
 *    document, which website, which order. Where a number really is fixed in
 *    Danish law it is stated, and where it varies it says so.
 * 2. It has to be specific enough to act on. "Find de nødvendige papirer" is
 *    not knowledge, it is the same wall with different words.
 */

import { analyse, type Analysis } from './language'

export interface KnowHow {
  id: string
  /** What you must physically have in front of you before starting. */
  need?: string
  /** Where it actually happens. */
  where?: string
  /** The route through, in one or two sentences. */
  how?: string
  /** Timing that is outside your control. */
  timing?: string
  /** The thing that usually derails it, and what to do about it. */
  snag?: string
  /** What counts as finished, so it can end. */
  done?: string
  /** Why it is worth doing, when that is not obvious. */
  stakes?: string
}

interface Entry extends KnowHow {
  test: (a: Analysis, full: string) => boolean
}

const KNOWLEDGE: Entry[] = [
  {
    id: 'skat',
    test: (_a, full) => /\b(skat|skat\.dk|[åa]rsopg[øo]relse[\wæøåÆØÅ]*|forskudsopg[øo]relse[\wæøåÆØÅ]*|selvangivelse[\wæøåÆØÅ]*|fradrag[\wæøåÆØÅ]*)\b/i.test(full),
    need: 'MitID, og de tal du skal rette efter: lønsedler, renter, kørsel, fagforening eller a-kasse.',
    where: 'skat.dk. Log ind øverst til højre, så ligger både forskudsopgørelsen og årsopgørelsen på forsiden.',
    how: 'Forskudsopgørelsen er dit gæt på næste år og kan rettes hele året. Årsopgørelsen er facit for året, der gik. Ret det ene felt, du kom for, og lad resten stå.',
    timing: 'Årsopgørelsen kommer i marts. Forskudsopgørelsen for næste år kommer i november.',
    snag: 'MitID ligger på den samme telefon, som du logger ind fra, og det er der, folk falder ud. Brug en computer, eller hav telefonen klar til at skifte frem og tilbage én gang.',
    done: 'Du har logget ind og set tallene. Det er nok. Rettelserne kan tages en anden dag.',
    stakes: 'Et forkert felt i forskudsopgørelsen bliver til restskat et år senere, hvor du har glemt hvorfor.',
  },
  {
    id: 'boligstøtte',
    test: (_a, full) => /\bboligst[øo]tte[\wæøåÆØÅ]*|\bboligsikring[\wæøåÆØÅ]*|\bboligydelse[\wæøåÆØÅ]*|udbetaling danmark/i.test(full),
    need: 'MitID, din lejekontrakt, huslejens størrelse, boligens kvadratmeter og antal værelser, og hvem der bor der.',
    where: 'borger.dk. Søg på boligstøtte, så bliver du sendt videre til Udbetaling Danmark.',
    how: 'Ansøgningen gemmer sig selv undervejs, så du kan gå fra den og komme tilbage. Du behøver ikke gøre det færdigt i én omgang.',
    snag: 'Kvadratmeter og antal værelser står i lejekontrakten, og det er dem, folk går i stå på. Find kontrakten frem først, så er resten udfyldning.',
    done: 'Ansøgningen er sendt. Svaret kommer i din digitale post og skal ikke jages.',
  },
  {
    id: 'eboks',
    test: (_a, full) => /\be-?boks\b|\bmit\.dk\b|digital post|\bpost fra det offentlige\b/i.test(full),
    need: 'MitID.',
    where: 'e-Boks eller mit.dk, i appen eller i browseren.',
    how: 'Åbn alt uden at læse det. Sortér i tre: skal betales, skal besvares, kan lukkes. Først derefter læser du.',
    snag: 'Digital post regnes for modtaget, når den er sendt, også hvis du ikke har åbnet den. Det er derfor et ulæst brev kan blive til en rykker.',
    done: 'Alt er åbnet og sorteret. Du skal ikke handle på noget i samme omgang.',
  },
  {
    id: 'syn',
    test: (_a, full) => /\bsyn(?:et|shal[\wæøåÆØÅ]*)?\b|\bbilsyn[\wæøåÆØÅ]*|\bomsyn[\wæøåÆØÅ]*/i.test(full),
    need: 'Nummerpladen. Registreringsattesten skal ligge i bilen, men de fleste synshaller slår bilen op på nummerpladen.',
    where: 'En synshal. De fleste kan bookes online, og der er som regel flere at vælge imellem i samme by.',
    how: 'Book tiden, kør derhen, vent i venteområdet. Selve synet tager typisk en halv time.',
    timing: 'Fristen står i din digitale post og i Motorregisteret. Book i god tid, tiderne fyldes op.',
    snag: 'Går den ikke igennem, får du en frist til omsyn, og omsyn er billigere end et helt nyt syn, hvis du overholder den. Så tag omsynet, mens fristen løber.',
    done: 'Tiden er booket og står i kalenderen. Resten er noget, du bare møder op til.',
  },
  {
    id: 'læge',
    test: (_a, full) => /\bl[æa]ge[\wæøåÆØÅ]*|\bpraktiserende\b|\bsundhed\.dk\b|\bhenvisning[\wæøåÆØÅ]*|\bblodpr[øo]ve[\wæøåÆØÅ]*|\bpr[øo]vesvar[\wæøåÆØÅ]*/i.test(full),
    need: 'Dit sundhedskort eller MitID, og én sætning om hvad det handler om.',
    where: 'Klinikkens egen hjemmeside eller app. Mange bruger Min Læge. Ellers sundhed.dk.',
    how: 'Skriv en e-konsultation i stedet for at ringe, hvis det ikke haster. Den bliver besvaret, og du slipper for telefontiden.',
    timing: 'Telefontid er hos de fleste klinikker om morgenen, typisk mellem 8 og 9. Akutte ting skal ringes ind, ikke skrives.',
    snag: 'Prøvesvar ligger som regel på sundhed.dk, før klinikken ringer. Du må gerne kigge selv.',
    done: 'Beskeden er sendt eller tiden er booket. Svaret er ikke din opgave.',
  },
  {
    id: 'apotek',
    test: (_a, full) => /\bapotek[\wæøåÆØÅ]*|\brecept[\wæøåÆØÅ]*|\bmedicin[\wæøåÆØÅ]*/i.test(full),
    need: 'Sundhedskortet, eller bare MitID hvis du henter det digitalt.',
    where: 'Apoteket, eller apotekets hjemmeside hvis det skal sendes.',
    how: 'Recepten ligger digitalt. Du skal ikke have en seddel med, kun kortet.',
    snag: 'Er recepten udløbet, skal lægen forny den, og det er en e-konsultation, ikke et besøg.',
    done: 'Medicinen er hentet eller bestilt.',
  },
  {
    id: 'pakke',
    test: (_a, full) => /\bpakke[nr]?\b|\bpakkeshop[\wæøåÆØÅ]*|\bposthus[\wæøåÆØÅ]*|\bpostnord\b|\bgls\b|\bdao\b|\breturner[\wæøåÆØÅ]*|\bretur\b/i.test(full),
    need: 'Pakken, og koden eller stregkoden fra sms’en eller appen. Til returnering: returlabelen, printet eller som QR-kode.',
    where: 'Pakkeshoppen på kvitteringen eller i appen. Det er ikke altid den nærmeste.',
    how: 'Har du ikke en printer, kan de fleste pakkeshops printe labelen fra QR-koden på din telefon.',
    timing: 'Pakker bliver sendt retur efter et antal dage. Datoen står i sms’en.',
    snag: 'Returfrister på køb er som regel 14 dage fra modtagelsen, men det er sælgerens regler, ikke postens. Tjek mailen fra butikken, ikke fra fragtfirmaet.',
    done: 'Pakken er afleveret, og du har kvitteringen på telefonen.',
  },
  {
    id: 'regning',
    test: (_a, full) => /\bregning[\wæøåÆØÅ]*|\bbetal[\wæøåÆØÅ]*|\brykker[\wæøåÆØÅ]*|\bnetbank[\wæøåÆØÅ]*|\bgiro\b|\bfi-?kode\b|\bindbetalingskort\b/i.test(full),
    need: 'Regningen med beløb og betalingsoplysninger, og din netbank eller MobilePay.',
    where: 'Netbanken. Under indbetalingskort skal du bruge kortart, kreditornummer og FI-kode, og alle tre står på selve regningen.',
    how: 'Mange regninger kan sættes til Betalingsservice, mens du alligevel har den åben. Så er det den sidste gang, du gør det manuelt.',
    snag: 'Kig ikke på saldoen undervejs. Åbn den ene regning, betal den, luk igen.',
    done: 'Betalingen er godkendt. Kvitteringen ligger i netbanken, du behøver ikke gemme papiret.',
    stakes: 'En ubetalt regning bliver til en rykker med gebyr, og det er gebyret, ikke regningen, der gør ondt.',
  },
  {
    id: 'opsigelse',
    test: (_a, full) => /\bops[iy]g[\wæøåÆØÅ]*|\babonnement[\wæøåÆØÅ]*|\bmedlemskab[\wæøåÆØÅ]*|\bfitness[\wæøåÆØÅ]*|\bstreaming[\wæøåÆØÅ]*/i.test(full),
    need: 'Dit kunde- eller aftalenummer, og en skriftlig kanal.',
    where: 'Selskabets egen side, under Min side eller Kundeservice. Opsig aldrig kun over telefonen.',
    how: 'Skriv det kort: navn, kundenummer, “jeg opsiger min aftale”, og dags dato.',
    timing: 'De fleste abonnementer har et opsigelsesvarsel, typisk løbende måned plus en måned. Det står i aftalen, og det betyder, at du betaler et stykke tid endnu.',
    snag: 'Gem bekræftelsen. Uden den er der ingen opsigelse, uanset hvad du har sagt til hvem.',
    done: 'Bekræftelsen er modtaget og gemt.',
  },
  {
    id: 'forsikring',
    test: (_a, full) => /\bforsikring[\wæøåÆØÅ]*|\bskadesanmeldelse[\wæøåÆØÅ]*|\bskade\b|\bpolice[\wæøåÆØÅ]*/i.test(full),
    need: 'Policenummeret, datoen for det der skete, og billeder hvis der er noget at fotografere.',
    where: 'Selskabets app eller hjemmeside. Anmeldelse online går hurtigere end telefonen.',
    how: 'Skriv hvad der skete i tre linjer, uden at vurdere om det er dækket. Det er deres arbejde, ikke dit.',
    snag: 'Anmeld hellere for hurtigt end for sent. Mange selskaber har frister, og en anmeldelse kan altid trækkes tilbage.',
    done: 'Anmeldelsen er sendt, og du har sagsnummeret.',
  },
  {
    id: 'flytning',
    test: (_a, full) => /\bflytte[\wæøåÆØÅ]*|\bflytning[\wæøåÆØÅ]*|\badresse[æa]ndring[\wæøåÆØÅ]*|\bny adresse\b/i.test(full),
    need: 'MitID og den nye adresse med flyttedato.',
    where: 'borger.dk.',
    timing: 'Flytning skal meldes tidligst fire uger før og senest fem dage efter, du er flyttet. Det er en frist, ikke en anbefaling.',
    how: 'Når adressen er meldt, følger folkeregister, læge og digital post automatisk med. Bank, forsikring og abonnementer gør ikke.',
    snag: 'Postomdeling flytter ikke af sig selv. Bestil eftersendelse separat, hvis du vil have papirpost med.',
    done: 'Flytningen er meldt på borger.dk.',
  },
  {
    id: 'jobansøgning',
    test: (_a, full) => /\bans[øo]gning[\wæøåÆØÅ]*|\bjobans[øo]g[\wæøåÆØÅ]*|\bcv\b|\bjobopslag[\wæøåÆØÅ]*/i.test(full),
    need: 'Opslaget, dit CV, og et tomt dokument.',
    how: 'Skriv de tre ting fra opslaget, de tydeligvis går efter. Skriv en linje til hver, om hvad du har gjort. Det er ansøgningen. Indledningen skriver du til sidst.',
    snag: 'Den bliver ikke bedre af flere gennemlæsninger efter den tredje. Sæt en grænse på forhånd.',
    done: 'Sendt. Ikke perfekt, sendt.',
  },
  {
    id: 'eksamen',
    test: (_a, full) => /\beksamen[\wæøåÆØÅ]*|\bpr[øo]ve\b|\baflevering[\wæøåÆØÅ]*|\bopgave[\wæøåÆØÅ]*\s+skal afleveres/i.test(full),
    need: 'Datoen, stedet, og hvad der er tilladt at have med.',
    how: 'Læg de tre ting i kalenderen hver for sig: forberedelsen, transporten og selve tiden. Det er transporten, der plejer at blive glemt.',
    snag: 'Tjek reglerne for hjælpemidler i god tid, ikke aftenen før.',
    done: 'Tid, sted og transport står i kalenderen.',
  },
  {
    id: 'oprydning',
    test: (a, full) => /\bryd[\wæøåÆØÅ]*|\boprydning[\wæøåÆØÅ]*|\brod\b|\breng[øo]r[\wæøåÆØÅ]*|\bst[øo]vsug[\wæøåÆØÅ]*/i.test(full) || a.verb === 'ryd',
    need: 'En pose til skrald, en kasse til det der skal et andet sted hen, og en timer.',
    how: 'Én overflade ad gangen, ikke ét rum. Alt der ikke hører til, ryger i kassen uden at blive vurderet. Kassen tømmer du en anden dag.',
    snag: 'Oprydning har ingen slutning i sig selv, og det er derfor den ikke starter. Timeren er slutningen.',
    done: 'Timeren ringede. Så er du færdig, uanset hvordan der ser ud.',
  },
  {
    id: 'vasketøj',
    test: (_a, full) => /\bvasket[øo]j\b|\bvaskemaskin[\wæøåÆØÅ]*|\bvaske?\s+t[øo]j\b|\bt[øo]rretumbler[\wæøåÆØÅ]*/i.test(full),
    need: 'Vaskemiddel, og en maskine der er tom.',
    how: 'Sortér ikke i dag. Tag den største bunke, fyld maskinen, tryk start.',
    snag: 'Det er ikke vasken, der går galt, det er de fire timer, hvor tøjet ligger vådt. Sæt en påmindelse, når du trykker start.',
    done: 'Maskinen kører, og påmindelsen er sat.',
  },
  {
    id: 'mitid',
    test: (_a, full) => /\bmitid\b|\bnemid\b/i.test(full),
    need: 'Telefonen med MitID-appen, og din pinkode.',
    snag: 'Skal du logge ind på den samme telefon, som appen ligger på, springer browseren over i appen og tilbage igen. Det virker, men det ser ud som om, du er faldet ud.',
    where: 'MitID-appen. Kodeviseren og appen er to forskellige ting, og de kan ikke bruges i flæng.',
  },
  {
    id: 'bank',
    test: (_a, full) => /\bbank[\wæøåÆØÅ]*|\bl[åa]n\b|\brente[\wæøåÆØÅ]*|\bafdrag[\wæøåÆØÅ]*|\brealkredit[\wæøåÆØÅ]*|\bkonto\b/i.test(full),
    need: 'Kontonummer eller lånenummer, og én sætning om hvad du vil vide.',
    where: 'Netbankens beskedfunktion. Den er skriftlig, den er dokumenteret, og der er ingen ventetid.',
    how: 'Skriv spørgsmålet, før du beslutter om du ringer. Halvdelen af opkaldet er at finde ud af, hvad man vil spørge om.',
    snag: 'Rådgiveren ringer tilbage på et tidspunkt, du ikke vælger. Skriftligt slipper du for at skulle være klar.',
    done: 'Spørgsmålet er stillet. Svaret er ikke din opgave.',
  },
  {
    id: 'tandlæge',
    test: (_a, full) => /\btandl[æa]ge[\wæøåÆØÅ]*|\btandpine\b|\btandrens[\wæøåÆØÅ]*/i.test(full),
    need: 'Klinikkens nummer eller bookingside, og to dage der kunne passe.',
    where: 'De fleste klinikker har online booking. Tjek deres side, før du ringer.',
    timing: 'Tandpine og hævelse er akut og skal ringes ind samme dag, ikke bookes online.',
    done: 'Tiden står i kalenderen.',
  },
]

/** What the app knows about this task, beyond its steps. */
export function knowHowFor(title: string): KnowHow | null {
  const t = title.trim()
  if (!t) return null
  const a = analyse(t)
  for (const entry of KNOWLEDGE) {
    if (entry.test(a, t)) return entry
  }
  return null
}

export function hasKnowHow(title: string): boolean {
  return knowHowFor(title) !== null
}
