import { describe, expect, it } from 'vitest';
import { planSteps, blockedBy, formatDuration } from '@/lib/games/plan';
import { GAMES, game } from '@/lib/games/catalog';
import type { Step } from '@/lib/games/catalog';

describe('rækkefølgen', () => {
  it('sætter aldrig et trin før det det afhænger af', () => {
    for (const g of GAMES) {
      if (!g.steps) continue;
      const plan = planSteps(g.steps);
      const seen = new Set<string>();
      for (const step of plan.steps) {
        for (const dependency of step.after ?? []) {
          expect(seen.has(dependency), `${g.id}: ${step.id} kom før ${dependency}`).toBe(true);
        }
        seen.add(step.id);
      }
    }
  });

  it('starter det der kører uden dig, så tidligt som muligt', () => {
    const steps: Step[] = [
      { id: 'a', text: 'Noget der tager tid', seconds: 300 },
      { id: 'b', text: 'Noget andet', seconds: 300 },
      { id: 'maskine', text: 'Sæt maskinen i gang', background: true, seconds: 60 },
    ];
    const plan = planSteps(steps);
    expect(plan.steps[0]!.id).toBe('maskine');
    expect(plan.steps[0]!.hoisted).toBe(true);
  });

  it('flytter ikke et baggrundstrin foran det der skal ske først', () => {
    const steps: Step[] = [
      { id: 'af', text: 'Riv sengetøjet af', seconds: 90 },
      { id: 'maskine', text: 'Maskinen i gang', after: ['af'], background: true, seconds: 60 },
    ];
    const plan = planSteps(steps);
    expect(plan.steps.map((s) => s.id)).toEqual(['af', 'maskine']);
  });

  it('sparer den tid der ellers går med at vente på en ovn', () => {
    const plan = planSteps(game('lave-mad')!.steps!);
    // Ovnen tændes først og er varm når maden skal i. Gøres den til sidst,
    // står man og venter på den samme opvarmning bagefter.
    expect(plan.steps[0]!.id).toBe('ovn');
    expect(plan.naiveSeconds - plan.totalSeconds).toBeGreaterThanOrEqual(600);
  });

  it('skelner mellem hvor længe det tager og hvor længe du står med det', () => {
    const plan = planSteps(game('vasketoej')!.steps!);
    // Halvanden times vask, ti minutters arbejde. Det er det tal der afgør
    // om man går i gang nu eller på lørdag.
    expect(plan.handsOnSeconds).toBeLessThan(plan.totalSeconds / 4);
    expect(plan.handsOnSeconds).toBeGreaterThan(0);
  });

  it('regner et baggrundstrins køretid med, ikke bare det at sætte det i gang', () => {
    const plan = planSteps(game('vasketoej')!.steps!);
    const hang = plan.steps.find((s) => s.id === 'toerre')!;
    // Tøjet kan ikke hænges op før maskinen er færdig.
    expect(hang.startsAt).toBeGreaterThan(3600);
  });

  it('venter ikke på noget ingenting afhænger af', () => {
    const plan = planSteps(game('sengetoej')!.steps!);
    // Sengen redes mens maskinen kører. Der ventes ikke på den.
    expect(plan.totalSeconds).toBe(plan.handsOnSeconds);
  });

  it('forklarer hvert trin den har flyttet frem', () => {
    const plan = planSteps(game('badevaerelse')!.steps!);
    expect(plan.steps[0]!.id).toBe('spray');
    expect(plan.insights.map((i) => i.id)).toContain('spray');
    for (const insight of plan.insights) expect(insight.why.length).toBeGreaterThan(15);
  });

  it('bruger den skrevne rækkefølge når intet andet adskiller to trin', () => {
    const steps: Step[] = [
      { id: 'et', text: 'Et', seconds: 60 },
      { id: 'to', text: 'To', seconds: 60 },
      { id: 'tre', text: 'Tre', seconds: 60 },
    ];
    expect(planSteps(steps).steps.map((s) => s.id)).toEqual(['et', 'to', 'tre']);
  });

  it('hænger ikke på en cyklus i kataloget', () => {
    const steps: Step[] = [
      { id: 'a', text: 'A', after: ['b'] },
      { id: 'b', text: 'B', after: ['a'] },
    ];
    const plan = planSteps(steps);
    expect(plan.steps).toHaveLength(2);
  });

  it('ignorerer en afhængighed der peger på ingenting', () => {
    const steps: Step[] = [
      { id: 'a', text: 'A', after: ['findes-ikke'] },
      { id: 'b', text: 'B', after: ['a'] },
    ];
    expect(planSteps(steps).steps.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('ignorerer et trin der afhænger af sig selv', () => {
    const steps: Step[] = [{ id: 'a', text: 'A', after: ['a'] }];
    expect(planSteps(steps).steps).toHaveLength(1);
  });

  it('giver mere tid på let end på svær', () => {
    const steps = game('opvask')!.steps!;
    const let_ = planSteps(steps, 'let').totalSeconds;
    const svaer = planSteps(steps, 'svaer').totalSeconds;
    expect(let_).toBeGreaterThan(svaer);
  });

  it('starter hvert trin hvor det forrige slap', () => {
    const plan = planSteps(game('ryd-rum')!.steps!);
    for (let i = 1; i < plan.steps.length; i += 1) {
      expect(plan.steps[i]!.startsAt).toBeGreaterThanOrEqual(plan.steps[i - 1]!.startsAt);
    }
    expect(plan.steps[0]!.startsAt).toBe(0);
  });
});

describe('hvad der spærrer', () => {
  it('nævner kun det der faktisk mangler', () => {
    const steps = game('opvask')!.steps!;
    const fyld = steps.find((s) => s.id === 'fyld')!;
    expect(blockedBy(fyld, new Set(), steps).map((s) => s.id)).toEqual(['toem']);
    expect(blockedBy(fyld, new Set(['toem']), steps)).toEqual([]);
  });
});

describe('varighed', () => {
  it('skriver tid som et menneske ville sige det', () => {
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(30)).toBe('1 min');
    expect(formatDuration(20)).toBe('under 1 min');
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(3600)).toBe('1 t');
    expect(formatDuration(3900)).toBe('1 t 5 min');
  });
});
