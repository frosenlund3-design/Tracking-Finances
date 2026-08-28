'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button, Card } from '@/components/ui/primitives';
import { Logo } from '@/components/nav';
import { cn } from '@/lib/cn';
import { completeOnboardingAction, loadDemoDataAction } from './actions';

type Mode = 'personal' | 'business' | 'both';

const MODES: Array<{ value: Mode; title: string; body: string }> = [
  { value: 'personal', title: 'Personal', body: 'Everyday spending, salary, subscriptions.' },
  { value: 'business', title: 'Business', body: 'Revenue, costs, Stripe, bookkeeping labels.' },
  { value: 'both', title: 'Both', body: 'Kept separate, shown side by side.' },
];

export function OnboardingFlow({
  name,
  hasData,
  bankConfigured,
  stripeConfigured,
}: {
  name: string | null;
  hasData: boolean;
  bankConfigured: boolean;
  stripeConfigured: boolean;
}) {
  const [step, setStep] = useState(hasData ? 2 : 0);
  const [mode, setMode] = useState<Mode>('both');
  const [loaded, setLoaded] = useState(hasData);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function loadDemo() {
    setError(null);
    startTransition(async () => {
      const result = await loadDemoDataAction();
      if (result.error) setError(result.error);
      else setLoaded(true);
    });
  }

  return (
    <div className="rise">
      <div className="mb-8 flex items-center gap-2">
        <Logo />
        <span className="text-[15px] font-semibold tracking-tight">Kroner</span>
      </div>

      <div className="mb-6 flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i <= step ? 'bg-accent' : 'bg-surface-muted',
            )}
          />
        ))}
      </div>

      {step === 0 ? (
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">
            {name ? `Hello, ${name.split(' ')[0]}.` : 'Let’s connect your money.'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Two things to know before we start.
          </p>

          <Card className="mt-5 p-5">
            <h2 className="text-sm font-medium">Kroner can only read</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
              Bank access goes through your bank’s own secure authorization. Kroner never sees your
              MitID, your bank password, or any card details — and has no ability to move money.
            </p>
          </Card>

          <Card className="mt-3 p-5">
            <h2 className="text-sm font-medium">Try it before you connect anything</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
              Demo data is nine months of realistic Danish transactions. It runs through the same
              engine as a real bank feed, so what you see is the real product.
            </p>
          </Card>

          <Button className="mt-6" size="lg" full onClick={() => setStep(1)}>
            Continue
          </Button>
        </section>
      ) : null}

      {step === 1 ? (
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">Connect your money</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Start with demo data, or connect a real account now.
          </p>

          <Card className="mt-5 p-5">
            <h2 className="text-sm font-medium">Demo data</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
              Nine months of transactions across a personal account, a business account and Stripe.
            </p>
            <Button className="mt-4" full onClick={loadDemo} disabled={pending || loaded}>
              {loaded ? 'Demo data loaded' : pending ? 'Generating…' : 'Load demo data'}
            </Button>
            {loaded ? (
              <p role="status" className="mt-2 text-[12px] text-positive">
                Nine months of transactions are ready. Continue when you are.
              </p>
            ) : null}
          </Card>

          <Card className="mt-3 p-5">
            <h2 className="text-sm font-medium">Connect your bank</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
              {bankConfigured
                ? 'Authorize read-only access at your own bank through Open Banking.'
                : 'Open Banking credentials are not configured on this deployment yet. You can add them later in Integrations.'}
            </p>
            <Link href="/connect" className="mt-4 block">
              <Button variant="secondary" full>
                {bankConfigured ? 'Connect bank' : 'See connections'}
              </Button>
            </Link>
          </Card>

          {!stripeConfigured ? null : (
            <p className="mt-3 px-1 text-[12px] text-ink-subtle">
              Stripe and MobilePay can be connected once you are set up.
            </p>
          )}

          {error ? (
            <p role="alert" className="mt-4 rounded-lg bg-negative-soft px-3 py-2 text-[13px] text-negative">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex gap-2">
            <Button variant="ghost" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button className="flex-1" size="lg" onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">What are you tracking?</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            This decides which dashboards appear. You can change it any time.
          </p>

          <form action={completeOnboardingAction} className="mt-5 space-y-2.5">
            <input type="hidden" name="trackingMode" value={mode} />
            {MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                aria-pressed={mode === option.value}
                className={cn(
                  'block w-full rounded-[var(--radius-card)] border p-4 text-left transition-colors',
                  mode === option.value
                    ? 'border-accent bg-accent-soft'
                    : 'border-border bg-surface hover:border-border-strong',
                )}
              >
                <span className="text-sm font-medium">{option.title}</span>
                <span className="mt-0.5 block text-[13px] text-ink-muted">{option.body}</span>
              </button>
            ))}

            <Button type="submit" size="lg" full className="!mt-6">
              Open my dashboard
            </Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
