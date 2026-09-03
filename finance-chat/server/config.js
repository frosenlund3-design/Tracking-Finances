/**
 * Al opsætning ét sted.
 *
 * Nøgler læses fra miljøvariabler, og fra en .env-fil hvis den ligger ved
 * siden af package.json. Ingen nøgle forlader nogensinde serveren: browseren
 * taler kun med denne server, og serveren taler med Stripe, GoHighLevel og
 * Claude.
 */
import { readFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Minimal .env-læser, så vi slipper for endnu en afhængighed. */
function loadEnvFile() {
  const file = join(ROOT, '.env')
  if (!existsSync(file)) return
  for (const rawLine of readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    // Rigtige miljøvariabler vinder over .env-filen.
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvFile()

const env = (name, fallback = '') => (process.env[name] ?? fallback).trim()

const sessionSecret = env('SESSION_SECRET')

export const config = {
  port: Number(env('PORT', '8080')),
  isProduction: env('NODE_ENV') === 'production',

  /**
   * Slå kun til hvis der står præcis én proxy foran, og den selv skriver
   * X-Forwarded-For. Ellers kan en besøgende selv sætte headeren og dermed
   * få en frisk kvote forsøg hver gang han gætter på adgangskoden.
   */
  trustProxy: env('TRUST_PROXY').toLowerCase() === 'true',

  /** Adgangskoden til appen. Uden den starter serveren ikke. */
  appPassword: env('APP_PASSWORD'),

  /**
   * Nøglen der signerer login-cookien. Sættes den ikke, laver vi en tilfældig
   * ved opstart, så virker alt, men alle bliver logget ud ved genstart.
   */
  sessionSecret: sessionSecret || randomBytes(32).toString('hex'),
  sessionSecretWasGenerated: !sessionSecret,
  sessionHours: Number(env('SESSION_HOURS', '720')),

  anthropicApiKey: env('ANTHROPIC_API_KEY'),
  model: env('CLAUDE_MODEL', 'claude-opus-5'),
  effort: env('CLAUDE_EFFORT', 'medium'),

  stripeSecretKey: env('STRIPE_SECRET_KEY'),

  ghlToken: env('GHL_API_KEY'),
  ghlLocationId: env('GHL_LOCATION_ID'),
  ghlBaseUrl: env('GHL_BASE_URL', 'https://services.leadconnectorhq.com'),
  /** Valgfrit. Nogle konti kræver et bruger-id på noter og opgaver. */
  ghlUserId: env('GHL_USER_ID'),
  /** Sæt til "false" hvis chatten kun må læse i GoHighLevel. */
  ghlAllowWrites: env('GHL_ALLOW_WRITES', 'true').toLowerCase() !== 'false',

  timezone: env('TIMEZONE', 'Europe/Copenhagen'),
  currency: env('CURRENCY', 'DKK'),
  businessName: env('BUSINESS_NAME', ''),
}

/** Fejl der skal stoppe opstart, og advarsler der bare skal siges højt. */
export function checkConfig() {
  const errors = []
  const warnings = []

  if (!config.appPassword) {
    errors.push('APP_PASSWORD mangler. Sæt en lang adgangskode i .env.')
  } else if (config.appPassword.length < 10) {
    errors.push('APP_PASSWORD er for kort. Brug mindst 10 tegn.')
  }

  if (!config.anthropicApiKey) {
    errors.push('ANTHROPIC_API_KEY mangler. Uden den kan chatten ikke svare.')
  }

  if (!config.stripeSecretKey && !config.ghlToken) {
    warnings.push(
      'Hverken Stripe eller GoHighLevel er sat op. Chatten kan svare, men kan ikke slå noget op.',
    )
  }

  if (config.stripeSecretKey && !config.stripeSecretKey.startsWith('rk_')) {
    warnings.push(
      'STRIPE_SECRET_KEY ser ikke ud til at være en begrænset nøgle (rk_...). ' +
        'Programmet læser kun, men brug en restricted key med read-only rettigheder for en sikkerheds skyld.',
    )
  }

  if (config.ghlToken && !config.ghlLocationId) {
    warnings.push('GHL_LOCATION_ID mangler, så GoHighLevel-opslag vil fejle.')
  }

  if (config.sessionSecretWasGenerated) {
    warnings.push(
      'SESSION_SECRET mangler. Der bruges en tilfældig nøgle, så du bliver logget ud hver gang serveren genstarter.',
    )
  } else if (config.sessionSecret.length < 32) {
    warnings.push(
      'SESSION_SECRET er kort. Brug mindst 32 tegn, ellers er login-cookien lettere at forfalske.',
    )
  }

  return { errors, warnings }
}

export const hasStripe = () => Boolean(config.stripeSecretKey)
export const hasGhl = () => Boolean(config.ghlToken && config.ghlLocationId)
