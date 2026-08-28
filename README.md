# Loops

En organiseringsapp bygget til ADHD-hjerner. Ingen kalender, ingen lang to-do-liste
— alt er cirkler, du zoomer ind i, og "open loops" du lukker.

Alt kører lokalt i browseren. Ingen konto, ingen server, ingen betalte API'er,
ingen sporing. Appen kan installeres på hjemmeskærmen og virker uden internet.

```bash
npm install
npm run dev        # udvikling (inkl. demo-data)
npm run build      # typecheck + produktionsbuild
npm run preview    # se produktionsbuildet lokalt
npm run lint
```

---

## Idéen

Hjernen skal ikke være databasen. Brugeren skriver én rodet tanke ned; appen
sorterer, placerer og deler op. Hvert ekstra valg — kategori, projekt, deadline,
prioritet — er friktion, og friktion er dér ADHD-brugeren falder fra.

Tre ting bærer hele designet:

1. **Alt er en cirkel i ét træ.** En cirkel i UI'et og en opgave i data er det
   samme objekt. Derfor kan nesting være vilkårligt dyb uden specialtilfælde.
2. **Zoom er navigationen.** Man bevæger sig indad i sit eget hoved, ikke
   mellem sider.
3. **Open loops.** Tallet er ikke "ting du ikke har lavet", men "ting din
   hjerne ikke længere behøver huske".

---

## Sådan hænger koden sammen

```
src/
  db/          Dexie-skema, typer, seed-data og krypteringsgrænsen
  store/       Ét Zustand-store: al state og alle handlinger
  lib/         Motorerne — ren logik, ingen React
    brainDump.ts   parser én rodet dansk tekst til placerede loops
    decompose.ts   skabeloner der gør vage opgaver til første fysiske skridt
    firstAction.ts finder det mindste sande næste skridt
    attention.ts   finder det der har ligget for længe
    layout.ts      den deterministiske cirkel-layout-motor
    colors.ts      farve pr. cirkel, deterministisk
    scoring.ts     "hvad skal jeg nu?" + point
    mentalLoad.ts  den rolige belastningskurve
    coach/         regelmotoren bag ADHD-coachen
    giftcards.ts   gavekort-opsparingen
    vault.ts       profil-låsen: kodekrav, nøgleudledning, kryptering
  components/  UI
```

Motorerne i `lib/` kender ikke til React, og UI'et indeholder ingen logik af
betydning. Det gør dem lette at teste og lette at bytte ud.

### Forsiden: ét lille skridt

Forsiden leder aldrig med en opgave. En opgave kan man frygte. Den leder med en
bevægelse:

> **Åbn netbanken** · 30 sekunder. Så er du i gang.
> `[ Jeg gør det nu  +4 ]`

`firstAction.ts` finder det mindste sande næste skridt — det første ufærdige
microstep, eller opgaven selv hvis den allerede er lillebitte — og estimerer
hvor kort det er. Pointene for at *starte* står på selve knappen, fordi det er
igangsætningen der er svær, ikke afslutningen.

Alt andet på forsiden er gjort stillere: mental load er en tynd streg, ikke en
måler, og værktøjerne er én række chips. En skærm fuld af konkurrerende kort er
en skærm man lukker.

### Brain dump

`parseBrainDump()` gør dette:

> "Jeg skal have styr på SOME og ringe til tandlægen og jeg mangler også at
> købe vaskemiddel og poste på Instagram"

til dette:

```
Arbejde › SOME          Få styr på SOME        45 min   5 steps
Mig › Tandlæge          Ring til tandlægen      6 min   4 steps
Hjem › Indkøb           Køb vaskemiddel         8 min   4 steps
Arbejde › SOME › Instagram   Post på Instagram  45 min   5 steps
```

Rent lokalt: segmentering, et dansk leksikon, imperativ-omskrivning og
heuristikker for tid, vægt og energi. `" og "` deles kun, når det der følger
kan stå alene — så "salt og peber" ikke bliver til to opgaver. Tidsudtryk
fjernes fra titlen, når de er fanget som en dato.

Appen må gerne gætte forkert. Bekræftelsesskærmen ("Ser det rigtigt ud?") er
sikkerhedsnettet — men at gætte stille er langt bedre end at bede brugeren om
at udfylde otte felter.

