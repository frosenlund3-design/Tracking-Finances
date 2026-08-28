import '@/lib/server-guard';
import { runTool, resolvePeriod, type ToolContext } from './tools';
import { ALL_CATEGORIES } from '@/lib/categories';

/**
 * Rule-based intent parsing, used when no ANTHROPIC_API_KEY is configured.
 *
 * It routes a question to the same read-only tools the model would use, then
 * renders the result with a template. Coverage is narrower than the model's,
 * but the numbers are identical — they come from the same SQL — and demo mode
 * stays genuinely usable with no credentials at all.
 */

type Period = Parameters<typeof resolvePeriod>[0];

/**
 * A period label as it reads inside a sentence.
 *
 * "Last 30 days" wants lowercasing after "in"; "July 2026" and "2026" do not —
 * a month is a proper noun and "in july 2026" reads like a typo.
 */
export function periodPhrase(label: string): string {
  return /^[A-Z][a-z]+ \d{4}$/.test(label) || /^\d{4}$/.test(label)
    ? label
    : label.toLowerCase();
}

function detectPeriod(q: string): Period {
  if (/\blast month\b|\bsidste m[åa]ned\b|\bprevious month\b/.test(q)) return 'last_month';
  if (/\blast week\b/.test(q)) return 'last_week';
  if (/\bthis week\b|\bdenne uge\b/.test(q)) return 'this_week';
  if (/\blast 7 days\b|\bpast week\b/.test(q)) return 'last_7_days';
  if (/\blast 30 days\b|\bpast month\b/.test(q)) return 'last_30_days';
  if (/\blast 90 days\b|\blast quarter\b|\bpast 3 months\b/.test(q)) return 'last_90_days';
  if (/\blast year\b/.test(q)) return 'last_year';
  if (/\bthis year\b|\byear to date\b|\bytd\b/.test(q)) return 'this_year';
  return 'this_month';
}

function detectOwnership(q: string): 'personal' | 'business' | 'all' {
  if (/\bbusiness\b|\bcompany\b|\bfirma\b|\berhverv\b/.test(q)) return 'business';
  if (/\bpersonal\b|\bprivate\b|\bprivat\b/.test(q)) return 'personal';
  return 'all';
}

const CATEGORY_HINTS: Array<{ re: RegExp; key: string }> = [
  { re: /\beating out\b|\brestaurant|\bdining\b|\btakeaway\b|\bcaf[eé]\b/, key: 'restaurants' },
  { re: /\bgrocer|\bsupermarket|\bfood shop/, key: 'groceries' },
  { re: /\bsoftware\b|\bsaas\b|\bsubscriptions? tools?\b/, key: 'business_software' },
  { re: /\badvertis|\bads\b|\bmarketing\b/, key: 'business_advertising' },
  { re: /\btransport|\btravel card|\btrain\b|\bfuel\b|\bpetrol\b/, key: 'transport' },
  { re: /\brent\b|\bhusleje\b/, key: 'rent' },
  { re: /\butilit|\belectric|\bheating\b/, key: 'utilities' },
  { re: /\bshopping\b|\bclothes\b/, key: 'shopping' },
  { re: /\bentertainment\b|\bstreaming\b/, key: 'entertainment' },
  { re: /\bhealth\b|\bpharmac|\bgym\b/, key: 'health' },
  { re: /\btravel\b|\bholiday\b|\bflight/, key: 'travel' },
  { re: /\bcontractor|\bfreelanc/, key: 'business_contractors' },
  { re: /\bpayroll\b|\bsalar(y|ies) paid\b/, key: 'business_payroll' },
  { re: /\btax(es)?\b/, key: 'business_taxes' },
];

function detectCategory(q: string): string | undefined {
  for (const hint of CATEGORY_HINTS) if (hint.re.test(q)) return hint.key;
  const direct = ALL_CATEGORIES.find((c) => q.includes(c.label.toLowerCase()));
  return direct?.key;
}

