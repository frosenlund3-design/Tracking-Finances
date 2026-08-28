/**
 * Penge til husleje.
 *
 * This is here because she asked, in the middle of a list of ordinary
 * organisational things, "hvordan jeg skal skaffe penge til husleje", and the
 * coach offered to add "Hjælp til at sortere mine taks" as a task. That is the
 * worst thing in this app so far. When somebody puts a sentence like that into
 * a message, it is the sentence that matters, and everything else in the
 * message can wait.
 *
 * Two rules for what is written here.
 *
 * It has to be true and useful in Denmark, today, for somebody who cannot pay
 * the rent. Not "lav et budget". The things a debt adviser would actually say
 * first, in the order they would say them.
 *
 * It has to be sized for an ADHD brain in a panic. Executive function is the
 * first thing to go under acute stress, so this is one call today and a short
 * list for the week, not a plan. Anything longer would be read as another
 * thing she is failing at.
 *
 * Nothing here is financial or legal advice, and it says so. The point is to
 * get her to the people whose job it is, before the deadline rather than after.
 */

export interface CrisisAnswer {
  lines: string[]
  /** Things worth having as real loops, if she wants them. */
  tasks: string[]
  options: string[]
}

/**
 * The rent one.
 *
 * The single most valuable fact in here is the first one, and it is the one
 * nobody knows: talking to the landlord before the due date turns a default
 * into an agreement. Everything downstream of that is easier.
 */
export function rentAnswer(): CrisisAnswer {
  return {
    lines: [
      'Så lægger vi resten. Det her er det, der betyder noget.',
      'Først det vigtigste, og det er ikke det, folk tror: sig det til udlejer, før fristen løber ud. En aftale om at betale i to rater er noget helt andet end en restance, både juridisk og for dem. Skriv det, så I begge har det på skrift.',
      'Og det du nok er mest bange for: du kan ikke sættes ud fra den ene dag til den anden. Der skal først komme et skriftligt påkrav med en frist, og betaler du inden den frist, kan lejemålet ikke ophæves for det beløb. Fristen står i brevet.',
      'Der findes også hjælp, som mange ikke søger, fordi de ikke ved den findes:',
      'Kommunen kan give en enkeltydelse til en rimeligt begrundet enkeltudgift, og husleje kan være det. Det er en vurdering og ikke en ret, men det koster kun en ansøgning at få den vurdering. Søg i borgerservice eller på kommunens side.',
      'Tjek på borger.dk om du får den boligstøtte, du faktisk har ret til. Mange får mindre, end de kunne, fordi tallene ikke er blevet rettet efter en indkomst der har ændret sig.',
      'Gratis gældsrådgivning findes: Forbrugerrådet Tænk, Settlementet, KFUM’s Sociale Arbejde og Røde Kors har den. Det er gratis, fortroligt, og de har set det her tusind gange før.',
      'Og en ting du ikke skal: kviklån. Det flytter problemet en måned og gør det større.',
      'Jeg er ikke rådgiver, og det her er ikke juridisk rådgivning. Men det er den rækkefølge, en rådgiver ville tage det i.',
    ],
    tasks: [
      'Skriv til udlejer om en afdragsordning',
      'Søg enkeltydelse hos kommunen',
      'Tjek min boligstøtte på borger.dk',
      'Book gratis gældsrådgivning',
    ],
    options: ['Læg dem ind som opgaver', 'Hjælp mig med at skrive til udlejer', 'Jeg kan ikke lige nu'],
  }
}

/** A letter she can send today, which is the part that actually stops. */
export function landlordTemplate(): CrisisAnswer {
  return {
    lines: [
      'Så skriver vi den. Du skal ikke forklare dig, og du skal ikke undskylde. Kort er bedre.',
      'Kopiér det her og ret navn og beløb:',
      '"Hej [navn]. Jeg kan desværre ikke betale hele huslejen for [måned] til tiden. Jeg kan betale [beløb] den [dato] og resten den [dato]. Jeg vil gerne aftale det med jer på forhånd frem for at komme bagud. Venlig hilsen [dit navn], [adresse]."',
      'Tre linjer. Ingen forklaring på hvorfor, den skylder du ikke nogen.',
      'Send den skriftligt, også hvis du også ringer. Så findes aftalen.',
    ],
    tasks: ['Send beskeden til udlejer'],
    options: ['Læg den ind som opgave', 'Tak', 'Hvad hvis de siger nej?'],
  }
}

/** What happens if the landlord refuses. Asked often, and rarely answered. */
export function landlordRefused(): CrisisAnswer {
  return {
    lines: [
      'Så er det ikke slut, det er bare næste skridt.',
      'Kommunen er stadig der. En enkeltydelse kan søges, uanset hvad udlejer siger, og et afslag fra udlejer gør ikke ansøgningen svagere.',
      'Får du et påkrav, så læs kun to ting i brevet: beløbet og fristen. Resten kan vente.',
      'Og ring til en gratis gældsrådgivning samme dag. De kan tale med udlejer på dine vegne, og det er en helt anden samtale, når det ikke er dig, der skal føre den.',
    ],
    tasks: ['Ring til gratis gældsrådgivning'],
    options: ['Læg den ind', 'Okay'],
  }
}

/** Any money question that is not the rent. */
export function moneyAnswer(): CrisisAnswer {
  return {
    lines: [
      'Penge er et af de steder, hvor det ikke er opgaven, der er tung. Det er, hvad du kan komme til at se undervejs.',
      'Så vi kigger ikke på det hele. Ét tal ad gangen.',
      'Hvad er det, der haster? En regning med en dato, eller en fornemmelse af at det hele skrider?',
    ],
    tasks: [],
    options: ['En regning med en dato', 'Det hele skrider', 'Jeg skal skaffe penge'],
  }
}
