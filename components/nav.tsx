'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { Sheet } from '@/components/ui/primitives';

/**
 * Mobile: a bottom tab bar above the home indicator, with everything past the
 * first four destinations in a sheet. Desktop: a sidebar showing all of it.
 *
 * Four tabs plus More, because five equal tabs on a phone are five targets
 * nobody can hit accurately.
 */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const ICONS = {
  home: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M3.5 10.5 12 4l8.5 6.5" />
      <path d="M6 9.8V20h12V9.8" />
    </svg>
  ),
  accounts: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <path d="M3 10.5h18M7 14.5h3" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  ),
  ask: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="5.5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="18.5" cy="12" r="1.4" />
    </svg>
  ),
  business: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2.5" />
      <path d="M9 7.5V5.5h6v2" />
    </svg>
  ),
  review: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4 7h16M4 12h9M4 17h6" strokeLinecap="round" />
      <path d="m15.5 16 2 2 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  advanced: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4 19V9M9.5 19V5M15 19v-7M20.5 19v-4" />
    </svg>
  ),
  insights: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 3.5a5.5 5.5 0 0 0-3 10.1V16h6v-2.4a5.5 5.5 0 0 0-3-10.1Z" />
      <path d="M10 19h4" />
    </svg>
  ),
  subscriptions: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4h-4" />
    </svg>
  ),
  mobilepay: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="7" y="3" width="10" height="18" rx="2.6" />
      <path d="M10.5 17.5h3" />
    </svg>
  ),
  connect: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M13 6.5 14.8 4.7a3.8 3.8 0 0 1 5.4 5.4L18.4 12" />
      <path d="M11 17.5 9.2 19.3a3.8 3.8 0 0 1-5.4-5.4L5.6 12" />
    </svg>
  ),
  privacy: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 3.5 5 6.5v5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9v-5l-7-3Z" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2 5.6 5.6" />
    </svg>
  ),
};

interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  description?: string;
}

const PRIMARY: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: 'home' },
  { href: '/accounts', label: 'Accounts', icon: 'accounts' },
  { href: '/transactions', label: 'Activity', icon: 'activity' },
  { href: '/assistant', label: 'Ask', icon: 'ask' },
];

const SECONDARY: NavItem[] = [
  { href: '/review', label: 'Review', icon: 'review', description: 'Sort what Kroner is unsure about' },
  { href: '/business', label: 'Business', icon: 'business', description: 'Revenue, costs, gross profit' },
  { href: '/advanced', label: 'Advanced', icon: 'advanced', description: 'Burn rate, runway, payment rails' },
  { href: '/insights', label: 'Insights', icon: 'insights', description: 'What changed, and a forecast' },
  { href: '/subscriptions', label: 'Subscriptions', icon: 'subscriptions', description: 'Every recurring payment' },
  { href: '/mobilepay', label: 'MobilePay', icon: 'mobilepay', description: 'Who you pay, who pays you' },
  { href: '/connect', label: 'Connect', icon: 'connect', description: 'Bank, Stripe, MobilePay' },
  { href: '/privacy', label: 'Privacy & security', icon: 'privacy', description: 'What is stored, what never is' },
  { href: '/settings', label: 'Settings', icon: 'settings', description: 'Profile, rules, your data' },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the sheet on navigation, so it never lingers over the new screen.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const secondaryActive = SECONDARY.some((item) => isActive(pathname, item.href));

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/85 backdrop-blur-xl lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto flex max-w-lg">
          {PRIMARY.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'pressable flex min-h-[54px] flex-col items-center justify-center gap-1 py-2',
                    'text-[10px] font-medium transition-colors',
                    active ? 'text-accent' : 'text-ink-subtle',
                  )}
                >
                  <span className="h-[22px] w-[22px]">{ICONS[item.icon]}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              className={cn(
                'pressable flex min-h-[54px] w-full flex-col items-center justify-center gap-1 py-2',
                'text-[10px] font-medium transition-colors',
                secondaryActive ? 'text-accent' : 'text-ink-subtle',
              )}
            >
              <span className="h-[22px] w-[22px]">{ICONS.more}</span>
              More
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Everything else">
        <ul className="space-y-1 pb-2">
          {SECONDARY.map((item) => (
            <li key={item.href}>
              <button
                type="button"
                onClick={() => router.push(item.href)}
                className={cn(
                  'pressable flex w-full items-center gap-3 rounded-2xl p-3 text-left',
                  isActive(pathname, item.href) ? 'bg-accent-soft' : 'hover:bg-surface-muted',
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-ink-muted"
                >
                  <span className="h-[20px] w-[20px]">{ICONS[item.icon]}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{item.label}</span>
                  {item.description ? (
                    <span className="block truncate text-[12.5px] text-ink-subtle">{item.description}</span>
                  ) : null}
                </span>
                <span aria-hidden="true" className="shrink-0 text-ink-subtle">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}

export function Sidebar({ userLabel }: { userLabel: string }) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface px-3 py-5 lg:flex">
      <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2">
        <Logo />
        <span className="text-[15px] font-semibold tracking-tight text-ink">Kroner</span>
      </Link>

      <ul className="space-y-0.5">
        {PRIMARY.map((item) => (
          <SidebarLink key={item.href} item={item} pathname={pathname} />
        ))}
      </ul>

      <ul className="mt-6 space-y-0.5 border-t border-border pt-4">
        {SECONDARY.map((item) => (
          <SidebarLink key={item.href} item={item} pathname={pathname} compact />
        ))}
      </ul>

      <div className="mt-auto px-2.5 pt-4 text-[12px] text-ink-subtle">
        <p className="truncate">{userLabel}</p>
        <p className="mt-1 flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-positive" aria-hidden="true" />
          Read-only access
        </p>
      </div>
    </aside>
  );
}

function SidebarLink({
  item,
  pathname,
  compact,
}: {
  item: NavItem;
  pathname: string;
  compact?: boolean;
}) {
  const active = isActive(pathname, item.href);
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-2.5 rounded-xl px-2.5 transition-colors',
          compact ? 'py-1.5 text-[13px]' : 'py-2 text-sm font-medium',
          active ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
        )}
      >
        <span className={compact ? 'h-4 w-4' : 'h-[18px] w-[18px]'}>{ICONS[item.icon]}</span>
        {item.label}
      </Link>
    </li>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-xl bg-accent text-[13px] font-semibold text-white',
        className,
      )}
      aria-hidden="true"
    >
      kr
    </span>
  );
}
