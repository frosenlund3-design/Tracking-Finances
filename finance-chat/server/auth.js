/**
 * Login med én adgangskode.
 *
 * Ingen brugerdatabase, ingen bruger-oprettelse: der er én adgangskode, og den
 * står kun på serveren. Efter login får browseren en signeret cookie, som den
 * ikke selv kan læse eller forfalske (HttpOnly + HMAC).
 */
import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { config } from './config.js'

const COOKIE_NAME = 'fc_session'

const b64url = (buffer) => Buffer.from(buffer).toString('base64url')

function sign(payload) {
  return createHmac('sha256', config.sessionSecret).update(payload).digest('base64url')
}

/** Sammenligner uden at afsløre noget via svartiden. */
function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest()
  const hb = createHash('sha256').update(String(b)).digest()
  return timingSafeEqual(ha, hb)
}

export function checkPassword(candidate) {
  if (!config.appPassword || typeof candidate !== 'string') return false
  return safeEqual(candidate, config.appPassword)
}

export function createSessionToken() {
  const payload = b64url(
    JSON.stringify({
      sid: randomBytes(16).toString('hex'),
      exp: Date.now() + config.sessionHours * 3600 * 1000,
    }),
  )
  return `${payload}.${sign(payload)}`
}

/** Returnerer sessionens id, eller null hvis cookien er falsk eller udløbet. */
export function readSessionToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [payload, signature] = token.split('.', 2)
  const expected = sign(payload)
  if (signature.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data.sid || typeof data.exp !== 'number' || data.exp < Date.now()) return null
    return data.sid
  } catch {
    return null
  }
}

/** Lille cookie-læser, så vi slipper for cookie-parser. */
function readCookie(header, name) {
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim())
    }
  }
  return null
}

export function setSessionCookie(res, token) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${config.sessionHours * 3600}`,
  ]
  if (config.isProduction) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

/** Express-middleware: alt bagved kræver gyldig cookie. */
export function requireAuth(req, res, next) {
  const sid = readSessionToken(readCookie(req.headers.cookie, COOKIE_NAME))
  if (!sid) {
    res.status(401).json({ error: 'Du er ikke logget ind.' })
    return
  }
  req.sessionId = sid
  next()
}

export function currentSessionId(req) {
  return readSessionToken(readCookie(req.headers.cookie, COOKIE_NAME))
}

/**
 * Simpel spærre mod at gætte adgangskoden: 8 forsøg pr. IP, så 15 minutters
 * pause. Ligger i hukommelsen, hvilket er nok til én server med én bruger.
 */
const attempts = new Map()
const MAX_ATTEMPTS = 8
const WINDOW_MS = 15 * 60 * 1000

export function loginBlocked(ip) {
  const entry = attempts.get(ip)
  if (!entry) return 0
  if (Date.now() - entry.first > WINDOW_MS) {
    attempts.delete(ip)
    return 0
  }
  if (entry.count < MAX_ATTEMPTS) return 0
  return Math.ceil((entry.first + WINDOW_MS - Date.now()) / 1000)
}

export function noteFailedLogin(ip) {
  const entry = attempts.get(ip)
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    attempts.set(ip, { count: 1, first: Date.now() })
  } else {
    entry.count += 1
  }
}

export function clearLoginAttempts(ip) {
  attempts.delete(ip)
}
