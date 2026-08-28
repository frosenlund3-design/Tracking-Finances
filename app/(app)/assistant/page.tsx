import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { assistantAvailable } from '@/ai/assistant';
import { periodTotals } from '@/services/analytics';
import { monthRange } from '@/lib/dates';
import { AssistantChat } from './chat';

export const metadata: Metadata = { title: 'Assistant' };
export const dynamic = 'force-dynamic';

export default async function AssistantPage() {
  const user = await requireUser();
  const month = monthRange(0);
  const totals = await periodTotals(user.id, { from: month.start, to: month.end }, user.baseCurrency);

  return (
    <AssistantChat
      available={assistantAvailable()}
      hasData={totals.transactionCount > 0}
      demoMode={user.demoMode}
      name={user.displayName}
    />
  );
}
