/**
 * Triggers.
 *
 * A trigger is not the same as a difficulty. "Perfektionisme" describes how
 * somebody works. "Hvis nogen virker sure på mig" describes something that
 * happens to them, arrives before thought does, and takes the rest of the day
 * with it. Dodson's work on rejection sensitivity is explicit that the
 * reaction precedes the appraisal: it is already running by the time you get
 * to decide whether it was warranted.
 *
 * That has one hard consequence for this app. Advice offered on top of a live
 * trigger response does not land, and pressing on one is how a person stops
 * trusting the thing that pressed. So when a message or a task touches
 * something she has written down here, the coach stops advising: it names the
 * thing, takes the demand off the table, and offers a way around rather than
 * through. This is the low-demand, declarative approach used with demand
 * avoidance, and it is the difference between an app she keeps and an app she
 * deletes.
 *
 * Nothing here is inferred. Only what she typed in "Om dig" counts.
 */

export interface TriggerHit {
  /** Her own words for it. */
  trigger: string
  /** What the coach says first, before anything else. */
  name: string
  /** A way around it, concrete enough to do in the next minute. */
  around: string
  /** A quick reply that keeps her in control of what happens next. */
  offer: string
}

interface KnownTrigger {
  id: string
  /** Matches her own label for it. */
  label: RegExp
  /** Matches a message or a task title that touches it. */
  cue: RegExp
  name: string
  around: string
  offer: string
}

/**
 * The common ones, with a real way around each. Written as things a person
 * could actually do in the next sixty seconds, not as principles.
 */
const KNOWN: KnownTrigger[] = [
  {
    id: 'someone-annoyed',
    label: /sure? p[åa] mig|vrede|utilfreds|skuffe|kritik|afvis/i,
    cue: /\b(sur|sure|vred|irriteret|skuffet|utilfreds|sagde ikke noget|svarede ikke|kort i tonen|kigger m[æa]rkeligt|tror de|de synes|dumt af mig|pinligt)\b/i,
    name: 'Der er noget her med, at nogen kan være sure på dig. Det er sådan et sted, hvor reaktionen kommer før tanken.',
    around:
      'Du behøver ikke afgøre nu, om de faktisk er sure. Skriv i én linje, hvad du rent faktisk ved: hvad blev der sagt, ord for ord? Alt andet er en fortolkning, og den kan vente.',
    offer: 'Hjælp mig med at skille det ad',
  },
  {
    id: 'money',
    label: /regning|[øo]konomi|penge|g[æa]ld|budget|bank/i,
    cue: /\b(regning[\wæøåÆØÅ]*|[øo]konomi[\wæøåÆØÅ]*|penge|g[æa]ld|rykker[\wæøåÆØÅ]*|budget[\wæøåÆØÅ]*|netbank[\wæøåÆØÅ]*|betal[\wæøåÆØÅ]*|r[øo]dt tal|kontoen|skat)\b/i,
    name: 'Der er penge i den her. Det er et af dine ømme steder, og så er det ikke opgaven, der er tung, det er hvad du kan komme til at se undervejs.',
    around:
      'Kig ikke på saldoen. Åbn kun det ene, der skal betales, betal det, og luk igen. Resten af tallene skal du ikke forholde dig til i dag.',
    offer: 'Kun den ene regning',
  },
  {
    id: 'phone',
    label: /telefon|ringe|opkald/i,
    cue: /\b(ring[\wæøåÆØÅ]*|opkald|telefon[\wæøåÆØÅ]*|tale med dem|snakke med dem|nummeret)\b/i,
    name: 'Der er et opkald i den. Det er et af de steder, du selv har skrevet ned.',
    around:
      'Der findes næsten altid en skriftlig vej: kontaktformular, chat, beskedfunktionen i deres app, eller en mail. Den tæller lige så meget. Skal vi lede efter den i stedet?',
    offer: 'Find en skriftlig vej',
  },
  {
    id: 'post',
    label: /post|e-?boks|brev|kuvert/i,
    cue: /\b(post[\wæøåÆØÅ]*|e-?boks|brev[\wæøåÆØÅ]*|kuvert[\wæøåÆØÅ]*|rudekuvert[\wæøåÆØÅ]*|uåbnet)\b/i,
    name: 'Uåbnet post. Det er sjældent indholdet, der er problemet, det er ikke at vide hvad der står.',
    around:
      'Åbn alle sammen uden at læse noget. Læg dem i tre bunker: skal betales, skal besvares, kan smides ud. Du skal ikke handle på noget i dag, kun vide hvad der er.',
    offer: 'Bare åbne, ikke læse',
  },
  {
    id: 'late',
    label: /for sent|komme til tiden|forsinke/i,
    cue: /\b(for sent|n[åa]r det ikke|forsinket|tiden l[øo]ber|skal n[åa] det|misser)\b/i,
    name: 'At komme for sent. Det er tit ikke afgangen, der glipper, det er alt det, der skal ske lige inden.',
    around:
      'Sæt alarmen på det tidspunkt, du skal ud ad døren, ikke på det tidspunkt du skal være der. Og læg det, du skal have med, ved døren nu.',
    offer: 'Regn baglæns for mig',
  },
  {
    id: 'mess',
    label: /rod|uorden|kaos derhjemme|beskidt/i,
    cue: /\b(rod[\wæøåÆØÅ]*|uorden|rodet|beskidt|ulækkert|ser forf[æa]rdeligt ud|kan ikke se bunden)\b/i,
    name: 'Rod. Det har ingen slutning, og det er derfor det aldrig starter.',
    around: 'Vælg én overflade. Ikke ét rum, én overflade. Ti minutter på uret, og så er du færdig, uanset hvordan der ser ud.',
    offer: 'Vælg en overflade for mig',
  },
  {
    id: 'corrected',
    label: /rettet|kritik|fejl|bed[øo]m/i,
    cue: /\b(rettet|kritik|fejl|bed[øo]m[\wæøåÆØÅ]*|de kigger p[åa]|skal godkendes|feedback|gennemgang)\b/i,
    name: 'Det her kan blive rettet af nogen. Det er der, det plejer at gå i stå.',
    around:
      'Aftal med dig selv nu, hvad der er godt nok, og skriv det ned, før du går i gang. Så er beslutningen taget af dig og ikke af den, der kigger bagefter.',
    offer: 'Hjælp mig med at sætte grænsen',
  },
  {
    id: 'why',
    label: /spurgt hvorfor|forklare mig|retf[æa]rdigg[øo]r/i,
    cue: /\b(hvorfor har du ikke|hvorfor gjorde du|skal forklare|retf[æa]rdigg[øo]re|undskylde mig)\b/i,
    name: 'Der ligger et hvorfor i den her, og du har skrevet, at det er et ømt sted.',
    around:
      'Du skylder ikke nogen en forklaring for at have udsat noget. “Jeg tager den i dag” er et helt svar. Punktum bagefter.',
    offer: 'Giv mig en sætning jeg kan bruge',
  },
  {
    id: 'deadline',
    label: /deadline|frist/i,
    cue: /\b(deadline[\wæøåÆØÅ]*|frist[\wæøåÆØÅ]*|senest|inden fredag|l[øo]ber ud|udl[øo]ber)\b/i,
    name: 'Der er en frist i den. Du har skrevet, at fristerne selv gør noget ved dig.',
    around:
      'Flyt fristen. Ikke den rigtige, din. Sæt den til dagen før, og lad den rigtige være noget, du ikke tænker på. Så er der luft, hvis dagen går skævt.',
    offer: 'Sæt min egen frist dagen før',
  },
  {
    id: 'asking-help',
    label: /bede om hj[æa]lp|sp[øo]rge nogen|til besv[æa]r/i,
    cue: /\b(bede om hj[æa]lp|sp[øo]rge om hj[æa]lp|til besv[æa]r|ville ikke ulejlige|t[øo]r ikke sp[øo]rge)\b/i,
    name: 'Der skal spørges nogen om noget. Det er et af de steder, du har markeret.',
    around:
      'Skriv beskeden nu, uden at sende den. Én sætning om hvad du skal bruge, og én om hvornår. Så er det færdigt, og send-knappen er en helt anden beslutning.',
    offer: 'Hjælp mig med at formulere den',
  },
  {
    id: 'noise',
    label: /lyd|st[øo]j|larm/i,
    cue: /\b(larm[\wæøåÆØÅ]*|st[øo]j[\wæøåÆØÅ]*|h[øo]jt|larmer|for meget lyd|kan ikke t[æa]nke)\b/i,
    name: 'Lyd. Det hører til opgaven, ikke ved siden af den.',
    around: 'Høretelefoner på, før du gør noget som helst andet. Det er trin ét, ikke en forberedelse.',
    offer: 'Læg det ind som første trin',
  },
]

