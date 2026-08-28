'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/primitives';

/**
 * Page-level failure. It deliberately shows no technical detail: the digest is
 * enough to find the real error in the server log, and a stack trace on a
 * finance screen tells an attacker more than it tells the user.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ui] render failed', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-sm flex-col justify-center px-5 text-center">
      <h1 className="text-lg font-semibold tracking-tight">This screen did not load</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
        Your data is untouched — nothing was changed or lost. Try again, and if it keeps happening
        the details are in the server log.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <a href="/dashboard">
          <Button variant="secondary">Back to dashboard</Button>
        </a>
      </div>
      {error.digest ? (
        <p className="mt-4 font-mono text-[11px] text-ink-subtle">Reference {error.digest}</p>
      ) : null}
    </div>
  );
}
