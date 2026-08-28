import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { Logo } from '@/components/nav';
import { getCurrentUser } from '@/lib/auth';
import { signInAction } from '@/app/auth-actions';

// Reads the session cookie to redirect anyone already signed in.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect(user.onboardingCompletedAt ? '/dashboard' : '/onboarding');
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="rise">
        <Link href="/" className="mb-8 flex items-center gap-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Kroner</span>
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1.5 text-sm text-ink-muted">Sign in to see where your money went.</p>

        {params.reset ? (
          <p
            role="status"
            className="mt-4 rounded-lg bg-positive-soft px-3 py-2 text-[13px] text-positive"
          >
            Password updated. Sign in with your new password.
          </p>
        ) : null}

        <div className="mt-6">
          <AuthForm
            action={signInAction}
            submitLabel="Sign in"
            pendingLabel="Signing in…"
            fields={[
              { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
              {
                name: 'password',
                label: 'Password',
                type: 'password',
                autoComplete: 'current-password',
              },
            ]}
          />
        </div>

        <div className="mt-5 flex items-center justify-between text-[13px]">
          <Link href="/forgot-password" className="text-ink-muted hover:text-ink">
            Forgot password?
          </Link>
          <Link href="/signup" className="font-medium text-accent">
            Create an account
          </Link>
        </div>
      </div>
    </main>
  );
}
