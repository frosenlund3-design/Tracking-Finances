import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { Logo } from '@/components/nav';
import { getCurrentUser } from '@/lib/auth';
import { signUpAction } from '@/app/auth-actions';

// Reads the session cookie to redirect anyone already signed in.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Create account' };

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="rise">
        <Link href="/" className="mb-8 flex items-center gap-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Kroner</span>
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          You can explore the whole product with demo data before connecting anything real.
        </p>

        <div className="mt-6">
          <AuthForm
            action={signUpAction}
            submitLabel="Create account"
            pendingLabel="Creating…"
            fields={[
              {
                name: 'displayName',
                label: 'Name',
                type: 'text',
                autoComplete: 'name',
                required: false,
                placeholder: 'Optional',
              },
              { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
              {
                name: 'password',
                label: 'Password',
                type: 'password',
                autoComplete: 'new-password',
                hint: 'At least 12 characters. A passphrase works well.',
              },
            ]}
          />
        </div>

        <p className="mt-5 text-[13px] text-ink-muted">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-accent">
            Sign in
          </Link>
        </p>

        <p className="mt-6 text-[12px] leading-relaxed text-ink-subtle">
          Kroner never asks for card numbers, CVV codes, MitID or bank passwords. Bank access goes
          through your bank’s own secure authorization, read-only.
        </p>
      </div>
    </main>
  );
}
