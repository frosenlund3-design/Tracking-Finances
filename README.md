# Loops

En organiseringsapp bygget til ADHD-hjerner. Ingen kalender, ingen lang to-do-liste
, alt er cirkler, du zoomer ind i, og "open loops" du lukker.

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
lille boks op, der viser præcis hvad hun skal trykke på, del-ikonet og "Føj til
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
sorterer, placerer og deler op. Hvert ekstra valg, kategori, projekt, deadline,
prioritet, er friktion, og friktion er dér ADHD-brugeren falder fra.

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
  lib/         Motorerne, ren logik, ingen React
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

`firstAction.ts` finder det mindste sande næste skridt, det første ufærdige
microstep, eller opgaven selv hvis den allerede er lillebitte, og estimerer
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
kan stå alene, så "salt og peber" ikke bliver til to opgaver. Tidsudtryk
fjernes fra titlen, når de er fanget som en dato.

### Sætningen bliver læst, ikke scannet

`lib/language.ts` finder udsagnsordet, det ordet handler om, og hvor det sker.
Alt andet (kategori, steps, tid) bygger på *dem*, ikke på et vilkårligt ord
i teksten. Det er hele forskellen på en app der forstår opgaven og en der
mønstergenkender:

| Skrevet | Læst som | Uden sætningslæsning |
| --- | --- | --- |
| Køb vaskemiddel | køb · vaskemiddel | vask → "Fyld maskinen" |
| Betal regningen fra tandlægen | betal · regningen | tandlæge → "Book en tid" |
| Ryd op i garagen | ryd op · garagen | "Gå ind til op" |
| Print billetterne ud | print · billetterne | "Find billetterne ud frem" |
| Ring til banken om mit lån | ring · banken | "spørge banken om mit lån om" |
| Skal have booket en tid | book · en tid | "Have booket en tid" (og klassificeret som note) |

Konkrete ting den håndterer: perfektum (*have booket* → **Book**), partikelverber
både før og efter genstanden (*ryd **op***, *print billetterne **ud***), bestemt
form, og at målet stopper ved næste forholdsord. Domæneviden må kun overtrumfe
udsagnsordet, når udsagnsordet tillader det: `betal` slår aldrig om i tandlæge-
booking, uanset hvem regningen er fra.

En detalje der kostede en fejl: JavaScripts `\b` er kun ASCII, så `/p[åa]\b/`
matcher aldrig "på" efterfulgt af et mellemrum. "Få styr på min pension" blev
læst som udsagnsordet *få* med genstanden *styr*. Alle danske mønstre i
`language.ts` slutter derfor på `(?=\s|$)` i stedet.

### Hvor småt

Samme opgave, seks detaljegrader, 1, 3, 5, 8, 12 eller 20 trin. Hvert trin har
en `rank`, så en kortere liste er de *vigtigste* trin i rigtig rækkefølge, ikke
de første fem. Skydeknappen sidder både i brain dump-gennemgangen og på den
enkelte opgave. Skifter man detaljegrad, bliver listen skrevet om, men trin
man allerede har sat flueben ved, bliver stående.

Uspecifikke opgaver får flest trin, fordi det er dem der har brug for dem:
*"Få styr på pensionen"* er ikke et gøremål, det er et manglende overblik, og
det bliver aldrig færdigt, fordi det ikke har en ende. Så trinene giver den en.
Tilsvarende for *"Find ud af …"* (en beslutning) og *"Vaskemaskinen larmer"*
(en reparation, ikke en vask).

### Ikke alt i en brain dump er en opgave

*"Ved ikke hvor det bliver af… ved heller ikke hvordan jeg skal kontakte dem"*
er kontekst, ikke en handling. Gør man den til et loop, gør det aktiv skade:
den lægges til i mental load, den dukker op som noget der skal startes, og den
kan aldrig blive færdig. Man kan ikke *udføre* en bekymring.

Derfor klassificerer parseren hvert stykke som **opgave** eller **note**.
Noter havner i "Hovedet", hæftet på den opgave de stod ved siden af. De tæller
ikke med nogen steder. Bias'en er med vilje: i tvivlstilfælde bliver det en
opgave, for en note der burde have været en opgave er let at forfremme i
bekræftelses-skærmen, mens en bekymring der blev til en opgave stille og roligt
puster tallet op og aldrig kan lukkes.

Appen må gerne gætte forkert. Bekræftelsesskærmen ("Ser det rigtigt ud?") er
sikkerhedsnettet. Men at gætte stille er langt bedre end at bede brugeren om
at udfylde otte felter.

Hver linje får en sikkerhed på om det er en opgave eller en note, og alt under
`CERTAIN` bliver markeret på gennemgangsskærmen. **Sikkerheden handler kun om
opgave-eller-note.** Om appen også vidste *hvor* den hørte hjemme er et andet
spørgsmål (`placed`). En opgave uden kendt kategori er stadig utvivlsomt en
opgave, og at markere den som tvivlsom ville lære brugeren at ignorere den
markering der faktisk betyder noget.

Nogle af de skel der viste sig at være vigtige:

- **Datid er ikke en instruks.** *"Lægen ringede"* er baggrund. Som opgave er
  det noget der aldrig kan lukkes.
- **… medmindre der ligger en instruks inde i den.** *"Hun sagde at jeg skulle
  sende papirerne inden den 3. september"* er en opgave med en frist, og
  indpakningen bliver skrællet af: **Send papirerne**.
