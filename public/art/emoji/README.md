# Kunsten

Alle SVG-filer i denne mappe er **Noto Emoji** af Google, hentet fra
<https://github.com/googlefonts/noto-emoji> og licenseret under
**SIL Open Font License 1.1** (se `LICENSE.txt`).

De ligger i repoet frem for at blive hentet ved runtime: en flise der venter på
et CDN er en flise der glimter, og et katalog uden netværk er ikke et katalog.

Hent nye med `node scripts/fetch-emoji.mjs` efter at have tilføjet dem i
`lib/games/catalog.ts`. Scriptet springer over det der allerede er hentet.
