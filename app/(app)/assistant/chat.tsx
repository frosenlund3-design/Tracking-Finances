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
  /** Tools that have started but whose answer has not arrived yet. */
  running?: string[];
  pending?: boolean;
  failed?: boolean;
}

/*
 * Deliberately mixed. The first thing on the screen decides what people think
 * the assistant is for, and a list of six money questions teaches them it
 * cannot answer anything else.
 */
const SUGGESTIONS = [
  'What should I cook tonight?',
  'What needs eating before it goes off?',
  'Where did most of my money go this month?',
  'Which bin does a receipt go in?',
  'What am I about to run out of?',
  'What subscriptions am I paying for?',
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
  const [followUps, setFollowUps] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const conversationId = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  /**
   * Streams the answer.
   *
   * Which tools ran and the text itself both arrive as they happen, so the
   * wait is filled with the work rather than a spinner. The numbers are
   * identical to the non-streaming path — this is presentation, not accuracy.
   */
  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy) return;

    setInput('');
    if (composerRef.current) composerRef.current.style.height = '';
    setBusy(true);
    setFollowUps([]);

    const history = turns
      .filter((t) => !t.pending && !t.failed)
      .slice(-8)
      .map((t) => ({ role: t.role, content: t.content }));

    setTurns((prev) => [
      ...prev,
      { role: 'user', content: trimmed },
      { role: 'assistant', content: '', pending: true, running: [] },
    ]);

    const patchLast = (patch: (turn: Turn) => Turn) =>
      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last) next[next.length - 1] = patch(last);
        return next;
      });

    try {
      const response = await fetch('/api/assistant/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: trimmed, conversationId: conversationId.current, history }),
      });

      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'The assistant could not answer that.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Server-sent events are separated by a blank line.
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith('data:')) continue;
          let event: {
            type: string; text?: string; tool?: string;
            toolsUsed?: string[]; evidence?: Turn['evidence']; followUps?: string[];
          };
          try {
            event = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }

          if (event.type === 'tool' && event.tool) {
            const tool = event.tool;
            patchLast((turn) => ({ ...turn, running: [...(turn.running ?? []), tool] }));
          } else if (event.type === 'answer' && event.text) {
            const text = event.text;
            patchLast((turn) => ({ ...turn, pending: false, content: turn.content + text }));
          } else if (event.type === 'done') {
            patchLast((turn) => ({
              ...turn,
              pending: false,
              running: undefined,
              toolsUsed: event.toolsUsed ?? turn.toolsUsed,
              evidence: event.evidence ?? turn.evidence,
            }));
            setFollowUps(event.followUps ?? []);
          } else if (event.type === 'error') {
            patchLast((turn) => ({
              ...turn,
              pending: false,
              failed: true,
              content: event.text ?? 'Something went wrong.',
            }));
          }
        }
      }

      // A stream that ended without producing anything is still a failure.
      patchLast((turn) =>
        turn.content || turn.failed
          ? turn
          : { ...turn, pending: false, failed: true, content: 'No answer came back. Try again.' },
      );
    } catch (err) {
      patchLast((turn) => ({
        ...turn,
        pending: false,
        failed: true,
        content: err instanceof Error ? err.message : 'Something went wrong.',
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rise flex min-h-[calc(100dvh-9rem)] flex-col">
      <header className="pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Ask</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          Your money, your kitchen, your home. Every number comes from a query against your own
          data — the assistant reads and explains, and cannot move money, change anything, or
          decide anything on your behalf.
        </p>
      </header>

      {!hasData ? (
        <Card className="p-5">
          <p className="text-[14px] font-medium">No data to ask about yet</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
            Load demo data, connect an account, or scan something into the kitchen — then come back
            and ask anything.
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

            {followUps.length > 0 && !busy ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {followUps.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => ask(suggestion)}
                    className="pressable rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-ink-muted hover:text-ink"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}

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
                ref={composerRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  // Grow with the question. A two-line question typed into a
                  // one-line box scrolls its own first line out of sight,
                  // which is a strange thing to do to someone mid-sentence.
                  const el = e.target;
                  el.style.height = 'auto';
                  el.style.height = `${el.scrollHeight}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void ask(input);
                  }
                }}
                rows={1}
                maxLength={1000}
                placeholder="Ask a question…"
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
    const running = turn.running ?? [];
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
        {running.length > 0
          ? (TOOL_LABELS[running[running.length - 1]!] ?? 'Reading your transactions') + '…'
          : 'Working it out from your transactions…'}
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
