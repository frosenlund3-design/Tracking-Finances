import { CircleDot, Clock, Gift, Home as HomeIcon } from 'lucide-react'
import { ROOT_ID } from '@/db/db'
import { useStore, type Screen } from '@/store/useStore'
import { haptic } from '@/lib/haptics'

const TABS: Array<{ id: Screen; label: string; icon: React.ReactNode }> = [
  { id: 'home', label: 'I dag', icon: <HomeIcon size={21} /> },
  { id: 'map', label: 'Cirkler', icon: <CircleDot size={21} /> },
  { id: 'time', label: 'Tid', icon: <Clock size={21} /> },
  { id: 'rewards', label: 'Point', icon: <Gift size={21} /> },
]

export function TabBar() {
  const screen = useStore((s) => s.screen)
  const setScreen = useStore((s) => s.setScreen)
  const setFocus = useStore((s) => s.setFocus)
  const focusId = useStore((s) => s.focusId)

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/92 backdrop-blur-xl pb-safe">
      <div className="mx-auto flex max-w-[560px] items-stretch">
        {TABS.map((t) => {
          const active = screen === t.id || (t.id === 'rewards' && screen === 'settings')
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
              className="focus-ring flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 pt-2"
              aria-current={active ? 'page' : undefined}
            >
              <span className={active ? 'text-ink' : 'text-faint'}>{t.icon}</span>
              <span className={`text-[10.5px] ${active ? 'text-ink font-medium' : 'text-faint'}`}>{t.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
