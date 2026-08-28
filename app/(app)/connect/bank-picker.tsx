'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Button, Input, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { disconnectBankAction, syncConnectionAction } from '@/app/(app)/integrations/actions';

interface FeaturedBank {
  key: string;
  name: string;
  institutionId: string;
  institutionName: string;
  tone: string;
  initials: string;
  hasLogo: boolean;
  transactionHistoryDays: number;
}

interface OtherBank {
  id: string;
  name: string;
  logoUrl: string | null;
  transactionHistoryDays: number;
}

/**
 * Choosing a bank is the one decision only the user can make, so it is the
 * only thing this asks. The common Danish banks are one tap; everything else
 * is a search rather than a 200-row list nobody scrolls.
 */
export function BankPicker({
  connection,
  onDone,
  onMessage,
}: {
  connection: { id: string; name: string; accountCount: number; syncError: string | null } | null;
  onDone: () => void;
  onMessage: (message: { tone: 'ok' | 'bad'; text: string }) => void;
}) {
  const [featured, setFeatured] = useState<FeaturedBank[] | null>(null);
  const [others, setOthers] = useState<OtherBank[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [connecting, setConnecting] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (connection) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/banks/institutions?country=DK');
        const data = (await response.json()) as {
          featured?: FeaturedBank[];
          others?: OtherBank[];
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? 'Could not load banks.');
        if (cancelled) return;
        setFeatured(data.featured ?? []);
        setOthers(data.others ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load banks.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return others.filter((o) => o.name.toLowerCase().includes(term)).slice(0, 20);
  }, [others, query]);

  async function connect(institutionId: string, institutionName: string) {
    setConnecting(institutionId);
    setError(null);
    try {
      const response = await fetch('/api/banks/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ institutionId, institutionName }),
      });
      const data = (await response.json()) as { authorizationUrl?: string; error?: string };
      if (!response.ok || !data.authorizationUrl) {
        throw new Error(data.error ?? 'Could not start the bank authorization.');
      }
      // Hand off to the bank's own approval page.
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setConnecting(null);
      setError(err instanceof Error ? err.message : 'Could not connect.');
    }
  }

  if (connection) {
    return (
      <div className="space-y-3 pb-2">
        <div className="rounded-xl bg-surface-muted p-3.5">
          <p className="text-[14px] font-medium">{connection.name}</p>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">
            {connection.accountCount} account{connection.accountCount === 1 ? '' : 's'}, read-only.
          </p>
          {connection.syncError ? (
            <p className="mt-2 text-[12.5px] leading-relaxed text-notice">{connection.syncError}</p>
          ) : null}
        </div>

        <Button
          full
          disabled={pending}
          onClick={() => {
            const form = new FormData();
            form.set('connectionId', connection.id);
            form.set('target', 'bank');
            startTransition(async () => {
              const result = await syncConnectionAction(form);
              if (result.error) onMessage({ tone: 'bad', text: result.error });
              else onMessage({ tone: 'ok', text: result.message ?? 'Up to date.' });
              onDone();
            });
          }}
        >
          {pending ? 'Syncing…' : 'Sync now'}
        </Button>

        <Button
          full
          variant="secondary"
          disabled={pending}
          onClick={() => {
            const form = new FormData();
            form.set('connectionId', connection.id);
            startTransition(async () => {
              const result = await disconnectBankAction(form);
              if (result.error) onMessage({ tone: 'bad', text: result.error });
              else onMessage({ tone: 'ok', text: result.message ?? 'Disconnected.' });
              onDone();
            });
          }}
        >
          Disconnect
        </Button>

        <p className="pb-2 text-[12px] leading-relaxed text-ink-subtle">
          Disconnecting withdraws consent at your bank and deletes the stored token. Everything
          already imported stays.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pb-4">
        <p className="rounded-xl bg-negative-soft px-3.5 py-2.5 text-[13px] text-negative">{error}</p>
      </div>
    );
  }

  if (!featured) {
    return (
      <div className="space-y-2 pb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[60px] rounded-[var(--radius-tile)]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-2">
      {featured.length > 0 ? (
        <ul className="space-y-2">
          {featured.map((bank) => (
            <li key={bank.key}>
              <button
                type="button"
                onClick={() => connect(bank.institutionId, bank.institutionName)}
                disabled={connecting !== null}
                className={cn(
                  'pressable flex w-full items-center gap-3 rounded-[var(--radius-tile)] border border-border',
                  'bg-surface p-3 text-left disabled:opacity-60 disabled:active:scale-100',
                )}
              >
                <BankLogo bank={bank} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{bank.name}</span>
                  <span className="block truncate text-[12px] text-ink-subtle">
                    {Math.round(bank.transactionHistoryDays / 30)} months of history
                  </span>
                </span>
                <span className="shrink-0 text-[13px] font-medium text-accent">
                  {connecting === bank.institutionId ? 'Opening…' : 'Connect'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-muted">
          No Danish banks were returned. Check the provider credentials.
        </p>
      )}

      {others.length > 0 ? (
        <div>
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${others.length} more banks`}
            aria-label="Search for your bank"
          />
          {matches.length > 0 ? (
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
              {matches.map((bank) => (
                <li key={bank.id}>
                  <button
                    type="button"
                    onClick={() => connect(bank.id, bank.name)}
                    disabled={connecting !== null}
                    className="pressable flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-muted"
                  >
                    <span className="truncate text-[14px]">{bank.name}</span>
                    <span className="shrink-0 text-[13px] font-medium text-accent">
                      {connecting === bank.id ? '…' : 'Connect'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim() ? (
            <p className="mt-2 px-1 text-[13px] text-ink-subtle">No bank matches “{query.trim()}”.</p>
          ) : null}
        </div>
      ) : null}

      <p className="pb-2 text-[12px] leading-relaxed text-ink-subtle">
        You will approve this at your own bank. Kroner never sees your MitID, your password, or any
        card details.
      </p>
    </div>
  );
}

function BankLogo({ bank }: { bank: FeaturedBank }) {
  const [failed, setFailed] = useState(false);

  if (bank.hasLogo && !failed) {
    return (
      // Proxied through our own origin so the bank's CDN never sees the visitor.
      <img
        src={`/api/banks/logo?institution=${encodeURIComponent(bank.institutionId)}`}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-10 w-10 shrink-0 rounded-xl border border-border bg-white object-contain p-1"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold text-white"
      style={{ background: bank.tone }}
    >
      {bank.initials}
    </span>
  );
}
