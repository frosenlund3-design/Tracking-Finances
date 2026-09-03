/**
 * Nothing a thumb has to hit is smaller than 44px.
 *
 * A button below that is not a styling detail on a phone. A missed tap reads
 * as the app not responding, so she taps again, often on whatever is next to
 * it, and then the app has done something she did not ask for. Thirty-six of
 * them had drifted down to 42 and one drag handle to 26.
 *
 * Checked on every build rather than remembered, like the em dashes.
 *
 * Run as part of `npm run check`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const FLOOR = 44

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (/\.tsx$/.test(name)) out.push(path)
  }
  return out
}

let bad = 0
for (const file of walk('src')) {
  const text = readFileSync(file, 'utf8')
  text.split('\n').forEach((line, i) => {
    // Only the explicit pixel sizes. Padding-based heights are checked in the
    // browser sweep instead, where the real box can be measured.
    for (const m of line.matchAll(/\b(?:min-h|h)-\[(\d+)px\]/g)) {
      const px = Number(m[1])
      if (px >= FLOOR) continue
      // Decorative bars, rings and icons are not tap targets.
      if (/rounded-full bg-line|aria-hidden|absolute|pointer-events-none/.test(line)) continue
      if (!/button|onClick|onPointerDown|role="button"|cursor-grab/.test(line + text.slice(text.indexOf(line) - 400, text.indexOf(line)))) continue
      bad++
      console.log(`  ${file}:${i + 1}  ${px}px: ${line.trim().slice(0, 90)}`)
    }
  })
}

console.log(bad ? `\n${bad} for små tryk-mål\n` : '\nalle tryk-mål er mindst 44px\n')
process.exit(bad ? 1 : 0)