- **En dato gør en linje til en aftale.** *"Mors fødselsdag er 14. marts"*
  skrives ikke ned for sjov. (Punktummet i "14." er også et ordenstal, ikke et
  punktum, ellers blev linjen til to loops, hvoraf det ene hed "Marts".)
- **En indkøbsliste er én opgave.** *"køb ind - mælk, brød, kaffe"* er ikke
  fire loops, hvoraf tre aldrig kan lukkes.
- **En allerede booket tid får ingen booking-liste.** *"Tandlæge torsdag kl 14"*
  er ikke noget der skal bookes.

### Cirkel-layout

`layoutRadial()` løser geometrien i stedet for at finjustere den, fordi
fejltilstandene er præcis dem der ødelægger appen: cirkler der overlapper,
falder ud af skærmen, bliver for små at ramme eller får ulæselige labels.

Løsningsrækkefølge: centerradius → største barneradius der stadig er plads til
→ ringradius skubbet ud til kanten → vinkeltjek, og ved for lidt plads skaleres
alle børn ens ned, hvorefter der løses igen. Både én og to ringe prøves, og den
løsning der giver de største cirkler vinder. Cirkler vokser også for at fylde
skærmen, når der kun er få af dem.

Er der for mange børn, vises `+N flere`, som åbner en **liste**, tyve cirkler i
én ring er geometrisk muligt og fuldstændig ulæseligt.

Cirklerne har ingen kant. Formen kommer fra en blød gradient der falmer fra en
lys tone ned i grundfarven, med skyggen tonet i samme farve. Hver cirkel har sin
egen farve, valgt deterministisk ud fra dens plads hos forælderen, så søskende
aldrig deler farve og den samme cirkel har den samme farve hver gang.

Fra hver cirkel løber en kæde af mindre og mindre cirkler udad, én perle per
niveau nedenunder. Den siger det, man skal tro på for at kunne gå i gang: at
det bliver mindre og mindre, og at den sidste er bitte lille. Layoutet
budgetterer plads til hele kometen, ikke kun hovedet, så kæderne aldrig løber
ud over kanten.

Perlerne er med vilje ikke klikbare: **man går ét niveau ind ad gangen**.
Man kan altid gå ud igen, og man kan skifte mellem verdenerne på øverste
niveau, men man kan ikke springe fra "Mit liv" ned til en opgave tre niveauer
nede. Reglen håndhæves i `canFocus()` i storet, ikke kun i UI'et, så alle
indgange overholder den.

### Point

Samme tal driver både rådgivning og belønning: `scoreTask()` giver hver opgave
0–100 point ud fra hvor god en idé den er *lige nu* (aktualitet, hvor hurtigt
den kan lukkes, om den blokerer andet, energi-match, tidspunkt på dagen, hvor
længe den er blevet undgået). Den score bestemmer også hvor mange point man får
for at lukke den, så appen aldrig foreslår noget og bagefter belønner dårligt
for det.

Ekstra point for det der er svært: at *starte*, at bryde en scroll, at tømme
hovedet, og især for opgaver man længe har cirklet om.

Gavekortet koster 25 point pr. krone, 50 kr. er omkring 70 lukkede loops, 200
kr. omkring 280. Det er med vilje en rigtig opsparing over uger. En belønning
der kommer for let holder op med at være en belønning, og målet er ikke at nå
tallet, det er at have noget der bliver ved med at trække. Skærmen siger tallet
i loops og ikke kun i point, for "5.000 point" er bare en mur.

### "Der er ikke noget, du skal lige nu"

Den sætning er den mest værdifulde skærm i appen, og den var uopnåelig. Den
kom kun frem, når hvert eneste loop var lukket, hvilket for et menneske med et
fuldt liv aldrig sker. Så den gjorde aldrig sit arbejde.

Nu er der to veje til den, i `enough.ts`:

1. **Luk et lille antal loops.** Tallet skalerer med den energi hun har angivet
   (1 ved 10%, op til 4 ved 100%) og det er med vilje lille. Tre lukkede
   loops på en 30%-dag er en god dag, ikke en fiasko på vej mod ti.
2. **Sig det.** "Jeg er færdig for i dag" er en legitim beslutning, præcis som
   at parkere noget, og det tager ét tryk.

Så skifter forsiden til en rolig afslutning: hvad hun nåede, hvor meget mental
load faldt siden i morges, og **"Luk appen. Vi ses i morgen."** Det er hele
pointen med succeskriteriet, appen skal have hende ud af appen.

Det er aldrig en lås. "Jeg vil gerne én mere" hæver dagens mål med én i stedet
for bare at rydde flaget, så "nok" bliver ved med at være et rigtigt tal.

**Men den er spærret.** At føle sig færdig, mens en frist løber ud i aften, er
værre end ikke at føle sig færdig. Det er appen, der hjælper hende med at
misse noget. Så afslutningsskærmen kommer kun frem, når der ikke er noget
tilbage, som *virkelig* ikke kan vente: fristerne i dag, de faste tider i dag,
det overskredne. Er målet nået, men der stadig ligger noget rigtigt, siger den
det i stedet:

> **Du har lavet nok, der er bare én ting med en tid**
> Resten kan sagtens vente til i morgen. De her har en rigtig tid.

