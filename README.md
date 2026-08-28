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
  db/          Dexie-skema, typer og seed-data
  store/       Ét Zustand-store: al state og alle handlinger
  lib/         Motorerne — ren logik, ingen React
    brainDump.ts   parser én rodet dansk tekst til placerede loops
    decompose.ts   skabeloner der gør vage opgaver til første fysiske skridt
    layout.ts      den deterministiske cirkel-layout-motor
    scoring.ts     "hvad skal jeg nu?" + point
    mentalLoad.ts  den rolige belastningskurve
    coach/         regelmotoren bag ADHD-coachen
    giftcards.ts   gavekort-opsparingen
  components/  UI
```

Motorerne i `lib/` kender ikke til React, og UI'et indeholder ingen logik af
betydning. Det gør dem lette at teste og lette at bytte ud.

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

### Point

Samme tal driver både rådgivning og belønning: `scoreTask()` giver hver opgave
0–100 point ud fra hvor god en idé den er *lige nu* (aktualitet, hvor hurtigt
den kan lukkes, om den blokerer andet, energi-match, tidspunkt på dagen, hvor
længe den er blevet undgået). Den score bestemmer også hvor mange point man får
for at lukke den — så appen aldrig foreslår noget og bagefter belønner dårligt
for det.

Ekstra point for det der er svært: at *starte*, at bryde en scroll, at tømme
hovedet, og især for opgaver man længe har cirklet om.

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

---

## Data og privatliv

Alt ligger i IndexedDB i browseren. Ingen analytics, ingen tredjeparter, intet
netværkskald efter første indlæsning. Backup tages som en JSON-fil via
Indstillinger og kan hentes ind igen samme sted.

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
