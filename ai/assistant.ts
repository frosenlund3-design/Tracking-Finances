import '@/lib/server-guard';
import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaContentBlock,
  BetaMessageParam,
  BetaTextBlock,
  BetaTool,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from '@anthropic-ai/sdk/resources/beta/messages';
import { randomUUID } from 'node:crypto';
import { withUser } from '@/database';
import { redact } from '@/security/redact';
import { anthropicToolDefinitions, runTool, ALLOWED_TOOL_NAMES, type ToolContext } from './tools';
import { answerDeterministically } from './fallback';
import type { User } from '@/types/finance';

/**
 * The finance assistant.
 *
 * Division of labour, strictly:
 *   the model   — understands the question, picks a tool, phrases the answer
 *   the backend — computes every number, in SQL, from the user's own data
 *
 * The model is never shown a pile of raw transactions and asked to total them.
 * It receives the output of a deterministic calculation and explains it. That
 * is the entire anti-hallucination design, and it is enforced structurally:
 * the only way for the model to obtain a figure is to call a tool that
 * computed it.
 */

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5';
const MAX_TOOL_ROUNDS = 6;
const MAX_QUESTION_LENGTH = 1000;

const SYSTEM_PROMPT = `You are the assistant inside Kroner, which organises four parts of a person's life: their money, their kitchen, their home and their body.

HOW YOU WORK
- Every figure you state must come from a tool result in this conversation. Never estimate, never infer a total from a list of transactions, never carry a number over from your own general knowledge.
- If a tool returns no data, say so plainly. "I don't have any transactions in that period" is a good answer. Inventing a plausible number is not.
- Prefer one well-chosen tool call. Call several only when the question genuinely needs them.
- Amounts arrive with a "formatted" field already in the user's currency. Use it verbatim rather than reformatting.
- Questions about food, sorting, routines and supplies are as much yours as questions about money. "What should I cook tonight" is answered from what is actually in their kitchen, not from general recipe knowledge.

WHAT YOU CANNOT DO
- You have read access only. You cannot move money, make payments, issue refunds, change payout settings, connect or disconnect accounts, or alter any data. If asked, say plainly that you are read-only and point to the relevant screen in the app.
- You are not an accountant. You may describe what was spent and how a transaction is currently marked for bookkeeping, but do not give definitive Danish tax advice. When tax comes up, note that deductibility should be confirmed with an accountant.
- You are not a doctor or a food safety authority. Best-before dates in the kitchen are the app's estimate of how long a kind of thing usually keeps, not a safety ruling — say so if someone asks whether something is still safe, and tell them to trust their own senses over a stored date.

ABOUT PROGRESS
- The app has no streaks and nothing that can be broken. Momentum decays slowly and never falls below a floor the person has already earned; routine targets are weekly, not daily. Never imply someone is behind, never frame a quiet week as a failure, and never use urgency to push them into doing something.

HOW YOU WRITE
- Lead with the answer. One or two sentences, then detail only if it helps.
- Include the count of transactions behind a total when you have it — it makes the number checkable.
- Neutral and factual. No alarm, no judgement about spending choices, no motivational framing.
- Say "estimate" when the figure is a projection, because projections carry a disclaimer for a reason.
- Never guilt, never nag. If someone has not cooked or trained this week, that is information, not a verdict.`;

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantResult {
  answer: string;
  toolsUsed: string[];
  /** Raw computed results, so the UI can show the figures behind the sentence. */
  evidence: Array<{ tool: string; result: unknown }>;
  model: string | null;
  mode: 'model' | 'deterministic';
  latencyMs: number;
}