Alt det andet (de atten "engang"-loops) er præcis det, hun har lov til at
føle sig færdig på trods af.

### Rigtige tidspunkter

De fleste loops har ingen deadline, og opfundne deadlines er præcis den vej,
et roligt system bliver til den stressende kalender hun i forvejen ikke gider.
Så en tid er valgfri alle steder, men når der er en rigtig én, bliver den
behandlet som rigtig. `deadlines.ts` skelner mellem to ting, fordi de opfører
sig forskelligt:

- **Frist:** skal være færdig inden. Den kan laves i forvejen, og den rykker
  op i rækkefølgen, jo tættere den kommer. En frist i dag slår alt andet.
- **Fast tid:** sker på det tidspunkt, uanset hvad du gjorde. En lægetid eller
  en eksamen er aldrig "start nu". Den er "vær der 14.30". Derfor holdes faste
  tider helt ude af "hvad skal jeg nu"-motoren og vises for sig selv øverst på
  forsiden.

Brain dump'en fanger dem selv: *"Lægetid på fredag kl. 9"* bliver til **Lægetid**,
fast tid, fredag 09.00. *"Aflever ansøgning senest på torsdag"* bliver til
**Aflever ansøgning**, med frist, torsdag.

### Smart fordeling på ugen

`planner.ts` kan foreslå, hvornår hver ting faktisk passer. Pointen er ikke at
fylde en kalender. En fyldt kalender er præcis den, hun ikke gider. Pointen er,
at når noget *har* et fornuftigt tidspunkt, skal appen vide det, i stedet for at
lade hende regne det ud i det øjeblik hun har mindst overskud til det.

Fire regler gør det meste, og de er alle sammen noget et menneske ville sige højt:

1. **Man kan ikke ringe til tandlægen klokken ni om aftenen, eller om
   søndagen.** Alt der kræver at nogen andre har åbent, lander kun på en
   hverdag i åbningstiden.
2. **Tunge ting hvor brændstoffet er.** Hun fortalte i onboarding, hvornår hun
   har energi; en krævende opgave lægges der, og de små fylder de flade dele af
   dagen ud.
3. **Intet lander efter sin frist**, og en frist får et døgns luft foran sig ,
   at planlægge noget til den eftermiddag det skal afleveres, er at planlægge
   at misse det.
4. **En slot rummer langt mindre end den teknisk kunne.** Tre kvarter, og tid
   der allerede er optaget af en rigtig aftale trækkes fra først.

Alt er et forslag. Forslaget viser sin egen begrundelse ("der har de åbent",
"du har mest energi der"), hun kan fjerne enkelte linjer, og intet flytter sig
før hun siger ja. Resten af hendes loops får med vilje ikke et tidspunkt.

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

Det er en median, ikke et gennemsnit, én afbrudt eftermiddag skal ikke forgifte
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
egen stemmegenkendelse sat til `da-DK`, på iPhone er det den samme motor som
mikrofon-tasten på tastaturet, og den er god til dansk.

To ting siges ligeud, fordi de er sande:

- Diktering er det ene sted i Loops, der ikke er rent lokalt. Lyden sendes til
  Apple eller Google for at blive lavet om til tekst. Det står på skærmen før
  første optagelse, og det kan slås fra i indstillinger.
- Ingen diktering er 100% præcis. Derfor lander teksten altid i et felt, hun kan
  rette i, før den sendes, appen handler aldrig på ord, hun ikke har set.

Har browseren ingen stemmegenkendelse, vises knappen slet ikke frem for at vises
i stykker.

### Coach

En regelmotor, ikke en sprogmodel: intent-genkendelse, tilstand (energi, mental
load, opgavens størrelse, hjerneprofil) og et strategivalg med mange
formuleringer per strategi og tone. Den finder den opgave brugeren *nævner* ,
ikke bare den der tilfældigvis var på skærmen.

Svaret bygges i en fast rækkefølge: **spejl først, navngiv mekanismen, og først
derefter et forslag.** Et råd før tingen har fået et navn læses som en
afvisning, og af en der allerede kender materialet læses det som at blive
talt ned til.

**Om dig** (Indstillinger → Din profil) er det eneste sted appen ved noget om
diagnoser og udfordringer. Den gætter aldrig selv og udleder det aldrig af
adfærd; den ville før eller siden gætte forkert og så tale skråsikkert om et
andet menneske. Feltet styrer to ting:

1. **Hvad der overhovedet må bringes op.** Monotropi nævnes kun, hvis hun selv
   har skrevet autisme eller autistiske træk.
2. **Hvor grundlæggende den må være.** "Jeg ved det meste" slår al forklaring
   af hvad ADHD *er* fra. Når intet begreb passer, spørger den i stedet for at
   dele et råd ud, et spørgsmål hun ikke har stillet sig selv gør arbejdet, et
   råd hun kan remse op koster tillid.

`lib/coach/knowledge.ts` er begrebsbanken. Barren for hver post er, om en
velinformeret voksen med ADHD ville finde den *ny*, eller i det mindste
skarpere skåret end den udgave hun går rundt med. "Del det op i mindre bidder"
falder igennem. "Muren foran opgaven er følelsesmæssigt restmateriale fra
tidligere forsøg, og den står foran opgaven, ikke inde i den" går igennem. Hver
post skiller *indsigten* fra *handlingen*, og når flere passer, vinder den der
er låst op af hendes egen profil, dernæst den der forklarer mest af det hun
skrev.

