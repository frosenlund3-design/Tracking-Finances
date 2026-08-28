import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { Onboarding } from '@/components/Onboarding'
import { Home } from '@/components/Home'
import { CircleUniverse } from '@/components/CircleUniverse'
import { TimeRings } from '@/components/TimeRings'
import { Rewards } from '@/components/Rewards'
import { Settings } from '@/components/Settings'
import { Stats } from '@/components/Stats'
import { TabBar } from '@/components/TabBar'
import { Sheet } from '@/components/ui/Sheet'
import { BrainDumpPanel } from '@/components/BrainDump'
import { WhatNow } from '@/components/WhatNow'
import { StartMode } from '@/components/StartMode'
import { BodyDouble } from '@/components/BodyDouble'
import { ScrollRescue } from '@/components/ScrollRescue'
import { Coach } from '@/components/Coach'
import { NodeSheet } from '@/components/NodeSheet'
import { QuickAdd } from '@/components/QuickAdd'
import { EnergySheet } from '@/components/EnergySheet'
import { Notes } from '@/components/Notes'
import { Celebration } from '@/components/Celebration'
import { LockScreen } from '@/components/Lock'
import { InstallHint } from '@/components/InstallHint'

export default function App() {
  const ready = useStore((s) => s.ready)
  const init = useStore((s) => s.init)
  const onboarded = useStore((s) => s.profile.onboarded)
  const authState = useStore((s) => s.authState)
  const screen = useStore((s) => s.screen)
  const overlay = useStore((s) => s.overlay)
  const closeOverlay = useStore((s) => s.closeOverlay)

  useEffect(() => {
    void init()
  }, [init])

  if (!ready) {
    return (
      <div className="grid h-safe-screen place-items-center bg-canvas">
        <div className="h-16 w-16 rounded-full border border-line bg-surface breathe" />
      </div>
    )
  }

  if (authState === 'locked') return <LockScreen />

  if (!onboarded) return <Onboarding />

  return (
    <div className="h-safe-screen overflow-hidden bg-canvas">
      <main className="h-full">
        {screen === 'home' && <Home />}
        {screen === 'map' && <CircleUniverse />}
        {screen === 'time' && <TimeRings />}
        {screen === 'rewards' && <Rewards />}
        {screen === 'settings' && <Settings />}
        {screen === 'stats' && <Stats />}
      </main>

      <TabBar />
      <Celebration />
      <InstallHint />

      <Sheet open={overlay.kind === 'braindump'} onClose={closeOverlay} title="Få det ud af hovedet" full>
        <BrainDumpPanel onCommitted={() => undefined} />
      </Sheet>

      <Sheet open={overlay.kind === 'whatnow'} onClose={closeOverlay} title="Hvad skal jeg gøre nu?">
        <WhatNow />
      </Sheet>

      <Sheet open={overlay.kind === 'start'} onClose={closeOverlay} full hideClose>
        {overlay.kind === 'start' && <StartMode nodeId={overlay.nodeId} />}
      </Sheet>

      <Sheet open={overlay.kind === 'bodydouble'} onClose={closeOverlay} title="Jeg bliver her" full>
        {overlay.kind === 'bodydouble' && <BodyDouble nodeId={overlay.nodeId} />}
      </Sheet>

      <Sheet open={overlay.kind === 'rescue'} onClose={closeOverlay} title="Scroll-redning">
        <ScrollRescue />
      </Sheet>

      <Sheet open={overlay.kind === 'coach'} onClose={closeOverlay} title="ADHD-coach" full>
        {overlay.kind === 'coach' && <Coach nodeId={overlay.nodeId} ask={overlay.ask} />}
      </Sheet>

      <Sheet open={overlay.kind === 'node'} onClose={closeOverlay}>
        {overlay.kind === 'node' && <NodeSheet nodeId={overlay.nodeId} />}
      </Sheet>

      <Sheet open={overlay.kind === 'quickadd'} onClose={closeOverlay} title="Tilføj">
        {overlay.kind === 'quickadd' && <QuickAdd parentId={overlay.parentId} />}
      </Sheet>

      <Sheet open={overlay.kind === 'energy'} onClose={closeOverlay} title="Hvor meget har du i tanken?">
        <EnergySheet />
      </Sheet>

      <Sheet open={overlay.kind === 'notes'} onClose={closeOverlay} title="Hovedet" full>
        <Notes />
      </Sheet>
    </div>
  )
}
