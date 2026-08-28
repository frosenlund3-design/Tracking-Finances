/**
 * Circle colours.
 *
 * Each task gets its own colour, filled as a soft gradient that fades from a
 * lighter tone into the base, no outline, no hard edge. The palette is muted
 * and adult on purpose: these are the colours of a nice ceramics shop, not of
 * a children's app.
 *
 * Colours are deterministic. The same circle is the same colour every time she
 * opens the app, which is what turns the map into a place she can remember
 * rather than a graph that gets re-drawn.
 */

export interface CircleTone {
  /** Lighter tone, top-left of the gradient. */
  from: string
  /** Base tone, bottom-right. */
  to: string
  /** Progressively lighter fills for the nested rings inside. */
  nested: string[]
  /** Readable text on top of the fill. */
  text: string
  /** Soft shadow tint. */
  shadow: string
}

/** Hue / saturation pairs. Low saturation keeps it calm at any size. */
const PALETTE: Array<[number, number]> = [
  [268, 22], // plum
  [22, 42], // terracotta
  [152, 20], // sage
  [38, 38], // sand
  [212, 24], // dusty blue
  [346, 26], // rose
  [86, 22], // olive
  [12, 30], // clay
  [318, 18], // mauve
  [186, 20], // teal
]

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/**
 * Siblings must never share a colour, so the index inside the parent picks the
 * hue and the parent's own hash rotates the whole palette. That gives distinct
 * neighbours everywhere without a global colouring pass.
 */
export function toneFor(nodeId: string, siblingIndex: number, parentId: string | null, dark: boolean): CircleTone {
  const rotation = parentId ? hash(parentId) % PALETTE.length : 0
  const index = (siblingIndex + rotation) % PALETTE.length
  const [h, s] = PALETTE[index]
  // A small per-node wobble so two circles at the same slot in different
  // branches are not literally identical.
  const wobble = (hash(nodeId) % 7) - 3

  if (dark) {
    const l = 26
    return {
      from: `hsl(${h + wobble} ${s}% ${l + 9}%)`,
      to: `hsl(${h + wobble} ${s}% ${l}%)`,
      nested: [`hsl(${h + wobble} ${s}% ${l + 7}%)`, `hsl(${h + wobble} ${s}% ${l + 13}%)`, `hsl(${h + wobble} ${s}% ${l + 19}%)`],
      text: `hsl(${h + wobble} 22% 92%)`,
      shadow: `hsl(${h + wobble} 30% 6% / 0.5)`,
    }
  }

  const l = 82
  return {
    from: `hsl(${h + wobble} ${s}% ${l + 8}%)`,
    to: `hsl(${h + wobble} ${s}% ${l - 4}%)`,
    nested: [`hsl(${h + wobble} ${s}% ${l + 4}%)`, `hsl(${h + wobble} ${s}% ${l + 9}%)`, `hsl(${h + wobble} ${s}% ${l + 13}%)`],
    text: `hsl(${h + wobble} 38% 22%)`,
    shadow: `hsl(${h + wobble} 34% 32% / 0.22)`,
  }
}

/** The centre circle is quieter than its children so the eye goes outward. */
export function centerTone(dark: boolean): CircleTone {
  return dark
    ? {
        from: 'rgb(52 47 52)',
        to: 'rgb(40 36 40)',
        nested: ['rgb(56 51 56)', 'rgb(62 57 62)', 'rgb(68 63 68)'],
        text: 'rgb(240 234 228)',
        shadow: 'rgb(0 0 0 / 0.5)',
      }
    : {
        from: 'rgb(255 253 250)',
        to: 'rgb(244 238 229)',
        nested: ['rgb(250 245 238)', 'rgb(252 249 244)', 'rgb(255 253 250)'],
        text: 'rgb(46 39 33)',
        shadow: 'rgb(60 46 34 / 0.20)',
      }
}
