import type { Difficulty, Step } from './catalog';
import { DIFFICULTY_TIME } from './catalog';

/**
 * Rækkefølgen.
 *
 * Det her er den ene ting appen gør bedre end mavefornemmelsen. To regler:
 *
 *   1. Et trin må ikke komme før det det afhænger af. Vand på et gulv med
 *      støv på bliver til mudder, og rens der ikke har fået lov at virke
 *      betyder at man skrubber i ti minutter i stedet for i ét.
 *
 *   2. Et trin der kører videre uden dig — vaskemaskinen, ovnen, rensen der
 *      skal trække — skal i gang så tidligt som overhovedet muligt. Det er
 *      dér de fleste taber en halv time: maskinen sættes over til sidst, og
 *      så står man og venter på noget der kunne have kørt hele tiden.
 *
 * Alt herunder er rene funktioner, så rækkefølgen kan bevises frem for at
 * blive skønnet.
 */

export interface PlannedStep extends Step {
  /** Nummeret i den rækkefølge appen foreslår. */
  order: number;
  /** Sandt når trinnet er flyttet frem foran noget der stod før det. */
  hoisted: boolean;
  /** Hvor mange sekunder inde i forløbet trinnet begynder. */
  startsAt: number;
  /** Hvor længe trinnet optager dig. */
  handsOnSeconds: number;
}

export interface Plan {
  steps: PlannedStep[];
  /** Fra du begynder til du er færdig, inklusive den tid du venter. */
  totalSeconds: number;
  /** Hvor meget af det du faktisk står med. */
  handsOnSeconds: number;
  /**
   * Hvad det ville tage, hvis man gjorde det man plejer.
   *
   * Ikke den skrevne rækkefølge — kataloget skriver allerede den rigtige, så
   * den sammenligning ville altid vise nul. Målt i stedet mod den fejl der
   * rent faktisk begås: at sætte det i gang til sidst der kunne have kørt
   * hele tiden.
   */
  naiveSeconds: number;
  /** De trin der er værd at forklare inden man går i gang. */
  insights: Array<{ id: string; text: string; why: string }>;
}

const DEFAULT_SECONDS = 90;

/** Hvor længe trinnet optager dig, i modsætning til hvor længe det varer. */
function handsOn(step: Step, scale: number): number {
  const raw = step.handsOn ?? step.seconds ?? DEFAULT_SECONDS;
  return Math.max(5, Math.round(raw * scale));
}

/** Hvor længe der går før trinnets virkning er færdig. */
function runsFor(step: Step, scale: number): number {
  // Kun din egen tid skaleres af sværhedsgraden. En vaskemaskine kører ikke
  // hurtigere fordi man har valgt svær.
  if (step.background) return step.seconds ?? DEFAULT_SECONDS;
  return handsOn(step, scale);
}

/**
 * Lægger en tidsplan for en given rækkefølge.
 *
 * Du kan kun lave én ting ad gangen, men verden kan lave flere: et trin
 * begynder når du er ledig *og* det det afhænger af er færdigt. Det er
 * derfor rækkefølgen betyder noget — sættes vasketøjet over til sidst, står
 * halvanden time og venter på ingenting.
 */
function schedule(order: Step[], scale: number) {
  const finishedAt = new Map<string, number>();
  const startedAt = new Map<string, number>();
  let personFree = 0;

  for (const step of order) {
    const ready = (step.after ?? []).reduce(
      (latest, id) => Math.max(latest, finishedAt.get(id) ?? 0),
      0,
    );
    const start = Math.max(personFree, ready);
    const mine = handsOn(step, scale);
    personFree = start + mine;
    startedAt.set(step.id, start);
    finishedAt.set(step.id, start + runsFor(step, scale));
  }

  return { startedAt, elapsed: personFree };
}

/**
 * Lægger planen.
 *
 * En Kahn-sortering hvor det eneste der adskiller to trin der begge er klar,
 * er om det ene kører videre uden dig. Gør det, kommer det først.
 */
