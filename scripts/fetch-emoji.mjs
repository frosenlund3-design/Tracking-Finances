/**
 * Henter kunsten til spilfliserne.
 *
 * Noto Emoji, SIL Open Font License 1.1 — fri at bruge, ændre og distribuere.
 * Filerne ligger i repoet frem for at blive hentet ved runtime: en flise der
 * venter på et CDN er en flise der glimter, og et katalog uden netværk er
 * ikke et katalog.
 *
 * Kør:  node scripts/fetch-emoji.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCE = 'https://raw.githubusercontent.com/googlefonts/noto-emoji/main/svg';
const OUT = path.join(process.cwd(), 'public', 'art', 'emoji');

/** Noto navngiver efter kodepunkter, uden variationsvælgeren FE0F. */
export function notoName(emoji) {
  const points = [...emoji]
    .map((c) => c.codePointAt(0).toString(16))
    .filter((hex) => hex !== 'fe0f');
  return `emoji_u${points.join('_')}.svg`;
}

async function main() {
  const { allEmoji } = await import('./emoji-list.mjs');
  const wanted = allEmoji();
  await fs.mkdir(OUT, { recursive: true });

  let fetched = 0;
  let skipped = 0;
  const missing = [];

  for (const emoji of wanted) {
    const name = notoName(emoji);
    const target = path.join(OUT, name);
    try {
      await fs.access(target);
      skipped += 1;
      continue;
    } catch {
      // Ikke hentet endnu.
    }

    const response = await fetch(`${SOURCE}/${name}`);
    if (!response.ok) {
      missing.push(`${emoji} → ${name} (${response.status})`);
      continue;
    }
    const body = await response.text();
    // Fjern Illustrator-kommentarer og XML-erklæring: de fylder en fjerdedel
    // af filen og betyder ingenting i en <img>.
    const trimmed = body
      .replace(/<\?xml[^>]*\?>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
    await fs.writeFile(target, trimmed, 'utf8');
    fetched += 1;
  }

  console.log(`hentet ${fetched}, havde ${skipped}, mangler ${missing.length}`);
  for (const m of missing) console.log('  ✗', m);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
