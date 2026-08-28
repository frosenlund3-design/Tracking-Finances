import { describe, expect, it } from 'vitest';
import { containsForbiddenSecret, redact, redactDeep } from '@/security/redact';
import { checkPasswordStrength, hashPassword, verifyPassword } from '@/security/password';
import { LIMITS, rateLimit, resetRateLimits } from '@/security/rate-limit';

describe('redaction', () => {
  it('removes a card number that passes the Luhn check', () => {
    expect(redact('Paid with 4111 1111 1111 1111 today')).toContain('[redacted-card]');
    expect(redact('Paid with 4111111111111111')).toContain('[redacted-card]');
  });

  it('leaves a long number that is not a card alone', () => {
    // A reference number should survive; blanket digit-stripping would destroy
    // legitimate bank descriptions.
    const reference = 'Faktura 1234567890123456 betalt';
    expect(redact(reference)).toBe(reference);
  });

  it('removes credentials, tokens and Danish identifiers', () => {
    expect(redact('cvv: 123')).toContain('[redacted]');
    expect(redact('password=hunter2')).toContain('[redacted-credential]');
    expect(redact('CPR 010190-1234')).toContain('[redacted-cpr]');
    expect(redact('IBAN DK5000400440116243')).toContain('[redacted-iban]');
    expect(redact('Authorization: Bearer abcdefghijklmnop1234')).toContain('[redacted-token]');
    expect(redact('key sk_live_abcdefgh12345')).toContain('[redacted-key]');
  });

  it('redacts nested objects and sensitive keys by name', () => {
    const result = redactDeep({
      access_token: 'secret',
      safe: 'ordinary text',
      nested: { password: 'hunter2', note: 'card 4111111111111111' },
      list: ['cvv: 999'],
    }) as Record<string, unknown>;

    expect(result.access_token).toBe('[redacted]');
    expect(result.safe).toBe('ordinary text');
    expect((result.nested as Record<string, unknown>).password).toBe('[redacted]');
    expect(String((result.nested as Record<string, unknown>).note)).toContain('[redacted-card]');
    expect(String((result.list as unknown[])[0])).toContain('[redacted]');
  });

  it('recognises material the app must refuse outright', () => {
    expect(containsForbiddenSecret('4111111111111111')).toBe(true);
    expect(containsForbiddenSecret('my MitID code is 447281')).toBe(true);
    expect(containsForbiddenSecret('Groceries at Netto, 240 kr')).toBe(false);
  });
});

describe('password handling', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('a-long-enough-passphrase');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(hash).not.toContain('a-long-enough-passphrase');
    expect(await verifyPassword('a-long-enough-passphrase', hash)).toBe(true);
    expect(await verifyPassword('a-long-enough-passphrasf', hash)).toBe(false);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password-here'), hashPassword('same-password-here')]);
    expect(a).not.toBe(b);
  });

  it('normalizes unicode so an equivalent password still verifies', async () => {
    const hash = await hashPassword('passphrase-café-long');
    expect(await verifyPassword('passphrase-café-long', hash)).toBe(true);
  });

  it('rejects a malformed stored hash instead of throwing', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything', '')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$x$y$z$AA==$AA==')).toBe(false);
  });

  it('requires length over character-class gymnastics', () => {
    expect(checkPasswordStrength('short').ok).toBe(false);
    expect(checkPasswordStrength('password1').ok).toBe(false);
    expect(checkPasswordStrength('aaaaaaaaaaaaaaa').ok).toBe(false);
    expect(checkPasswordStrength('correct horse battery staple').ok).toBe(true);
  });
});

describe('rate limiting', () => {
  it('allows up to the limit then blocks with a retry hint', () => {
    resetRateLimits();
    const key = 'test:login';
    for (let i = 0; i < LIMITS.login.limit; i++) {
      expect(rateLimit(key, LIMITS.login.limit, LIMITS.login.windowMs).allowed).toBe(true);
    }
    const blocked = rateLimit(key, LIMITS.login.limit, LIMITS.login.windowMs);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keeps separate buckets per key', () => {
    resetRateLimits();
    expect(rateLimit('a', 1, 60_000).allowed).toBe(true);
    expect(rateLimit('a', 1, 60_000).allowed).toBe(false);
    expect(rateLimit('b', 1, 60_000).allowed).toBe(true);
  });
});

describe('token encryption', () => {
  it('round-trips a token and rejects tampering', async () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
    const { seal, open } = await import('@/security/crypto');

    const sealed = seal('rk_live_supersecret', 'user-1|stripe|access');
    expect(sealed.ciphertext).not.toContain('supersecret');
    expect(open(sealed, 'user-1|stripe|access')).toBe('rk_live_supersecret');

    // A row copied to a different user must fail to decrypt, not leak.
    expect(() => open(sealed, 'user-2|stripe|access')).toThrow();
    // A modified ciphertext must fail the authentication tag.
    expect(() => open({ ...sealed, ciphertext: Buffer.from('tampered').toString('base64') }, 'user-1|stripe|access')).toThrow();
  });
});
