import type { Finding } from '@/services/anomalies';
import type { FinancialInsight } from '@/types/finance';

/**
 * One list instead of two.
 *
 * Findings and insights are produced by different code for different reasons,
 * but on screen they were fifteen identical cards in two adjacent sections,
 * and a list of fifteen identical cards gets read as zero. This merges them,
 * ranks them by how much money each is about, and — the part that matters —
 * separates the two kinds that were being conflated:
 *
 *   signals  something changed, or something is worth a second look
 *   status   a standing figure: what the subscriptions cost, what the month
 *            is on track to be
 *
 * A standing figure is not a thing to look at. It belongs in a compact
 * summary, not in a card that looks like a duplicate-charge alert.
 */

export type ObservationTone = 'notable' | 'info';

export interface Observation {
  id: string;
  title: string;
  body: string;
  /** Where tapping it goes, when there is anywhere useful to go. */
  href: string | null;
  tone: ObservationTone;
  /** How much money the observation is about, in minor units. Ranks the list. */
  weightMinor: number;
}

export interface Observations {
  signals: Observation[];
  status: Observation[];
}

/** Insight kinds that state a standing figure rather than report a change. */
const STATUS_KINDS = new Set([
  'subscription_total',
  'run_rate',
  'month_net',
  'largest_expense',
]);

/**
 * The money an insight is about.
 *
 * Insights carry the numbers behind their sentence in `facts`, so the ranking
 * reads them rather than parsing the sentence. Where an insight is about a
 * change, the size of the change is what matters, not the level.
 */
function insightWeight(insight: FinancialInsight): number {
  const facts = insight.facts;
  const num = (key: string): number => {
    const value = facts[key];
    return typeof value === 'number' ? Math.abs(value) : 0;
  };

  const current = num('currentMinor');
  const previous = num('previousMinor');
  if (current > 0 && previous > 0) return Math.abs(current - previous);

  return (
    num('annualMinor') ||
    num('monthlyMinor') ||
    num('amountMinor') ||
    num('projectedMonthMinor') ||
    Math.abs(num('netMinor')) ||
    0
  );
}

function fromInsight(insight: FinancialInsight): Observation {
  return {
    id: `insight:${insight.id}`,
    title: insight.title,
    body: insight.body,
    href: hrefForInsight(insight.kind),
    tone: insight.severity === 'notable' ? 'notable' : 'info',
    weightMinor: insightWeight(insight),
  };
}

function hrefForInsight(kind: string): string | null {
  if (kind.startsWith('category_change:')) {
    return `/transactions?category=${encodeURIComponent(kind.slice('category_change:'.length))}`;
  }
  if (kind.startsWith('subscription')) return '/subscriptions';
  if (kind === 'largest_expense') return '/transactions?sort=largest';
  if (kind === 'business_revenue_change') return '/business';
  return null;
}

function fromFinding(finding: Finding): Observation {
  return {
    id: `finding:${finding.kind}:${finding.title}`,
    title: finding.title,
    body: finding.body,
    href: finding.href,
    // Findings are already filtered down to things worth saying, but calling
    // every one of them "notable" would make the badge meaningless.
    tone: finding.kind === 'possible_double_charge' ? 'notable' : 'info',
    weightMinor: finding.weightMinor,
  };
}

/** Merges the two sources into one ranked list, with status split out. */
export function mergeObservations(
  findings: Finding[],
  insights: FinancialInsight[],
): Observations {
  const signals: Observation[] = findings.map(fromFinding);
  const status: Observation[] = [];

  for (const insight of insights) {
    (STATUS_KINDS.has(insight.kind) ? status : signals).push(fromInsight(insight));
  }

  // Notable first, then by money at stake. Two observations about the same
  // amount keep a stable order so the list does not shuffle between loads.
  signals.sort((a, b) => {
    if (a.tone !== b.tone) return a.tone === 'notable' ? -1 : 1;
    if (b.weightMinor !== a.weightMinor) return b.weightMinor - a.weightMinor;
    return a.id.localeCompare(b.id);
  });
  status.sort((a, b) => b.weightMinor - a.weightMinor || a.id.localeCompare(b.id));

  return { signals, status };
}
