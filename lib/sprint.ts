/**
 * To-minutters sprints.
 *
 * Hver eneste opgave herunder kan nås på et godt stykke under to minutter af
 * en der har udskudt den i en måned. Det er den eneste regel listen følger, og
 * det er den regel der betyder noget: "ryd køkkenet" er et projekt og bliver
 * undgået, "alt på bordet tilbage hvor det hører til" er en opgave og bliver
 * gjort.
 */

export interface Room {
  key: string;
  label: string;
  glyph: string;
  tasks: string[];
}

export const ROOMS: Room[] = [
  {
    key: 'kitchen',
    label: 'Køkken',
    glyph: '🍳',
    tasks: [
      'Alt på bordet tilbage hvor det hører til',
      'Tør én flade af — den værste',
      'Tøm opvaskemaskinen, eller fyld den',
      'Smid det ud i køleskabsdøren der åbenlyst er færdigt',
      'Fold eller smid poserne på stolen',
      'Sæt det rene service på plads — kun det rene',
    ],
  },
  {
    key: 'bathroom',
    label: 'Badeværelse',
    glyph: '🛁',
    tasks: [
      'Smid det ud du ikke har rørt i et år',
      'Tør vask og hane af',
      'Rent håndklæde frem, det gamle i vask',
      'Alt på badekarskanten tilbage på en hylde',
      'Smid de tomme flasker i bruseren ud',
    ],
  },
  {
    key: 'bedroom',
    label: 'Soveværelse',
    glyph: '🛏️',
    tasks: [
      'Tøjet på stolen: brugt, vask eller væk',
      'Ryd én flade helt',
      'Red sengen — dårligt er fint',
      'Glas og kopper tilbage i køkkenet',
      'Alt under sengen der ikke hører til der',
    ],
  },
  {
    key: 'living',
    label: 'Stue',
    glyph: '🛋️',
    tasks: [
      'Puderne tilbage i sofaen',
      'Alt på sofabordet: væk eller rettet op',
      'Kablerne samlet i ét bundt',
      'Post og papir i én bunke',
      'Alt der hører til i et andet rum, ind i det rum',
    ],
  },
  {
    key: 'desk',
    label: 'Skrivebord',
    glyph: '💻',
    tasks: [
      'Hver eneste kop og glas ud i køkkenet',
      'Papir i én bunke, smid det åbenlyse ud',
      'Kabler redt ud og bag bordet',
      'Tør bordet af når fladen endelig er fri',
      'Luk de faner du ikke læser',
    ],
  },
  {
    key: 'hallway',
    label: 'Entré',
    glyph: '🚪',
    tasks: [
      'Skoene parvis og op ad væggen',
      'Jakker på knager, ikke på gulvet',
      'Post: smid ud, gem, eller gør noget ved den',
      'Tasker op fra gulvet',
      'Det der har stået ved døren i en uge, flyttes',
    ],
  },
];

const BY_KEY = new Map(ROOMS.map((r) => [r.key, r]));

export function room(key: string): Room | undefined {
  return BY_KEY.get(key);
}

/** Tre opgaver til et rum. Tre, fordi fire er en liste. */
export function pickTasks(roomKey: string, count = 3, random: () => number = Math.random): string[] {
  const found = BY_KEY.get(roomKey);
  if (!found) return [];
  const pool = [...found.tasks];
  // Låst før løkken: `pool` bliver tømt undervejs, så en sammenligning med
  // dens aktuelle længde ville stoppe cirka halvvejs.
  const wanted = Math.min(count, pool.length);
  const picked: string[] = [];
  while (picked.length < wanted && pool.length > 0) {
    const [task] = pool.splice(Math.floor(random() * pool.length), 1);
    if (task) picked.push(task);
  }
  return picked;
}

export const SPRINT_SECONDS = 120;
