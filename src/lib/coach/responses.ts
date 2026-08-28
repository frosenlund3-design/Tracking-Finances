import type { Strategy, Tone } from './types'

/**
 * Variation banks.
 *
 * Every strategy has several phrasings per tone so the coach does not feel
 * like a macro. Lines are deliberately short, 1 to 4 of them, never an essay.
 * The `{task}` and `{step}` slots are filled by the engine.
 */

type Bank = Partial<Record<Tone, string[][]>> & { default: string[][] }

export const RESPONSES: Record<Strategy, Bank> = {
  'micro-step': {
    default: [
      ['Okay. Vi dropper "{task}" 😌', 'Din eneste opgave lige nu: {step}', 'Skriv "der" når du har gjort det.'],
      ['Vi gør den latterligt nem.', 'Kun det her: {step}', 'Resten findes ikke lige nu.'],
      ['Glem hele opgaven.', '{step}', 'Det er alt.'],
    ],
    blunt: [
      ['Ikke hele "{task}". Kun: {step}'],
      ['{step}. Så stopper vi.'],
    ],
    warm: [
      ['Det er helt fint, at den føles for stor 💛', 'Prøv kun det her: {step}'],
      ['Vi tager det mindste stykke.', '{step}', 'Du behøver ikke mere end det.'],
    ],
    humor: [
      ['"{task}" er officielt aflyst 🙃', 'Erstattet af: {step}'],
      ['Vi snyder hjernen.', 'Kun {step}. Den opdager det ikke.'],
    ],
    peptalk: [
      ['Du kan det her.', 'Start med: {step}', 'Det er hele opgaven lige nu.'],
    ],
  },

  'five-second-launch': {
    default: [
      ['Vi tæller ned fra 5.', 'Når vi rammer 1, rejser du dig.', 'Ikke andet.'],
      ['5 sekunder. Så bevæger kroppen sig.', 'Ikke fordi du har lyst. Bare fordi vi tæller.'],
    ],
    blunt: [['5-4-3-2-1. Rejs dig.']],
    warm: [['Vi laver en lille start sammen.', 'Fem sekunder, så rejser du dig. Det er alt.']],
    humor: [['Raketopsendelse om 5 sekunder 🚀', 'Du er raketten. Beklager.']],
    peptalk: [['Fem sekunder og du er i gang!', 'Klar? Vi tæller.']],
  },

  'body-doubling': {
    default: [
      ['Jeg bliver her imens.', 'Din eneste opgave: {step}', 'Sig til når den er gjort.'],
      ['Vi gør det sammen.', 'Jeg venter her. {step}'],
    ],
    warm: [['Jeg går ingen steder 💛', 'Tag {step} i dit eget tempo.']],
    blunt: [['Jeg venter. {step}. Sig til.']],
    humor: [['Jeg sidder her og kigger på dig (venligt).', '{step}. Jeg holder øje 👀']],
    peptalk: [['Jeg er her hele vejen!', '{step}, så siger du til.']],
  },

  'reduce-scope': {
    default: [
      ['Vi skærer den ned.', 'Ikke hele "{task}". Bare 20% af den.', 'Så er du færdig.'],
      ['Den er for stor lige nu.', 'Lav den halvt. Det tæller fuldt ud.'],
    ],
    warm: [['Du skal ikke lave det hele.', 'Lav en lille del af "{task}", så er den gjort for i dag.']],
    blunt: [['Halvér den. "{task}" behøver ikke være færdig.']],
    humor: [['"{task}" har lige fået en rabat på 80% 🏷️']],
    peptalk: [['En lille bid af "{task}" er stadig en sejr!']],
  },

  'remove-perfectionism': {
    default: [
      ['Den behøver ikke være god.', 'Den skal bare være gjort.', 'Grim version tæller.'],
      ['Ingen vurderer det her.', 'Lav den dårligste udgave, du kan slippe afsted med.'],
    ],
    warm: [['Du må gerne lave den halvdårligt 💛', 'Færdig slår perfekt. Hver gang.']],
    blunt: [['Godt nok. Send den.']],
    humor: [['Målet er 4 ud af 10. Sigt lavt 😌']],
    peptalk: [['Bare kom i gang, du retter til bagefter hvis du vil!']],
  },

  timer: {
    default: [
      ['Sæt en timer på 10 minutter.', 'Når den ringer, må du stoppe.', 'Også midt i det hele.'],
      ['Ti minutter. Ikke mere.', 'Du har lov at stoppe bagefter.'],
    ],
    warm: [['Vi laver en tidsramme, så det ikke er uendeligt.', '10 minutter, så er du fri.']],
    blunt: [['10 minutter. Start nu.']],
    humor: [['10 minutter. Så må du lovligt lave ingenting 🛋️']],
    peptalk: [['10 minutter, det kan du sagtens!']],
  },

  'compassionate-reset': {
    default: [
      ['Der er ikke sket noget galt.', 'Vi starter bare her.', 'Hvad har du overskud til lige nu?'],
      ['Okay. Stop op et øjeblik.', 'Ingen dårlig samvittighed. Vi begynder forfra herfra.'],
    ],
    warm: [['Det er okay 💛', 'Du er ikke bagud. Der findes ikke bagud her.', 'Vi tager den herfra.']],
    blunt: [['Fint. Videre. Hvad er det mindste du kan gøre nu?']],
    humor: [['Dagen er ikke ødelagt. Den er bare... kreativt anvendt 😄', 'Vi starter herfra.']],
    peptalk: [['Nulstil. Du har stadig hele resten af dagen!']],
  },

  'environmental-cue': {
    default: [
      ['Skift rum.', 'Gå derhen hvor tingen er.', 'Så snakker vi videre.'],
      ['Læg telefonen fra dig med skærmen nedad.', 'Rejs dig.', 'Kom tilbage når du står op.'],
    ],
    warm: [['Prøv at flytte dig fysisk, det hjælper tit mere end viljestyrke.', 'Gå ud i rummet hvor "{task}" hører til.']],
    blunt: [['Rejs dig. Gå derhen. Skriv "der".']],
    humor: [['Sofaen er ikke din ven lige nu 😌', 'Rejs dig, forræder.']],
    peptalk: [['Kom, bare hen til rummet. Det er hele skridtet!']],
  },

  novelty: {
    default: [
      ['Den er kedelig. Det er en rigtig grund.', 'Sæt musik på, eller sæt et tidspres på.', 'Så bliver den lige til at holde ud.'],
      ['Kedeligt = svært. Det er ikke dovenskab.', 'Lav en leg ud af det: hvor meget når du på 7 minutter?'],
    ],
    warm: [['Kedelige ting er faktisk sværere for din hjerne. Det passer.', 'Prøv med lyd på, podcast, musik, hvad som helst.']],
    blunt: [['Kedelig opgave. Sæt musik på og kør 7 minutter.']],
    humor: [['Din hjerne strejker mod kedsomhed. Fair nok.', 'Musik på. Så snyder vi den.']],
    peptalk: [['Sæt noget fed musik på og smadr den på 7 minutter!']],
  },

  challenge: {
    default: [
      ['Hvor meget kan du nå på 5 minutter?', 'Ikke færdiggøre. Bare se hvor langt du kommer.'],
      ['Lille væddemål med dig selv: 5 minutter.', 'Jeg tror du når mere end du regner med.'],
    ],
    blunt: [['5 minutter. Se hvor langt du kommer.']],
    humor: [['Væddemål: du når mere på 5 min end du tror. Bevis mig forkert 😏']],
    warm: [['Prøv bare fem minutter, uden krav om at blive færdig.']],
    peptalk: [['5 minutter! Jeg tipper på at du overrasker dig selv.']],
  },

  'visual-progress': {
    default: [
      ['Du har lukket {closed} loops.', 'Mental load er faldet.', 'Det virker, selvom det ikke føles sådan.'],
      ['Kig lige på cirklerne.', 'Der er færre end i går.'],
    ],
    warm: [['Du har faktisk flyttet en del 💛', '{closed} loops er lukket.']],
    blunt: [['{closed} lukket. Det tæller.']],
    humor: [['{closed} loops lukket. Hjernen har fået plads til flere kattevideoer 🐈']],
    peptalk: [['{closed} loops lukket! Det er rigtig flot.']],
  },

  'immediate-reward': {
    default: [
      ['Når den er gjort: 10 minutter uden dårlig samvittighed.', 'Aftale?'],
      ['Lav den, og så gør du noget du har lyst til bagefter.', 'Uden at rydde op først.'],
    ],
    warm: [['Bagefter må du gøre noget rart. Uden at fortjene det yderligere 💛']],
    blunt: [['Gør den. Så har du fri.']],
    humor: [['Bestikkelse er tilladt. Hvad køber jeg dig for det her? ☕']],
    peptalk: [['Klar den, så har du hele belønningen bagefter!']],
  },

  externalise: {
    default: [
      ['Skriv det ned i stedet for at holde på det.', 'Alt der ligger i hovedet, tæller dobbelt.'],
      ['Få det ud af hovedet først.', 'Vi sorterer bagefter.'],
    ],
    warm: [['Prøv at tømme hovedet ned i appen 💛', 'Så holder du ikke på det hele selv.']],
    blunt: [['Skriv det ned. Alt sammen. Nu.']],
    humor: [['Dit hoved er en elendig database. Brug appen 😄']],
    peptalk: [['Smid det hele ud af hovedet, så bliver det meget lettere!']],
  },

  'pick-for-you': {
    default: [
      ['Du skal ikke vælge.', 'Jeg vælger: "{task}"', 'Ca. {minutes} min.'],
      ['Vi springer valget over.', '"{task}", den passer til dig lige nu.'],
    ],
    warm: [['Lad mig tage beslutningen 💛', 'Prøv "{task}". Ca. {minutes} min.']],
    blunt: [['"{task}". {minutes} min. Kør.']],
    humor: [['Jeg har valgt for dig. Ingen indsigelser 😌', '"{task}", ca. {minutes} min.']],
    peptalk: [['Jeg har fundet den perfekte til dig nu: "{task}"!']],
  },

  'park-it': {
    default: [
      ['Den skal måske slet ikke laves nu.', 'Vil du parkere "{task}"?', 'Så holder du op med at bruge energi på den.'],
      ['At udskyde bevidst er ikke det samme som at udskyde.', 'Parkér den, og få den ud af hovedet.'],
    ],
    warm: [['Det er helt legitimt at sige "ikke nu" 💛', 'Skal vi parkere "{task}"?']],
    blunt: [['Parkér den. Den fylder unødigt.']],
    humor: [['"{task}" sendes på ferie 🌴 Vil du det?']],
    peptalk: [['Ryd den af vejen eller parkér den, så har du plads til det, der tæller!']],
  },
}

