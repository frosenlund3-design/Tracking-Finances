'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ensureMigrated } from '@/database/migrate';
import { assertSameOrigin, getCurrentUser, requestContext } from '@/lib/auth';
import {
  AuthError,
  consumePasswordReset,
  createPasswordReset,
  createUser,
  verifyCredentials,
} from '@/services/users';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  destroySession,
  setSessionCookie,
} from '@/security/session';
import { AUDIT_ACTIONS, recordAudit } from '@/security/audit';
import { LIMITS, rateLimit } from '@/security/rate-limit';
import { cookies } from 'next/headers';

export interface FormState {
  error?: string;
  notice?: string;
}

const emailSchema = z.string().trim().min(3).max(254).email('Enter a valid email address.');

const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(200),
});

const signupSchema = z.object({
  email: emailSchema,
  password: z.string().min(12, 'Use at least 12 characters.').max(200),
  displayName: z.string().trim().max(80).optional(),
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Check the details and try again.';
}

/** Rate-limit key. Falls back to the email when no IP is available. */
async function limiterKey(scope: string, identifier: string): Promise<string> {
  const { ip } = await requestContext();
  return `${scope}:${ip ?? identifier.toLowerCase()}`;
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertSameOrigin();
  await ensureMigrated();

  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    displayName: formData.get('displayName') || undefined,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const key = await limiterKey('signup', parsed.data.email);
  if (!rateLimit(key, LIMITS.signup.limit, LIMITS.signup.windowMs).allowed) {
    return { error: 'Too many sign-up attempts. Try again later.' };
  }

  let userId: string;
  try {
    const user = await createUser(parsed.data);
    userId = user.id;
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    console.error('[auth] signup failed', err);
    return { error: 'Could not create the account. Please try again.' };
  }

  const context = await requestContext();
  const { token, expiresAt } = await createSession(userId, context);
  await setSessionCookie(token, expiresAt);
  await recordAudit(userId, AUDIT_ACTIONS.SIGNED_UP, {}, context);

  redirect('/onboarding');
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertSameOrigin();
  await ensureMigrated();

  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const key = await limiterKey('login', parsed.data.email);
  const limit = rateLimit(key, LIMITS.login.limit, LIMITS.login.windowMs);
  if (!limit.allowed) {
    return {
      error: `Too many attempts. Try again in about ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
    };
  }

  const context = await requestContext();
  let user;
  try {
    user = await verifyCredentials(parsed.data.email, parsed.data.password);
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    console.error('[auth] sign-in failed', err);
    return { error: 'Could not sign in. Please try again.' };
  }

  const { token, expiresAt } = await createSession(user.id, context);
  await setSessionCookie(token, expiresAt);
  await recordAudit(user.id, AUDIT_ACTIONS.SIGNED_IN, {}, context);

  redirect(user.onboardingCompletedAt ? '/dashboard' : '/onboarding');
}

export async function signOutAction(): Promise<void> {
  await assertSameOrigin();
  const user = await getCurrentUser();
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  await clearSessionCookie();
  if (user) await recordAudit(user.id, AUDIT_ACTIONS.SIGNED_OUT, {}, await requestContext());
  redirect('/login');
}

export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await assertSameOrigin();
  await ensureMigrated();

  const parsed = emailSchema.safeParse(formData.get('email'));
  if (!parsed.success) return { error: 'Enter a valid email address.' };

  const key = await limiterKey('reset', parsed.data);
  if (!rateLimit(key, LIMITS.passwordReset.limit, LIMITS.passwordReset.windowMs).allowed) {
    return { error: 'Too many requests. Try again later.' };
  }

  const reset = await createPasswordReset(parsed.data);
  if (reset) {
    await recordAudit(
      reset.userId,
      AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
      {},
      await requestContext(),
    );
    // No email provider is configured, so the link is written to the server log
    // rather than silently going nowhere. Wire an email service here in production.
    console.info(
      `[auth] password reset link for ${parsed.data}: /reset-password?token=${reset.token}`,
    );
  }

  // The same response either way — a reset form must not reveal which
  // addresses have accounts.
  return {
    notice:
      'If that address has an account, a reset link is on its way. Check the server log in local development.',
  };
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await assertSameOrigin();
  await ensureMigrated();

  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  if (!token) return { error: 'This reset link is incomplete.' };

  try {
    const userId = await consumePasswordReset(token, password);
    await recordAudit(userId, AUDIT_ACTIONS.PASSWORD_CHANGED, {}, await requestContext());
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    console.error('[auth] reset failed', err);
    return { error: 'Could not reset the password. Request a new link.' };
  }

  redirect('/login?reset=1');
}
