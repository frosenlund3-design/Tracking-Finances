import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Offline' };

/**
 * Served by the service worker when a navigation fails. Static by design — it
 * has to render with no network and no database.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-muted text-ink-subtle">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 3l18 18" strokeLinecap="round" />
          <path d="M8.5 16.4a5 5 0 0 1 7 0" strokeLinecap="round" />
          <path d="M5 13a9 9 0 0 1 3.2-2.1M18.9 13a9 9 0 0 0-4.6-2.6" strokeLinecap="round" />
        </svg>
      </div>
      <h1 className="text-lg font-semibold tracking-tight">You’re offline</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
        Kroner shows live figures only, so it waits for a connection rather than showing you a
        balance that might be out of date.
      </p>
      <p className="mt-4 text-[13px] text-ink-subtle">This page will work again as soon as you’re back.</p>
    </div>
  );
}
