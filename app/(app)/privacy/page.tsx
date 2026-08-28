import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Privacy & security' };

const NEVER_STORED = [
  'Card numbers (PAN)',
  'CVV / CVC security codes',
  'MitID credentials or codes',
  'NemID credentials',
  'Bank passwords or PINs',
  'Bank login usernames',
  'CPR numbers',
  'Full IBANs — only the last four characters',
];

const STORED = [
  { what: 'Your email and a hash of your password', why: 'To sign you in. The password itself is never stored — only a scrypt hash.' },
  { what: 'Transactions: amount, date, merchant, description, category', why: 'This is the product. Without it there is nothing to show you.' },
  { what: 'Account names, types and balances', why: 'To show totals and split personal from business.' },
  { what: 'Encrypted provider access tokens', why: 'To fetch new transactions without asking you to re-authorize daily. Encrypted with AES-256-GCM using a key held outside the database.' },
  { what: 'Your category corrections', why: 'So the same correction never has to be made twice.' },
  { what: 'Questions you ask the assistant', why: 'So the conversation has history. The computed figures are not stored with them.' },
  { what: 'Account events (signed in, bank connected, data exported)', why: 'So you can see what happened to your account. Amounts and merchants are deliberately excluded.' },
];

const AI_CANNOT = [
  'Send money or make a transfer',
  'Create a payment or a charge',
  'Issue a refund',
  'Change a Stripe payout setting',
  'Connect or disconnect an account',
  'Change or delete a transaction',
  'Reach any system outside your own financial data',
];

export default async function PrivacyPage() {
  const user = await requireUser();

  return (
    <div className="rise space-y-5 pb-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Privacy &amp; security</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          What Kroner stores, what it refuses to store, and how to remove it all.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Never stored, never requested</CardTitle>
        </CardHeader>
        <CardBody className="pt-0">
          <ul className="grid gap-2 sm:grid-cols-2">
            {NEVER_STORED.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[13px] text-ink-muted">
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[10px] text-ink-subtle"
                  aria-hidden="true"
                >
                  ✕
                </span>
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-muted">
            There is no screen in Kroner that asks for any of these, and no database column that
            could hold them. Free-text fields you type — notes, descriptions — are scanned before
            saving, and anything that looks like a card number or a credential is rejected rather
            than stored.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What is stored, and why</CardTitle>
        </CardHeader>
        <CardBody className="pt-0">
          <dl className="divide-y divide-border">
            {STORED.map((item) => (
              <div key={item.what} className="py-3 first:pt-0">
                <dt className="text-[13px] font-medium">{item.what}</dt>
                <dd className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{item.why}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How bank connections work</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2.5 pt-0 text-[13px] leading-relaxed text-ink-muted">
          <p>
            <strong className="font-medium text-ink">You authorize at your bank, not here.</strong>{' '}
            Connecting sends you to your bank’s own authorization page through a licensed Open
            Banking provider. You authenticate there. Kroner is not part of that exchange and
            receives no credential from it.
          </p>
          <p>
            <strong className="font-medium text-ink">The access granted is read-only.</strong> The
            consent covers account details, balances and transactions. Payment initiation is a
            separate permission under PSD2 which Kroner never requests, and there is no code in this
            application that could use it.
          </p>
          <p>
            <strong className="font-medium text-ink">Tokens are encrypted at rest.</strong>{' '}
            AES-256-GCM, with the key supplied through the environment and never written to the
            database. Your user id is bound into the encryption, so a token row copied to another
            account fails to decrypt rather than leaking. Tokens are decrypted only for the length
            of a single call to the provider and are never sent to the browser.
          </p>
          <p>
            <strong className="font-medium text-ink">Your data is isolated in the database.</strong>{' '}
            Every table carries a row-level security policy, and requests run as an unprivileged
            role. A query that forgot to filter by user would return nothing rather than someone
            else’s transactions.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What the assistant can and cannot do</CardTitle>
        </CardHeader>
        <CardBody className="pt-0">
          <p className="text-[13px] leading-relaxed text-ink-muted">
            The assistant can read your financial data and explain it. Its entire capability list is
            a fixed set of read-only queries — it cannot run arbitrary code, cannot reach the
            internet, and cannot call anything outside that list. Requests for a tool not on the
            list are refused before any query runs.
          </p>
          <ul className="mt-3 space-y-1.5">
            {AI_CANNOT.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[13px] text-ink-muted">
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[10px] text-ink-subtle"
                  aria-hidden="true"
                >
                  ✕
                </span>
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
            Every figure it reports is computed by a database query first. The model chooses which
            question to ask and phrases the answer; it never does the arithmetic, which is why it
            cannot invent a total.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Disconnecting and deleting</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 pt-0">
          <div>
            <p className="text-[13px] font-medium">Disconnect a bank</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
              Withdraws consent at the provider where their API supports it, deletes the stored
              token, and stops all syncing. Transactions already imported are kept — a temporary
              provider outage should never destroy your history. Delete them separately if you want
              them gone.
            </p>
            <Link href="/integrations" className="mt-1.5 inline-block text-[13px] font-medium text-accent">
              Manage connections
            </Link>
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-[13px] font-medium">Delete all financial data</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
              Removes every transaction, account, connection, subscription, rule and stored token,
              keeping your login.
            </p>
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-[13px] font-medium">Delete your account</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
              Removes the account and everything attached to it. Not reversible.
            </p>
            <Link href="/settings" className="mt-1.5 inline-block text-[13px] font-medium text-accent">
              Delete data in settings
            </Link>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bookkeeping, not tax advice</CardTitle>
        </CardHeader>
        <CardBody className="pt-0">
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Kroner lets you label transactions as deductible, potentially deductible, not
            deductible, or needing review, and export them as CSV. Those labels are yours, for your
            own records or your accountant’s. Kroner applies no Danish tax rules, calculates no tax
            liability, and never presents a figure as profit after tax. The assistant will not give
            definitive tax advice.
          </p>
        </CardBody>
      </Card>

      <p className="px-1 text-[12px] text-ink-subtle">
        Signed in as {user.email}. Data lives on the deployment you are using.
      </p>
    </div>
  );
}
