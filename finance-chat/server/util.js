/** Små hjælpere, der bruges begge steder (Stripe og GoHighLevel). */

/** Valutaer uden decimaler. Stripe regner i mindste enhed for alle andre. */
const ZERO_DECIMAL = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
])

/** 12995 + "dkk" → "129,95 DKK". Beløb fra Stripe er altid i øre/cent. */
export function money(minorAmount, currency = 'dkk') {
  if (minorAmount === null || minorAmount === undefined) return null
  const code = String(currency || 'dkk').toLowerCase()
  const value = ZERO_DECIMAL.has(code) ? minorAmount : minorAmount / 100
  const formatted = new Intl.NumberFormat('da-DK', {
    minimumFractionDigits: ZERO_DECIMAL.has(code) ? 0 : 2,
    maximumFractionDigits: ZERO_DECIMAL.has(code) ? 0 : 2,
  }).format(value)
  return `${formatted} ${code.toUpperCase()}`
}

/** Unix-sekunder → "2026-09-01" (læsbart for både model og menneske). */
export function date(unixSeconds) {
  if (!unixSeconds) return null
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10)
}

/** Unix-sekunder → fuld ISO-tid. */
export function dateTime(unixSeconds) {
  if (!unixSeconds) return null
  return new Date(unixSeconds * 1000).toISOString()
}

/** "2026-01-01", "2026-01-01T10:00:00Z" eller unix-tal → unix-sekunder. */
export function toUnix(value) {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value === 'number') return Math.floor(value)
  const trimmed = String(value).trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  const parsed = Date.parse(trimmed.length === 10 ? `${trimmed}T00:00:00Z` : trimmed)
  return Number.isNaN(parsed) ? undefined : Math.floor(parsed / 1000)
}

/** Holder et tal inden for sine grænser, uanset hvad modellen finder på. */
export function clamp(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

/** Fjerner tomme felter, så tool-svar ikke fyldes med null. */
export function compact(object) {
  const out = {}
  for (const [key, value] of Object.entries(object)) {
    if (value === null || value === undefined || value === '') continue
    if (Array.isArray(value) && value.length === 0) continue
    out[key] = value
  }
  return out
}

/** Klipper meget lange tekster, så ét opslag ikke fylder hele samtalen. */
export function truncate(text, max = 600) {
  if (typeof text !== 'string') return text
  return text.length > max ? `${text.slice(0, max)}… [afkortet]` : text
}

/** Sidste udvej hvis et tool-svar bliver absurd stort. */
export function toToolText(value, maxChars = 60000) {
  const json = JSON.stringify(value, null, 0)
  if (json.length <= maxChars) return json
  return JSON.stringify({
    afkortet: true,
    besked:
      'Svaret var for stort til at vises helt. Bed om et mindre udsnit (færre rækker eller en kortere periode).',
    uddrag: json.slice(0, maxChars),
  })
}
