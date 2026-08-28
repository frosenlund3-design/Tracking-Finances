import type { Completion } from '@/db/types'

/**
 * Making the numbers trustworthy.
 *
 * "Hvis der står 2 min, skal det faktisk tage 2 min." That is not a cosmetic
 * request — time blindness means an ADHD brain has no independent way to check,
 * so it has to be able to trust the app's number. One estimate that turns out
 * to be a forty-minute swamp, and the number stops meaning anything forever.
 *
 * So Loops measures. When a task is started in Start Mode and finished in the
 * same sitting, we know how long it really took. The ratio between real and
 * estimated becomes a personal factor, and every duration shown to her is put
 * through it. If her ten-minute jobs really take fourteen, the app says
 * fourteen.
 *
 * The factor is a median, not a mean: one interrupted afternoon should not
 * poison every estimate afterwards.
 */

/** Below this we do not have enough evidence, and 1 is the honest answer. */
const MIN_SAMPLES = 5
/** Anything longer was a task left open across a break, not a measurement. */
export const MAX_CREDIBLE_MINUTES = 240
/** Never distort beyond this — a wild factor is its own kind of lying. */
const MIN_FACTOR = 0.6
const MAX_FACTOR = 3

export interface Calibration {
  factor: number
  samples: number
  /** True once there is enough evidence to be adjusting anything. */
  active: boolean
}

export const NEUTRAL: Calibration = { factor: 1, samples: 0, active: false }

export function calibrationFrom(completions: Completion[]): Calibration {
  const ratios = completions
    .filter((c) => c.actualMinutes && c.minutes && c.actualMinutes <= MAX_CREDIBLE_MINUTES)
    .map((c) => (c.actualMinutes as number) / (c.minutes as number))
    // Most recent first — the app should track how she works now.
    .slice(0, 40)

  if (ratios.length < MIN_SAMPLES) return { factor: 1, samples: ratios.length, active: false }

  const sorted = [...ratios].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const raw = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2

  return {
    factor: Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, raw)),
    samples: ratios.length,
    active: true,
  }
}

/** The number actually shown to her, in minutes. */
export function calibratedMinutes(estimate: number, cal: Calibration): number {
  if (!cal.active) return estimate
  const adjusted = estimate * cal.factor
  // Round to something a person would say out loud.
  if (adjusted < 3) return Math.max(1, Math.round(adjusted))
  if (adjusted < 15) return Math.round(adjusted)
  if (adjusted < 60) return Math.round(adjusted / 5) * 5
  return Math.round(adjusted / 15) * 15
}

/** Same, for the sub-minute first actions. */
export function calibratedSeconds(estimate: number, cal: Calibration): number {
  if (!cal.active) return estimate
  return Math.round(estimate * cal.factor)
}

/** One plain sentence for the statistics screen. Never a scolding. */
export function calibrationSentence(cal: Calibration): string | null {
  if (!cal.active) {
    return cal.samples > 0
      ? `Loops har målt ${cal.samples} ${cal.samples === 1 ? 'opgave' : 'opgaver'} indtil videre. Efter et par flere begynder tiderne at rette sig efter dig.`
      : 'Når du bruger start-tilstanden, måler Loops hvor lang tid tingene faktisk tager — og retter tiderne efter dig.'
  }
  const pct = Math.round((cal.factor - 1) * 100)
  if (Math.abs(pct) < 8) return 'Dine tider passer. Når der står 10 minutter, tager det ca. 10 minutter.'
  if (pct > 0) {
    return `Ting tager typisk ${pct}% længere tid, end der først står. Loops lægger det oveni nu, så tallet passer.`
  }
  return `Du er typisk ${Math.abs(pct)}% hurtigere end først anslået. Loops trækker det fra nu.`
}
