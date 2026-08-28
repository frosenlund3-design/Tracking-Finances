import type { WasteFraction } from '@/lib/food';

/**
 * Danish waste sorting, as it is actually printed on the bins.
 *
 * Denmark sorts into ten national fractions, and the labels below are kept in
 * Danish on purpose: they are what is written on the lid in the back yard, and
 * translating them to English would make the app less useful in the one moment
 * it is needed — standing in the kitchen holding a yoghurt pot.
 *
 * The `why` line on each item is the point of the whole file. Anyone can learn
 * that a receipt goes in residual waste; knowing it is because the paper is
 * coated for thermal printing is what makes the next unfamiliar thing sortable
 * without looking it up.
 */

export interface FractionDef {
  key: WasteFraction;
  /** As printed on Danish bins. */
  label: string;
  /** For anyone who has just moved here. */
  english: string;
  /** The national scheme's colour for this fraction. */
  color: string;
  glyph: string;
  hint: string;
}

export const FRACTIONS: FractionDef[] = [
  {
    key: 'food',
    label: 'Madaffald',
    english: 'Food waste',
    color: '#2f7d32',
    glyph: '🍎',
    hint: 'Anything that was once edible, plus coffee grounds and tea leaves.',
  },
  {
    key: 'paper',
    label: 'Papir',
    english: 'Paper',
    color: '#1565c0',
    glyph: '📄',
    hint: 'Clean, dry, unglued paper. Envelopes with windows are fine.',
  },
  {
    key: 'cardboard',
    label: 'Pap',
    english: 'Cardboard',
    color: '#8d6e3a',
    glyph: '📦',
    hint: 'Corrugated and solid board, flattened, without food grease.',
  },
  {
    key: 'metal',
    label: 'Metal',
    english: 'Metal',
    color: '#5c6bc0',
    glyph: '🥫',
    hint: 'Tins, foil, lids, small metal objects. Emptied, not scrubbed.',
  },
  {
    key: 'glass',
    label: 'Glas',
    english: 'Glass packaging',
    color: '#00897b',
    glyph: '🫙',
    hint: 'Bottles and jars only. Drinking glasses are a different material.',
  },
  {
    key: 'plastic',
    label: 'Plast',
    english: 'Plastic',
    color: '#f9a825',
    glyph: '🧴',
    hint: 'Packaging plastic, emptied. Hard and soft both.',
  },
  {
    key: 'cartons',
    label: 'Mad- og drikkekartoner',
    english: 'Food & drink cartons',
    color: '#00acc1',
    glyph: '🧃',
    hint: 'Milk and juice cartons. Cap on, not rinsed, not flattened flat.',
  },
  {
    key: 'residual',
    label: 'Restaffald',
    english: 'Residual waste',
    color: '#616161',
    glyph: '🗑️',
    hint: 'What genuinely fits nowhere else. Smaller than most people think.',
  },
  {
    key: 'textile',
    label: 'Tekstilaffald',
    english: 'Textiles',
    color: '#8e24aa',
    glyph: '👕',
    hint: 'Worn-out clothing and fabric. Wearable clothes go to charity instead.',
  },
  {
    key: 'hazardous',
    label: 'Farligt affald',
    english: 'Hazardous waste',
    color: '#d32f2f',
    glyph: '⚠️',
    hint: 'Batteries, bulbs, chemicals, paint, electronics. Never the household bin.',
  },
];

const BY_KEY = new Map(FRACTIONS.map((f) => [f.key, f]));

export function fraction(key: string): FractionDef | undefined {
  return BY_KEY.get(key as WasteFraction);
}

export function fractionLabel(key: string): string {
  return BY_KEY.get(key as WasteFraction)?.label ?? key;
}

export interface WasteItem {
  name: string;
  /** Danish name, for search. */
  danish: string;
  answer: WasteFraction;
  /** Why, in one line. This is what makes the next item guessable. */
  why: string;
  /** Items people reliably get wrong. Worth more in the game. */
  tricky?: boolean;
}

