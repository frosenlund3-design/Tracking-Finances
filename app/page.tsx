import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Logo } from '@/components/nav';
import { Button } from '@/components/ui/primitives';

const NEVER_STORED = [
  'Card numbers',
  'CVV codes',
  'MitID credentials',
  'Bank passwords',
  'Bank login details',
];

const WHAT_IT_DOES = [
  {
    title: 'Every krone, accounted for',
    body: 'Transactions arrive from your bank and Stripe, get normalized into one model, deduplicated, and categorized automatically.',
  },
  {
    title: 'Personal and business, side by side',
    body: 'Each transaction is labelled personal, business or mixed. Correct one and the rule sticks for every future charge from that merchant.',
  },
  {
    title: 'An assistant that cannot make numbers up',
    body: 'Ask a question in plain language. The answer is computed in the database first, then explained — the model never does the arithmetic.',
  },
  {
    title: 'Subscriptions you had forgotten',
    body: 'Recurring charges are detected from the cadence of the payments themselves, with the monthly cost, the annual cost, and the next expected date.',
  },
];

/**
 * Reads the session to decide where to send a signed-in visitor, so it can
 * never be prerendered — and marking that explicitly keeps `next build` from
 * needing a database at all.
 */
export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.onboardingCompletedAt ? '/dashboard' : '/onboarding');

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Kroner</span>
        </div>
        <Link href="/login" className="text-[13px] font-medium text-ink-muted hover:text-ink">
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-20">
        <section className="rise pt-8 sm:pt-16">
          <p className="text-[13px] font-medium text-accent">Read-only by design</p>
          <h1 className="mt-3 text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Know exactly where
            <br />
            your money went.
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-muted">
            A finance dashboard for your personal and business money. It reads your accounts,
            categorizes everything, and answers questions — and it can never move a krone.
          </p>

          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
            <Link href="/signup" className="sm:w-auto">
              <Button size="lg" full>
                Start with demo data
              </Button>
            </Link>
            <Link href="/login" className="sm:w-auto">
              <Button size="lg" variant="secondary" full>
                Sign in
              </Button>
            </Link>
          </div>
          <p className="mt-3 text-[12px] text-ink-subtle">
            The full product works on realistic demo data before you connect anything.
          </p>
        </section>

        <section className="mt-16 grid gap-3 sm:grid-cols-2">
          {WHAT_IT_DOES.map((item) => (
            <div
              key={item.title}
              className="rounded-[var(--radius-card)] border border-border bg-surface p-5"
            >
              <h2 className="text-[15px] font-medium tracking-tight">{item.title}</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{item.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-16 rounded-[var(--radius-card)] border border-border bg-surface p-6">
          <h2 className="text-[15px] font-medium tracking-tight">What is never stored</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
            Bank access uses European Open Banking. You authorize at your own bank, in your bank’s
            own flow. Kroner receives a read-only data token and nothing else.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {NEVER_STORED.map((item) => (
              <li key={item} className="flex items-center gap-2 text-[13px] text-ink-muted">
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[10px] text-ink-subtle"
                  aria-hidden="true"
                >
                  ✕
                </span>
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] leading-relaxed text-ink-subtle">
            The assistant is read-only too. It has no tool that can send money, create a payment,
            issue a refund, or change a payout setting.
          </p>
        </section>
      </main>

      <footer className="mx-auto max-w-3xl border-t border-border px-5 py-6 text-[12px] text-ink-subtle">
        Kroner does not replace an accountant. Bookkeeping labels are yours to review.
      </footer>
    </div>
  );
}
