'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

/**
 * Mobile: a bottom tab bar sitting above the iPhone home indicator.
 * Desktop: a fixed sidebar. Same five destinations either way — everything
 * else lives one level down, reachable from the screens themselves.
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const PRIMARY: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5.5 9.5V20h13V9.5" />
      </svg>
    ),
  },
  {
    href: '/transactions',
    label: 'Activity',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M4 7h16M4 12h16M4 17h10" />
      </svg>
    ),
  },
  {
    href: '/assistant',
    label: 'Ask',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" />
      </svg>
    ),
  },
  {
    href: '/business',
    label: 'Business',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M4 8h16v12H4z" />
        <path d="M9 8V5.5h6V8" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'More',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <circle cx="12" cy="12" r="1.4" />
        <circle cx="12" cy="5.5" r="1.4" />
        <circle cx="12" cy="18.5" r="1.4" />
      </svg>
    ),
  },
];

const SECONDARY = [
  { href: '/insights', label: 'Insights' },
  { href: '/subscriptions', label: 'Subscriptions' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/privacy', label: 'Privacy & security' },
  { href: '/settings', label: 'Settings' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/settings') return pathname.startsWith('/settings');
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-md lg:hidden"
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
                  'flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors',
                  active ? 'text-accent' : 'text-ink-subtle',
                )}
              >
                <span className="h-[22px] w-[22px]">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
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
        {PRIMARY.filter((i) => i.href !== '/settings').map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                )}
              >
                <span className="h-[18px] w-[18px]">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 space-y-0.5 border-t border-border pt-4">
        {SECONDARY.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'block rounded-lg px-2.5 py-1.5 text-[13px] transition-colors',
                active ? 'bg-surface-muted text-ink' : 'text-ink-subtle hover:text-ink',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto px-2.5 pt-4 text-[12px] text-ink-subtle">
        <p className="truncate">{userLabel}</p>
        <p className="mt-1 flex items-center gap-1.5">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-positive"
            aria-hidden="true"
          />
          Read-only access
        </p>
      </div>
    </aside>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-[13px] font-semibold text-white',
        className,
      )}
      aria-hidden="true"
    >
      kr
    </span>
  );
}
