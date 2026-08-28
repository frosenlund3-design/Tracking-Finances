/**
 * Generates the PWA PNG icons from the same geometry as public/favicon.svg.
 *
 * Done with a tiny hand-rolled rasteriser + zlib PNG encoder rather than an
 * image dependency: the artwork is a handful of circles, and this keeps the
 * install footprint (and the build) free of native binaries.
 *
 * Run: node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { Buffer } from 'node:buffer'

const BG = [0xf6, 0xf1, 0xe9]
const INK = [0x2e, 0x27, 0x21]

const DOTS = [
  { x: 0.5, y: 0.203, r: 0.0586, c: [0x8c, 0x7a, 0xa5], a: 1 },
  { x: 0.758, y: 0.352, r: 0.0469, c: [0xd6, 0xa7, 0x80], a: 1 },
  { x: 0.758, y: 0.648, r: 0.0391, c: [0x8a, 0xa8, 0x9e], a: 1 },
  { x: 0.5, y: 0.797, r: 0.0508, c: [0xa8, 0x9b, 0x8d], a: 1 },
  { x: 0.242, y: 0.648, r: 0.043, c: [0x8c, 0x7a, 0xa5], a: 0.7 },
  { x: 0.242, y: 0.352, r: 0.0352, c: [0xd6, 0xa7, 0x80], a: 0.75 },
]

function crc32(buf) {
  let c
  const table = crc32.table ?? (crc32.table = Array.from({ length: 256 }, (_, n) => {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  }))
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function encodePng(size, pixels) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** 3x3 supersampling keeps the circle edges smooth without a real rasteriser. */
function render(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4)
  const SS = 3
  const cornerR = maskable ? 0 : size * 0.219
  const scale = maskable ? 0.78 : 1 // safe zone for maskable icons
  const off = (size * (1 - scale)) / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS
          const fy = y + (sy + 0.5) / SS
          const sample = shade(fx, fy, size, cornerR, scale, off, maskable)
          r += sample[0]; g += sample[1]; b += sample[2]; a += sample[3]
        }
      }
      const n = SS * SS
      const i = (y * size + x) * 4
      px[i] = Math.round(r / n)
      px[i + 1] = Math.round(g / n)
      px[i + 2] = Math.round(b / n)
      px[i + 3] = Math.round(a / n)
    }
  }
  return px
}

function shade(fx, fy, size, cornerR, scale, off, maskable) {
  // Background plate (rounded rect, or full bleed for maskable).
  if (!maskable && !insideRoundedRect(fx, fy, size, cornerR)) return [0, 0, 0, 0]

  let col = [...BG]

  // Geometry is expressed in unit coordinates of the inner artwork box.
  const ux = (fx - off) / (size * scale)
  const uy = (fy - off) / (size * scale)

  // Main ring: r 0.1875, stroke 0.03125
  const d = Math.hypot(ux - 0.5, uy - 0.5)
  if (Math.abs(d - 0.1875) <= 0.0156) col = [...INK]

  for (const dot of DOTS) {
    if (Math.hypot(ux - dot.x, uy - dot.y) <= dot.r) {
      col = dot.a === 1 ? [...dot.c] : mix(col, dot.c, dot.a)
    }
  }
  return [col[0], col[1], col[2], 255]
}

function mix(base, top, alpha) {
  return base.map((v, i) => Math.round(v * (1 - alpha) + top[i] * alpha))
}

function insideRoundedRect(x, y, size, r) {
  if (x < r && y < r) return Math.hypot(r - x, r - y) <= r
  if (x > size - r && y < r) return Math.hypot(x - (size - r), r - y) <= r
  if (x < r && y > size - r) return Math.hypot(r - x, y - (size - r)) <= r
  if (x > size - r && y > size - r) return Math.hypot(x - (size - r), y - (size - r)) <= r
  return true
}

mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true })

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
]

for (const [name, size, opts] of targets) {
  const png = encodePng(size, render(size, opts))
  writeFileSync(new URL(`../public/icons/${name}`, import.meta.url), png)
  console.log(`${name}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`)
}
