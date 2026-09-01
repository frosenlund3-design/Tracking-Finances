/**
 * Laver PWA-ikonerne ud fra samme geometri som public/icons/icon.svg.
 *
 * Skrevet med en lille håndlavet rasterizer og zlib i stedet for et
 * billedbibliotek: motivet er en firkant og en taleboble, og på den måde
 * slipper installationen for endnu en afhængighed.
 *
 * Kør: npm run icons
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const TOP = [0x3f, 0x7d, 0xf5] // blå
const BOTTOM = [0x7b, 0x5c, 0xff] // violet
const INK = [0xff, 0xff, 0xff]

/* ------------------------------------------------------------------- PNG */

const table = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

function encodePng(size, pixels) {
  const stride = size * 4 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0 // filtertype "none"
    pixels.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bitdybde
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* -------------------------------------------------------------- geometri */

/** Alt regnes i 0-1, så samme motiv passer i alle størrelser. */
const inRoundRect = (px, py, x, y, w, h, r) => {
  if (px < x || px > x + w || py < y || py > y + h) return false
  const cx = Math.min(Math.max(px, x + r), x + w - r)
  const cy = Math.min(Math.max(py, y + r), y + h - r)
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
}

/** Boblens hale: en lille trekant der peger ned mod venstre. */
const TAIL = [
  [0.34, 0.58],
  [0.47, 0.58],
  [0.29, 0.75],
]

const inTail = (px, py) => {
  const [a, b, c] = TAIL
  // Punktet ligger i trekanten hvis det er på samme side af alle tre kanter.
  const side = (p, q) => (px - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (py - q[1])
  const d1 = side(a, b)
  const d2 = side(b, c)
  const d3 = side(c, a)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}

function drawPixel(px, py, bleed) {
  // Baggrund: lodret overgang fra blå til violet.
  const t = py
  const bg = [
    Math.round(TOP[0] + (BOTTOM[0] - TOP[0]) * t),
    Math.round(TOP[1] + (BOTTOM[1] - TOP[1]) * t),
    Math.round(TOP[2] + (BOTTOM[2] - TOP[2]) * t),
  ]

  const onPlate = bleed || inRoundRect(px, py, 0.02, 0.02, 0.96, 0.96, 0.22)
  if (!onPlate) return [0, 0, 0, 0]

  const bubble = inRoundRect(px, py, 0.24, 0.26, 0.52, 0.38, 0.11) || inTail(px, py)
  if (bubble) {
    // Tre prikker inde i boblen.
    for (const cx of [0.37, 0.5, 0.63]) {
      if ((px - cx) ** 2 + (py - 0.45) ** 2 <= 0.0026) return [...bg, 255]
    }
    return [...INK, 255]
  }
  return [...bg, 255]
}

function render(size, { bleed = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4)
  const SAMPLES = 3 // kantudjævning
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const [pr, pg, pb, pa] = drawPixel(
            (x + (sx + 0.5) / SAMPLES) / size,
            (y + (sy + 0.5) / SAMPLES) / size,
            bleed,
          )
          r += pr * pa
          g += pg * pa
          b += pb * pa
          a += pa
        }
      }
      const i = (y * size + x) * 4
      if (a > 0) {
        pixels[i] = Math.round(r / a)
        pixels[i + 1] = Math.round(g / a)
        pixels[i + 2] = Math.round(b / a)
      }
      pixels[i + 3] = Math.round(a / (SAMPLES * SAMPLES))
    }
  }
  return encodePng(size, pixels)
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'icon-192.png'), render(192))
writeFileSync(join(OUT, 'icon-512.png'), render(512))
writeFileSync(join(OUT, 'icon-maskable-512.png'), render(512, { bleed: true }))
writeFileSync(join(OUT, 'apple-touch-icon.png'), render(180, { bleed: true }))
console.log('Ikoner skrevet til public/icons/')
