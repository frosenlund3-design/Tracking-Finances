/**
 * Rum-scanneren.
 *
 * Hvad der faktisk kan lade sig gøre, sagt én gang så resten af koden ikke
 * lader som om andet: WebXR's plandetektion — den rigtige Pokémon GO-teknik —
 * findes ikke i Safari, og telefonen her er en iPhone. Det der derimod findes
 * på hver eneste telefon er gyroskopet.
 *
 * Så rummet deles i sektorer efter kompasretning, og en sektor tælles som
 * dækket når kameraet har peget på den længe nok. Det er ikke rumforståelse,
 * og det påstår ikke at være det — men det svarer præcist på spørgsmålet
 * "har jeg kigget hele vejen rundt", og det er det spørgsmålet i virkeligheden
 * handler om når man står midt i et rum og skal have det ryddet.
 *
 * Alt herunder er rene funktioner, så dækningen kan bevises frem for at blive
 * skønnet.
 */

export const SECTOR_COUNT = 12;
/** Hvor mange millisekunder kameraet skal holde i en sektor for at tage den. */
export const DWELL_MS = 550;

export interface Sector {
  index: number;
  /** Midterretningen i grader, 0 = der hvor scanningen begyndte. */
  bearing: number;
  covered: boolean;
  /** Hvor længe kameraet har holdt her, i millisekunder. */
  dwell: number;
}

export function emptySectors(count = SECTOR_COUNT): Sector[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    bearing: (index * 360) / count,
    covered: false,
    dwell: 0,
  }));
}

/** Bringer en vinkel ind i [0, 360). */
export function normaliseAngle(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** Hvilken sektor peger kameraet på? */
export function sectorAt(heading: number, count = SECTOR_COUNT): number {
  const width = 360 / count;
  return Math.floor(normaliseAngle(heading + width / 2) / width) % count;
}

/** Korteste vinkelafstand mellem to retninger, i grader. */
export function angleDelta(a: number, b: number): number {
  const diff = Math.abs(normaliseAngle(a) - normaliseAngle(b));
  return diff > 180 ? 360 - diff : diff;
}

export interface SweepUpdate {
  sectors: Sector[];
  /** Sektorer der blev dækket af netop dette tik. */
  captured: number[];
}

/**
 * Et tik af scanningen.
 *
 * Rene ind- og uddata, så det kan afprøves uden et kamera: giv den sektorerne,
 * hvor telefonen peger hen, og hvor lang tid der er gået.
 */
export function tickSweep(
  sectors: Sector[],
  heading: number,
  deltaMs: number,
  count = SECTOR_COUNT,
): SweepUpdate {
  const target = sectorAt(heading, count);
  const captured: number[] = [];

  const next = sectors.map((sector) => {
    if (sector.index !== target || sector.covered) return sector;
    const dwell = sector.dwell + Math.max(0, deltaMs);
    if (dwell >= DWELL_MS) {
      captured.push(sector.index);
      return { ...sector, dwell, covered: true };
    }
    return { ...sector, dwell };
  });

  return { sectors: next, captured };
}

export function coverage(sectors: Sector[]): number {
  if (sectors.length === 0) return 0;
  return sectors.filter((s) => s.covered).length / sectors.length;
}

/**
 * Hvad der mangler, sagt som en retning frem for et tal.
 *
 * "Drej til venstre" er brugbart når man står med telefonen fremme;
 * "sektor 7 mangler" er ikke.
 */
export function nextHint(sectors: Sector[], heading: number): string | null {
  const missing = sectors.filter((s) => !s.covered);
  if (missing.length === 0) return null;

  // Den nærmeste manglende sektor, og hvilken vej der er kortest derhen.
  let best = missing[0]!;
  let bestDelta = angleDelta(heading, best.bearing);
  for (const sector of missing) {
    const delta = angleDelta(heading, sector.bearing);
    if (delta < bestDelta) {
      best = sector;
      bestDelta = delta;
    }
  }

  if (bestDelta < 18) return 'Hold den lige her';
  const signed = normaliseAngle(best.bearing - heading);
  return signed < 180 ? 'Drej til højre' : 'Drej til venstre';
}

/**
 * Opgaverne der falder ud af en scanning.
 *
 * Kameraet ved ikke hvad der ligger på gulvet — ingen web-app gør. Det den
 * ved er hvor mange retninger der er blevet kigget i, og hvor lang tid det
 * tog. Derfor er opgaverne knyttet til rummet frem for til objekter, og de
 * er formuleret som noget man kan gøre uden at appen behøver at have set det.
 */
export const SWEEP_TASKS: string[] = [
  'Alt på gulvet: op på et bord eller på plads',
  'Den flade der er værst — ryd den helt',
  'Alle kopper og glas ud i køkkenet',
  'Tøj: bær, vask eller væk',
  'Papir og post i én bunke',
  'Kabler samlet',
  'Skraldespanden tømt',
  'Det der ikke hører til i rummet, bæres derhen hvor det hører til',
];

/** Tre opgaver, valgt ud fra hvor grundigt der blev scannet. */
export function tasksFor(coverageShare: number, random: () => number = Math.random): string[] {
  const wanted = coverageShare >= 0.9 ? 4 : coverageShare >= 0.6 ? 3 : 2;
  const pool = [...SWEEP_TASKS];
  const picked: string[] = [];
  const target = Math.min(wanted, pool.length);
  while (picked.length < target && pool.length > 0) {
    const [task] = pool.splice(Math.floor(random() * pool.length), 1);
    if (task) picked.push(task);
  }
  return picked;
}
