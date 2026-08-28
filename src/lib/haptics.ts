/**
 * Haptics.
 *
 * Reality check: iOS Safari does not expose navigator.vibrate. On iPhone this
 * is therefore a no-op, and nothing in the UI claims otherwise — the setting is
 * labelled as "hvor det er muligt". On Android and desktop Chrome it works.
 * We never let a missing vibration change what the app does.
 */

let enabled = true

export function setHapticsEnabled(value: boolean): void {
  enabled = value
}

export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

type Pattern = 'tap' | 'success' | 'soft' | 'step'

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 8,
  soft: 4,
  step: [6, 40, 6],
  success: [10, 50, 18],
}

export function haptic(pattern: Pattern = 'tap'): void {
  if (!enabled || !hapticsSupported()) return
  try {
    navigator.vibrate(PATTERNS[pattern])
  } catch {
    /* vibration is a nicety, never a dependency */
  }
}
