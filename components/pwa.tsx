'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

/**
 * Registers the service worker. Kept in its own component so the rest of the
 * tree stays server-rendered.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[pwa] service worker registration failed', err);
      });
    };
    // Registering after load keeps it off the critical path.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'kroner.install-dismissed';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari predates the standard and uses its own flag.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS reports as a Mac, so the touch points give it away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * "Add to Home Screen".
 *
 * Chrome and Edge fire `beforeinstallprompt` and let us open the real install
 * dialog. Safari on iOS does not, and never will — there, the only honest
 * thing is to show the two taps the user has to make themselves.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone()) return; // already installed
    try {
      if (localStorage.getItem(DISMISSED_KEY)) return;
    } catch {
      /* private mode: just show it */
    }

    const onIos = isIos();
    setIos(onIos);
    if (onIos) {
      setVisible(true);
      return;
    }

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setVisible(false));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function dismiss() {
    setVisible(false);
    setShowIosSheet(false);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      /* nothing to remember it with */
    }
  }

  async function install() {
    if (ios) {
      setShowIosSheet(true);
      return;
    }
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <>
      <div
        className={cn(
          'rise flex items-center gap-3 rounded-2xl border border-border bg-surface p-3',
          'shadow-[var(--shadow-card)]',
        )}
      >
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-[15px] font-semibold text-white"
        >
          kr
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium leading-tight">Add Kroner to your home screen</p>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">
            Opens like an app, full screen, one tap away.
          </p>
        </div>
        <Button size="sm" onClick={install} className="shrink-0">
          Add
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-1 shrink-0 p-1.5 text-ink-subtle hover:text-ink"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {showIosSheet ? <IosInstructions onClose={() => setShowIosSheet(false)} onDismiss={dismiss} /> : null}
    </>
  );
}

function IosInstructions({ onClose, onDismiss }: { onClose: () => void; onDismiss: () => void }) {
  // Portalled for the same reason as Sheet: a transformed ancestor would
  // otherwise become the containing block and push this off-screen.
  return createPortal(
    <div
      className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-label="Add to home screen"
      onClick={onClose}
    >
      <div
        className="sheet-in w-full max-w-md rounded-t-3xl border-t border-border bg-surface p-5 shadow-[var(--shadow-sheet)] sm:mb-6 sm:rounded-3xl sm:border"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-border-strong" aria-hidden="true" />
        <h2 className="text-[17px] font-semibold tracking-tight">Add to Home Screen</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          Safari asks you to do this yourself. Two taps:
        </p>

        <ol className="mt-4 space-y-3">
          <Step
            n={1}
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" strokeLinecap="round" />
              </svg>
            }
          >
            Tap the <strong className="font-medium">Share</strong> button in Safari’s toolbar.
          </Step>
          <Step
            n={2}
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="4" y="4" width="16" height="16" rx="4" />
                <path d="M12 9v6M9 12h6" strokeLinecap="round" />
              </svg>
            }
          >
            Choose <strong className="font-medium">Add to Home Screen</strong>, then Add.
          </Step>
        </ol>

        <div className="mt-5 flex gap-2">
          <Button variant="secondary" full onClick={onDismiss}>
            Don’t show again
          </Button>
          <Button full onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-ink-muted"
      >
        {icon}
      </span>
      <span className="pt-1.5 text-[14px] leading-snug">
        <span className="sr-only">Step {n}. </span>
        {children}
      </span>
    </li>
  );
}