/** Words that say nothing about what a free-typed trigger is about. */
const STOP = new Set([
  'hvis', 'nogen', 'noget', 'mig', 'jeg', 'min', 'mit', 'mine', 'der', 'den', 'det', 'som',
  'og', 'at', 'er', 'var', 'har', 'skal', 'kan', 'vil', 'en', 'et', 'til', 'for', 'med', 'om',
  'af', 'på', 'så', 'men', 'ikke', 'bare', 'meget', 'helt', 'også', 'når', 'virker', 'bliver',
])

function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zæøå0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w))
}

/**
 * Does this text touch one of her triggers?
 *
 * Deliberately conservative. A false positive here means the coach solemnly
 * names a wound she did not have, which is both unhelpful and slightly
 * creepy, so a free-typed trigger only fires on a real content word from her
 * own phrasing.
 */
export function matchTriggers(text: string, triggers: string[] | undefined): TriggerHit[] {
  if (!triggers?.length || !text.trim()) return []
  const hits: TriggerHit[] = []
  const seen = new Set<string>()

  for (const trigger of triggers) {
    const known = KNOWN.find((k) => k.label.test(trigger))
    if (known) {
      if (known.cue.test(text) && !seen.has(known.id)) {
        seen.add(known.id)
        hits.push({ trigger, name: known.name, around: known.around, offer: known.offer })
      }
      continue
    }

    // Free-typed. Match on her own content words, and answer in her own words.
    const words = contentWords(trigger)
    if (!words.length) continue
    const lower = text.toLowerCase()
    if (!words.some((w) => lower.includes(w.slice(0, Math.max(4, w.length - 2))))) continue
    if (seen.has(trigger)) continue
    seen.add(trigger)
    hits.push({
      trigger,
      name: `Det her rører ved noget, du selv har skrevet ned: “${trigger}”.`,
      around:
        'Så lader vi være med at gå igennem det. Hvad er den mindste bid, der ikke rører ved den del? Den tager vi, og resten lader vi ligge.',
      offer: 'Find den mindste bid',
    })
  }
  return hits
}
