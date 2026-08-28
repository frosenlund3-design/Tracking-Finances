'use client';

import './globals.css';

/** Last resort: the root layout itself failed, so this renders its own html. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 text-center">
          <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
            Kroner could not start this page. Your financial data is unaffected.
          </p>
          <a href="/" className="mt-5 text-[13px] font-medium text-accent">
            Reload
          </a>
          {error.digest ? (
            <p className="mt-4 font-mono text-[11px] text-ink-subtle">Reference {error.digest}</p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
