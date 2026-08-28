'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Sheet } from '@/components/ui/primitives';
import { InstallPrompt } from '@/components/pwa';
import { cn } from '@/lib/cn';
import { syncConnectionAction } from '@/app/(app)/integrations/actions';
import { BankPicker } from './bank-picker';
import type { MobilePayStatus } from '@/integrations/mobilepay';

interface BankConnection {
  id: string;
  name: string;
  status: string;
  lastSyncedAt: string | null;
  accountCount: number;
  syncError: string | null;
}

interface StripeConnection {
  status: string;
  livemode: boolean;
  name: string | null;
}

/**
 * The connect screen.
 *
 * Three tiles, one tap each. Everything that can be decided for the user is
 * decided for them: which aggregator, which scope, what to sync. What is left
 * is the one choice only they can make — which bank.
 */
export function ConnectHub({
  bankConfigured,
  bankSetupHint,
  bankConnection,
  stripeConnectAvailable,
  stripeConnection,
  mobilePay,
  encryptionReady,
  demoLoaded,
  notice,
}: {
  bankConfigured: boolean;
  bankSetupHint: string;
  bankConnection: BankConnection | null;
  stripeConnectAvailable: boolean;
  stripeConnection: StripeConnection | null;
  mobilePay: MobilePayStatus & { transactionCount: number };
  encryptionReady: boolean;
  demoLoaded: boolean;
  notice: { bank?: string; stripe?: string; mobilepay?: string };
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<'bank' | 'stripe' | 'mobilepay' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function connectStripe() {
    setBusy('stripe');
    setMessage(null);
    try {
      const response = await fetch('/api/stripe/connect', { method: 'POST' });
      const data = (await response.json()) as { authorizationUrl?: string; error?: string };
      if (!response.ok || !data.authorizationUrl) throw new Error(data.error ?? 'Could not start Stripe.');
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setBusy(null);
      setMessage({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not connect Stripe.' });
    }
  }

  function loadDemo() {
    setBusy('demo');
    setMessage(null);
    startTransition(async () => {
      const form = new FormData();
      form.set('target', 'demo');
      const result = await syncConnectionAction(form);
      setBusy(null);
      if (result.error) setMessage({ tone: 'bad', text: result.error });
      else {
        setMessage({ tone: 'ok', text: result.message ?? 'Demo data ready.' });
        router.refresh();
      }
    });
  }

  return (
    <div className="rise space-y-6 pb-4">
      <header>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Connect your money</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
          One tap each. Every connection is read-only — Kroner can see your transactions and can
          never move a krone.
        </p>
      </header>

      <InstallPrompt />

      {notice.stripe ? <Notice kind={notice.stripe} provider="Stripe" /> : null}
      {notice.bank ? <Notice kind={notice.bank} provider="your bank" /> : null}

      {message ? (
        <p
          role="status"
          className={cn(
            'rounded-xl px-3.5 py-2.5 text-[13px]',
            message.tone === 'ok' ? 'bg-positive-soft text-positive' : 'bg-negative-soft text-negative',
          )}
        >
          {message.text}
        </p>
      ) : null}

      <div className="space-y-3">
        <ConnectTile
          title="Your bank"
          subtitle={
            bankConnection
              ? `${bankConnection.name} · ${bankConnection.accountCount} account${bankConnection.accountCount === 1 ? '' : 's'}`
              : 'Nordea, Danske Bank, Jyske and the rest'
          }
          detail={
            bankConnection
              ? 'Balances and transactions, refreshed on demand.'
              : 'You approve at your own bank. Kroner never sees MitID or your password.'
          }
          mark={<BankMark />}
          tone="#0b4fa5"
          connected={Boolean(bankConnection)}
          disabled={!bankConfigured}
          disabledHint={bankConfigured ? undefined : bankSetupHint}
          cta={bankConnection ? 'Manage' : 'Connect bank'}
          onClick={() => setSheet('bank')}
        />

        <ConnectTile
          title="Stripe"
          subtitle={
            stripeConnection
              ? `${stripeConnection.name ?? 'Stripe account'} · ${stripeConnection.livemode ? 'Live' : 'Test'}`
              : 'Payments, refunds, fees and payouts'
          }
          detail={
            stripeConnection
              ? 'Revenue and fees split apart automatically.'
              : stripeConnectAvailable
                ? 'Approve read-only access in Stripe. Two taps, no keys to copy.'
                : 'Paste a restricted read-only key, or set up Stripe Connect for one-tap.'
          }
          mark={<StripeMark />}
          tone="#635bff"
          connected={Boolean(stripeConnection)}
          disabled={!encryptionReady}
          disabledHint={encryptionReady ? undefined : 'Set TOKEN_ENCRYPTION_KEY first.'}
          cta={stripeConnection ? 'Manage' : 'Connect Stripe'}
          busy={busy === 'stripe'}
          onClick={() => {
            if (stripeConnection) setSheet('stripe');
            else if (stripeConnectAvailable) void connectStripe();
            else setSheet('stripe');
          }}
        />

        <ConnectTile
          title="MobilePay"
          subtitle={
            mobilePay.transactionCount > 0
              ? `${mobilePay.transactionCount} payments tracked`
              : 'Who you pay, and who pays you'
          }
          detail={
            mobilePay.transactionCount > 0
              ? 'Read from your bank feed and grouped by person.'
              : 'Personal MobilePay has no API — Kroner reads it from your bank instead.'
          }
          mark={<MobilePayMark />}
          tone="#5a78ff"
          connected={mobilePay.transactionCount > 0}
          cta={mobilePay.transactionCount > 0 ? 'Open' : 'How it works'}
          onClick={() => {
            if (mobilePay.transactionCount > 0) router.push('/mobilepay');
            else setSheet('mobilepay');
          }}
        />
      </div>

      {!demoLoaded ? (
        <Card className="p-4">
          <p className="text-[15px] font-medium">Not ready to connect anything?</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            Load nine months of realistic demo data and use the whole product first. It runs through
            exactly the same engine as a real bank feed.
          </p>
          <Button className="mt-3" full variant="secondary" disabled={busy === 'demo'} onClick={loadDemo}>
            {busy === 'demo' ? 'Generating…' : 'Load demo data'}
          </Button>
        </Card>
      ) : null}

      <p className="px-1 text-[12px] leading-relaxed text-ink-subtle">
        Kroner never asks for card numbers, CVV codes, MitID or bank passwords, and has no code that
        could move money.{' '}
        <Link href="/privacy" className="font-medium text-accent">
          How this works
        </Link>
      </p>

      <Sheet
        open={sheet === 'bank'}
        onClose={() => setSheet(null)}
        title={bankConnection ? 'Your bank' : 'Choose your bank'}
        description={
          bankConnection
            ? 'Connected read-only. Disconnecting keeps everything already imported.'
            : 'You will be handed to your bank to approve read-only access.'
        }
      >
        <BankPicker
          connection={bankConnection}
          onDone={() => {
            setSheet(null);
            router.refresh();
          }}
          onMessage={setMessage}
        />
      </Sheet>

      <Sheet
        open={sheet === 'stripe'}
        onClose={() => setSheet(null)}
        title="Stripe"
        description={
          stripeConnection
            ? 'Connected with read-only access.'
            : 'Read-only access to payments, refunds, fees and payouts.'
        }
      >
        <StripeSheet
          connected={Boolean(stripeConnection)}
          connectAvailable={stripeConnectAvailable}
          onConnect={connectStripe}
          onDone={() => {
            setSheet(null);
            router.refresh();
          }}
        />
      </Sheet>

      <Sheet
        open={sheet === 'mobilepay'}
        onClose={() => setSheet(null)}
        title="MobilePay"
        description="Where the data comes from, and why there is no button to press."
      >
        <MobilePaySheet status={mobilePay} onClose={() => setSheet(null)} />
      </Sheet>
    </div>
  );
}

function ConnectTile({
  title,
  subtitle,
  detail,
  mark,
  tone,
  connected,
  disabled,
  disabledHint,
  cta,
  busy,
  onClick,
}: {
  title: string;
  subtitle: string;
  detail: string;
  mark: React.ReactNode;
  tone: string;
  connected: boolean;
  disabled?: boolean;
  disabledHint?: string;
  cta: string;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        'pressable block w-full rounded-[var(--radius-card)] border bg-surface p-4 text-left',
        'shadow-[var(--shadow-card)] disabled:opacity-60 disabled:active:scale-100',
        connected ? 'border-positive/35' : 'border-border',
      )}
    >
      <div className="flex items-center gap-3.5">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-tile)] text-white"
          style={{ background: tone }}
        >
          {mark}
        </span>

        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-[16px] font-semibold tracking-tight">{title}</span>
          {connected ? (
            <Badge tone="positive" className="shrink-0">
              <span className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full bg-positive" />
              Connected
            </Badge>
          ) : null}
        </span>

        <span
          className={cn(
            'shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium',
            connected ? 'bg-surface-muted text-ink-muted' : 'bg-accent text-white',
          )}
        >
          {busy ? '…' : cta}
        </span>
      </div>

      {/* Full width for the copy: a truncated explanation explains nothing. */}
      <span className="mt-2.5 block text-[13px] leading-snug text-ink-muted">{subtitle}</span>
      <span className="mt-1.5 block text-[12.5px] leading-relaxed text-ink-subtle">
        {disabled && disabledHint ? disabledHint : detail}
      </span>
    </button>
  );
}