### Cirkel-layout

`layoutRadial()` løser geometrien i stedet for at finjustere den, fordi
fejltilstandene er præcis dem der ødelægger appen: cirkler der overlapper,
falder ud af skærmen, bliver for små at ramme eller får ulæselige labels.

Løsningsrækkefølge: centerradius → største barneradius der stadig er plads til
→ ringradius skubbet ud til kanten → vinkeltjek, og ved for lidt plads skaleres
alle børn ens ned, hvorefter der løses igen. Både én og to ringe prøves, og den
løsning der giver de største cirkler vinder. Cirkler vokser også for at fylde
skærmen, når der kun er få af dem.

Er der for mange børn, vises `+N flere`, som åbner en **liste** — tyve cirkler i
én ring er geometrisk muligt og fuldstændig ulæseligt.

Cirklerne har ingen kant. Formen kommer fra en blød gradient der falmer fra en
lys tone ned i grundfarven, med skyggen tonet i samme farve. Hver cirkel har sin
egen farve, valgt deterministisk ud fra dens plads hos forælderen, så søskende
aldrig deler farve og den samme cirkel har den samme farve hver gang.

Inde i hver cirkel sidder de underliggende niveauer som mindre og mindre,
lysere og lysere cirkler — så man kan se hvor dybt noget går, før man går ind i
det. De inderste er med vilje ikke klikbare: **man går ét niveau ind ad gangen**.
Man kan altid gå ud igen, og man kan skifte mellem verdenerne på øverste
niveau, men man kan ikke springe fra "Mit liv" ned til en opgave tre niveauer
nede. Reglen håndhæves i `canFocus()` i storet, ikke kun i UI'et, så alle
indgange overholder den.

### Point

Samme tal driver både rådgivning og belønning: `scoreTask()` giver hver opgave
0–100 point ud fra hvor god en idé den er *lige nu* (aktualitet, hvor hurtigt
den kan lukkes, om den blokerer andet, energi-match, tidspunkt på dagen, hvor
længe den er blevet undgået). Den score bestemmer også hvor mange point man får
for at lukke den — så appen aldrig foreslår noget og bagefter belønner dårligt
for det.

Ekstra point for det der er svært: at *starte*, at bryde en scroll, at tømme
hovedet, og især for opgaver man længe har cirklet om.

### Det der har ligget for længe

`attention.ts` scanner efter loops der er blevet skubbet flere gange, ligger
efter deres dato, er startet uden at komme videre, eller bare har ligget længe i
forhold til hvor små de er. Små ting der ligger i ugevis siger mere end store.

Den lister dem ikke. Den finder **én**, og coachen stiller ét spørgsmål:

```
"Ring til tandlægen" er blevet skubbet 6 gange.
Jeg gætter ikke på hvorfor.
Hvad sker der, når du kommer til den?

[Jeg ved ikke hvor jeg skal starte]  [Den føles for stor]  [Den er kedelig]
[Jeg glemmer den]  [Jeg mangler energi]  [Den skal være perfekt]
```

Svaret navngiver problemet, før der løses noget:

```
Så er det ikke dovenskab. Opgaven er for stor til at holde i hovedet på én gang.
Okay. Vi dropper "Ring til tandlægen" 😌
Din eneste opgave lige nu: Find nummeret
```

Årsagen gemmes på opgaven, så appen holder op med at spørge og begynder at
tilpasse sig. En app der lister tolv forsinkede ting har fortalt brugeren noget
hun allerede vidste og havde det skidt med; en app der spørger kan finde ud af
hvorfor.

### Coach

En regelmotor, ikke en sprogmodel: intent-genkendelse, tilstand (energi, mental
load, opgavens størrelse, hjerneprofil) og et strategivalg med mange
formuleringer per strategi og tone. Den finder den opgave brugeren *nævner* —
ikke bare den der tilfældigvis var på skærmen.

`lib/coach/adapter.ts` er sømmen: implementér `CoachAdapter`, og en rigtig model
kan kobles på uden at UI'et ændres. Appen er fuldt funktionel uden.

---

## Hvad appen ikke gør

Ingen knap i Loops lover noget browseren ikke kan:

- **Den kan ikke blokere TikTok eller Instagram.** En web-app må ikke det på
  iPhone. "Scroll-redning" er en vej *ud* af scrollen, som brugeren selv åbner —
  og det står i UI'et.
- **Den kan ikke købe gavekort.** Der er ingen server og ingen betaling.
  Sparegrisen holder styr på opsparingen og siger til, når man har fortjent
  belønningen, og linker til butikker der rent faktisk sælger et digitalt
  gavekort i det beløb. Selve købet gør man selv.
- **Den kan ikke vibrere på iPhone.** iOS Safari har ikke `navigator.vibrate`.
  Indstillingen siger "hvor det er muligt", og manglende vibration ændrer aldrig
  hvad appen gør.
- **Koden kan ikke nulstilles.** Der er ingen konto at sende en mail til. Det
  står både før hun vælger en kode og på låseskærmen.

---

## Profil, kode og kryptering

Der er ingen server, så "opret en profil" kan ikke betyde en konto et sted. Det
betyder noget rigtigt og lokalt: en kode der skal skrives for at åbne appen på
den her telefon, og som samtidig krypterer det hun skriver.

- Koden skrives to gange og skal opfylde tre krav, vist live mens hun skriver:
  mindst 10 tegn, både store og små bogstaver, mindst ét tal eller specialtegn.
- Nøglen udledes med PBKDF2-SHA256, 250 000 runder, med et tilfældigt salt.
  Det der gemmes er en SHA-256 af den udledte nøgle — ikke nøglen selv — så det
  der ligger i IndexedDB ikke kan bruges til at dekryptere noget.
- Nøglen holdes kun i hukommelsen i sessionen og krypterer med AES-GCM.

**Hvad der er beskyttet:** alle titler, beskrivelser, microsteps, brain dumps og
coach-samtaler — altså indholdet af hendes hoved.
**Hvad der ikke er:** træets form (hvor mange loops, hvornår de blev lavet,
hvilke der er lukket). Det bliver stående i klartekst, så Dexies indeks virker,
og så appen kan fortælle noget nyttigt uden nøglen. Begge dele står i UI'et. En
lås der oversælger sig selv er værre end ingen lås.

Koden er valgfri — den ligger som sidste, springbare trin i onboarding og kan
altid slås til og fra i Indstillinger.

## Data og privatliv

Alt ligger i IndexedDB i browseren. Ingen analytics, ingen tredjeparter, intet
netværkskald efter første indlæsning. Backup tages som en JSON-fil via
Indstillinger og kan hentes ind igen samme sted.

Backup-filen eksporteres i klartekst, også når låsen er slået til, og
lås-posten kommer aldrig med. En backup der kun kan åbnes med en kode man
måske glemmer, er ikke en backup. Det står i Indstillinger, så filen bliver
gemt et fornuftigt sted.

---

## Læg den på hjemmeskærmen

1. Åbn linket i Safari på iPhone
2. Tryk på del-ikonet
3. Vælg "Føj til hjemmeskærm"

Så åbner den fullscreen som en almindelig app — også uden internet.

## Deployment

Bygger til statiske filer, så alle gratis udbydere virker. `base` er `'./'`, så
den også kan ligge i en undermappe.

- **GitHub Pages** — workflowet i `.github/workflows/deploy.yml` bygger og
  udgiver ved push til `main`. Slå Pages til under Settings → Pages → Source:
  GitHub Actions.
- **Vercel / Cloudflare Pages / Netlify** — peg på repoet. Build: `npm run build`,
  output: `dist`.

Ikonerne genereres fra samme geometri som `public/favicon.svg` med
`npm run icons` — ingen billedafhængigheder.

## Typografi og bevægelse

Skriften er systemets egen, som på iPhone er SF Pro — den er både pænere og
gratis, og den er der allerede. Inter (latin, ~48 kB) er buntet med som
reserve for Android og desktop; den hentes lokalt, ikke fra Google, så appen
bliver ved med at virke offline og sender ikke noget til tredjepart.

Bevægelserne kommer fra Framer Motion: menulinjen har én delt pille der glider
mellem fanerne med fjederfysik og frostet glas over indholdet, og cirklerne
bruger samme fjeder til zoom. Alt respekterer både `prefers-reduced-motion` og
appens egen "reduceret stimulation".