export const WASTE_ITEMS: WasteItem[] = [
  // --- straightforward, so the game has a rhythm to break ---
  { name: 'Banana peel', danish: 'Bananskræl', answer: 'food', why: 'All food scraps, peel included.' },
  { name: 'Coffee grounds', danish: 'Kaffegrums', answer: 'food', why: 'Grounds and the paper filter both count as food waste.' },
  { name: 'Tea bag', danish: 'Tebrev', answer: 'food', why: 'Bag and leaves together — remove a metal staple first.' },
  { name: 'Egg shells', danish: 'Æggeskaller', answer: 'food', why: 'Food waste, shells included.' },
  { name: 'Leftover dinner', danish: 'Madrester', answer: 'food', why: 'Cooked food is still food waste.' },
  { name: 'Newspaper', danish: 'Avis', answer: 'paper', why: 'Clean, dry, unglued paper.' },
  { name: 'Envelope with a window', danish: 'Rudekuvert', answer: 'paper', why: 'The plastic window is separated at the sorting plant.' },
  { name: 'Printer paper', danish: 'Printerpapir', answer: 'paper', why: 'Ordinary paper, staples and all.' },
  { name: 'Magazine', danish: 'Ugeblad', answer: 'paper', why: 'Glossy paper still sorts as paper.' },
  { name: 'Cardboard box', danish: 'Papkasse', answer: 'cardboard', why: 'Flatten it so the bin holds more than one.' },
  { name: 'Cereal box', danish: 'Havregrynspakke', answer: 'cardboard', why: 'Solid board. Take out the inner plastic bag.' },
  { name: 'Toilet roll tube', danish: 'Toiletrulle-rør', answer: 'cardboard', why: 'Cardboard, not paper.', tricky: true },
  { name: 'Tin can', danish: 'Konservesdåse', answer: 'metal', why: 'Emptied, not scrubbed. The lid goes in too.' },
  { name: 'Aluminium foil', danish: 'Alufolie', answer: 'metal', why: 'Foil is metal even when crumpled.' },
  { name: 'Beer cap', danish: 'Kapsel', answer: 'metal', why: 'Small metal still belongs with metal.' },
  { name: 'Tea light holder', danish: 'Fyrfadsholder', answer: 'metal', why: 'The aluminium cup, once the wax is out.' },
  { name: 'Wine bottle', danish: 'Vinflaske', answer: 'glass', why: 'Glass packaging. Cap off, no need to rinse.' },
  { name: 'Jam jar', danish: 'Marmeladeglas', answer: 'glass', why: 'Jar in glass, metal lid in metal.' },
  { name: 'Shampoo bottle', danish: 'Shampooflaske', answer: 'plastic', why: 'Hard packaging plastic.' },
  { name: 'Plastic bag', danish: 'Plastikpose', answer: 'plastic', why: 'Soft plastic sorts with plastic in Denmark.' },
  { name: 'Yoghurt pot', danish: 'Yoghurtbæger', answer: 'plastic', why: 'Emptied. The foil lid goes in metal.' },
  { name: 'Milk carton', danish: 'Mælkekarton', answer: 'cartons', why: 'Its own fraction. Cap on, do not rinse.' },
  { name: 'Juice carton', danish: 'Juicekarton', answer: 'cartons', why: 'Drink cartons have their own bin.' },
  { name: 'Passata carton', danish: 'Tomatkarton', answer: 'cartons', why: 'A food carton is the same fraction as a drink one.' },
  { name: 'Worn-out t-shirt', danish: 'Slidt t-shirt', answer: 'textile', why: 'Textile waste. Anything still wearable goes to charity.' },
  { name: 'Odd socks', danish: 'Enkelte sokker', answer: 'textile', why: 'Damaged textiles are still recycled as textiles.' },
  { name: 'Old towel', danish: 'Gammelt håndklæde', answer: 'textile', why: 'Fabric, so textile waste — even stained.' },
  { name: 'AA battery', danish: 'AA-batteri', answer: 'hazardous', why: 'Never the household bin. Most bins have a lid box for these.' },
  { name: 'LED bulb', danish: 'LED-pære', answer: 'hazardous', why: 'Electronics. Bulbs with a chip in them are hazardous.' },
  { name: 'Paint tin', danish: 'Malingsrest', answer: 'hazardous', why: 'Paint is chemical waste, tin and all.' },
  { name: 'Phone charger', danish: 'Oplader', answer: 'hazardous', why: 'Small electronics go to hazardous or a recycling centre.' },
  { name: 'Nail polish', danish: 'Neglelak', answer: 'hazardous', why: 'Solvent-based, so chemical waste.' },

  // --- the ones people get wrong ---
  { name: 'Receipt', danish: 'Kvittering', answer: 'residual', why: 'Thermal paper is coated and contaminates the paper stream.', tricky: true },
  { name: 'Pizza box with grease', danish: 'Fedtet pizzabakke', answer: 'residual', why: 'Grease ruins a batch of cardboard. A clean lid can still go in pap.', tricky: true },
  { name: 'Drinking glass', danish: 'Drikkeglas', answer: 'residual', why: 'Drinking glass melts at a different temperature than bottle glass.', tricky: true },
  { name: 'Mirror', danish: 'Spejl', answer: 'residual', why: 'Coated glass, so not glass packaging.', tricky: true },
  { name: 'Ceramic plate', danish: 'Keramiktallerken', answer: 'residual', why: 'Ceramic is not glass, however much it looks like it.', tricky: true },
  { name: 'Used tissue', danish: 'Brugt lommetørklæde', answer: 'residual', why: 'Soiled paper is residual, not paper.', tricky: true },
  { name: 'Cigarette butt', danish: 'Cigaretskod', answer: 'residual', why: 'The filter is plastic, but not recyclable plastic.', tricky: true },
  { name: 'Nappy', danish: 'Ble', answer: 'residual', why: 'Mixed and soiled materials.' },
  { name: 'Vacuum bag', danish: 'Støvsugerpose', answer: 'residual', why: 'Contents are unsortable by definition.' },
  { name: 'Chewing gum', danish: 'Tyggegummi', answer: 'residual', why: 'Gum base is a plastic, and not one that recycles.', tricky: true },
  { name: 'Wax candle stub', danish: 'Stearinlysrest', answer: 'residual', why: 'Wax is residual; the metal holder is not.', tricky: true },
  { name: 'Cat litter', danish: 'Kattegrus', answer: 'residual', why: 'Not food waste, even the clumping kind.', tricky: true },
  { name: 'Cotton bud', danish: 'Vatpind', answer: 'residual', why: 'Too small and too mixed to sort.' },
  { name: 'Toothbrush', danish: 'Tandbørste', answer: 'residual', why: 'Bonded plastic and nylon cannot be separated.', tricky: true },
  { name: 'Broken porcelain', danish: 'Knust porcelæn', answer: 'residual', why: 'Same story as ceramic.' },
  { name: 'Baking paper', danish: 'Bagepapir', answer: 'residual', why: 'Silicone-coated, so it is not paper any more.', tricky: true },
  { name: 'Foil-lined coffee bag', danish: 'Kaffepose', answer: 'residual', why: 'Layered plastic and foil, bonded together.', tricky: true },
  { name: 'Crisp packet', danish: 'Chipspose', answer: 'residual', why: 'Metallised film, not sortable plastic.', tricky: true },
  { name: 'Post-it note', danish: 'Post-it', answer: 'paper', why: 'The glue strip is small enough not to matter.', tricky: true },
  { name: 'Paper coffee cup', danish: 'Papkrus', answer: 'residual', why: 'Plastic-lined so it holds liquid — and so it is not pap.', tricky: true },
  { name: 'Milk carton cap', danish: 'Karton-låg', answer: 'cartons', why: 'Leave the cap on the carton. It is sorted downstream.', tricky: true },
  { name: 'Metal lid from a jar', danish: 'Metallåg fra glas', answer: 'metal', why: 'Off the jar, into metal — two fractions from one item.', tricky: true },
  { name: 'Bubble wrap', danish: 'Bobleplast', answer: 'plastic', why: 'Soft plastic packaging, so plastic.', tricky: true },
  { name: 'Plant pot (plastic)', danish: 'Plastikurtepotte', answer: 'plastic', why: 'Plastic even when it is not packaging.', tricky: true },
  { name: 'Wine cork', danish: 'Naturkork', answer: 'residual', why: 'Natural cork is not food waste and not packaging plastic.', tricky: true },
  { name: 'Screw cap from a bottle', danish: 'Skruelåg', answer: 'metal', why: 'Metal cap, metal bin.' },
  { name: 'Egg carton', danish: 'Æggebakke', answer: 'cardboard', why: 'Moulded paper pulp sorts as cardboard.', tricky: true },
  { name: 'Wrapping paper with glitter', danish: 'Glimmer-gavepapir', answer: 'residual', why: 'Glitter and plastic film make it unrecyclable.', tricky: true },
  { name: 'Clean aluminium tray', danish: 'Ren aluform', answer: 'metal', why: 'Scrape it out; it does not need washing.' },
  { name: 'Frying oil', danish: 'Brugt stegeolie', answer: 'hazardous', why: 'Never down the drain. Small amounts can go in residual, sealed.', tricky: true },
  { name: 'Medicine', danish: 'Medicinrester', answer: 'hazardous', why: 'Back to the pharmacy, which handles it as hazardous.', tricky: true },
  { name: 'Spray can', danish: 'Spraydåse', answer: 'hazardous', why: 'Pressurised and often chemical, even when empty.', tricky: true },
  { name: 'Old phone', danish: 'Gammel telefon', answer: 'hazardous', why: 'Electronics, and the battery especially.' },
  { name: 'Ink cartridge', danish: 'Blækpatron', answer: 'hazardous', why: 'Ink is a chemical and the cartridge is electronics.', tricky: true },
];

