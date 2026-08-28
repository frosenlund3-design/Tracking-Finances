/**
 * Outbound scrubbing. Anything crossing a trust boundary — the model, logs,
 * audit rows, error reports — passes through here first.
 *
 * The app never asks for card numbers, but a bank's free-text description
 * field is outside our control, so we defend anyway.
 */

interface Pattern {
  name: string;
  re: RegExp;
  replacement: string;
  /** Extra validation before redacting, to limit false positives. */
  guard?: (match: string) => boolean;
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const PATTERNS: Pattern[] = [
  {
    name: 'pan',
    re: /\b(?:\d[ -]?){13,19}\b/g,
    replacement: '[redacted-card]',
    guard: (m) => {
      const digits = m.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
    },
  },
  { name: 'cvv', re: /\b(?:cvv|cvc|cvv2|sikkerhedskode)\b\s*[:=]?\s*\d{3,4}\b/gi, replacement: '[redacted]' },
  // Danish CPR (personnummer): DDMMYY-XXXX
  { name: 'cpr', re: /\b\d{6}[- ]?\d{4}\b/g, replacement: '[redacted-cpr]' },
  { name: 'iban', re: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, replacement: '[redacted-iban]' },
  { name: 'email', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, replacement: '[redacted-email]' },
  { name: 'bearer', re: /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]{16,}=*/g, replacement: '[redacted-token]' },
  { name: 'secret-key', re: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}/g, replacement: '[redacted-key]' },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, replacement: '[redacted-jwt]' },
  {
    name: 'password-kv',
    re: /\b(?:password|kodeord|adgangskode|pin|mitid)\b\s*[:=]\s*\S+/gi,
    replacement: '[redacted-credential]',
  },
];

const SENSITIVE_KEYS = new Set([
  'password', 'password_hash', 'passwordhash', 'token', 'access_token', 'refresh_token',
  'secret', 'client_secret', 'api_key', 'apikey', 'authorization', 'cookie', 'set-cookie',
  'iban', 'cardnumber', 'card_number', 'pan', 'cvv', 'cvc', 'pin', 'mitid', 'ssn', 'cpr',
  'ciphertext', 'auth_tag', 'iv',
]);

export function redact(input: string): string {
  let out = input;
  for (const p of PATTERNS) {
    out = out.replace(p.re, (match) => (p.guard && !p.guard(match) ? match : p.replacement));
  }
  return out;
}

/** Deep-redacts strings inside a plain object, for logs and audit details. */
export function redactDeep<T>(value: T, depth = 0): T {
  if (depth > 6) return '[truncated]' as unknown as T;
  if (typeof value === 'string') return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[redacted]' : redactDeep(v, depth + 1);
    }
    return out as unknown as T;
  }
  return value;
}


/** Detects sensitive material the app must refuse to store at all. */
export function containsForbiddenSecret(input: string): boolean {
  const digits = input.replace(/\D/g, '');
  if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) return true;
  return /\b(?:cvv|cvc|mitid|nemid)\b/i.test(input) && /\d{3,}/.test(input);
}
