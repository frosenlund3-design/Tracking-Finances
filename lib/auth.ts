import '@/lib/server-guard';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { ensureMigrated } from '@/database/migrate';
import { SESSION_COOKIE, resolveSessionUser } from '@/security/session';
import type { User } from '@/types/finance';

/**
 * Request-scoped current user. `cache` dedupes it across every server
 * component in a single render.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  await ensureMigrated();
  const store = await cookies();
  return resolveSessionUser(store.get(SESSION_COOKIE)?.value);
});

/** For pages: bounces to the login screen when signed out. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'UnauthorizedError';
  }
}

/** For route handlers: throws instead of redirecting. */
export async function requireApiUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  return {
    ip: forwarded ? (forwarded.split(',')[0]?.trim() ?? null) : h.get('x-real-ip'),
    userAgent: h.get('user-agent'),
  };
}

/**
 * Origin check for state-changing requests — belt and braces alongside
 * SameSite=Lax cookies.
 */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get('origin');
  if (!origin) return; // same-origin form posts and server actions omit it
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) throw new Error('Missing host header');
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new Error('Invalid origin');
  }
  if (originHost !== host) throw new Error('Cross-origin request rejected');
}
