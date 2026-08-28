/**
 * Keeping the app she has on her phone the same as the app that was shipped.
 *
 * A home-screen PWA is not a web page. iOS keeps it suspended rather than
 * closed, its JavaScript stays in memory, and the service worker serves the
 * build it already has. So a fix can be live for days while her phone quietly
 * keeps running the old one, and neither of us can tell from the outside.
 *
 * That is worse than an ordinary stale cache, because everything looks fine.
 * She reports something that was fixed, and the fix appears not to work.
 *
 * Two rules here.
 *
 * It never reloads under her hands. A page that reloads itself mid sentence is
 * exactly the kind of thing that makes an app feel unreliable, and losing a
 * half-typed brain dump would be unforgivable. So it reloads only in the first
 * few seconds after launch, or the next time she comes back to a page she had
 * left. Otherwise it waits.
 *
 * And it checks. Registration alone only looks for a new version when the page
 * loads, which for a suspended PWA can be never.
 */

const LAUNCH = Date.now()
/** Long enough to be "still opening", short enough that she has not started. */
const SETTLING_MS = 4000
/** Hourly is plenty for an app one person uses. */
const CHECK_EVERY_MS = 60 * 60 * 1000

let pendingReload = false

function reloadWhenSafe(): void {
  if (pendingReload) return
  pendingReload = true

  if (Date.now() - LAUNCH < SETTLING_MS) {
    window.location.reload()
    return
  }
  // She is using it. Wait until she has looked away.
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') window.location.reload()
    },
    { once: true },
  )
}

export function watchForUpdates(): void {
  if (!('serviceWorker' in navigator)) return

  // A new worker has taken over, so the code in this tab is now the old build.
  navigator.serviceWorker.addEventListener('controllerchange', reloadWhenSafe)

  void navigator.serviceWorker.ready.then((registration) => {
    const check = () => {
      if (document.visibilityState === 'visible') void registration.update().catch(() => undefined)
    }
    window.setInterval(check, CHECK_EVERY_MS)
    // And whenever she comes back to it, which for this app is the common case.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  })
}

/**
 * The escape hatch, for when it is stuck anyway.
 *
 * Throws away the service worker and every cached file and reloads from the
 * network. It touches no data: everything she has written lives in IndexedDB,
 * which is not a cache and is not cleared here.
 */
export async function forceUpdate(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } finally {
    // Cache-busted so the browser cannot hand back its own copy of index.html.
    window.location.replace(`${window.location.pathname}?v=${Date.now()}`)
  }
}

/** Which build is actually running, so this is never a guess again. */
export const BUILD_ID: string = __BUILD_ID__