/** Items grouped by answer, so a round can be balanced across fractions. */
export function itemsByFraction(): Map<WasteFraction, WasteItem[]> {
  const map = new Map<WasteFraction, WasteItem[]>();
  for (const item of WASTE_ITEMS) {
    const list = map.get(item.answer) ?? [];
    list.push(item);
    map.set(item.answer, list);
  }
  return map;
}

/** Free-text lookup for "which bin does this go in?". */
export function findItem(query: string): WasteItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return WASTE_ITEMS.filter(
    (item) => item.name.toLowerCase().includes(q) || item.danish.toLowerCase().includes(q),
  ).slice(0, 8);
}

/* --------------------------------------------------------------- a round */

/**
 * Builds a round.
 *
 * Two constraints make it feel like a game rather than a quiz. It draws across
 * at least five different fractions, so the answer is never "the same bin
 * again"; and about a third of the items are ones people reliably get wrong,
 * which is where the round stops being a formality and starts teaching
 * something.
 */
export function buildSortRound(size = 10, random: () => number = Math.random): WasteItem[] {
  const tricky = WASTE_ITEMS.filter((i) => i.tricky);
  const plain = WASTE_ITEMS.filter((i) => !i.tricky);
  const wantTricky = Math.round(size * 0.35);

  const picked = [
    ...shuffle(tricky, random).slice(0, Math.min(wantTricky, tricky.length)),
    ...shuffle(plain, random).slice(0, Math.max(0, size - Math.min(wantTricky, tricky.length))),
  ];

  // A round that happens to be four bins repeated is a worse round. Top up
  // from unused fractions until at least five are represented.
  const used = new Set(picked.map((i) => i.answer));
  if (used.size < 5) {
    const spare = shuffle(
      WASTE_ITEMS.filter((i) => !used.has(i.answer) && !picked.includes(i)),
      random,
    );
    for (const item of spare) {
      if (used.size >= 5) break;
      picked[picked.length - 1] = item;
      used.add(item.answer);
    }
  }

  return shuffle(picked, random).slice(0, size);
}

function shuffle<T>(list: T[], random: () => number): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
