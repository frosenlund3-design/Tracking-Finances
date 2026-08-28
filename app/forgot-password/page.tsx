import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { Logo } from '@/components/nav';
import { requestPasswordResetAction } from '@/app/auth-actions';

export const metadata: Metadata = { title: 'Reset password' };

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="rise">
        <Link href="/" className="mb-8 flex items-center gap-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Kroner</span>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Enter your email and we’ll send a link to set a new password.
        </p>
        <div className="mt-6">
          <AuthForm
            action={requestPasswordResetAction}
            submitLabel="Send reset link"
            pendingLabel="Sending…"
            fields={[{ name: 'email', label: 'Email', type: 'email', autoComplete: 'email' }]}
          />
        </div>
        <p className="mt-5 text-[13px]">
          <Link href="/login" className="text-ink-muted hover:text-ink">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
