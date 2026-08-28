import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTemporaryDatabase, createTestUser, createTestAccount } from './helpers/db';

useTemporaryDatabase();

let userId: string;
let ctx: { userId: string; currency: string; now: Date };

beforeAll(async () => {
  const { ensureMigrated } = await import('@/database/migrate');
  await ensureMigrated();
  userId = await createTestUser();
  const { map } = await createTestAccount(userId);
  const { ingestTransactions } = await import('@/services/transactions');
  await ingestTransactions(
    userId,
    map,
    [
      { transactionId: 'a1', providerAccountId: 'acct-1', amountMinor: -28_430, currency: 'DKK', transactionDate: '2026-06-05', bookingDate: null, merchant: 'Wolt', description: 'WOLT' },
      { transactionId: 'a2', providerAccountId: 'acct-1', amountMinor: -14_500, currency: 'DKK', transactionDate: '2026-06-06', bookingDate: null, merchant: 'GitHub', description: 'GITHUB INC' },
      { transactionId: 'a3', providerAccountId: 'acct-1', amountMinor: 3_840_000, currency: 'DKK', transactionDate: '2026-06-28', bookingDate: null, merchant: 'Employer', description: 'Loenoverfoersel' },
    ],
    'demo',
  );
  ctx = { userId, currency: 'DKK', now: new Date('2026-06-30T12:00:00Z') };
});

afterAll(async () => {
  const { closeDatabase } = await import('@/database');
  await closeDatabase();
});

