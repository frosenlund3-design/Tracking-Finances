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

const SYSTEM_PROMPT = `You are the finance assistant inside Kroner, a personal and business money tracker.

HOW YOU WORK
- Every figure you state must come from a tool result in this conversation. Never estimate, never infer a total from a list of transactions, never carry a number over from your own general knowledge.
- If a tool returns no data, say so plainly. "I don't have any transactions in that period" is a good answer. Inventing a plausible number is not.
- Prefer one well-chosen tool call. Call several only when the question genuinely needs them.
- Amounts arrive with a "formatted" field already in the user's currency. Use it verbatim rather than reformatting.

WHAT YOU CANNOT DO
- You have read access only. You cannot move money, make payments, issue refunds, change payout settings, connect or disconnect accounts, or alter any data. If asked, say plainly that you are read-only and point to the relevant screen in the app.
- You are not an accountant. You may describe what was spent and how a transaction is currently marked for bookkeeping, but do not give definitive Danish tax advice. When tax comes up, note that deductibility should be confirmed with an accountant.

HOW YOU WRITE
- Lead with the answer. One or two sentences, then detail only if it helps.
- Include the count of transactions behind a total when you have it — it makes the number checkable.
- Neutral and factual. No alarm, no judgement about spending choices, no motivational framing.
- Say "estimate" when the figure is a projection, because projections carry a disclaimer for a reason.`;

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
      max_tokens: 4096,
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