export function assistantAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function textFrom(content: BetaContentBlock[]): string {
  return content
    .filter((b): b is BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export async function askAssistant(
  user: User,
  question: string,
  history: AssistantMessage[] = [],
  conversationId: string = randomUUID(),
): Promise<AssistantResult> {
  const started = Date.now();
  const trimmed = question.trim().slice(0, MAX_QUESTION_LENGTH);
  const ctx: ToolContext = { userId: user.id, currency: user.baseCurrency, now: new Date() };

  await logTurn(user.id, conversationId, 'user', trimmed, []);

  // Without an API key the assistant still answers, using a rule-based intent
  // parser over the same tools. Demo mode stays fully usable.
  if (!assistantAvailable()) {
    const fallback = await answerDeterministically(trimmed, ctx);
    await logTurn(user.id, conversationId, 'assistant', fallback.answer, fallback.toolsUsed, null, Date.now() - started);
    return { ...fallback, model: null, mode: 'deterministic', latencyMs: Date.now() - started };
  }

  const client = new Anthropic();
  const toolsUsed: string[] = [];
  const evidence: Array<{ tool: string; result: unknown }> = [];

  const messages: BetaMessageParam[] = [
    ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: trimmed },
  ];

  let answer = '';
  let servedModel: string | null = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      // Adaptive thinking is on by default on this model and its tokens count
      // against max_tokens, so a tight cap truncates the answer rather than
      // the reasoning. Answers here are short; the headroom is for thinking.
      max_tokens: 16_000,
      system: SYSTEM_PROMPT,
      tools: anthropicToolDefinitions() as BetaTool[],
      messages,
      output_config: { effort: 'low' },
      // Route around a safety refusal rather than returning nothing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    servedModel = response.model;

    if (response.stop_reason === 'refusal') {
      answer =
        'I was not able to answer that one. Try rephrasing it, or ask about a specific period or category.';
      break;
    }

    const toolUses = response.content.filter(
      (b): b is BetaToolUseBlock => b.type === 'tool_use',
    );

    if (toolUses.length === 0) {
      answer = textFrom(response.content);
      break;
    }

    messages.push({ role: 'assistant', content: response.content });

    const results: BetaToolResultBlockParam[] = [];
    for (const use of toolUses) {
      // Defence in depth: even if the model names something else, it stops here.
      if (!ALLOWED_TOOL_NAMES.has(use.name)) {
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          is_error: true,
          content: 'This tool is not available. Only read-only financial queries are permitted.',
        });
        continue;
      }
      try {
        const result = await runTool(use.name, use.input, ctx);
        toolsUsed.push(use.name);
        evidence.push({ tool: use.name, result });
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          is_error: true,
          content: err instanceof Error ? redact(err.message) : 'Tool failed.',
        });
      }
    }

    // All tool results go back in a single user message.
    messages.push({ role: 'user', content: results });

    if (round === MAX_TOOL_ROUNDS - 1) {
      answer =
        'That question needed more lookups than I can do in one go. Try narrowing it to a single period or category.';
    }
  }

  if (!answer) answer = 'I could not put an answer together for that. Try rephrasing the question.';

  const latencyMs = Date.now() - started;
  await logTurn(user.id, conversationId, 'assistant', answer, toolsUsed, servedModel, latencyMs);

  return { answer, toolsUsed, evidence, model: servedModel, mode: 'model', latencyMs };
}

/**
 * Records the conversation for the user's own history. Tool *names* are kept;
 * tool *results* are not, so the log never becomes a second copy of the
 * financial data.
 */