`lib/coach/memory.ts` kigger på hendes egne data, hvornår hun rent faktisk
lukker ting, hvad der rådner, om steps hjælper, og siger det højt under "Hvad
jeg har lagt mærke til". Minimum seks datapunkter, før noget overhovedet
nævnes; ellers er det ikke et mønster, det er støj. Alt kan afvises med "det
passer ikke på mig".

Samtaler gemmes hver for sig og navngives efter det første hun selv skriver, så
man kan gå tilbage i en gammel tråd og tage fat igen.

### Den åbner med noget nyt hver gang

Den plukkede før én af tre hilsner tilfældigt og tilbød de samme tre knapper
hver gang. Efter en uge er det ikke en samtale, det er en dørklokke.

Nu vælges åbningen ud fra hvad der faktisk er sandt lige nu, og den samme
bruges aldrig to gange i træk. Det den ved om hendes dag kommer først:

> Du har lukket 3 i dag. Skal vi tage én mere, eller skal vi kigge på noget der
> er sværere end det?

> I går lukkede du 4. I dag er der ikke sket noget endnu. Det er ikke en
> anklage, det er et spørgsmål: er der noget andet i dag, eller er det bare i
> dag?

> Der ligger 22 åbne loops. Nogle af dem skal du sandsynligvis aldrig lave.
> Skal vi finde dem og smide dem ud?

Er der ikke noget særligt at sige, roterer den blandt ti spørgsmål, der ikke
kan besvares med en knap. Det er meningen: et spørgsmål, man skal tænke over i
to sekunder, er en samtale der starter. En hilsen er ikke.

De sidste seks gemmes i indstillingerne, så det holder også efter en
genstart.

### Den læser hele beskeden, før noget som helst reagerer på en stump af den

Det her lag findes på grund af én samtale, der gik galt. Hun skrev:

> Jeg har brug for hjælp til at sortere mine taks, og derefter prioritere de top
> 3-5 vigtigste, og også brug for hjælp til økonomi og hvordan jeg skal skaffe
> penge til husleje..

og coachen svarede: *"Jeg hørte en opgave i det: 'Hjælp til at sortere mine
taks'. Skal jeg lægge den ind?"*

Tre ting var galt, og alle tre kom fra det samme sted: dele af appen
mønstergenkendte brudstykker af beskeden i stedet for at læse den.

1. **Hun bad om hjælp.** At bede om hjælp er ikke en opgave, der skal
   arkiveres. Der må intet gemmes fra en besked, der indeholder en anmodning.
2. **Hun bad om tre ting.** At svare på én af dem, valgt vilkårligt, er værre
   end at svare på ingen, for det ser ud som om den forstod.
3. *"Skulle du ikke være terapeut?"* er et spørgsmål om coachen. Det blev
   besvaret som et spørgsmål om en opgave, der hed "Eller bruge håndklæde
   faktisk)". Det er den slags svar, der afslutter forholdet.

`lib/coach/understand.ts` læser først. Alt andet i coachen ligger nedenstrøms
for det, og ingen af delene ser den rå tekst mere.

### Husleje man ikke kan betale

Det var den sætning, der lå midt i beskeden, og den, appen trådte hen over.
Når den er der, er det den, der betyder noget, og resten kan vente.

Indholdet er skrevet efter to regler. Det skal være sandt og brugbart i Danmark
i dag for en, der ikke kan betale huslejen. Ikke "lav et budget", men det en
gældsrådgiver rent faktisk ville sige først, i den rækkefølge de ville sige det.
Og det skal have en størrelse, en ADHD-hjerne i panik kan bære: ét opkald i dag
og en kort liste til ugen. Eksekutiv funktion er det første, der ryger under
akut stress.

Det vigtigste er også det, færrest ved: **sig det til udlejer, før fristen løber
ud.** En aftale om at betale i to rater er noget helt andet end en restance.
Derefter kommunens enkeltydelse, boligstøtten der måske ikke er rettet efter en
ændret indkomst, og den gratis gældsrådgivning. Og at man ikke kan sættes ud
uden et skriftligt påkrav med en frist først.

Den kan også skrive beskeden til udlejer, og den ved hvad man gør, hvis de
siger nej.

Den siger tydeligt, at den ikke er rådgiver, og at det ikke er juridisk
rådgivning. Pointen er at få hende til dem, hvis job det er, før fristen frem
for efter.

### Spørgsmål om coachen selv

*"Skulle du ikke være terapeut?"* fortjener et rigtigt svar, og svaret er nej.
Hun har en ph.d.; hun regner ud hvad det her er inden for en uge, og hvis det
har ladet som om, bliver alt andet det har sagt også mistænkeligt. At sige lige
ud hvad det er køber mere tillid end en god efterligning af et menneske ville.

### Coachen kan gøre ting, ikke bare sige ting

En assistent, der kun kan snakke, er endnu en ting man skal styre. Og det at
styre ting er præcis det, der er i stykker. Så `lib/coach/agent.ts` læser en
anmodning, finder ud af hvad der skal ændres, og ændrer det:

