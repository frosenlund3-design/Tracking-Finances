import Link from 'next/link';

/**
 * Demo mode is stated plainly wherever figures are shown. A finance product
 * that leaves you unsure whether a number is real has failed at its one job.
 */
export function DemoBanner({ demoMode }: { demoMode: boolean }) {
  if (!demoMode) return null;
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-muted px-3 py-2 text-[12px] text-ink-muted">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-notice"
        aria-hidden="true"
      />
      <span className="flex-1">These are demo figures, not your real accounts.</span>
      <Link href="/integrations" className="shrink-0 font-medium text-accent">
        Connect
      </Link>
    </div>
  );
}
