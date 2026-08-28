import { motion } from 'framer-motion'
import { Battery, Brain, Gift, MessageCircleHeart, Play, Plus, Settings as SettingsIcon, Waves } from 'lucide-react'
import { useStore, useClosedToday, useMentalLoad, useNextTask, useParked, useAvailableXP } from '@/store/useStore'
import { LoadRing } from './ui/LoadRing'
import { greeting, humanMinutes, relativeDay } from '@/lib/time'
import { streakLine } from '@/lib/rewards'
import { visibleChildren } from '@/lib/nodes'
import { ROOT_ID } from '@/db/db'
import { scoreLabel } from '@/lib/scoring'
import { levelFor } from '@/lib/rewards'

/**
 * Dagens view.
 *
 * The rule for this screen: within five seconds she must know what the app
 * thinks she should do, and be able to start it with one tap. Everything else
 * is below the fold on purpose.
 */
export function Home() {
  const load = useMentalLoad()
  const next = useNextTask()
  const openOverlay = useStore((s) => s.openOverlay)
  const setScreen = useStore((s) => s.setScreen)
  const setFocus = useStore((s) => s.setFocus)
  const map = useStore((s) => s.map)
  const prefs = useStore((s) => s.prefs)
  const daysAway = useStore((s) => s.daysAway)
  const closedToday = useClosedToday()
  const parked = useParked()
  const availableXP = useAvailableXP()

  const worlds = visibleChildren(map, ROOT_ID)
  const streak = streakLine(prefs.streak, daysAway)
  const level = levelFor(prefs.totalXP)
  const goal = prefs.rewardGoal

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-32">
      <div className="px-6 pt-safe">
        <div className="flex items-start justify-between pt-1">
          <div>
            <h1 className="text-[25px] font-semibold tracking-[-0.03em]">{greeting()}</h1>
            {streak && <p className="mt-1 text-[14px] text-muted">{streak}</p>}
          </div>
          <button
            onClick={() => setScreen('settings')}
            aria-label="Indstillinger"
            className="focus-ring -mr-2 -mt-1 grid h-11 w-11 place-items-center rounded-full text-faint active:scale-95"
          >
            <SettingsIcon size={20} />
          </button>
        </div>

        {/* Mental load */}
        <div className="mt-3 flex flex-col items-center">
          <LoadRing
            percent={load.percent}
            size={132}
            loops={load.openLoops}
            label="Mental load"
            onClick={() => openOverlay({ kind: 'energy' })}
          />
          <p className="mt-3 flex items-start gap-2 px-2 text-center text-[14px] leading-snug">
            <Brain size={15} className="mt-0.5 shrink-0 text-faint" />
            <span>
              {load.openLoops} ting din hjerne ikke længere behøver huske
              {closedToday > 0 && (
                <span className="text-calm"> · {closedToday} lukket i dag</span>
              )}
            </span>
          </p>
        </div>

        {/* The one next thing */}
        <div className="mt-4">
          {next ? (
            <motion.div
              layout
              className="rounded-xl3 border border-line bg-surface p-5 shadow-soft"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Næste</p>
                <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-ink/70">
                  {next.score} point · {scoreLabel(next.score)}
                </span>
              </div>

              <p className="mt-2.5 text-[20px] font-semibold leading-snug tracking-[-0.02em]">{next.node.title}</p>
              <p className="mt-1.5 text-[13.5px] text-muted">
                ca. {humanMinutes(next.node.estimatedMinutes)}
                {next.reasons.length > 0 && ` · ${next.reasons[0]}`}
              </p>

              <div className="mt-4 flex gap-2.5">
                <button
                  onClick={() => openOverlay({ kind: 'start', nodeId: next.node.id })}
                  className="focus-ring flex min-h-[54px] flex-[2] items-center justify-center gap-2 rounded-xl2 bg-ink text-[16px] font-medium text-canvas active:scale-[0.98] transition"
                >
                  <Play size={17} fill="currentColor" />
                  Start nu
                </button>
                <button
                  onClick={() => openOverlay({ kind: 'whatnow' })}
                  className="focus-ring min-h-[54px] flex-1 rounded-xl2 border border-line bg-raised text-[15px] active:scale-[0.98] transition"
                >
                  Noget andet
                </button>
              </div>
              <p className="mt-3 text-center text-[12.5px] text-faint">Du behøver ikke tænke på resten endnu.</p>
            </motion.div>
          ) : (
            <div className="rounded-xl3 border border-line bg-surface p-7 text-center shadow-soft">
              <p className="text-[18px] font-semibold tracking-[-0.02em]">Der er ikke noget, du skal lige nu</p>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
                Hvis der ligger noget i hovedet alligevel, så læg det herned.
              </p>
              <button
                onClick={() => openOverlay({ kind: 'braindump' })}
                className="focus-ring mt-5 min-h-[52px] w-full rounded-xl2 bg-ink px-6 text-[16px] font-medium text-canvas active:scale-[0.98]"
              >
                Få det ud af hovedet
              </button>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <QuickAction
            icon={<Plus size={18} />}
            label="Få det ud af hovedet"
            onClick={() => openOverlay({ kind: 'braindump' })}
          />
          <QuickAction
            icon={<MessageCircleHeart size={18} />}
            label="Snak med coachen"
            onClick={() => openOverlay({ kind: 'coach', nodeId: next?.node.id })}
          />
          <QuickAction
            icon={<Waves size={18} />}
            label="Jeg sidder fast i scrolling"
            onClick={() => openOverlay({ kind: 'rescue' })}
          />
          <QuickAction
            icon={<Battery size={18} />}
            label={`Energi: ${prefs.currentEnergy}%`}
            onClick={() => openOverlay({ kind: 'energy' })}
          />
        </div>

        {/* Reward progress */}
        <button
          onClick={() => setScreen('rewards')}
          className="focus-ring mt-4 flex w-full items-center gap-4 rounded-xl2 border border-line bg-surface p-4 text-left active:scale-[0.99] transition"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft">
            <Gift size={19} className="text-ink/70" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">
              {goal ? `${availableXP} / ${goal.xpTarget} point` : `${availableXP} point · niveau ${level.level}`}
            </span>
            <span className="mt-0.5 block truncate text-[12.5px] text-faint">
              {goal ? `Sparer op til gavekort på ${goal.amountDKK} kr.` : 'Sæt et mål, du sparer op til'}
            </span>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line">
              <span
                className="block h-full rounded-full bg-warm transition-all duration-500"
                style={{ width: `${Math.min(100, goal ? (availableXP / goal.xpTarget) * 100 : level.progress * 100)}%` }}
              />
            </span>
          </span>
        </button>

        {/* Worlds */}
        <div className="mt-9">
          <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Dine verdener</p>
          <div className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-4">
            {worlds.map((w) => (
              <WorldBubble key={w.id} id={w.id} title={w.title} onClick={() => setFocus(w.id)} />
            ))}
          </div>
        </div>

        {/* Parked */}
        {parked.length > 0 && (
          <div className="mt-9">
            <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Parkeret</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              De her fylder ikke i hovedet lige nu. De kommer selv tilbage.
            </p>
            <div className="mt-3 space-y-2">
              {parked.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  onClick={() => openOverlay({ kind: 'node', nodeId: p.id })}
                  className="focus-ring flex w-full items-center justify-between rounded-xl2 border border-line bg-surface px-4 py-3.5 text-left active:scale-[0.99]"
                >
                  <span className="min-w-0 flex-1 truncate text-[15px]">{p.title}</span>
                  <span className="ml-3 shrink-0 text-[12.5px] text-faint">
                    {p.parkedUntil ? relativeDay(new Date(p.parkedUntil).toISOString().slice(0, 10)) : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-12 text-center text-[12px] leading-relaxed text-faint/80">
          Dine tanker bliver på din telefon.
        </p>
      </div>
    </div>
  )
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="focus-ring flex min-h-[76px] flex-col justify-between rounded-xl2 border border-line bg-surface p-4 text-left active:scale-[0.98] transition"
    >
      <span className="text-faint">{icon}</span>
      <span className="text-[13.5px] font-medium leading-snug">{label}</span>
    </button>
  )
}

function WorldBubble({ id, title, onClick }: { id: string; title: string; onClick: () => void }) {
  const map = useStore((s) => s.map)
  const count = visibleChildren(map, id).length
  return (
    <button
      onClick={onClick}
      className="focus-ring flex w-[86px] flex-col items-center gap-2 active:scale-95 transition"
    >
      <span className="grid h-[68px] w-[68px] place-items-center rounded-full border border-line bg-surface shadow-node">
        <span className="text-[13px] font-medium text-muted">{count || ''}</span>
      </span>
      <span className="text-center text-[12.5px] leading-tight">{title}</span>
    </button>
  )
}
