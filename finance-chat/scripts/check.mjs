/**
 * Hurtigt tjek før man starter: er alle filer syntaktisk i orden, og kan
 * JSON-filerne læses? Kør: npm run check
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function walk(dir) {
  const found = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) found.push(...walk(path))
    else found.push(path)
  }
  return found
}

let failures = 0

for (const file of walk(root)) {
  const extension = extname(file)
  const relative = file.slice(root.length + 1)

  if (extension === '.js' || extension === '.mjs') {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
    } catch (error) {
      failures += 1
      console.error(`✖ ${relative}\n${error.stderr?.toString() || error.message}`)
    }
  } else if (extension === '.json' || extension === '.webmanifest') {
    try {
      JSON.parse(readFileSync(file, 'utf8'))
    } catch (error) {
      failures += 1
      console.error(`✖ ${relative}: ${error.message}`)
    }
  }
}

if (failures) {
  console.error(`\n${failures} fil(er) fejlede.`)
  process.exit(1)
}
console.log('Alt ser rigtigt ud.')