/** Pulls a quoted or capitalised merchant name out of the question. */
function detectMerchant(q: string, original: string): string | undefined {
  const quoted = original.match(/["'“]([^"'”]{2,40})["'”]/);
  if (quoted?.[1]) return quoted[1];
  const on = original.match(/\b(?:on|at|to|from|for)\s+([A-Z][\w.&-]*(?:\s+[A-Z][\w.&-]*)?)/);
  if (on?.[1] && !/^(This|Last|The|My|I)$/i.test(on[1])) return on[1];
  if (/\bopenai\b/.test(q)) return 'OpenAI';
  return undefined;
}

interface FallbackAnswer {
  answer: string;
  toolsUsed: string[];
  evidence: Array<{ tool: string; result: unknown }>;
}

type MoneyValue = { formatted: string; minor: number };
const isMoney = (v: unknown): v is MoneyValue =>
  typeof v === 'object' && v !== null && 'formatted' in v;

export async function answerDeterministically(
  question: string,
  ctx: ToolContext,
): Promise<FallbackAnswer> {
  const q = question.toLowerCase();
  const period = detectPeriod(q);
  const ownership = detectOwnership(q);
  const category = detectCategory(q);
  const merchant = detectMerchant(q, question);

  const call = async (tool: string, input: Record<string, unknown>) => {
    const result = await runTool(tool, input, ctx);
    return { tool, result };
  };

  // MobilePay
  if (/\bmobile\s?pay\b/.test(q)) {
    const { tool, result } = await call('get_mobilepay_summary', { period });
    const r = result as {
      available: boolean; transactionCount: number; sent: MoneyValue; received: MoneyValue;
      net: MoneyValue; people: Array<{ name: string; net: MoneyValue; transactionCount: number }>;
    };
    if (!r.available) {
      return {
        answer:
          'No MobilePay payments in that period. MobilePay has no consumer API, so these are read out of your bank feed — connect a bank and they appear automatically.',
        toolsUsed: [tool],
        evidence: [{ tool, result }],
      };
    }
    const top = r.people.slice(0, 5)
      .map((p) => `• ${p.name} — ${p.net.formatted} net across ${p.transactionCount}`)
      .join('\n');
    return {
      answer: `${r.transactionCount} MobilePay payments: ${r.sent.formatted} sent, ${r.received.formatted} received, ${r.net.formatted} net.\n\n${top}`,
      toolsUsed: [tool],
      evidence: [{ tool, result }],
    };
  }

  // Payment rails
  if (/\b(card|kort|direct debit|betalingsservice|cash|kontant)\b/.test(q) && /\bspend|\bhow much|\bpay\b/.test(q)) {
    const { tool, result } = await call('get_payment_channels', { period, ownership });
    const r = result as {
      period: string;
      channels: Array<{ label: string; out: MoneyValue; shareOfSpendingPct: number; transactionCount: number }>;
    };
    const list = r.channels
      .filter((c) => c.out.minor > 0)
      .map((c) => `• ${c.label} — ${c.out.formatted} (${c.shareOfSpendingPct}%, ${c.transactionCount})`)
      .join('\n');
    return {
      answer: list
        ? `How money left your accounts in ${periodPhrase(r.period)}:\n\n${list}`
        : `No spending recorded in ${periodPhrase(r.period)}.`,
      toolsUsed: [tool],
      evidence: [{ tool, result }],
    };
  }

  // Per-account
  if (/\baccounts?\b|\bkonto\b|\bkonti\b|\bbalance/.test(q)) {
    const { tool, result } = await call('get_account_flows', { period, ownership });
    const r = result as {
      period: string;
      accounts: Array<{
        name: string; balance: MoneyValue | null; inFromOutside: MoneyValue;
        outToOutside: MoneyValue; active: boolean;
      }>;
    };
    const list = r.accounts
      .filter((a) => a.active)
      .map(
        (a) =>
          `• ${a.name} — ${a.balance ? a.balance.formatted : 'no balance'} · ${a.inFromOutside.formatted} in, ${a.outToOutside.formatted} out`,
      )
      .join('\n');
    return {
      answer: list
        ? `Your accounts in ${periodPhrase(r.period)}:\n\n${list}\n\nMoney moved between your own accounts is excluded from the in and out figures.`
        : 'No accounts connected yet.',
      toolsUsed: [tool],
      evidence: [{ tool, result }],
    };
  }

  // Subscriptions
  if (/\bsubscription|\brecurring\b|\babonnement/.test(q)) {
    const { tool, result } = await call('get_subscriptions', { ownership, includeLapsed: false });
    const r = result as {
      count: number; totalMonthly: MoneyValue; totalAnnual: MoneyValue;
      subscriptions: Array<{ merchant: string; monthlyEquivalent: MoneyValue; interval: string }>;
    };
    const top = r.subscriptions.slice(0, 5)
      .map((s) => `• ${s.merchant} — ${s.monthlyEquivalent.formatted}/month (${s.interval})`)
      .join('\n');
    return {
      answer: r.count === 0
        ? 'No recurring payments detected yet. They appear once a merchant has charged you at least three times on a regular cadence.'
        : `You have ${r.count} active subscription${r.count === 1 ? '' : 's'}, costing ${r.totalMonthly.formatted} a month (${r.totalAnnual.formatted} a year).\n\n${top}`,
      toolsUsed: [tool],
      evidence: [{ tool, result }],
    };
  }

  // Safe to spend / forecast
  if (/\bsafely spend\b|\bsafe to spend\b|\bafford\b|\bforecast\b|\bwill i have\b/.test(q)) {
    const { tool, result } = await call('get_cash_flow_forecast', {});
    const r = result as {
      safeToSpendThisMonth: MoneyValue; currentBalance: MoneyValue;
      projections: Array<{ horizonDays: number; estimatedBalance: MoneyValue }>;
    };
    const p30 = r.projections.find((p) => p.horizonDays === 30);
    return {
      answer: `Based on your balance of ${r.currentBalance.formatted}, your recurring income and your known commitments, roughly ${r.safeToSpendThisMonth.formatted} is available to spend this month.${
        p30 ? ` In 30 days the estimated balance is ${p30.estimatedBalance.formatted}.` : ''
      } These are estimates from observed patterns, not guarantees.`,
      toolsUsed: [tool],
      evidence: [{ tool, result }],
    };
  }

  // Business
  if (/\bprofit\b|\brevenue\b|\bbusiness\b.*\b(made|earn)|\bomsætning\b/.test(q) || (ownership === 'business' && /\bmade\b|\bearn/.test(q))) {
    const { tool, result } = await call('get_business_summary', { period });
    const r = result as {
      period: string; revenue: MoneyValue; totalExpenses: MoneyValue;
      grossProfit: MoneyValue; processorRevenue: MoneyValue;
    };
    return {
      answer: `In ${periodPhrase(r.period)}, business revenue was ${r.revenue.formatted} against ${r.totalExpenses.formatted} of recorded business costs — a gross profit of ${r.grossProfit.formatted}. Of that, ${r.processorRevenue.formatted} came through a payment processor. This is not a tax calculation; no tax rules are applied.`,
      toolsUsed: [tool],
      evidence: [{ tool, result }],
    };
  }

  // Comparison
  if (/\bcompare\b|\bversus\b|\bvs\b|\bmore than last\b/.test(q)) {
    const { tool, result } = await call('compare_periods', { ownership });
    const r = result as {
      thisMonth: { expenses: MoneyValue; income: MoneyValue };
      lastMonth: { expenses: MoneyValue; income: MoneyValue };
      expenseChangePct: number | null;
    };
    const change = r.expenseChangePct;
    return {
      answer: `This month you have spent ${r.thisMonth.expenses.formatted}, against ${r.lastMonth.expenses.formatted} for all of last month${
        change === null ? '' : ` — ${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}%`
      }. Income is ${r.thisMonth.income.formatted} this month against ${r.lastMonth.income.formatted} last month. The current month is still incomplete.`,
      toolsUsed: [tool],
      evidence: [{ tool, result }],
    };
  }

  // Biggest expense
  if (/\bbiggest\b|\blargest\b|\bmost expensive\b/.test(q)) {
    const { tool, result } = await call('get_largest_expenses', { period, ownership, limit: 5 });
    const r = result as {
      period: string;
      expenses: Array<{ merchant: string; amount: MoneyValue; date: string; category: string }>;
    };
    if (r.expenses.length === 0) {
      return { answer: `No expenses recorded in ${periodPhrase(r.period)}.`, toolsUsed: [tool], evidence: [{ tool, result }] };
    }
    const list = r.expenses.map((e) => `• ${e.merchant} — ${e.amount.formatted} (${e.category}, ${e.date})`).join('\n');
    return {
      answer: `Your largest expenses in ${periodPhrase(r.period)}:\n\n${list}`,
      toolsUsed: [tool],
      evidence: [{ tool, result }],
    };
  }

  // Where did the money go
  if (/\bwhere\b.*\b(money|go|went)\b|\bbreakdown\b|\bwhat did i spend on\b/.test(q)) {
    const { tool, result } = await call('get_category_spending', { period, ownership, limit: 8 });
    const r = result as {
      period: string;
      categories: Array<{ label: string; amount: MoneyValue; sharePct: number; transactionCount: number }>;
    };
    if (r.categories.length === 0) {
      return { answer: `No spending recorded in ${periodPhrase(r.period)}.`, toolsUsed: [tool], evidence: [{ tool, result }] };
    }
    const list = r.categories.map((c) => `• ${c.label} — ${c.amount.formatted} (${c.sharePct}%, ${c.transactionCount} transactions)`).join('\n');
    return {
      answer: `Where your money went in ${periodPhrase(r.period)}:\n\n${list}`,
      toolsUsed: [tool],
      evidence: [{ tool, result }],
    };
  }

  // Named merchant
  if (merchant) {
    const { tool, result } = await call('list_transactions', {
      period, ownership, search: merchant, limit: 20,
    });
    const r = result as {
      period: string; matchCount: number;
      transactions: Array<{ merchant: string; amount: MoneyValue; date: string }>;
    };
    const total = r.transactions.reduce((s, t) => s + Math.abs(t.amount.minor), 0);
    if (r.matchCount === 0) {
      return {
        answer: `No transactions matching "${merchant}" in ${periodPhrase(r.period)}.`,
        toolsUsed: [tool],
        evidence: [{ tool, result }],
      };
    }
    const { result: totals } = await call('get_period_summary', { period, ownership });
    const currency = (totals as { income: MoneyValue }).income.formatted.replace(/[\d.,\s-]/g, '');
    return {
      answer: `${r.matchCount} transaction${r.matchCount === 1 ? '' : 's'} matching "${merchant}" in ${periodPhrase(r.period)}, totalling about ${(total / 100).toLocaleString('da-DK')} ${currency || 'DKK'} across the ones shown.`,
      toolsUsed: [tool],
      evidence: [{ tool, result }],
    };
  }

  // Category-specific spend
  if (category && /\bspend|\bspent|\bcost|\bhow much\b/.test(q)) {
    const { tool, result } = await call('get_category_spending', {
      period, ownership, category, limit: 1,
    });
    const r = result as {
      period: string;
      categories: Array<{ label: string; amount: MoneyValue; transactionCount: number }>;
    };
    const row = r.categories[0];
    return {
      answer: row
        ? `You spent ${row.amount.formatted} on ${row.label.toLowerCase()} in ${periodPhrase(r.period)}, across ${row.transactionCount} transaction${row.transactionCount === 1 ? '' : 's'}.`
        : `Nothing recorded in that category for ${periodPhrase(r.period)}.`,
      toolsUsed: [tool],
      evidence: [{ tool, result }],
    };
  }

  // Default: period summary.
  const { tool, result } = await call('get_period_summary', { period, ownership });
  const r = result as {
    period: string; income: MoneyValue; expenses: MoneyValue; net: MoneyValue; transactionCount: number;
  };
  const scope = ownership === 'all' ? '' : ` (${ownership})`;
  return {
    answer:
      r.transactionCount === 0
        ? `No transactions recorded for ${periodPhrase(r.period)}${scope}.`
        : `In ${periodPhrase(r.period)}${scope}: ${r.income.formatted} in, ${r.expenses.formatted} out, leaving ${r.net.formatted} across ${r.transactionCount} transactions.\n\nWithout an Anthropic API key I answer from a fixed set of question patterns. Add ANTHROPIC_API_KEY to ask anything in your own words.`,
    toolsUsed: [tool],
    evidence: [{ tool, result }],
  };
}

export { isMoney };