export function planSteps(steps: Step[], difficulty: Difficulty = 'mellem'): Plan {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const position = new Map(steps.map((step, i) => [step.id, i]));

  // Afhængigheder der peger på noget der ikke findes, ignoreres frem for at
  // låse hele planen. En stavefejl i kataloget må aldrig blokere et spil.
  const remaining = new Map(
    steps.map((step) => [
      step.id,
      new Set((step.after ?? []).filter((id) => byId.has(id) && id !== step.id)),
    ]),
  );

  const ordered: Step[] = [];
  const done = new Set<string>();

  while (ordered.length < steps.length) {
    const ready = steps.filter(
      (step) => !done.has(step.id) && [...remaining.get(step.id)!].every((id) => done.has(id)),
    );

    if (ready.length === 0) {
      // Cyklus i kataloget. Tag resten i skreven rækkefølge frem for at hænge.
      for (const step of steps) if (!done.has(step.id)) ready.push(step);
    }

    ready.sort((a, b) => {
      // Det der kører uden dig, først — og det der kører længst, allerførst.
      const background = Number(Boolean(b.background)) - Number(Boolean(a.background));
      if (background !== 0) return background;
      if (a.background && b.background) {
        const length = (b.seconds ?? 0) - (a.seconds ?? 0);
        if (length !== 0) return length;
      }
      return (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0);
    });

    const next = ready[0]!;
    ordered.push(next);
    done.add(next.id);
  }

  const scale = DIFFICULTY_TIME[difficulty];
  const smart = schedule(ordered, scale);
  const naive = schedule(naiveOrder(steps, byId, position), scale);

  const planned: PlannedStep[] = ordered.map((step, i) => ({
    ...step,
    order: i + 1,
    hoisted: (position.get(step.id) ?? 0) > i,
    startsAt: smart.startedAt.get(step.id) ?? 0,
    handsOnSeconds: handsOn(step, scale),
  }));

  /*
   * Hvad der er værd at sige inden man går i gang.
   *
   * De to slags trin folk ikke selv ville have taget i den rækkefølge: dem
   * der er flyttet frem, og dem der kører videre uden én. At kataloget
   * tilfældigvis allerede har skrevet rensen først, gør den ikke mindre
   * overraskende for den der plejer at skrubbe med det samme — så
   * baggrundstrin tæller med uanset hvor de stod.
   */
  const insights = planned
    .filter((step) => step.why && (step.hoisted || step.background))
    .slice(0, 3)
    .map((step) => ({ id: step.id, text: step.text, why: step.why! }));

  return {
    steps: planned,
    totalSeconds: smart.elapsed,
    handsOnSeconds: planned.reduce((sum, step) => sum + step.handsOnSeconds, 0),
    naiveSeconds: naive.elapsed,
    insights,
  };
}

/**
 * Rækkefølgen uden hjælp.
 *
 * Præcis den modsatte regel: alt der kunne køre uden dig, skubbes så langt
 * bagud som afhængighederne tillader. Det er ikke en stråmand — det er den
 * ene fejl der gør et vasketøj til en hel eftermiddag i stedet for en time.
 */
function naiveOrder(
  steps: Step[],
  byId: Map<string, Step>,
  position: Map<string, number>,
): Step[] {
  const remaining = new Map(
    steps.map((step) => [
      step.id,
      new Set((step.after ?? []).filter((id) => byId.has(id) && id !== step.id)),
    ]),
  );
  const ordered: Step[] = [];
  const done = new Set<string>();

  while (ordered.length < steps.length) {
    const ready = steps.filter(
      (step) => !done.has(step.id) && [...remaining.get(step.id)!].every((id) => done.has(id)),
    );
    if (ready.length === 0) {
      for (const step of steps) if (!done.has(step.id)) ready.push(step);
    }
    ready.sort((a, b) => {
      const background = Number(Boolean(a.background)) - Number(Boolean(b.background));
      if (background !== 0) return background;
      return (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0);
    });
    const next = ready[0]!;
    ordered.push(next);
    done.add(next.id);
  }
  return ordered;
}

/**
 * Er det her trin klar?
 *
 * Bruges mens der spilles: et trin hvis forudsætninger ikke er krydset af,
 * er ikke forkert at trykke på — det er bare ikke tur endnu, og skærmen
 * siger hvorfor i stedet for at deaktivere knappen uden forklaring.
 */
export function blockedBy(step: Step, doneIds: Set<string>, all: Step[]): Step[] {
  const byId = new Map(all.map((s) => [s.id, s]));
  return (step.after ?? [])
    .filter((id) => !doneIds.has(id))
    .map((id) => byId.get(id))
    .filter((s): s is Step => Boolean(s));
}

/** "12 min" eller "1 t 5 min". Til fliser og overskrifter. */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return 'under 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} t` : `${hours} t ${rest} min`;
}