/** Openers used when the user just says hi or opens the coach. */
export const GREETINGS: Record<Tone, string[]> = {
  calm: ['Hej. Hvad fylder lige nu?', 'Hej. Hvor er du henne i dag?', 'Hej. Hvad står i vejen?'],
  warm: ['Hej 💛 Hvad har du gang i?', 'Hej. Hvordan har du det lige nu?', 'Hej. Hvad kan jeg hjælpe dig i gang med?'],
  blunt: ['Hvad sidder du fast i?', 'Hvad skal der ske?', 'Sig frem.'],
  humor: ['Hejsa. Hvem har svigtet dig i dag? Opvasken eller skat? 😄', 'Hej. Hvad undgår vi i dag?'],
  peptalk: ['Hej! Hvad skal vi have knækket i dag?', 'Hejsa! Hvor skal vi starte?'],
}

/** Acknowledgements after the user reports a completed step. */
export const STEP_ACKS: Record<Tone, string[]> = {
  calm: ['Godt.', 'Fint. Videre.', 'Sådan.', 'Noteret.'],
  warm: ['Godt gået 💛', 'Dejligt.', 'Sådan, du.', 'Rigtig fint.'],
  blunt: ['Godt. Næste.', 'Fint.', 'Videre.'],
  humor: ['Se selv 😌', 'Utroligt hvad der sker når man rejser sig.', 'Nice.'],
  peptalk: ['Yes! Sådan!', 'Perfekt, du er i gang!', 'Flot!'],
}

export const CLOSERS: Record<Tone, string[]> = {
  calm: ['Du behøver ikke tænke på resten endnu.', 'Resten venter. Det er fint.'],
  warm: ['Resten må godt vente 💛', 'Du skal ikke gøre mere end det her.'],
  blunt: ['Resten er ikke din opgave lige nu.'],
  humor: ['Resten af listen er sat på lydløs 🤫'],
  peptalk: ['Én ting ad gangen, du klarer det!'],
}