| Du skriver | Der sker |
| --- | --- |
| Flere trin / færre trin | Listen skrives om, flueben bliver stående |
| Tilføj at jeg skal finde lønsedlerne | "Find lønsedlerne" ryger nederst på listen |
| Flyt den til på fredag | Opgaven flytter |
| Flyt den ind under Økonomi | Opgaven skifter cirkel |
| Parkér den | Ude af mental load i en uge |
| Kald den X | Ny titel |
| Hæng den på når jeg har sat kaffe over | Hvis-så-plan sat |
| Godt nok | Målet bliver en femtedel |
| Slet den | **Spørger først.** Det er det eneste, der ikke kan fortrydes |

Ligger anmodningen uden for det, den kan, returnerer den ingenting, og
rådgivningsmotoren svarer i stedet. Den handler aldrig på et gæt.

### Den kan altid svare på et spørgsmål om en opgave

`lib/knowhow.ts` er praktisk viden om dansk hverdagsadministration: hvilket
login, hvilket dokument, hvilken hjemmeside, hvad der plejer at vælte det, og
hvornår man må kalde det færdigt.

> **Hvad skal jeg bruge?**
> Til "Ordn skat" skal du bruge: MitID, og de tal du skal rette efter:
> lønsedler, renter, kørsel, fagforening eller a-kasse.
>
> **Hvad hvis det går galt?**
> MitID ligger på den samme telefon, som du logger ind fra, og det er der, folk
> falder ud. Brug en computer, eller hav telefonen klar til at skifte frem og
> tilbage én gang.

To regler for hver eneste linje derinde. Den skal være sand og blive ved med at
være sand, så priser og satser står der ikke; kun tingens form. Og den skal
være konkret nok til at handle på: "find de nødvendige papirer" er ikke viden,
det er den samme mur med andre ord.

Spørger man om noget, den ikke genkender, lægger den frem hvad den faktisk ved
og siger tydeligt hvad den ikke ved. At få "det ved jeg ikke, men her er hvad
jeg ved" er et rigtigt svar. At få en opmuntring i stedet for et svar er
grunden til, at man holder op med at spørge.

### Mental load, taget ud af samtalen

Det meste af det, en ADHD-hjerne bærer rundt på, bliver sagt højt længe før det
bliver skrevet ned, og det er i det sekund, det forsvinder. Så når noget hun
siger i chatten er en ting, hun skal have gjort, tilbyder coachen at gemme den.

En eller to ting ryger direkte ind. Tre eller flere gør ikke: fem nye rækker,
der dukker op i tavshed, er præcis det overvæld, hun kom for at slippe af med.
Dem tager den én ad gangen. Og nævner hun noget, appen allerede har, siger den
det højt: *"den ligger der allerede, den er ikke glemt."* Halvdelen af det, man
bærer, bærer man, fordi man ikke stoler på, at noget andet holder fast i det.

Den er med vilje striks. "Jeg kan ikke komme i gang" og "der er for meget" er
ikke opgaver, og en liste, man skal revidere, er værre end ingen liste.

### Triggers

Et felt for sig i "Om dig", adskilt fra udfordringer. En udfordring beskriver
hvordan man arbejder. En trigger beskriver noget, der sker for en, og som kommer
før tanken: *"hvis nogen virker sure på mig"*, *"regninger og økonomi"*.

Forskellen har én hård konsekvens: råd, der lander oven på en aktiv trigger,
når ikke frem, og at presse på en er den hurtigste måde at miste et menneske
på. Så når en besked eller en opgave rører ved noget derfra, holder coachen op
med at rådgive. Den siger hvad det er, fjerner kravet, og finder en vej udenom
i stedet for igennem, med et konkret alternativ for hver af de almindelige.
Én gang pr. samtale, aldrig lige efter hun har sagt, at den gættede forkert,
og hendes egne ord vejer altid tungere end titlen på den opgave, der tilfældigvis
var åben.

### Hvis-så, den eneste teknik med en ren mekanisme bag

En beslutning om at gøre noget "i morgen" skal bruges af det system, der lige nu
er overbelastet. En beslutning, der er bundet til et konkret øjeblik, skal ikke:
den udløses af situationen. Forskningen på det er usædvanlig ren og holder
specifikt for ADHD, hvor if-then-planer har bragt præstationen op på niveau med
kontrolgrupper på opgaver, der ellers viser et tydeligt underskud.

Så en opgave kan hænges på noget, hun alligevel gør: *"Når jeg har sat kaffe
over, åbn e-Boks."* Sætningen står på forsiden i stedet for pointteksten, fordi
den er hele planen. Skriver hun et klokkeslæt, siger appen fra: et klokkeslæt er
én beslutning mere, hun selv skal huske at møde. En kedel sætter sig selv over.

### Dem der kommer igen

Husleje, medicin, vasketøj, skraldespanden. Uden gentagelse skal de skrives ind
igen hver gang, og det er præcis dem, der bliver glemt.

Én regel gør hele forskellen: **den hober sig aldrig op.** At lukke den laver
den næste, og ikke andet. Springer man en over, findes der ingen restance,
ingen brudt streak og intet rødt tal. Kun den næste findes. En gentagen opgave,
der fører regnskab, er en maskine til at lave dårlig samvittighed, og dårlig
samvittighed er dét, der får hende til at holde op med at åbne appen.

Brain dumpen læser det direkte: *"Betal husleje hver måned"* bliver til
**Betal husleje**, der kommer igen den første. Den 31. i en måned med 30 dage
lander på den sidste i måneden i stedet for at glide ind i den næste.

