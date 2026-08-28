import Link from 'next/link';
import { Card, EmptyState, Button } from '@/components/ui/primitives';

export default function TransactionNotFound() {
  return (
    <div className="rise">
      <Link href="/transactions" className="text-[13px] text-ink-muted hover:text-ink">
        ← Every krone
      </Link>
      <Card className="mt-4">
        <EmptyState
          title="Transaction not found"
          description="It may have been deleted, or it belongs to a different account. Nothing here is shared between accounts."
          action={
            <Link href="/transactions">
              <Button size="sm">Back to all transactions</Button>
            </Link>
          }
        />
      </Card>
    </div>
  );
}
