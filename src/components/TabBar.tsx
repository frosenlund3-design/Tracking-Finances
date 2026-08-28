import { motion } from 'framer-motion'
import { CircleDot, Clock, Gift, Home as HomeIcon } from 'lucide-react'
import { ROOT_ID } from '@/db/db'
import { useStore, type Screen } from '@/store/useStore'
import { haptic } from '@/lib/haptics'

const TABS: Array<{ id: Screen; label: string; icon: typeof HomeIcon }> = [
  { id: 'home', label: 'I dag', icon: HomeIcon },
  { id: 'map', label: 'Cirkler', icon: CircleDot },
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

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 pb-safe">
      <div
        className="absolute inset-0 border-t border-line/70 bg-surface/80"
        style={{ backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)' }}
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-[560px] items-stretch px-2">
        {TABS.map((t) => {
          const active = screen === t.id || (t.id === 'rewards' && screen === 'settings')
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => {
                haptic('soft')
                // Tapping the tab you are already on takes you back out to
                // "Mit liv", so you can never get lost deep in the tree.
                if (t.id === 'map' && screen === 'map' && focusId !== ROOT_ID) setFocus(ROOT_ID)
                else setScreen(t.id)
              }}
              className="relative flex min-h-[58px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl pt-1.5 outline-none"
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
                <Icon size={21} strokeWidth={active ? 2.2 : 1.7} className={active ? 'text-ink' : 'text-faint'} />
              </motion.span>
              <span className={`relative text-[10.5px] ${active ? 'font-semibold text-ink' : 'text-faint'}`}>
                {t.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
