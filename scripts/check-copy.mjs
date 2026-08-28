/**
 * No em dashes. Anywhere.
 *
 * They read as machine-written, which is the last thing this app should sound
 * like, and one of them survived a manual sweep and shipped. So it is checked
 * on every build rather than remembered.
 *
 * Run as part of `npm run check`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['src', 'public', 'scripts']
const FILES = ['index.html', 'vite.config.ts', 'README.md']
// Built from code points so this file does not trip over itself.
const BANNED = [
  ['\u2014', 'em dash'],
  ['\u2015', 'horizontal bar'],
  ['\u2012', 'figure dash'],
]

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (/\.(ts|tsx|js|mjs|css|html|json|md|webmanifest)$/.test(name)) out.push(path)
  }
  return out
}

const files = [...ROOTS.flatMap((r) => { try { return walk(r) } catch { return [] } }), ...FILES]
let bad = 0

for (const file of files) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  text.split('\n').forEach((line, i) => {
    for (const [char, name] of BANNED) {
      if (line.includes(char)) {
        bad++
        console.log(`  ${file}:${i + 1}  ${name}: ${line.trim().slice(0, 90)}`)
      }
    }
  })
}

console.log(bad ? `\n${bad} tankestreger tilbage\n` : '\ningen tankestreger\n')
process.exit(bad ? 1 : 0)