### Den kan skaffe det, man mangler

*"Jeg har ikke deres nummer."* Det er dér, en opgave i virkeligheden stopper,
og den stopper i tavshed: man tænker ikke på det som at være blokeret, man
tænker på sig selv som en, der ikke får det gjort.

Appen har ingen forbindelse til noget udenfor og kan ikke slå det op. Så den
gør to ærlige ting i stedet. Ved den, hvor den slags plejer at ligge, siger den
det. Og under alle omstændigheder gør den *at finde det* til opgaven, for "find
deres nummer" kan blive færdig, og "ring til dem" kan ikke, så længe nummeret
mangler.

"Jeg mangler tid" og "jeg har ikke overskud" er noget andet og bliver ikke
behandlet som en mangel, der kan hentes frem.

### Skærmen der frøs

Den var ikke frossen. Den var forskubbet.

Appen er én beholder med fast højde, der ikke scroller, og det er dét, der får
den til at føles som en app frem for en hjemmeside. På iOS støder det ind i
tastaturet. Når tastaturet kommer op, skrumper layout-viewporten ikke:
`100dvh` melder stadig hele skærmen. Kun den *visuelle* viewport skrumper. Så
beholderen er højere end det synlige område, feltet hun skriver i sidder bag
tastaturet, og iOS reagerer ved selv at scrolle den visuelle viewport op.

Når tastaturet forsvinder igen, bliver den scroll ikke altid rullet tilbage.
Siden tegnes ét sted og modtager tryk et andet, så knapper holder op med at
reagere, uden at noget ser forkert ud. At lukke appen og åbne den igen nulstiller
viewporten, hvilket er præcis derfor det så ud til at være kuren.

`lib/viewport.ts` måler den visuelle viewport, udgiver den som `--app-height`,
og sætter layout-viewporten på plads igen hver gang tastaturet lukker. Aldrig
mens hun skriver: dét ville kæmpe mod browseren og skjule det felt, hun kigger
på.

Den anden kilde var arket. Hele arket kunne trækkes, hvilket kæmper mod den
scrollende liste indeni: et strøg opad i indholdet er både en scroll og et træk,
og hvis browseren afbryder pegeren undervejs (en systemgestus, en notifikation,
tastaturet der kommer op), kan trækket blive hængende uden noget til at afslutte
det. Nu trækkes der kun i håndtaget øverst.

### Tale, og hvorfor knappen ikke virkede

På en iPhone har en web-app startet fra hjemmeskærmen `webkitSpeechRecognition`
defineret, og den virker ikke. At starte den slutter med det samme uden ord og
tit uden fejl. Så knappen så rigtig ud, gjorde ingenting og sagde ingenting,
hvilket er den værste af de tre mulige opførsler.

Der findes ingen omvej, så appen siger det i stedet og peger på det, der
virker overalt på iOS: **mikrofon-tasten på selve tastaturet.** Det er Apples
egen diktering, den samme motor, i hvert eneste felt i Loops, og på nyere
iPhones kører den på selve telefonen.

Hvor appen godt må lytte, holder den nu sessionen i live selv. Safari laver
ikke rigtig `continuous`: sessionen slutter efter en sætning eller efter en kort
pause. Loops åbner den bare igen, indtil hun trykker stop. Og en session, der
ender uden at have hørt et eneste ord, siger det nu højt frem for at stoppe i
stilhed.

### Når browseren siger nej

Lagring kan blive nægtet: privat browsing, "bloker alle cookies", en låst
arbejdstelefon. Før sad appen på en pulserende cirkel for evigt, hvilket er det
værst tænkelige førstehåndsindtryk og ikke giver hende noget at handle på. Nu
siger den hvad der skete, og hvad man gør ved det.

### Kalenderen

Det eneste i appen, der kan nå hende, når Loops er lukket. En web-app kan ikke
vække en telefon, og i stedet for at lade som om, skriver den en almindelig
kalenderfil. Hendes egen kalender tager den, og hendes egen alarm går i gang.

Alarmerne er valgt med vilje. En aftale får én en time før og én en halv time
før, fordi timen er til at komme afsted og den halve time er til, at den første
blev væk. En frist får én kl. 9 dagen før, fordi en frist, man opdager på selve
dagen, ikke er en frist, det er en overraskelse.

**Hvad den ikke er:** den kører 100% lokalt uden sprogmodel, så den kan ikke
formulere frit eller ræsonnere sig frem til noget nyt. Den kan genkende det den
har begreber for, kende hende gennem hendes egne data, og undlade at sige det
indlysende. `lib/coach/adapter.ts` er sømmen: implementér `CoachAdapter`, den
får både profil, observationer og samtalehistorik med, og en rigtig model kan
kobles på uden at UI'et ændres. Appen er fuldt funktionel uden.

### `lib/habits.ts`: vaner, hørt og genkendt

To ting, som er den samme ting set fra hver sin side.

