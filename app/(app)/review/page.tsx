import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { reviewQueue } from '@/services/review';
import { Button, Card, EmptyState } from '@/components/ui/primitives';
import { ReviewDeck } from './deck';

export const metadata: Metadata = { title: 'Review' };
export const dynamic = 'force-dynamic';

export default async function ReviewPage() {
  const user = await requireUser();
  const queue = await reviewQueue(user.id, 25);

  if (queue.items.length === 0) {
    return (
      <div className="rise space-y-4">
        <h1 className="text-[28px] font-semibold tracking-tight">Review</h1>
        <Card>
          <EmptyState
            title="Nothing needs a decision"
            description="Every transaction has a category Kroner is confident about. Anything it is unsure of will show up here."
            action={
              <Link href="/transactions">
                <Button size="sm" variant="secondary">
                  Back to activity
                </Button>
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <ReviewDeck
      items={queue.items}
      remaining={queue.remaining}
      unreviewedMinor={queue.unreviewedMinor}
      currency={user.baseCurrency}
    />
  );
}
