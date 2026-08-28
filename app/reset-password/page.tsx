import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { Logo } from '@/components/nav';
import { resetPasswordAction } from '@/app/auth-actions';

// Reads the session cookie to redirect anyone already signed in.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="rise">
        <Link href="/" className="mb-8 flex items-center gap-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Kroner</span>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>

        {token ? (
          <>
            <p className="mt-1.5 text-sm text-ink-muted">
              Setting a new password signs you out everywhere else.
            </p>
            <div className="mt-6">
              <AuthForm
                action={resetPasswordAction}
                submitLabel="Update password"
                pendingLabel="Updating…"
                hidden={{ token }}
                fields={[
                  {
                    name: 'password',
                    label: 'New password',
                    type: 'password',
                    autoComplete: 'new-password',
                    hint: 'At least 12 characters.',
                  },
                ]}
              />
            </div>
          </>
        ) : (
          <p className="mt-4 rounded-lg bg-notice-soft px-3 py-2 text-[13px] text-ink-muted">
            This link is missing its token.{' '}
            <Link href="/forgot-password" className="font-medium text-accent">
              Request a new one
            </Link>
            .
          </p>
        )}
      </div>
    </main>
  );
}
