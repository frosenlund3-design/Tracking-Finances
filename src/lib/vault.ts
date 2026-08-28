/**
 * Profile lock.
 *
 * Loops has no server, so "opret en profil" cannot mean an account somewhere.
 * What it means here is real and local: a password that must be entered to
 * open the app on this device, and which also encrypts the text she writes.
 *
 * What is protected: every title, description, micro-step, brain dump and
 * coach message — the actual content of her head.
 * What is not: the shape of the tree (how many loops, when they were made,
 * which are done). Those stay readable so the database keeps working without
 * the key, and so the app can still tell her something useful before unlocking.
 *
 * Both halves are stated plainly in the UI. A lock that oversells itself is
 * worse than no lock.
 */

const ITERATIONS = 250_000
const PREFIX = 'enc1:'

export interface PasswordRule {
  id: string
  label: string
  test: (pw: string) => boolean
}

/** Three requirements, shown live as she types. */
export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: 'Mindst 10 tegn', test: (p) => p.length >= 10 },
  {
    id: 'case',
    label: 'Både store og små bogstaver',
    test: (p) => /[a-zæøå]/.test(p) && /[A-ZÆØÅ]/.test(p),
  },
  {
    id: 'symbol',
    label: 'Mindst ét tal eller specialtegn',
    test: (p) => /[0-9]/.test(p) || /[^\p{L}\p{N}]/u.test(p),
  },
]

export function passwordProblems(pw: string): PasswordRule[] {
  return PASSWORD_RULES.filter((r) => !r.test(pw))
}

export function isStrongEnough(pw: string): boolean {
  return passwordProblems(pw).length === 0
}

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

// TypeScript 5.7 made Uint8Array generic over its buffer type; WebCrypto wants
// the plain-ArrayBuffer flavour, so the helpers pin it explicitly.
function toBytes(s: string): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(s)
  const out = new Uint8Array(new ArrayBuffer(bytes.length))
  out.set(bytes)
  return out
}

function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const b of view) binary += String.fromCharCode(b)
  return btoa(binary)
}

function fromB64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const out = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export async function deriveKey(password: string, saltB64: string, iterations = ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', toBytes(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(saltB64), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
}

/**
 * The stored verifier is a hash *of the derived key*, never the key itself, so
 * what sits in IndexedDB cannot be used to decrypt anything.
 */
export async function verifierFor(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  const digest = await crypto.subtle.digest('SHA-256', raw)
  return toB64(digest)
}

export function newSalt(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16))))
}

/** Constant-time-ish comparison; both strings are fixed-length base64. */
export function sameVerifier(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ---------------------------------------------------------------------------
// Session key + field encryption
// ---------------------------------------------------------------------------

let sessionKey: CryptoKey | null = null

export function setSessionKey(key: CryptoKey | null): void {
  sessionKey = key
}

export function isUnlocked(): boolean {
  return sessionKey !== null
}

export function isEncrypted(value: string | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

export async function sealText(text: string, key: CryptoKey | null = sessionKey): Promise<string> {
  if (!key || !text) return text
  if (isEncrypted(text)) return text
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, toBytes(text))
  return `${PREFIX}${toB64(iv)}:${toB64(ct)}`
}

export async function openText(text: string, key: CryptoKey | null = sessionKey): Promise<string> {
  if (!isEncrypted(text)) return text
  if (!key) return '•••'
  const [, ivB64, ctB64] = text.split(':')
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, key, fromB64(ctB64))
    return new TextDecoder().decode(pt)
  } catch {
    return '•••'
  }
}