async function logTurn(
  userId: string,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  toolsUsed: string[],
  model: string | null = null,
  latencyMs: number | null = null,
): Promise<void> {
  try {
    await withUser(userId, async (db) => {
      await db.query(
        `INSERT INTO ai_queries (id, user_id, conversation_id, role, content, tools_used, model, latency_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(), userId, conversationId, role, redact(content).slice(0, 4000), toolsUsed, model, latencyMs],
      );
    });
  } catch (err) {
    console.error('[assistant] failed to log turn', err);
  }
}

export interface AssistantEvent {
  type: 'thinking' | 'tool' | 'answer' | 'done' | 'error';
  /** For 'answer': the delta of text to append. */
  text?: string;
  /** For 'tool': which read-only query just ran. */
  tool?: string;
  /** For 'done': everything the UI needs to finish the turn. */
  toolsUsed?: string[];
  evidence?: Array<{ tool: string; result: unknown }>;
  followUps?: string[];
}

/**
 * The same loop, streamed.
 *
 * Nothing about the answer changes — the numbers still come from the same
 * read-only queries. What changes is that the person sees the tool run and
 * the sentence appear as it is written, instead of watching a spinner for
 * several seconds. That is most of the perceived speed of an assistant.
 */
export async function* streamAssistant(
  user: User,
  question: string,
  history: AssistantMessage[] = [],
  conversationId: string = randomUUID(),
): AsyncGenerator<AssistantEvent> {
  const started = Date.now();
  const trimmed = question.trim().slice(0, MAX_QUESTION_LENGTH);
  const ctx: ToolContext = { userId: user.id, currency: user.baseCurrency, now: new Date() };

  await logTurn(user.id, conversationId, 'user', trimmed, []);

  if (!assistantAvailable()) {
    const fallback = await answerDeterministically(trimmed, ctx);
    for (const tool of fallback.toolsUsed) yield { type: 'tool', tool };
    yield { type: 'answer', text: fallback.answer };
    await logTurn(user.id, conversationId, 'assistant', fallback.answer, fallback.toolsUsed, null, Date.now() - started);
    yield {
      type: 'done',
      toolsUsed: fallback.toolsUsed,
      evidence: fallback.evidence,
      followUps: suggestFollowUps(trimmed, fallback.toolsUsed),
    };
    return;
  }

  const client = new Anthropic();
  const toolsUsed: string[] = [];
  const evidence: Array<{ tool: string; result: unknown }> = [];
  const messages: BetaMessageParam[] = [
    ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: trimmed },
  ];

  let answer = '';
  let servedModel: string | null = null;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 16_000,
        system: SYSTEM_PROMPT,
        tools: anthropicToolDefinitions() as BetaTool[],
        messages,
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });

      let roundText = '';
      const queue: string[] = [];
      stream.on('text', (delta) => {
        roundText += delta;
        queue.push(delta);
      });

      // Surface deltas as they arrive, then settle the round.
      const finalPromise = stream.finalMessage();
      while (true) {
        const settled = await Promise.race([
          finalPromise.then(() => 'done' as const),
          new Promise<'tick'>((resolve) => setTimeout(() => resolve('tick'), 40)),
        ]);
        while (queue.length > 0) yield { type: 'answer', text: queue.shift()! };
        if (settled === 'done') break;
      }

      const response = await finalPromise;
      servedModel = response.model;

      if (response.stop_reason === 'refusal') {
        answer = roundText ||
          'I was not able to answer that one. Try rephrasing it, or ask about a specific period or category.';
        break;
      }

      const toolUses = response.content.filter(
        (b): b is BetaToolUseBlock => b.type === 'tool_use',
      );
      if (toolUses.length === 0) {
        answer = roundText || textFrom(response.content);
        break;
      }

      messages.push({ role: 'assistant', content: response.content });

      const results: BetaToolResultBlockParam[] = [];
      for (const use of toolUses) {
        if (!ALLOWED_TOOL_NAMES.has(use.name)) {
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            is_error: true,
            content: 'This tool is not available. Only read-only financial queries are permitted.',
          });
          continue;
        }
        yield { type: 'tool', tool: use.name };
        try {
          const result = await runTool(use.name, use.input, ctx);
          toolsUsed.push(use.name);
          evidence.push({ tool: use.name, result });
          results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(result) });
        } catch (err) {
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            is_error: true,
            content: err instanceof Error ? redact(err.message) : 'Tool failed.',
          });
        }
      }
      messages.push({ role: 'user', content: results });

      if (round === MAX_TOOL_ROUNDS - 1) {
        answer =
          'That question needed more lookups than I can do in one go. Try narrowing it to a single period or category.';
        yield { type: 'answer', text: answer };
      }
    }
  } catch (err) {
    console.error('[assistant] stream failed', err);
    yield { type: 'error', text: 'The assistant could not finish that answer.' };
    return;
  }

  if (!answer) answer = 'I could not put an answer together for that. Try rephrasing the question.';
  await logTurn(user.id, conversationId, 'assistant', answer, toolsUsed, servedModel, Date.now() - started);
  yield {
    type: 'done',
    toolsUsed,
    evidence,
    followUps: suggestFollowUps(trimmed, toolsUsed),
  };
}

/**
 * What to offer next.
 *
 * Derived from which tool actually ran rather than from the wording of the
 * question, so a suggestion always leads somewhere the assistant can answer.
 */
export function suggestFollowUps(question: string, toolsUsed: string[]): string[] {
  const used = new Set(toolsUsed);
  const suggestions: string[] = [];

  if (used.has('get_category_spending')) {
    suggestions.push('Compare that to last month', 'Which merchants was that?');
  }
  if (used.has('get_period_summary')) {
    suggestions.push('Where did most of it go?', 'How much can I safely spend?');
  }
  if (used.has('get_subscriptions')) {
    suggestions.push('Which of those went up in price?', 'What renews in the next month?');
  }
  if (used.has('get_business_summary')) {
    suggestions.push('What are my biggest business costs?', 'How does that compare to last month?');
  }
  if (used.has('get_mobilepay_summary')) {
    suggestions.push('Who owes me the most?');
  }
  if (used.has('get_account_flows')) {
    suggestions.push('How much moved between my own accounts?');
  }
  if (used.has('get_cash_flow_forecast')) {
    suggestions.push('What is committed before I spend anything?');
  }
  if (used.has('get_kitchen_summary') || used.has('list_expiring_items')) {
    suggestions.push('What should I cook tonight?', 'Am I throwing much away?');
  }
  if (used.has('get_dinner_suggestions')) {
    suggestions.push('What would I need to buy for that?', 'Something quicker?');
  }
  if (used.has('list_routines')) {
    suggestions.push('How did last week go?');
  }
  if (used.has('list_supplies_running_low')) {
    suggestions.push('What is in the kitchen already?');
  }
  if (used.has('get_sorting_answer')) {
    suggestions.push('Which bins am I missing at home?');
  }

  if (suggestions.length === 0) {
    suggestions.push(
      'What should I cook tonight?',
      'What needs eating before it goes off?',
      'Where did most of my money go this month?',
    );
  }

  return [...new Set(suggestions)].slice(0, 3);
}

export async function loadConversation(
  userId: string,
  conversationId: string,
  limit = 40,
): Promise<AssistantMessage[]> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<{ role: 'user' | 'assistant'; content: string }>(
      `SELECT role, content FROM ai_queries
        WHERE user_id = $1 AND conversation_id = $2
        ORDER BY created_at LIMIT $3`,
      [userId, conversationId, limit],
    );
    return rows;
  });
}
