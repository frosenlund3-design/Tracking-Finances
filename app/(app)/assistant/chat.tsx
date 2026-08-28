'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, Card, Textarea } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[];
  evidence?: Array<{ tool: string; result: unknown }>;
  pending?: boolean;
  failed?: boolean;
}

const SUGGESTIONS = [
  'Where did most of my money go this month?',
  'How much did I spend on software?',
  'What subscriptions am I paying for?',
  'How much can I safely spend this month?',
  'Compare this month to last month.',
  'How much profit has my business made?',
];

const TOOL_LABELS: Record<string, string> = {
  get_period_summary: 'Totalled the period',
  get_category_spending: 'Grouped by category',
  get_merchant_spending: 'Grouped by merchant',
  list_transactions: 'Listed matching transactions',
  get_subscriptions: 'Read detected subscriptions',
  get_business_summary: 'Computed business figures',
  compare_periods: 'Compared two periods',
  get_cash_flow_forecast: 'Ran the cash flow estimate',
  get_largest_expenses: 'Found the largest expenses',
  get_balances_and_rate: 'Read balances and spend rate',
  get_monthly_trend: 'Read the monthly trend',
  get_upcoming_charges: 'Read upcoming charges',
  list_categories: 'Listed categories',
};

export function AssistantChat({
  available,
  hasData,
  demoMode,
  name,
}: {
  available: boolean;
  hasData: boolean;
  demoMode: boolean;
  name: string | null;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const conversationId = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy) return;

    setInput('');
    setBusy(true);
    setTurns((prev) => [
      ...prev,
      { role: 'user', content: trimmed },
      { role: 'assistant', content: '', pending: true },
    ]);

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          conversationId: conversationId.current,
          history: turns
            .filter((t) => !t.pending && !t.failed)
            .slice(-8)
            .map((t) => ({ role: t.role, content: t.content })),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'The assistant could not answer that.');
      }

      const data = (await response.json()) as {
        answer: string;
        toolsUsed: string[];
        evidence: Array<{ tool: string; result: unknown }>;
      };

      setTurns((prev) => [
        ...prev.slice(0, -1),
        {
          role: 'assistant',
          content: data.answer,
          toolsUsed: data.toolsUsed,
          evidence: data.evidence,
        },
      ]);
    } catch (err) {
      setTurns((prev) => [
        ...prev.slice(0, -1),
        {
          role: 'assistant',
          content: err instanceof Error ? err.message : 'Something went wrong.',
          failed: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rise flex min-h-[calc(100dvh-9rem)] flex-col">
      <header className="pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Ask about your money</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          Every number comes from a query against your own transactions. The assistant reads and
          explains — it cannot move money, make payments, or change anything.
        </p>
      </header>

      {!hasData ? (
        <Card className="p-5">
          <p className="text-[14px] font-medium">No data to ask about yet</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
            Load demo data or connect an account, then come back and ask anything.
          </p>
          <Link href="/connect" className="mt-4 block">
            <Button size="sm">Add some data</Button>
          </Link>
        </Card>
      ) : (
        <>
          <div className="flex-1 space-y-3">
            {turns.length === 0 ? (
              <div className="space-y-2.5">
                <p className="px-1 text-[13px] text-ink-muted">
                  {name ? `Try one of these, ${name.split(' ')[0]}:` : 'Try one of these:'}
                </p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="block w-full rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 text-left text-[14px] transition-colors hover:border-border-strong"
                  >
                    {s}
                  </button>
                ))}
                {!available ? (
                  <p className="px-1 pt-1 text-[12px] leading-relaxed text-ink-subtle">
                    No Anthropic API key is configured, so the assistant answers from a fixed set of
                    question patterns. The numbers are the same either way — they come from the same
                    queries. Set <code className="font-mono">ANTHROPIC_API_KEY</code> to ask
                    anything in your own words.
                  </p>
                ) : null}
              </div>
            ) : (
              turns.map((turn, i) => <TurnBubble key={i} turn={turn} />)
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
            className="sticky bottom-0 -mx-4 mt-4 border-t border-border bg-canvas/95 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-[var(--radius-card)] sm:border sm:px-3"
          >
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void ask(input);
                  }
                }}
                rows={1}
                maxLength={1000}
                placeholder="How much did I spend on restaurants?"
                aria-label="Ask a question about your finances"
                className="max-h-32 min-h-[2.75rem] flex-1"
              />
              <Button type="submit" disabled={busy || !input.trim()} className="shrink-0">
                {busy ? '…' : 'Ask'}
              </Button>
            </div>
            {demoMode ? (
              <p className="mt-1.5 px-1 text-[11px] text-ink-subtle">
                Answering from demo data.
              </p>
            ) : null}
          </form>
        </>
      )}
    </div>
  );
}

function TurnBubble({ turn }: { turn: Turn }) {
  if (turn.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-[14px] leading-relaxed text-white">
          {turn.content}
        </p>
      </div>
    );
  }

  if (turn.pending) {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-[13px] text-ink-muted">
        <span className="flex gap-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-subtle"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </span>
        Working it out from your transactions…
      </div>
    );
  }

  return (
    <div>
      <div
        className={cn(
          'max-w-[92%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[14px] leading-relaxed',
          turn.failed ? 'bg-negative-soft text-negative' : 'bg-surface border border-border',
        )}
      >
        {turn.content.split('\n').map((line, i) => (
          <p key={i} className={i > 0 ? 'mt-1.5' : undefined}>
            {line}
          </p>
        ))}
      </div>

      {turn.toolsUsed && turn.toolsUsed.length > 0 ? (
        <details className="mt-1.5 px-1">
          <summary className="cursor-pointer list-none text-[12px] text-ink-subtle hover:text-ink-muted">
            How this was calculated →
          </summary>
          <div className="mt-2 space-y-1.5 rounded-lg bg-surface-muted p-3">
            {[...new Set(turn.toolsUsed)].map((tool) => (
              <p key={tool} className="text-[12px] text-ink-muted">
                · {TOOL_LABELS[tool] ?? tool}
              </p>
            ))}
            <p className="pt-1 text-[11px] text-ink-subtle">
              These are read-only database queries. The model chose which to run and explained the
              result; it did not produce the numbers itself.
            </p>
          </div>
        </details>
      ) : null}
    </div>
  );
}
