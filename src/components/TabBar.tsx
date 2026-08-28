import { motion } from 'framer-motion'
import { CircleDot, Clock, Gift, Home as HomeIcon, MessageCircleHeart } from 'lucide-react'
import { ROOT_ID } from '@/db/db'
import { useStore, type Screen } from '@/store/useStore'
import { haptic } from '@/lib/haptics'

/**
 * Coach is a tab, not a chip.
 *
 * It used to sit in a row of chips below the fold on the home screen, which
 * meant the one part of the app you reach for when you cannot start was the
 * one part you had to go looking for. It is now one thumb-reach away from
 * anywhere, which is the whole point of it.
 */
const TABS: Array<{ id: Screen | 'coach'; label: string; icon: typeof HomeIcon }> = [
  { id: 'home', label: 'I dag', icon: HomeIcon },
  { id: 'map', label: 'Cirkler', icon: CircleDot },
  { id: 'coach', label: 'Coach', icon: MessageCircleHeart },
  { id: 'time', label: 'Tid', icon: Clock },
  { id: 'rewards', label: 'Point', icon: Gift },
]

/**
 * The menu bar.
 *
 * A single shared pill slides between tabs (one `layoutId`, spring physics),
 * the active icon lifts and the label fades up. Frosted glass over the content
 * behind it, so it reads as a native app bar rather than a row of links.
 */
export function TabBar() {
  const screen = useStore((s) => s.screen)
  const setScreen = useStore((s) => s.setScreen)
  const setFocus = useStore((s) => s.setFocus)
  const focusId = useStore((s) => s.focusId)
  const reduced = useStore((s) => s.prefs.reducedStimulation)
  const overlay = useStore((s) => s.overlay)
  const openOverlay = useStore((s) => s.openOverlay)
  const closeOverlay = useStore((s) => s.closeOverlay)

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 pb-safe">
      <div
        className="absolute inset-0 border-t border-line/70 bg-surface/80"
        style={{ backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)' }}
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-[560px] items-stretch px-2">
        {TABS.map((t) => {
          const active =
            t.id === 'coach'
              ? overlay.kind === 'coach'
              : overlay.kind !== 'coach' &&
                (screen === t.id || (t.id === 'rewards' && (screen === 'settings' || screen === 'stats')))
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => {
                haptic('soft')
                if (t.id === 'coach') {
                  // Tapping Coach while it is open closes it again, so the tab
                  // behaves like a tab and not like a one-way door.
                  if (overlay.kind === 'coach') closeOverlay()
                  else openOverlay({ kind: 'coach' })
                  return
                }
                // Tapping the tab you are already on takes you back out to
                // "Mit liv", so you can never get lost deep in the tree.
                if (t.id === 'map' && screen === 'map' && focusId !== ROOT_ID) setFocus(ROOT_ID)
                else setScreen(t.id)
              }}
              className="relative flex min-h-[58px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-0.5 pt-1.5 outline-none"
              aria-current={active ? 'page' : undefined}
            >
              {active && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-x-1.5 inset-y-1 rounded-2xl bg-accent-soft"
                  transition={
                    reduced
                      ? { duration: 0.12 }
                      : { type: 'spring', stiffness: 520, damping: 40, mass: 0.6 }
                  }
                  aria-hidden
                />
              )}
              <motion.span
                className="relative"
                animate={{ y: active ? -1 : 0, scale: active ? 1.06 : 1 }}
                transition={reduced ? { duration: 0.1 } : { type: 'spring', stiffness: 500, damping: 30 }}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.7} className={active ? 'text-ink' : 'text-faint'} />
              </motion.span>
              <span className={`relative text-[10px] ${active ? 'font-semibold text-ink' : 'text-faint'}`}>
                {t.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
