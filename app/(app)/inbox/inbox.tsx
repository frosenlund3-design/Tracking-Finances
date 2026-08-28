'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { disconnectMailboxAction } from './actions';

export interface InboxMessage {
  id: string;
  source: string;
  from: string;
  subject: string;
  preview: string;
  when: string;
  unread: boolean;
  url: string | null;
}

export interface SourceRow {
  id: string;
  displayName: string;
  possible: boolean;
  why?: string;
  configured: boolean;
  envVars: string[];
  docs?: string;
}

/**
 * One inbox, and an honest account of what can be in it.
 *
 * The section at the bottom is the important part. Every other unified-inbox
 * app either lists WhatsApp as "coming soon" forever or quietly scrapes a
 * logged-in session; this one says which platforms publish no way to read a
 * private person's messages, and why, so nobody waits for a feature that
 * cannot arrive.
 */
export function Inbox({
  messages,
  sources,
  connected,
  demo,
  gmailConfigured,
  gmailConnected,
  notice,
}: {
  messages: InboxMessage[];
  sources: SourceRow[];
  connected: string[];
  demo: boolean;
  gmailConfigured: boolean;
  gmailConnected: boolean;
  notice: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/gmail/connect', { method: 'POST' });
      const body = (await response.json()) as { authorizationUrl?: string; error?: string };
      if (!response.ok || !body.authorizationUrl) {
        setError(body.error ?? 'Could not start the connection.');
        setBusy(false);
        return;
      }
      window.location.href = body.authorizationUrl;
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  const impossible = sources.filter((s) => !s.possible);
  const possible = sources.filter((s) => s.possible);

  return (
    <div className="rise space-y-5">
      <header>
        <h1 className="text-[28px] font-bold tracking-tight">Inbox</h1>
        <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-muted">
          {connected.length > 0
            ? `Reading from ${connected.join(' and ')}. Read-only — nothing here can reply, delete or send.`
            : 'Everything that can honestly be read in one place. Read-only, always.'}
        </p>
      </header>

      {notice ? (
        <p
          className={cn(
            'rounded-xl px-3.5 py-2.5 text-[13px]',
            notice === 'connected'
              ? 'bg-positive-soft text-positive'
              : 'bg-notice-soft text-notice',
          )}
        >
          {notice === 'connected'
            ? 'Mailbox connected. Read-only access only.'
            : notice === 'declined'
              ? 'You declined the request. Nothing was connected.'
              : 'That link had expired. Try connecting again.'}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl bg-negative-soft px-3.5 py-2.5 text-[13px] text-negative">
          {error}
        </p>
      ) : null}

      {demo ? (
        <p className="rounded-xl bg-notice-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-notice">
          These are demo messages, not your real mail. Connect a mailbox to see your own.
        </p>
      ) : null}

      {!gmailConnected ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <p className="text-[15px] font-semibold">Connect a mailbox</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            One button, and the scope Google shows you is{' '}
            <code className="font-mono text-[12px]">gmail.readonly</code> — the grant cannot send,
            delete or label, even if this app tried. Only senders, subjects and the preview line
            are read; message bodies stay in Gmail.
          </p>
          {gmailConfigured ? (
            <Button className="mt-3" onClick={() => void connect()} disabled={busy}>
              {busy ? 'Opening Google…' : 'Connect Gmail'}
            </Button>
          ) : (
            <p className="mt-3 rounded-xl bg-surface-muted px-3 py-2.5 font-mono text-[12px] leading-relaxed text-ink-muted">
              Not configured on this deployment. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET,
              and add {`{APP_URL}`}/api/gmail/callback as an authorised redirect URI.
            </p>
          )}
        </div>
      ) : null}

      {messages.length > 0 ? (
        <ul className="space-y-1.5">
          {messages.map((message) => {
            const body = (
              <>
                <span className="flex items-baseline justify-between gap-3">
                  <span
                    className={cn(
                      'min-w-0 truncate text-[14.5px] leading-tight',
                      message.unread ? 'font-bold' : 'font-medium',
                    )}
                  >
                    {message.from}
                  </span>
                  <span className="shrink-0 text-[11.5px] text-ink-subtle">{message.when}</span>
                </span>
                <span className="mt-0.5 block truncate text-[13.5px]">{message.subject}</span>
                <span className="mt-0.5 block truncate text-[12.5px] text-ink-subtle">
                  {message.preview}
                </span>
              </>
            );
            return (
              <li key={`${message.source}-${message.id}`}>
                {message.url ? (
                  <a
                    href={message.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="pressable block rounded-2xl border border-border bg-surface p-3.5"
                  >
                    {body}
                  </a>
                ) : (
                  <div className="rounded-2xl border border-border bg-surface p-3.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {gmailConnected ? (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await disconnectMailboxAction();
            setBusy(false);
            router.refresh();
          }}
          className="px-1 text-[13px] text-negative disabled:opacity-60"
        >
          Disconnect the mailbox
        </button>
      ) : null}

      <section>
        <h2 className="px-1 text-[12.5px] font-semibold uppercase tracking-wide text-ink-subtle">
          What can be connected
        </h2>
        <ul className="mt-2 space-y-1.5">
          {possible.map((source) => (
            <li
              key={source.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold">{source.displayName}</span>
                <span className="mt-0.5 block text-[12.5px] text-ink-subtle">
                  {source.configured
                    ? 'Configured on this deployment'
                    : `Needs ${source.envVars.join(' and ')}`}
                </span>
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold',
                  source.configured
                    ? 'bg-positive-soft text-positive'
                    : 'bg-surface-muted text-ink-subtle',
                )}
              >
                {source.configured ? 'Ready' : 'Setup needed'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="px-1 text-[12.5px] font-semibold uppercase tracking-wide text-ink-subtle">
          What cannot, and why
        </h2>
        <p className="mt-1.5 px-1 text-[12.5px] leading-relaxed text-ink-muted">
          Not a roadmap. These platforms publish no way for any app to read a private person’s
          messages, so no version of this one will ever list them as connected.
        </p>
        <ul className="mt-2 space-y-1.5">
          {impossible.map((source) => (
            <li key={source.id} className="rounded-2xl border border-border bg-surface p-3.5">
              <p className="text-[14.5px] font-semibold">{source.displayName}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">{source.why}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
