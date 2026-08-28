# Loops

En organiseringsapp bygget til ADHD-hjerner. Ingen kalender, ingen lang to-do-liste
— alt er cirkler, du zoomer ind i, og "open loops" du lukker.

Alt kører lokalt i browseren. Ingen konto, ingen server, ingen betalte API'er,
ingen sporing. Appen kan installeres på hjemmeskærmen og virker uden internet.

---

## Sådan sender du den videre

**Én gang, af dig:**

1. Gå til repoets **Settings → Pages** og sæt *Source* til **GitHub Actions**.
2. Det er det. Hvert push bygger og lægger appen op.

Du får et link i stil med
`https://frosenlund3-design.github.io/Tracking-Finances/`. Det link er alt, der
skal sendes.

**Hos hende:** hun åbner linket i Safari. Efter et par sekunder dukker der en
lille boks op, der viser præcis hvad hun skal trykke på — del-ikonet og "Føj til
hjemmeskærm". Så ligger Loops som en app på hjemmeskærmen, åbner i fuld skærm og
virker uden internet.

Der er ingen konto, ingen mail og ingen kode at oprette først. Hun trykker "Kom i
gang", svarer på syv hurtige spørgsmål og skriver sin første tanke ind. Alt hun
skriver bliver på hendes telefon.

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

### "Der er ikke noget, du skal lige nu"

Den sætning er den mest værdifulde skærm i appen — og den var uopnåelig. Den
kom kun frem, når hvert eneste loop var lukket, hvilket for et menneske med et
fuldt liv aldrig sker. Så den gjorde aldrig sit arbejde.

Nu er der to veje til den, i `enough.ts`:

1. **Luk et lille antal loops.** Tallet skalerer med den energi hun har angivet
   — 1 ved 10%, op til 4 ved 100% — og det er med vilje lille. Tre lukkede
   loops på en 30%-dag er en god dag, ikke en fiasko på vej mod ti.
2. **Sig det.** "Jeg er færdig for i dag" er en legitim beslutning, præcis som
   at parkere noget, og det tager ét tryk.

Så skifter forsiden til en rolig afslutning: hvad hun nåede, hvor meget mental
load faldt siden i morges, og **"Luk appen. Vi ses i morgen."** Det er hele
pointen med succeskriteriet — appen skal have hende ud af appen.

Det er aldrig en lås. "Jeg vil gerne én mere" hæver dagens mål med én i stedet
for bare at rydde flaget, så "nok" bliver ved med at være et rigtigt tal.

**Men den er spærret.** At føle sig færdig, mens en frist løber ud i aften, er
værre end ikke at føle sig færdig — det er appen, der hjælper hende med at
misse noget. Så afslutningsskærmen kommer kun frem, når der ikke er noget
tilbage, som *virkelig* ikke kan vente: fristerne i dag, de faste tider i dag,
det overskredne. Er målet nået, men der stadig ligger noget rigtigt, siger den
det i stedet:

> **Du har lavet nok — der er bare én ting med en tid**
> Resten kan sagtens vente til i morgen. De her har en rigtig tid.

Alt det andet — de atten "engang"-loops — er præcis det, hun har lov til at
føle sig færdig på trods af.

### Rigtige tidspunkter

De fleste loops har ingen deadline, og opfundne deadlines er præcis den vej,
et roligt system bliver til den stressende kalender hun i forvejen ikke gider.
Så en tid er valgfri alle steder — men når der er en rigtig én, bliver den
behandlet som rigtig. `deadlines.ts` skelner mellem to ting, fordi de opfører
sig forskelligt:

- **Frist** — skal være færdig inden. Den kan laves i forvejen, og den rykker
  op i rækkefølgen, jo tættere den kommer. En frist i dag slår alt andet.
- **Fast tid** — sker på det tidspunkt, uanset hvad du gjorde. En lægetid eller
  en eksamen er aldrig "start nu", den er "vær der 14.30". Derfor holdes faste
  tider helt ude af "hvad skal jeg nu"-motoren og vises for sig selv øverst på
  forsiden.

Brain dump'en fanger dem selv: *"Lægetid på fredag kl. 9"* bliver til **Lægetid**,
fast tid, fredag 09.00. *"Aflever ansøgning senest på torsdag"* bliver til
**Aflever ansøgning**, frist, torsdag.

### Kan man stole på tiderne?

"Hvis der står 2 min, skal det faktisk tage 2 min." Det er ikke en kosmetisk
detalje: med tidsblindhed er der ingen uafhængig måde at tjekke det på, så
tallet skal kunne bæres. Ét estimat, der viser sig at være en fyrre minutters
sump, og så betyder tallet ingenting nogensinde igen.

Så `calibration.ts` måler. Når en opgave startes i start-tilstand og gøres
færdig i samme omgang, ved appen hvor lang tid den faktisk tog. Forholdet mellem
virkelig og anslået tid bliver til en personlig faktor, og hver eneste tid, der
vises, går igennem den. Tager hendes ti-minutters-opgaver i virkeligheden
fjorten, så står der fjorten.

Det er en median, ikke et gennemsnit — én afbrudt eftermiddag skal ikke forgifte
alle fremtidige estimater. Og i start-tilstand kører uret synligt, så hun selv
kan se, at de to minutter var to minutter.

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

### Stemme

Der er en mikrofonknap i både brain dump'en og coachen. Den bruger browserens
egen stemmegenkendelse sat til `da-DK` — på iPhone er det den samme motor som
mikrofon-tasten på tastaturet, og den er god til dansk.

To ting siges ligeud, fordi de er sande:

- Diktering er det ene sted i Loops, der ikke er rent lokalt. Lyden sendes til
  Apple eller Google for at blive lavet om til tekst. Det står på skærmen før
  første optagelse, og det kan slås fra i indstillinger.
- Ingen diktering er 100% præcis. Derfor lander teksten altid i et felt, hun kan
  rette i, før den sendes — appen handler aldrig på ord, hun ikke har set.

Har browseren ingen stemmegenkendelse, vises knappen slet ikke frem for at vises
i stykker.

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
- **Diktering er ikke 100% præcis, og ikke rent lokal.** Begge dele står på
  skærmen, og teksten skal godkendes af hende, før den bruges.

---

## De stille statistikker

`stats.ts` samler det, der er blevet til noget, og skærmen ligger bag
Indstillinger — ikke på forsiden. Et tal på forsiden bliver til et mål, og et
mål bliver til pres, hvilket er det ene appen ikke må tilføje. Hernede gør
tallene det modsatte: på en dårlig dag er de bevis for, at det faktisk virker.

- loops lukket, timer taget ud af hovedet, gange hun er kommet i gang
- ting hun havde skubbet flere gange — og alligevel klarede
- ting hun besluttede ikke var vigtige (det er også arbejde)
- hvornår på dagen hun rent faktisk lukker ting
- **hvad det har givet hende i kroner**

Penge er det eneste sted, hvor ærlighed kræver ekstra omtanke. Appen kan ikke
vide, hvad et stykke arbejde er værd, og et gættet tal ville gøre hver eneste
statistik bygget på det til en løgn. Derfor kommer beløb kun to steder fra:

- en værdi hun selv sætter på den enkelte opgave (fx en kundeopgave: 4.500 kr.)
- et skøn ud fra en timepris hun selv indtaster, kun på lukkede arbejdsopgaver,
  og altid mærket som et skøn

Det står i UI'et: *"Loops ved ikke hvad dit arbejde koster, og gætter ikke."*

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
