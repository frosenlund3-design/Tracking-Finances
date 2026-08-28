'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCelebrate } from '@/components/play/celebrate';
import { Input } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { setBinAction } from './actions';

export interface BinRow {
  key: string;
  label: string;
  english: string;
  color: string;
  glyph: string;
  hint: string;
  status: 'have' | 'missing' | 'unknown';
}

export interface LookupRow {
  name: string;
  danish: string;
  answer: string;
  answerLabel: string;
  answerColor: string;
  why: string;
}

/**
 * The bins at home, and a lookup for the moment you are standing there
 * holding something.
 *
 * The search comes first on the screen because it is the thing wanted in a
 * hurry; the inventory is underneath because it is answered once and then
 * mostly read.
 */
export function BinsScreen({ bins, items }: { bins: BinRow[]; items: LookupRow[] }) {
  const router = useRouter();
  const celebrate = useCelebrate();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return items
      .filter(
        (item) =>
          item.name.toLowerCase().includes(q) || item.danish.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [items, query]);

  async function answer(fraction: string, status: BinRow['status']) {
    setBusy(fraction);
    const result = await setBinAction({ fraction, status });
    setBusy(null);
    if (result.error) return;
    if (result.reward?.xp) {
      celebrate({
        xp: result.reward.xp,
        levelUp: result.reward.levelUp,
        unlocked: result.reward.unlocked,
      });
    }
    router.refresh();
  }

  const missing = bins.filter((b) => b.status === 'missing');
  const unanswered = bins.filter((b) => b.status === 'unknown').length;

  return (
    <div className="rise space-y-5">
      <header>
        <h1 className="text-[28px] font-bold tracking-tight">Sorting at home</h1>
        <p className="mt-0.5 text-[13.5px] text-ink-muted">
          Denmark sorts into ten fractions. Here is which ones you have, and where anything goes.
        </p>
      </header>

      <div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Which bin does… go in?"
          aria-label="Search for an item"
          type="search"
        />
        {results.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {results.map((item) => (
              <li
                key={item.name}
                className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[15px]"
                  style={{ background: item.answerColor, color: '#fff' }}
                >
                  ✓
                </span>
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-semibold leading-tight">
                    {item.name} → {item.answerLabel}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-muted">
                    {item.why}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : query.trim().length >= 2 ? (
          <p className="mt-2 rounded-2xl border border-border bg-surface p-3.5 text-[13px] leading-relaxed text-ink-muted">
            Not in the list. When in doubt it is <strong className="font-semibold">Restaffald</strong>{' '}
            — a wrong item in the recycling costs more than a right one in the residual bin.
          </p>
        ) : null}
      </div>

      {missing.length > 0 ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <p className="text-[14px] font-semibold">
            You are missing {missing.length} bin{missing.length === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            {missing.map((m) => m.label).join(', ')}. Your kommune supplies these free — it is one
            phone call, and it is the difference between sorting and meaning to.
          </p>
        </div>
      ) : null}

      <section>
        <h2 className="px-1 text-[12.5px] font-semibold uppercase tracking-wide text-ink-subtle">
          The ten fractions
          {unanswered > 0 ? ` · ${unanswered} unanswered` : ''}
        </h2>
        <ul className="mt-2 space-y-2">
          {bins.map((bin) => (
            <li key={bin.key} className="rounded-2xl border border-border bg-surface p-3.5">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[18px]"
                  style={{ background: bin.color, color: '#fff' }}
                >
                  {bin.glyph}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-tight">{bin.label}</p>
                  <p className="text-[12px] text-ink-subtle">{bin.english}</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{bin.hint}</p>
                </div>
              </div>
              <div className="mt-2.5 flex gap-1.5">
                {(['have', 'missing'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={busy === bin.key}
                    onClick={() => void answer(bin.key, status)}
                    className={cn(
                      'pressable flex-1 rounded-xl py-2 text-[13px] font-semibold disabled:opacity-60',
                      bin.status === status
                        ? status === 'have'
                          ? 'bg-positive-soft text-positive'
                          : 'bg-notice-soft text-notice'
                        : 'bg-surface-muted text-ink-muted',
                    )}
                  >
                    {status === 'have' ? 'I have this' : 'Do not have it'}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