Den ene er at læse en rutine ud af almindeligt talt dansk. Hun dikterede hele
sin hverdag i ét stræk, uden punktummer, og coachen svarede med bogholderi om
en helt anden opgave, fordi noget længere nede i systemet så ordene "hver dag"
midt i seks hundrede tegn og handlede på den stump. Nu bliver beskeden skåret op
ved de steder, en person faktisk holder pause, når ingen sætter punktummer: "og
så", "og ja så", og et nyt "jeg et-eller-andet-er". Kadence og "gør jeg det
allerede" bliver læst i det stykke, rutinen står i, ikke i hele beskeden. Det er
forskellen på at forstå hende og på at gøre hele hendes liv til hver tredje dag.

Ordforrådet er bevidst endeligt. Dikteret dansk kan ikke parses rent, men
hverdagsrutiner er et lille, lukket, virkeligt ordforråd: skraldet,
opvaskemaskinen, gulvet, pillerne. Den genkender dem, den kender, og tier om
resten.

Det vigtigste design er, at det hun **allerede** gør, og det hun **gerne vil**
i gang med, bliver holdt adskilt og behandlet modsat. En rutine hun holder, må
ikke blive til en linje på en liste: lige nu lykkes hun med at tørre bordet af,
og i det sekund det kan stå uafkrydset, har hun fået en ny måde at fejle på ved
noget, der virker. Til gengæld er de præcis dét, en ADHD-dag har mindst af: et
fast punkt, der kommer af sig selv, uden at nogen skal beslutte noget. Så de
bliver til ankre, og kun det hun bad om, bliver til loops.

Den anden side er at spotte, at noget, der allerede ligger i træet, er en vane.
"Tøm opvaskemaskinen" som engangsopgave er en fælde begge veje: krydser man den
af, er det løgn, for den er tilbage i aften, og lader man være, bliver den
liggende øverst og lærer hende, at listen ikke er til at stole på.

### `lib/focus.ts`: hvorfor lige den opgave

"Jeg føler det er ret random hvilken task den putter ind som den jeg skal lave
nu." Det var det. Scoringen lagde otte tal sammen til ét ud af hundrede og
sorterede på det, hvilket virker, når komponenterne er uenige, og fejler helt,
når de ikke er: tyve loops uden frist lander inden for få point af hinanden, den
øverste skifter, når klokken passerer en time, og der findes ikke noget svar på
"hvorfor lige den". En rangering, man ikke kan udspørge, er ikke til at skelne
fra en lodtrækning.

Tre ændringer, i rækkefølge efter hvor meget de betyder.

**Lag før point.** Rækkefølgen afgøres først af en kategori, og kun inden for
kategorien af score. En rigtig frist slår alt. Noget påbegyndt slår noget urørt.
Det gør rækkefølgen forklarlig i én sætning og stabil, fordi en opgave ikke
driver mellem lag, når klokken flytter sig.

**Listen er tre ting.** At have lagt det hele ind var det rigtige at gøre og
skal ikke straffes med en længere liste at kigge på. De tre bliver valgt én gang
og bliver stående dagen ud, og resten er reelt ude af syne i stedet for sorteret
længere ned.

**Vaner er ikke opgaver.** Seks daglige husholdningsloops i samme pulje som
"ring til kommunen" skubber det, der betyder noget, af pladsen og får listen til
at se bundløs ud.

Og så står der, hvorfor. Den vigtigste sætning i hele filen er den sidste: når
intet reelt skiller de øverste fra hinanden, siger den dét, i stedet for at
finde på en grund. At få at vide af et værktøj, at der ikke er et rigtigt svar,
er det, der gør, at man kan vælge en og komme i gang. En opdigtet begrundelse
gør, at man i stedet begynder at skændes med appen.

### Start Mode: uret starter forfra, totalen samler sig

Uret på skærmen måler det trin, der står foran hende, og går tilbage til nul,
hver gang hun trykker "gjort, næste". Det er ikke kosmetik. Et tal, der klatrer
gennem fem trin, laver "næste, næste, næste" om til et regnskab over, hvor lang
tid det her tager, og et regnskab over hvor lang tid det tager er præcis det,
der får hende til at stoppe. Sekunderne er ikke væk, de bliver lagt til side.

Til sidst får de deres egen skærm. Totalen for hele opgaven, alle trin talt med,
ved siden af det, hun havde sat af. Tidsblindhed bliver ikke løst ved at få den
forklaret; den bliver slidt ned af at se de to tal ved siden af hinanden ofte
nok. Appen kommenterer ikke, hvem der havde ret. Den viser begge og holder mund.

Det er det ene store øjeblik i appen. Alt andet er bevidst stille, fordi fest
hver gang holder op med at betyde noget, men at have lukket en opgave med fem
trin i er ikke hver gang.

### `lib/decompose.ts`: hver opgave kan deles op

En tredjedel af helt almindelige danske opgaver fik ingen trin overhovedet.
Ikke fordi de var svære, men fordi udsagnsordet var ægte og bare ikke havde en
håndskrevet kæde. Fra hendes side er det en knap, der ikke gør noget, og det er
det eneste, der er værre end generiske trin.

At skrive en kæde for hvert udsagnsord på dansk er heller ikke svaret. Der
findes kun en håndfuld reelt forskellige **former** for arbejde, og formen er
det, der afgør, hvor en opgave går i stå. Så hvert udsagnsord hører til én, og
formen bærer netop det stillads, den form har brug for:

- **Kontakt.** Muren er sætningen, ikke opkaldet. Beslut hvad du vil have ud af
  det først, så er det at tale den nemme del.
