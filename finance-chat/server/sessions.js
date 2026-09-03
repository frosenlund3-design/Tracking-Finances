/**
 * Samtalerne bor i serverens hukommelse, ikke i browseren og ikke i en
 * database. Det betyder: ingen kundedata på disken, og alt er væk når serveren
 * genstarter. Det er med vilje.
 */

const conversations = new Map()

const MAX_AGE_MS = 12 * 60 * 60 * 1000 // 12 timer uden aktivitet
const MAX_MESSAGES = 60 // omtrent 30 spørgsmål/svar

export function getMessages(sessionId) {
  const entry = conversations.get(sessionId)
  if (!entry) return []
  if (Date.now() - entry.updatedAt > MAX_AGE_MS) {
    conversations.delete(sessionId)
    return []
  }
  return entry.messages
}

export function saveMessages(sessionId, messages) {
  conversations.set(sessionId, { messages: trim(messages), updatedAt: Date.now() })
}

export function resetConversation(sessionId) {
  conversations.delete(sessionId)
  pending.delete(sessionId)
}

/**
 * En skrivning der venter på et ja.
 *
 * Når chatten vil skrive noget i GoHighLevel, bliver den standset her, indtil
 * brugeren har set præcis hvad der skrives og trykket ja. Alt der skal til for
 * at fortsætte samtalen bagefter, ligger i denne pakke.
 */
const pending = new Map()
const PENDING_MAX_AGE_MS = 15 * 60 * 1000

export function setPending(sessionId, data) {
  pending.set(sessionId, { ...data, at: Date.now() })
}

export function takePending(sessionId) {
  const entry = pending.get(sessionId)
  pending.delete(sessionId)
  if (!entry) return null
  if (Date.now() - entry.at > PENDING_MAX_AGE_MS) return null
  return entry
}

export function clearPending(sessionId) {
  pending.delete(sessionId)
}

/**
 * Klipper de ældste beskeder væk, men aldrig midt i et opslag: et svar med
 * tool_use skal altid følges af sit tool_result, ellers afviser API'et hele
 * samtalen. Derfor klippes der kun lige før en almindelig brugerbesked.
 */
function trim(messages) {
  if (messages.length <= MAX_MESSAGES) return messages
  for (let i = messages.length - MAX_MESSAGES; i < messages.length; i++) {
    if (messages[i].role === 'user' && typeof messages[i].content === 'string') {
      return messages.slice(i)
    }
  }
  return messages.slice(-2)
}

/** Rydder gamle samtaler ud, så hukommelsen ikke vokser i det uendelige. */
setInterval(() => {
  const now = Date.now()
  for (const [id, entry] of conversations) {
    if (now - entry.updatedAt > MAX_AGE_MS) conversations.delete(id)
  }
  for (const [id, entry] of pending) {
    if (now - entry.at > PENDING_MAX_AGE_MS) pending.delete(id)
  }
}, 30 * 60 * 1000).unref()