function Notice({ kind, provider }: { kind: string; provider: string }) {
  const copy: Record<string, { text: string; tone: 'ok' | 'bad' | 'info' }> = {
    connected: { text: `${provider} connected. Transactions are importing.`, tone: 'ok' },
    declined: { text: `Authorization cancelled. Nothing was connected or stored.`, tone: 'info' },
    expired: { text: 'That authorization link expired. Start again.', tone: 'bad' },
    incomplete: { text: 'The provider did not send back everything we need. Try again.', tone: 'bad' },
    pending: { text: `${provider} has not confirmed yet. Try again in a moment.`, tone: 'info' },
    failed: { text: `${provider} did not confirm access.`, tone: 'bad' },
    unknown: { text: 'Could not match that authorization. Start again from here.', tone: 'bad' },
  };
  const entry = copy[kind] ?? copy.unknown!;
  return (
    <p
      role="status"
      className={cn(
        'rounded-xl px-3.5 py-2.5 text-[13px]',
        entry.tone === 'ok' && 'bg-positive-soft text-positive',
        entry.tone === 'bad' && 'bg-negative-soft text-negative',
        entry.tone === 'info' && 'bg-surface-muted text-ink-muted',
      )}
    >
      {entry.text}
    </p>
  );
}

function StripeSheet({
  connected,
  connectAvailable,
  onConnect,
  onDone,
}: {
  connected: boolean;
  connectAvailable: boolean;
  onConnect: () => Promise<void>;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();

  if (connected) {
    return (
      <div className="space-y-3 pb-2">
        <ScopeList
          items={[
            'Balance transactions, charges and payouts',
            'Fees split out from revenue automatically',
          ]}
          denied={['Creating charges', 'Issuing refunds', 'Changing payout settings']}
        />
        <form
          action={async () => {
            const { disconnectStripeAction } = await import('@/app/(app)/integrations/actions');
            startTransition(async () => {
              await disconnectStripeAction();
              onDone();
            });
          }}
        >
          <Button type="submit" variant="secondary" full disabled={pending}>
            {pending ? 'Disconnecting…' : 'Disconnect Stripe'}
          </Button>
        </form>
        <p className="pb-2 text-[12px] leading-relaxed text-ink-subtle">
          Disconnecting revokes the grant at Stripe and deletes the stored token. Transactions
          already imported are kept.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-2">
      <ScopeList
        items={['Read payments, refunds, fees and payouts']}
        denied={['Create a charge', 'Issue a refund', 'Move a payout']}
      />
      {connectAvailable ? (
        <Button full size="lg" onClick={() => void onConnect()}>
          Continue to Stripe
        </Button>
      ) : (
        <div className="rounded-xl bg-surface-muted p-3.5">
          <p className="text-[13px] font-medium">One-tap Stripe is not set up here</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
            Set <code className="font-mono text-[11.5px]">STRIPE_CONNECT_CLIENT_ID</code> and{' '}
            <code className="font-mono text-[11.5px]">STRIPE_SECRET_KEY</code> to enable it. Until
            then you can paste a restricted read-only key in Integrations.
          </p>
          <Link href="/integrations" className="mt-2.5 inline-block text-[13px] font-medium text-accent">
            Open Integrations
          </Link>
        </div>
      )}
    </div>
  );
}

function MobilePaySheet({
  status,
  onClose,
}: {
  status: MobilePayStatus & { transactionCount: number };
  onClose: () => void;
}) {
  return (
    <div className="space-y-4 pb-2">
      <div className="rounded-xl bg-surface-muted p-3.5">
        <p className="text-[13px] font-medium">There is no MobilePay login to give us</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
          MobilePay has never offered a way for an app to read a personal account, and pretending
          otherwise would mean asking you for credentials no one should hand over. So Kroner reads
          your MobilePay payments out of your bank feed, where they already appear with the other
          person’s name.
        </p>
      </div>

      <ol className="space-y-2.5">
        {[
          'Connect your bank above — one tap.',
          'Kroner picks the MobilePay payments out of the feed.',
          'You get who you pay, who pays you, and the net with each person.',
        ].map((step, i) => (
          <li key={step} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-ink"
            >
              {i + 1}
            </span>
            <span className="text-[13.5px] leading-snug">{step}</span>
          </li>
        ))}
      </ol>

      {status.businessConfigured ? (
        <p className="rounded-xl bg-accent-soft p-3 text-[12.5px] leading-relaxed text-accent-ink">
          MobilePay business credentials are configured on this deployment, so merchant settlements
          can be pulled in as well.
        </p>
      ) : (
        <p className="text-[12px] leading-relaxed text-ink-subtle">
          Taking MobilePay as a business? Vipps MobilePay does have a merchant API — add
          MOBILEPAY_CLIENT_ID, MOBILEPAY_CLIENT_SECRET and MOBILEPAY_SUBSCRIPTION_KEY to enable it.
        </p>
      )}

      <Button full onClick={onClose}>
        Got it
      </Button>
    </div>
  );
}

function ScopeList({ items, denied }: { items: string[]; denied: string[] }) {
  return (
    <div className="space-y-2.5">
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-[13px] text-ink-muted">
            <span aria-hidden="true" className="mt-[3px] text-positive">
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m3 8.5 3.2 3.2L13 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {item}
          </li>
        ))}
      </ul>
      <ul className="space-y-1.5 border-t border-border pt-2.5">
        {denied.map((item) => (
          <li key={item} className="flex items-start gap-2 text-[13px] text-ink-subtle">
            <span aria-hidden="true" className="mt-[3px]">
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m4 4 8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function BankMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" {...strokeProps}>
      <path d="M3.5 9.5 12 4.5l8.5 5" />
      <path d="M6 10.5v7M10 10.5v7M14 10.5v7M18 10.5v7" />
      <path d="M4 19.5h16" />
    </svg>
  );
}

function StripeMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" {...strokeProps}>
      <path d="M15.5 8.2c-1-.6-2.2-.9-3.4-.9-1.9 0-3.1.8-3.1 2 0 3.3 7.1 1.9 7.1 6.1 0 2.1-1.9 3.4-4.6 3.4-1.5 0-3.1-.4-4.4-1.1" />
    </svg>
  );
}

function MobilePayMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" {...strokeProps}>
      <rect x="7" y="3" width="10" height="18" rx="2.6" />
      <path d="M10.5 17.5h3" />
      <path d="M9.8 9.2 12 11.4l3.2-3.6" />
    </svg>
  );
}
