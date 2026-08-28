import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listAccounts } from '@/services/accounts';
import { Card, CardBody, EmptyState, Button } from '@/components/ui/primitives';
import { ManualTransactionForm } from './form';

export const metadata: Metadata = { title: 'Add a transaction' };
export const dynamic = 'force-dynamic';

export default async function NewTransactionPage() {
  const user = await requireUser();
  const accounts = await listAccounts(user.id);

  return (
    <div className="rise space-y-4">
      <Link
        href="/transactions"
        className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink"
      >
        <span aria-hidden="true">←</span> Every krone
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add a transaction</h1>
        <p className="mt-1 text-[13px] text-ink-muted">
          For cash, an invoice, a debt, or anything a connected account will not see.
        </p>
      </div>

      <Card>
        {accounts.length === 0 ? (
          <EmptyState
            title="No account to add it to"
            description="Load demo data or connect an account first — a transaction has to belong somewhere."
            action={
              <Link href="/integrations">
                <Button size="sm">Go to integrations</Button>
              </Link>
            }
          />
        ) : (
          <CardBody className="pt-5">
            <ManualTransactionForm accounts={accounts} currency={user.baseCurrency} />
          </CardBody>
        )}
      </Card>
    </div>
  );
}
