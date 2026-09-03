/**
 * Serveren.
 *
 * Den gør tre ting: serverer chat-siden, tjekker adgangskoden, og sender
 * beskeder videre til Claude. Nøgler til Stripe, GoHighLevel og Claude ligger
 * kun her. Browseren ser dem aldrig.
 */
import express from 'express'
import { join } from 'node:path'
import { config, checkConfig, hasStripe, hasGhl, ROOT } from './config.js'
import {
  checkPassword,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  currentSessionId,
  loginBlocked,
  noteFailedLogin,
  clearLoginAttempts,
} from './auth.js'
import {
  getMessages,
  saveMessages,
  resetConversation,
  setPending,
  takePending,
  clearPending,
} from './sessions.js'
import { runChat, resumeChat, describeError } from './claude.js'
import { availableToolNames } from './tools/index.js'

const { errors, warnings } = checkConfig()
for (const warning of warnings) console.warn(`⚠️  ${warning}`)
if (errors.length) {
  for (const error of errors) console.error(`✖  ${error}`)
  console.error('\nSe finance-chat/.env.example for hvad der skal udfyldes.')
  process.exit(1)
}

const app = express()
if (config.trustProxy) app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(express.json({ limit: '32kb' }))

/** Sikkerhedsheadere. Siden må kun hente sine egne filer og kun tale med sig selv. */
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "object-src 'none'",
    ].join('; '),
  )
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()')
  if (config.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  }
  next()
})

/* ------------------------------------------------------------------- login */

app.post('/api/login', (req, res) => {
  const ip = req.ip || 'ukendt'
  const waitSeconds = loginBlocked(ip)
  if (waitSeconds) {
    res.status(429).json({
      error: `For mange forsøg. Prøv igen om ${Math.ceil(waitSeconds / 60)} minut(ter).`,
    })
    return
  }

  if (!checkPassword(req.body?.password)) {
    noteFailedLogin(ip)
    res.status(401).json({ error: 'Forkert adgangskode.' })
    return
  }

  clearLoginAttempts(ip)
  setSessionCookie(res, createSessionToken())
  res.json({ ok: true })
})

app.post('/api/logout', (req, res) => {
  const sid = currentSessionId(req)
  if (sid) resetConversation(sid)
  clearSessionCookie(res)
  res.json({ ok: true })
})

/** Hvad browseren må vide: om man er logget ind, og hvad der er koblet på. */
app.get('/api/me', (req, res) => {
  const sid = currentSessionId(req)
  res.json({
    loggedIn: Boolean(sid),
    name: config.businessName,
    stripe: hasStripe(),
    ghl: hasGhl(),
    writes: hasGhl() && config.ghlAllowWrites,
    tools: sid ? availableToolNames.length : 0,
  })
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

/* -------------------------------------------------------------------- chat */

/** Én besked ad gangen pr. session, så historikken ikke kan komme i uorden. */
const busy = new Set()

/** Simpel bremse: 30 beskeder pr. 5 minutter pr. session. */
const usage = new Map()
function tooManyMessages(sessionId) {
  const now = Date.now()
  const entry = usage.get(sessionId)
  if (!entry || now - entry.since > 5 * 60 * 1000) {
    usage.set(sessionId, { count: 1, since: now })
    return false
  }
  entry.count += 1
  return entry.count > 30
}

app.post('/api/reset', requireAuth, (req, res) => {
  resetConversation(req.sessionId)
  res.json({ ok: true })
})

/**
 * Kører ét svar og sender det løbende til browseren.
 *
 * Ender svaret med at ville skrive noget i GoHighLevel, standser det i stedet,
 * og det der skal til for at fortsætte gemmes til brugeren har sagt ja eller
 * nej. Historikken gemmes først når turen er helt færdig, så en ubesvaret
 * bekræftelse aldrig bliver hængende i samtalen.
 */
async function streamAnswer(req, res, work) {
  const sessionId = req.sessionId
  busy.add(sessionId)

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const emit = (type, data) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  // Holder forbindelsen i live gennem proxyer der ellers lukker stille linjer.
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n')
  }, 15000)

  const controller = new AbortController()
  res.on('close', () => controller.abort())

  try {
    const result = await work(emit, controller.signal)
    if (result.status === 'paused') {
      setPending(sessionId, { messages: result.messages, pending: result.pending })
    } else {
      clearPending(sessionId)
      saveMessages(sessionId, result.messages)
    }
    emit('done', { venter: result.status === 'paused' })
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error('Chat-fejl:', error?.message || error)
      emit('error', { message: describeError(error) })
    }
  } finally {
    clearInterval(heartbeat)
    busy.delete(sessionId)
    if (!res.writableEnded) res.end()
  }
}

app.post('/api/chat', requireAuth, async (req, res) => {
  const text = String(req.body?.message ?? '').trim()
  if (!text) {
    res.status(400).json({ error: 'Skriv en besked først.' })
    return
  }
  if (text.length > 4000) {
    res.status(400).json({ error: 'Beskeden er for lang. Del den op.' })
    return
  }
  if (tooManyMessages(req.sessionId)) {
    res.status(429).json({ error: 'Du har skrevet mange beskeder lige nu. Vent et par minutter.' })
    return
  }
  if (busy.has(req.sessionId)) {
    res.status(409).json({ error: 'Der er allerede et svar på vej.' })
    return
  }

  // Et nyt spørgsmål annullerer en bekræftelse der aldrig blev besvaret.
  clearPending(req.sessionId)

  await streamAnswer(req, res, (emit, signal) =>
    runChat({ history: getMessages(req.sessionId), userText: text, emit, signal }),
  )
})

/**
 * Ja eller nej til de skrivninger der venter. Det er det eneste sted i
 * programmet hvor et skrive-værktøj bliver kørt.
 */
app.post('/api/confirm', requireAuth, async (req, res) => {
  if (busy.has(req.sessionId)) {
    res.status(409).json({ error: 'Der er allerede et svar på vej.' })
    return
  }

  const approved = req.body?.approve === true
  const paused = takePending(req.sessionId)
  if (!paused) {
    res.status(409).json({
      error: 'Der er ikke længere noget der venter på et svar. Stil spørgsmålet igen.',
    })
    return
  }

  await streamAnswer(req, res, (emit, signal) =>
    resumeChat({ paused, approved, emit, signal }),
  )
})

/* ------------------------------------------------------------------ siden */

app.use(
  express.static(join(ROOT, 'public'), {
    index: 'index.html',
    maxAge: '1h',
    setHeaders(res, path) {
      // Servicearbejderen skal aldrig cache sig selv fast.
      if (path.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache')
    },
  }),
)

app.use((_req, res) => res.status(404).json({ error: 'Findes ikke.' }))

app.listen(config.port, () => {
  console.log(`\n  Chatten kører på http://localhost:${config.port}`)
  console.log(`  Stripe: ${hasStripe() ? 'tilsluttet (kun læsning)' : 'ikke sat op'}`)
  console.log(
    `  GoHighLevel: ${
      hasGhl() ? (config.ghlAllowWrites ? 'tilsluttet (læs + skriv)' : 'tilsluttet (kun læsning)') : 'ikke sat op'
    }\n`,
  )
})
