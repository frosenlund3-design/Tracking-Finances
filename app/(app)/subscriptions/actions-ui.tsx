'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/primitives';
import { setSubscriptionStatusAction } from './actions';
import type { Subscription } from '@/types/finance';

export function SubscriptionActions({
  id,
  status,
}: {
  id: string;
  status: Subscription['status'];
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function set(next: Subscription['status']) {
    const formData = new FormData();
    formData.set('id', id);
    formData.set('status', next);
    startTransition(async () => {
      await setSubscriptionStatusAction(formData);
      setConfirming(false);
    });
  }

  if (status === 'cancelled') {
    return (
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => set('active')}>
        Mark active again
      </Button>
    );
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
        <span>Mark as cancelled?</span>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          No
        </Button>
        <Button size="sm" disabled={pending} onClick={() => set('cancelled')}>
          Yes
        </Button>
      </span>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setConfirming(true)}
      title="Marks it cancelled in Kroner only — it does not cancel anything with the merchant."
    >
      I’ve cancelled this
    </Button>
  );
}