- **Online.** Muren er login og ikke at vide, hvilken side. Find dem først, så
  er det tre klik.
- **Fysisk.** Ingen defineret slutning, så en timer giver den en. Aldrig "lav
  det hele".
- **Ærinde.** Det dyre er overgangen ud ad døren, så den bliver hængt på en
  tur, der alligevel skulle ske.
- **Producere.** Muren er det blanke papir. En bevidst dårlig første udgave, ét
  gennemsyn, færdig. Mekanismen her er perfektionisme, ikke dovenskab.
- **Sortere.** Muren er at beslutte, igen og igen, for hver eneste ting. Så
  reglen bliver besluttet én gang, forfra, og resten er bare hænder.

Hvert forløb starter med noget fysisk, der er lille nok til, at det ville føles
fjollet at lade være, og slutter med noget, der lukker sløjfen, så det er
tydeligt, hvornår man må stoppe.

Ovenpå ligger de kæder, hvor virkeligheden har helt bestemte trin, som er værd
at kende: skat.dk, synet, pakken på posthuset, lægen. Og de steder, hvor ét
udsagnsord dækker to forskellige job, forgrener de sig på, hvad hun laver:
"forbered oplægget" og "klargør bilen til vinter" er samme ord og ikke det
samme arbejde.

To ting bliver der holdt særligt øje med, fordi begge to læses øjeblikkeligt
som at appen ikke har forstået sætningen. Grammatikken: trinnene har nu både
bydeform og navnemåde for hvert udsagnsord, så der ikke står "hvor man meld dig
fra nyhedsbrevet". Og at trinnet nævner **tingen**, ikke udsagnsordet: "Reparer
cyklen" gav engang "skriv i én linje hvad Reparer gør".

Der er præcis ét tilfælde tilbage uden trin, og det er med vilje. En aftale er
ikke en opgave. Der er ingen første handling i "Fars fødselsdag", man møder op.
Så appen siger det, i stedet for at dele den i fem dele eller lade knappen sidde
og gøre ingenting.

---

## Hvad appen ikke gør

Ingen knap i Loops lover noget browseren ikke kan:

- **Den kan ikke blokere TikTok eller Instagram.** En web-app må ikke det på
  iPhone. "Scroll-redning" er en vej *ud* af scrollen, som brugeren selv åbner ,
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
- **Coachen er ikke ChatGPT.** Der er ingen sprogmodel og ingen server, det
  ville kræve en betalt API og at hendes ord blev sendt ud af telefonen. Den
  er en regelmotor med en begrebsbank, mønstre fra hendes egne data og en
  hukommelse. Den er skarp inden for det, og den kan ikke improvisere uden for
  det. `CoachAdapter` er der, hvis den grænse en dag skal flyttes.

---

## De stille statistikker

`stats.ts` samler det, der er blevet til noget, og skærmen ligger bag
Indstillinger, ikke på forsiden. Et tal på forsiden bliver til et mål, og et
mål bliver til pres, hvilket er det ene appen ikke må tilføje. Hernede gør
tallene det modsatte: på en dårlig dag er de bevis for, at det faktisk virker.

- loops lukket, timer taget ud af hovedet, gange hun er kommet i gang
- ting hun havde skubbet flere gange, og alligevel klarede
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
  Det der gemmes er en SHA-256 af den udledte nøgle (ikke nøglen selv) så det
  der ligger i IndexedDB ikke kan bruges til at dekryptere noget.
- Nøglen holdes kun i hukommelsen i sessionen og krypterer med AES-GCM.

**Hvad der er beskyttet:** alle titler, beskrivelser, microsteps, brain dumps og
coach-samtaler, altså indholdet af hendes hoved.
**Hvad der ikke er:** træets form (hvor mange loops, hvornår de blev lavet,
hvilke der er lukket). Det bliver stående i klartekst, så Dexies indeks virker,
og så appen kan fortælle noget nyttigt uden nøglen. Begge dele står i UI'et. En
lås der oversælger sig selv er værre end ingen lås.

Koden er valgfri, den ligger som sidste, springbare trin i onboarding og kan
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

Så åbner den fullscreen som en almindelig app, også uden internet.

## Deployment

Bygger til statiske filer, så alle gratis udbydere virker. `base` er `'./'`, så
den også kan ligge i en undermappe.

- **GitHub Pages**, workflowet i `.github/workflows/deploy.yml` bygger og
  udgiver ved push til `main`. Slå Pages til under Settings → Pages → Source:
  GitHub Actions.
- **Vercel / Cloudflare Pages / Netlify**, peg på repoet. Build: `npm run build`,
  output: `dist`.

Ikonerne genereres fra samme geometri som `public/favicon.svg` med
`npm run icons`, ingen billedafhængigheder.

## Typografi og bevægelse

Skriften er systemets egen, som på iPhone er SF Pro, den er både pænere og
gratis, og den er der allerede. Inter (latin, ~48 kB) er buntet med som
reserve for Android og desktop; den hentes lokalt, ikke fra Google, så appen
bliver ved med at virke offline og sender ikke noget til tredjepart.

Bevægelserne kommer fra Framer Motion: menulinjen har én delt pille der glider
mellem fanerne med fjederfysik og frostet glas over indholdet, og cirklerne
bruger samme fjeder til zoom. Alt respekterer både `prefers-reduced-motion` og
appens egen "reduceret stimulation".
