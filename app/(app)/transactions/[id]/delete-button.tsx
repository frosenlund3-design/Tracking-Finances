'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/primitives';
import { deleteTransactionAction } from '../actions';

/**
 * Two-step, because deletion is not reversible. Only manually added rows can
 * be deleted at all — provider data would simply reappear on the next sync.
 */
export function DeleteManualTransaction({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    const formData = new FormData();
    formData.set('id', id);
    startTransition(async () => {
      const result = await deleteTransactionAction(formData);
      if (result?.error) setError(result.error);
    });
  }

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" className="text-negative" onClick={() => setConfirming(true)}>
        Delete this manual transaction
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-ink-muted">Delete permanently?</span>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      <Button variant="danger" size="sm" disabled={pending} onClick={remove}>
        {pending ? 'Deleting…' : 'Delete'}
      </Button>
      {error ? <span className="text-[13px] text-negative">{error}</span> : null}
    </div>
  );
}