describe('assistant tool surface', () => {
  it('exposes only read operations, by name', async () => {
    const { TOOLS } = await import('@/ai/tools');
    for (const tool of TOOLS) {
      expect(tool.name, `tool "${tool.name}" is not named as a read`).toMatch(
        /^(get|list|compare)_/,
      );
    }
  });

  it('never imports a module that can write', async () => {
    // The strongest guarantee is structural: if the AI layer cannot reach a
    // mutating function, no prompt can make it call one.
    const fs = await import('node:fs/promises');
    const source = await fs.readFile('ai/tools.ts', 'utf8');
    for (const forbidden of [
      'ingestTransactions',
      'updateTransaction',
      'createManualTransaction',
      'deleteTransaction',
      'deleteFinancialData',
      'storeToken',
      'useToken',
      'syncBankConnection',
      'syncStripe',
      'withSystem',
    ]) {
      expect(source, `ai/tools.ts references ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('refuses any tool name outside the allowlist', async () => {
    const { runTool, ToolRejectedError, ALLOWED_TOOL_NAMES } = await import('@/ai/tools');
    for (const name of ['send_money', 'create_payment', 'issue_refund', 'execute_sql', '__proto__', 'get_period_summary_evil']) {
      expect(ALLOWED_TOOL_NAMES.has(name)).toBe(false);
      await expect(runTool(name, {}, ctx)).rejects.toBeInstanceOf(ToolRejectedError);
    }
  });

  it('validates arguments instead of passing them through to SQL', async () => {
    const { runTool } = await import('@/ai/tools');
    const result = (await runTool(
      'get_period_summary',
      { period: "'; DROP TABLE transactions; --", ownership: 'all' },
      ctx,
    )) as { error?: string };
    expect(result.error).toBe('invalid_arguments');

    // The table is still there.
    const { periodTotals } = await import('@/services/analytics');
    expect((await periodTotals(userId, {})).transactionCount).toBe(3);
  });

  it('clamps a limit the model asks for beyond the allowed range', async () => {
    const { runTool } = await import('@/ai/tools');
    const result = (await runTool('list_transactions', { limit: 100_000 }, ctx)) as { error?: string };
    expect(result.error).toBe('invalid_arguments');
  });

  it('returns figures the backend computed, with a formatted string', async () => {
    const { runTool } = await import('@/ai/tools');
    const result = (await runTool(
      'get_category_spending',
      { period: 'this_month', category: 'restaurants' },
      ctx,
    )) as { categories: Array<{ label: string; amount: { minor: number; formatted: string } }> };

    expect(result.categories[0]!.amount.minor).toBe(28_430);
    expect(result.categories[0]!.amount.formatted).toContain('284');
  });

  it('agrees with the analytics layer, because it is the analytics layer', async () => {
    const { runTool } = await import('@/ai/tools');
    const { periodTotals } = await import('@/services/analytics');
    const viaTool = (await runTool('get_period_summary', { period: 'this_month' }, ctx)) as {
      income: { minor: number };
      expenses: { minor: number };
    };
    const direct = await periodTotals(userId, { from: '2026-06-01', to: '2026-06-30' });
    expect(viaTool.income.minor).toBe(direct.incomeMinor);
    expect(viaTool.expenses.minor).toBe(direct.expenseMinor);
  });

  it('scopes every tool to the calling user', async () => {
    const { runTool } = await import('@/ai/tools');
    const stranger = await createTestUser();
    const result = (await runTool(
      'get_period_summary',
      { period: 'this_month' },
      { userId: stranger, currency: 'DKK', now: ctx.now },
    )) as { transactionCount: number };
    expect(result.transactionCount).toBe(0);
  });

  it('labels forecasts as estimates', async () => {
    const { runTool } = await import('@/ai/tools');
    const result = (await runTool('get_cash_flow_forecast', {}, ctx)) as { disclaimer: string };
    expect(result.disclaimer.toLowerCase()).toContain('estimate');
  });

  it('states that business figures carry no tax calculation', async () => {
    const { runTool } = await import('@/ai/tools');
    const result = (await runTool('get_business_summary', { period: 'this_month' }, ctx)) as {
      note: string;
    };
    expect(result.note.toLowerCase()).toContain('no tax calculation');
  });

  it('produces a valid JSON schema for every tool', async () => {
    const { anthropicToolDefinitions, TOOLS } = await import('@/ai/tools');
    const definitions = anthropicToolDefinitions();
    expect(definitions).toHaveLength(TOOLS.length);
    for (const definition of definitions) {
      expect(definition.input_schema).toHaveProperty('type', 'object');
      expect(definition.description.length).toBeGreaterThan(20);
    }
  });
});

describe('deterministic fallback answers', () => {
  it('answers a category question with the computed total', async () => {
    const { answerDeterministically } = await import('@/ai/fallback');
    const result = await answerDeterministically('How much did I spend eating out this month?', ctx);
    expect(result.answer).toContain('284');
    expect(result.toolsUsed).toContain('get_category_spending');
    expect(result.evidence).toHaveLength(1);
  });

  it('routes a subscription question to the subscription tool', async () => {
    const { answerDeterministically } = await import('@/ai/fallback');
    const result = await answerDeterministically('What subscriptions am I paying for?', ctx);
    expect(result.toolsUsed).toContain('get_subscriptions');
  });

  it('says plainly when there is nothing to report', async () => {
    const { answerDeterministically } = await import('@/ai/fallback');
    const stranger = await createTestUser();
    const result = await answerDeterministically('Where did my money go?', {
      userId: stranger,
      currency: 'DKK',
      now: ctx.now,
    });
    expect(result.answer.toLowerCase()).toContain('no ');
  });
});

describe('period wording in fallback answers', () => {
  it('keeps month names capitalised and lowercases the rest', async () => {
    const { periodPhrase } = await import('@/ai/fallback');
    expect(periodPhrase('July 2026')).toBe('July 2026');
    expect(periodPhrase('2026')).toBe('2026');
    expect(periodPhrase('Last 30 days')).toBe('last 30 days');
    expect(periodPhrase('This week')).toBe('this week');
  });
});

describe('the life tools', () => {
  it('every tool is read-only by name, including the new ones', async () => {
    const { TOOLS } = await import('@/ai/tools');
    // Checked segment by segment rather than as a substring, or
    // "get_payment_channels" fails on the "pay" inside "payment".
    const WRITE_VERBS = new Set([
      'add', 'set', 'create', 'update', 'delete', 'remove', 'settle',
      'plan', 'tick', 'send', 'pay', 'move', 'buy', 'write', 'run',
    ]);
    for (const tool of TOOLS) {
      expect(tool.name, tool.name).toMatch(/^(get_|list_|compare_)/);
      for (const segment of tool.name.split('_')) {
        expect(WRITE_VERBS.has(segment), `${tool.name} contains "${segment}"`).toBe(false);
      }
    }
  });

  it('reads the kitchen without being able to change it', async () => {
    const { runTool, ALLOWED_TOOL_NAMES } = await import('@/ai/tools');
    const { addPantryItem } = await import('@/services/pantry');
    await addPantryItem(userId, { name: 'Laksefilet', expiresOn: '2026-06-16' }, '2026-06-15');

    const summary = (await runTool('get_kitchen_summary', {}, ctx)) as { totalItems: number };
    expect(summary.totalItems).toBe(1);

    const expiring = (await runTool('list_expiring_items', {}, ctx)) as {
      items: Array<{ name: string }>;
    };
    expect(expiring.items.map((i) => i.name)).toContain('Laksefilet');

    // And there is no way to act on any of it.
    for (const name of ['settle_pantry_item', 'add_pantry_item', 'plan_meal', 'tick_routine']) {
      expect(ALLOWED_TOOL_NAMES.has(name), name).toBe(false);
      await expect(runTool(name, {}, ctx)).rejects.toThrow();
    }
  });

  it('answers a sorting question from the data, not from memory', async () => {
    const { runTool } = await import('@/ai/tools');
    const result = (await runTool('get_sorting_answer', { item: 'kvittering' }, ctx)) as {
      matches: Array<{ fraction: string; why: string }>;
    };
    expect(result.matches[0]!.fraction).toBe('Restaffald');
    expect(result.matches[0]!.why).toMatch(/thermal/i);
  });

  it('says it does not know rather than guessing a bin', async () => {
    const { runTool } = await import('@/ai/tools');
    const result = (await runTool('get_sorting_answer', { item: 'zxqv' }, ctx)) as {
      matches: unknown[];
      fallback: string | null;
    };
    expect(result.matches).toEqual([]);
    expect(result.fallback).toMatch(/Restaffald/);
  });

  it('reports progress without inventing a streak', async () => {
    const { runTool } = await import('@/ai/tools');
    const result = (await runTool('get_progress_summary', {}, ctx)) as Record<string, unknown>;
    expect(result).toHaveProperty('momentum');
    expect(result).toHaveProperty('momentumFloor');
    expect(Object.keys(result).join(' ')).not.toMatch(/streak/i);
  });
});
