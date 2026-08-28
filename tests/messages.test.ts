import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTemporaryDatabase, createTestUser } from './helpers/db';
import { MESSAGE_SOURCES } from '@/integrations/messages/types';

useTemporaryDatabase();

beforeAll(async () => {
  const { ensureMigrated } = await import('@/database/migrate');
  await ensureMigrated();
});

afterAll(async () => {
  const { closeDatabase } = await import('@/database');
  await closeDatabase();
});

describe('what can honestly be read', () => {
  it('says which platforms are impossible and gives a reason for each', () => {
    const impossible = MESSAGE_SOURCES.filter((s) => !s.possible);
    expect(impossible.map((s) => s.id).sort()).toEqual([
      'imessage',
      'messenger',
      'signal',
      'whatsapp',
    ]);
    for (const source of impossible) {
      expect(source.why, source.id).toBeTruthy();
      expect(source.why!.length, source.id).toBeGreaterThan(40);
      // An impossible source must never carry setup instructions, or it reads
      // as merely unconfigured.
      expect(source.envVars, source.id).toEqual([]);
    }
  });

  it('gives every possible source the env vars a deployment needs', () => {
    for (const source of MESSAGE_SOURCES.filter((s) => s.possible)) {
      expect(source.envVars.length, source.id).toBeGreaterThan(0);
      expect(source.why, source.id).toBeUndefined();
    }
  });
});

describe('the unified inbox', () => {
  it('offers demo messages only in demo mode, and labels them as demo', async () => {
    const { unifiedInbox } = await import('@/integrations/messages/registry');
    const userId = await createTestUser();

    const plain = await unifiedInbox(userId, { demoMode: false });
    expect(plain.messages).toEqual([]);
    expect(plain.demo).toBe(false);

    const demo = await unifiedInbox(userId, { demoMode: true });
    expect(demo.demo).toBe(true);
    expect(demo.messages.length).toBeGreaterThan(0);
    // A demo message must never claim to come from a connected source.
    expect(demo.connected).toEqual([]);
    for (const message of demo.messages) expect(message.source).toBe('demo');
  });

  it('reads nothing without a stored grant, configured or not', async () => {
    const { unifiedInbox } = await import('@/integrations/messages/registry');
    const userId = await createTestUser();
    process.env.GOOGLE_CLIENT_ID = 'test-client';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    try {
      const result = await unifiedInbox(userId, { demoMode: false });
      expect(result.messages).toEqual([]);
      expect(result.connected).toEqual([]);
    } finally {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
    }
  });

  it('honours the limit it is given', async () => {
    const { unifiedInbox } = await import('@/integrations/messages/registry');
    const userId = await createTestUser();
    expect((await unifiedInbox(userId, { demoMode: true, limit: 2 })).messages).toHaveLength(2);
  });
});

describe('the Gmail grant', () => {
  it('asks for read-only and nothing else', async () => {
    const { GMAIL_SCOPES, gmailAuthorizationUrl } = await import('@/integrations/messages/gmail');
    expect(GMAIL_SCOPES).toEqual(['https://www.googleapis.com/auth/gmail.readonly']);

    process.env.GOOGLE_CLIENT_ID = 'test-client';
    try {
      const url = new URL(
        gmailAuthorizationUrl({ state: 'abc', redirectUri: 'https://example.test/cb' }),
      );
      expect(url.searchParams.get('scope')).toBe(GMAIL_SCOPES.join(' '));
      expect(url.searchParams.get('state')).toBe('abc');
      // Never ask Google to fold in scopes granted to something else.
      expect(url.searchParams.get('include_granted_scopes')).toBe('false');
      // No send, modify or compose scope may appear, however the URL is built.
      expect(url.toString()).not.toMatch(/gmail\.(send|modify|compose)|mail\.google\.com/);
    } finally {
      delete process.env.GOOGLE_CLIENT_ID;
    }
  });

  it('is not configured without both halves of the credential', async () => {
    const { gmailConfigured } = await import('@/integrations/messages/gmail');
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(gmailConfigured()).toBe(false);

    process.env.GOOGLE_CLIENT_ID = 'only-half';
    try {
      expect(gmailConfigured()).toBe(false);
    } finally {
      delete process.env.GOOGLE_CLIENT_ID;
    }
  });
});

describe('the token vault knows its purposes apart', () => {
  it('does not report a refresh token because an access token exists', async () => {
    const { storeToken, hasToken } = await import('@/services/token-vault');
    const userId = await createTestUser();
    await storeToken({ userId, provider: 'gmail', connectionId: null, token: 'access-value' });

    expect(await hasToken(userId, 'gmail', null)).toBe(true);
    expect(await hasToken(userId, 'gmail', null, 'refresh')).toBe(false);

    await storeToken({
      userId,
      provider: 'gmail',
      connectionId: null,
      purpose: 'refresh',
      token: 'refresh-value',
    });
    expect(await hasToken(userId, 'gmail', null, 'refresh')).toBe(true);
  });

  it("cannot open one user's token as another", async () => {
    const { storeToken, useToken } = await import('@/services/token-vault');
    const a = await createTestUser();
    const b = await createTestUser();
    await storeToken({ userId: a, provider: 'gmail', connectionId: null, token: 'secret' });
    await expect(useToken(b, 'gmail', null, async (t) => t)).rejects.toThrow();
  });
});
