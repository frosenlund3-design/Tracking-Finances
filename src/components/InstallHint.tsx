import { AnimatePresence, motion } from 'framer-motion'
import { Share, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useStore } from '@/store/useStore'

/**
 * "Føj til hjemmeskærm".
 *
 * The single most important thing a first-time visitor on an iPhone needs to
 * know, and Safari gives no prompt of its own — so without this, the link is
 * just a web page she closes and never finds again.
 *
 * Shown once, only on an iPhone or iPad, only in Safari, and only when the app
 * is not already installed. Dismissing it is remembered.
 */

const DISMISSED_KEY = 'loops.install-hint.dismissed'

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return isIos && isSafari
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function InstallHint() {
  const [show, setShow] = useState(false)
  // Never on top of a completion, and never in the middle of a focus mode —
  // the moment she closes a loop belongs to her, not to a banner.
  const busy = useStore((s) => s.celebration !== null || s.overlay.kind !== 'none')

  useEffect(() => {
    let dismissed = false
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY) === '1'
    } catch {
      /* private mode — just show it */
    }
    if (dismissed || isStandalone() || !isIosSafari()) return
    // Let her see the app first; a banner before anything has loaded reads
    // like a cookie notice.
    const t = window.setTimeout(() => setShow(true), 4000)
    return () => window.clearTimeout(t)
  }, [])

  const dismiss = () => {
    setShow(false)
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      /* nothing to remember it with; it will show again */
    }
  }

  return (
    <AnimatePresence>
      {show && !busy && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="fixed inset-x-3 bottom-[86px] z-[55]"
        >
          <div className="relative rounded-3xl border border-line bg-raised p-5 shadow-lift">
            <button
              onClick={dismiss}
              aria-label="Luk"
              className="focus-ring absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full text-faint"
            >
              <X size={17} />
            </button>

            <p className="pr-10 text-[15.5px] font-semibold tracking-[-0.02em]">
              Læg Loops på hjemmeskærmen
            </p>
            <p className="mt-2 pr-6 text-[13.5px] leading-relaxed text-muted">
              Så ligger den som en almindelig app — også uden internet.
            </p>

            <ol className="mt-3.5 space-y-2">
              <li className="flex items-center gap-2.5 text-[13.5px]">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold">
                  1
                </span>
                Tryk på
                <Share size={15} className="text-muted" />
                nederst i Safari
              </li>
              <li className="flex items-center gap-2.5 text-[13.5px]">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold">
                  2
                </span>
                Vælg "Føj til hjemmeskærm"
              </li>
            </ol>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
