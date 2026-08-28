import { motion } from 'framer-motion'
import { AlarmClock, Battery, CalendarClock, Check, ChevronRight, Gift, Moon, NotebookPen, Plus, Settings as SettingsIcon, Waves } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useStore, useClosedToday, useMentalLoad, useNextTask, useParked, useAvailableXP } from '@/store/useStore'
import { greeting, relativeDay, isoDate } from '@/lib/time'
import { streakLine, REWARD_XP, levelFor } from '@/lib/rewards'
import { visibleChildren } from '@/lib/nodes'
import { ROOT_ID } from '@/db/db'
import { firstActionFor } from '@/lib/firstAction'
import { scanAttention } from '@/lib/attention'
import { toneFor } from '@/lib/colors'
import { blockedHeadline, enoughBody, enoughHeadline, enoughState } from '@/lib/enough'
import { appointmentsToday, shortWhen, whenLabel } from '@/lib/deadlines'
import { humanMinutes } from '@/lib/time'
import { calibratedMinutes } from '@/lib/calibration'
import { useCalibration } from '@/store/useStore'

/**
 * Dagens view.
 *
 * One rule governs this screen: the very first thing on it is a physical
 * movement small enough that not doing it would feel silly. Not "Betal
 * elregningen · 10 min", "Åbn netbanken · 30 sekunder", with the reward for
 * starting shown on the button itself.
 *
 * Everything else is deliberately quieter than it used to be. Mental load is a
 * thin line, not a dial; the tools are one row of chips. A screen full of
 * competing cards is a screen you close.
 */
export function Home() {
  const load = useMentalLoad()
  const next = useNextTask()
  const openOverlay = useStore((s) => s.openOverlay)
  const setScreen = useStore((s) => s.setScreen)
  const setFocus = useStore((s) => s.setFocus)
  const map = useStore((s) => s.map)
  const prefs = useStore((s) => s.prefs)
  const dark = useStore((s) => s.profile.theme === 'dusk')
  const daysAway = useStore((s) => s.daysAway)
  const closedToday = useClosedToday()
  const parked = useParked()
  const availableXP = useAvailableXP()
  const notes = useStore((s) => s.notes)
  const declareDayDone = useStore((s) => s.declareDayDone)
  const wantMoreToday = useStore((s) => s.wantMoreToday)

  const [confirmDone, setConfirmDone] = useState(false)
  const cal = useCalibration()
  const enough = enoughState(prefs, closedToday, load.percent, map)
  const appointments = useMemo(() => appointmentsToday(map), [map])

  const worlds = visibleChildren(map, ROOT_ID)
  const streak = streakLine(prefs.streak, daysAway)
  const level = levelFor(prefs.totalXP)
  const goal = prefs.rewardGoal

  const action = firstActionFor(next?.node ?? null)
  const attention = useMemo(() => scanAttention(map)[0] ?? null, [map])

  const tone = useMemo(() => {
    if (!next) return null
    const parent = next.node.parentId ? map[next.node.parentId] : null
    const index = parent ? Math.max(0, parent.childIds.indexOf(next.node.id)) : 0
    return toneFor(next.node.id, index, next.node.parentId, dark)
  }, [next, map, dark])

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-32">
      <div className="px-5 pt-safe">
        <div className="flex items-start justify-between pt-1">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.03em]">{greeting()}</h1>
            {streak && <p className="mt-0.5 text-[13px] text-faint">{streak}</p>}
          </div>
          <button
            onClick={() => setScreen('settings')}
            aria-label="Indstillinger"
            className="focus-ring -mr-2 -mt-1 grid h-11 w-11 place-items-center rounded-full text-faint active:scale-95"
          >
            <SettingsIcon size={19} />
          </button>
        </div>

        {/* ── Fixed times today. Facts, not suggestions. ──────────────── */}
        {appointments.length > 0 && (
          <div className="mt-4 space-y-2">
            {appointments.map((a) => (
              <button
                key={a.id}
                onClick={() => openOverlay({ kind: 'node', nodeId: a.id })}
                className="focus-ring flex w-full items-center gap-3.5 rounded-3xl border border-warm/40 bg-warm/10 px-5 py-4 text-left active:scale-[0.99]"
              >
                <CalendarClock size={18} className="shrink-0 text-warm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium leading-snug">{a.title}</span>
                  <span className="mt-0.5 block text-[12.5px] text-muted">{whenLabel(a)}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ── Enough for today ────────────────────────────────────────── */}
        {enough.done ? (
          <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="mt-4 rounded-[30px] border border-line bg-surface p-7 text-center"
          >
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-calm/15">
              {enough.closed > 0 ? (
                <Check size={26} className="text-calm" />
              ) : (
                <Moon size={24} className="text-calm" />
              )}
            </div>

            <h2 className="mt-5 text-[24px] font-semibold leading-tight tracking-[-0.03em]">
              {enoughHeadline(enough)}
            </h2>
            <p className="mx-auto mt-2.5 max-w-[19rem] text-[15px] leading-relaxed text-muted">
              {enoughBody(enough)}
            </p>

            <p className="mt-6 text-[13.5px] text-faint">Luk appen. Vi ses i morgen.</p>

            <div className="mt-5 flex flex-col gap-1">
              <button
                onClick={() => void wantMoreToday()}
                className="focus-ring min-h-[48px] w-full rounded-3xl border border-line text-[14.5px] text-muted active:scale-[0.99]"
              >
                Jeg vil gerne én mere
              </button>
              <button
                onClick={() => openOverlay({ kind: 'braindump' })}
                className="focus-ring min-h-[44px] w-full text-[13.5px] text-faint"
              >
                Der ligger stadig noget i hovedet
              </button>
            </div>
          </motion.div>
        ) : enough.blocked ? (
          <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="mt-4 rounded-[30px] border border-line bg-surface p-6"
          >
            <div className="flex items-start gap-3">
              <AlarmClock size={20} className="mt-0.5 shrink-0 text-warm" />
              <div className="min-w-0">
                <h2 className="text-[20px] font-semibold leading-tight tracking-[-0.025em]">
                  {blockedHeadline(enough)}
                </h2>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
                  Resten kan sagtens vente til i morgen. De her har en rigtig tid.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {enough.necessary.slice(0, 3).map((n) => (
                <button
                  key={n.id}
                  onClick={() => openOverlay({ kind: 'start', nodeId: n.id })}
                  className="focus-ring flex w-full items-center gap-3 rounded-2xl border border-line bg-raised px-4 py-3.5 text-left active:scale-[0.99]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{n.title}</span>
                    <span className="mt-0.5 block text-[12px] text-warm">{whenLabel(n)}</span>
                  </span>
                  <ChevronRight size={15} className="shrink-0 text-faint" />
                </button>
              ))}
            </div>
          </motion.div>
        ) : next && action && tone ? (
          <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="mt-4 overflow-hidden rounded-[30px] p-6 pb-5"
            style={{
              background: `linear-gradient(160deg, ${tone.from} 0%, ${tone.to} 100%)`,
              color: tone.text,
              boxShadow: `0 2px 8px ${tone.shadow}, 0 26px 60px -26px ${tone.shadow}`,
            }}
          >
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] opacity-55">
              Start med det her
            </p>

            <h2 className="mt-3 text-[30px] font-semibold leading-[1.1] tracking-[-0.035em]">
              {action.text}
            </h2>

            <p className="mt-2.5 text-[15px] opacity-70">{action.humanTime}. Så er du i gang.</p>

            {next.node.dueAt && (
              <p className="mt-1.5 text-[13.5px] font-medium opacity-80">{whenLabel(next.node)}</p>
            )}

            <button
              onClick={() => openOverlay({ kind: 'start', nodeId: next.node.id })}
              className="focus-ring mt-6 flex min-h-[62px] w-full items-center justify-center gap-3 rounded-3xl text-[17px] font-semibold transition active:scale-[0.98]"
              style={{ background: tone.text, color: tone.to }}
            >
              Jeg gør det nu
              {prefs.showXP && (
                <span
                  className="rounded-full px-2.5 py-1 text-[12.5px] font-bold"
                  style={{ background: tone.from, color: tone.text }}
                >
                  +{REWARD_XP['task-started']}
                </span>
              )}
            </button>

            <p className="mt-3 text-center text-[12.5px] opacity-60">
              Point for at starte, ikke kun for at blive færdig.
            </p>

            <div className="mt-4 flex items-center justify-between border-t pt-3 text-[12.5px]" style={{ borderColor: `${tone.text}22` }}>
              <span className="min-w-0 flex-1 truncate opacity-60">
                {action.isWholeTask
                  ? `Hele opgaven · ${humanMinutes(calibratedMinutes(next.node.estimatedMinutes, cal))}`
                  : `Hører til: ${next.node.title}`}
              </span>
              <button
                onClick={() => openOverlay({ kind: 'whatnow' })}
                className="focus-ring -my-2 ml-3 flex min-h-[44px] shrink-0 items-center gap-1 font-medium opacity-75"
              >
                Noget andet
                <ChevronRight size={14} />
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="mt-4 rounded-[30px] border border-line bg-surface p-7 text-center">
            <p className="text-[19px] font-semibold tracking-[-0.02em]">Der er ikke noget, du skal</p>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
              Ligger der noget i hovedet alligevel, så læg det herned.
            </p>
            <button
              onClick={() => openOverlay({ kind: 'braindump' })}
              className="focus-ring mt-5 min-h-[56px] w-full rounded-3xl bg-ink px-6 text-[16px] font-semibold text-canvas active:scale-[0.98]"
            >
              Få det ud af hovedet
            </button>
          </div>
        )}

        {/* ── Permission to stop ──────────────────────────────────────── */}
        {!enough.done && (
          <button
            onClick={() => {
              if (enough.necessary.length > 0) setConfirmDone(true)
              else void declareDayDone()
            }}
            className="focus-ring mt-2.5 min-h-[44px] w-full text-[13px] text-faint"
          >
            Jeg er færdig for i dag
          </button>
        )}

        {confirmDone && (
          <div className="mt-2 rounded-3xl border border-line bg-surface p-5">
            <p className="text-[14.5px] leading-relaxed">
              Der {enough.necessary.length === 1 ? 'er' : 'er'} stadig {enough.necessary.length}{' '}
              {enough.necessary.length === 1 ? 'ting' : 'ting'} med en rigtig tid i dag.
            </p>
            <ul className="mt-2.5 space-y-1">
              {enough.necessary.slice(0, 3).map((n) => (
                <li key={n.id} className="text-[13px] text-muted">
                  {n.title}, <span className="text-warm">{shortWhen(n)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmDone(false)}
                className="focus-ring min-h-[46px] flex-1 rounded-2xl border border-line text-[14.5px]"
              >
                Vis mig dem
              </button>
              <button
                onClick={() => {
                  setConfirmDone(false)
                  void declareDayDone()
                }}
                className="focus-ring min-h-[46px] flex-1 rounded-2xl bg-ink text-[14.5px] text-canvas"
              >
                Jeg er færdig alligevel
              </button>
            </div>
          </div>
        )}

        {/* ── Something has been sitting there ────────────────────────── */}
        {attention && !enough.done && (
          <button
            onClick={() => openOverlay({ kind: 'coach', nodeId: attention.node.id, ask: true })}
            className="focus-ring mt-3 flex w-full items-center gap-3 rounded-3xl border border-line bg-surface px-5 py-4 text-left active:scale-[0.99]"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] leading-snug">{attention.headline}</span>
              <span className="mt-0.5 block text-[12.5px] text-faint">Skal vi finde ud af hvorfor?</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-faint" />
          </button>
        )}

        {/* ── Mental load, demoted to a line ──────────────────────────── */}
        <button
          onClick={() => openOverlay({ kind: 'energy' })}
          className="focus-ring mt-3 w-full rounded-3xl border border-line bg-surface px-5 py-4 text-left active:scale-[0.99]"
        >
          <span className="flex items-baseline justify-between">
            <span className="text-[13.5px]">
              {load.openLoops} ting din hjerne ikke behøver huske
            </span>
            <span className="text-[12.5px] text-faint">{load.percent}%</span>
          </span>
          <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-line">
            <motion.span
              className="block h-full rounded-full"
              style={{ background: load.percent < 35 ? 'rgb(var(--c-calm))' : load.percent < 70 ? 'rgb(var(--c-warm))' : 'rgb(var(--c-accent))' }}
              initial={{ width: 0 }}
              animate={{ width: `${load.percent}%` }}
              transition={{ type: 'spring', stiffness: 90, damping: 20 }}
            />
          </span>
          <span className="mt-2.5 flex items-center gap-2">
            <span className="flex gap-1" aria-hidden>
              {Array.from({ length: enough.goal }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${i < enough.closed ? 'bg-calm' : 'bg-line'}`}
                />
              ))}
            </span>
            <span className="text-[12px] text-faint">
              {closedToday === 0
                ? `Nok for i dag: ${enough.goal} ${enough.goal === 1 ? 'loop' : 'loops'}`
                : `${closedToday} af ${enough.goal}, nok for i dag`}
            </span>
          </span>
        </button>

        {/* ── Tools, one quiet row ────────────────────────────────────── */}
        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <Chip icon={<Plus size={16} />} label="Ud af hovedet" onClick={() => openOverlay({ kind: 'braindump' })} />
          <Chip icon={<Waves size={16} />} label="Scroll-stop" onClick={() => openOverlay({ kind: 'rescue' })} />
          <Chip
            icon={<NotebookPen size={16} />}
            label={notes.length ? `Hovedet (${notes.length})` : 'Hovedet'}
            onClick={() => openOverlay({ kind: 'notes' })}
          />
          <Chip icon={<Battery size={16} />} label={`${prefs.currentEnergy}%`} onClick={() => openOverlay({ kind: 'energy' })} />
        </div>

        {/* ── Saving up ───────────────────────────────────────────────── */}
        <button
          onClick={() => setScreen('rewards')}
          className="focus-ring mt-3 flex w-full items-center gap-4 rounded-3xl border border-line bg-surface p-4 text-left active:scale-[0.99]"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft">
            <Gift size={18} className="text-ink/70" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-medium">
              {goal ? `${availableXP} / ${goal.xpTarget} point` : `${availableXP} point · niveau ${level.level}`}
            </span>
            <span className="mt-0.5 block truncate text-[12px] text-faint">
              {goal ? `Gavekort på ${goal.amountDKK} kr.` : 'Sæt et mål, du sparer op til'}
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-faint" />
        </button>

        {/* ── Worlds ──────────────────────────────────────────────────── */}
        <div className="mt-8">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-faint">Dine verdener</p>
          <div className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-4">
            {worlds.map((w, i) => (
              <WorldBubble key={w.id} id={w.id} index={i} title={w.title} dark={dark} onClick={() => setFocus(w.id)} />
            ))}
          </div>
        </div>

        {parked.length > 0 && (
          <div className="mt-8">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-faint">Parkeret</p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              De her fylder ikke i hovedet lige nu. De kommer selv tilbage.
            </p>
            <div className="mt-3 space-y-2">
              {parked.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  onClick={() => openOverlay({ kind: 'node', nodeId: p.id })}
                  className="focus-ring flex w-full items-center justify-between rounded-3xl border border-line bg-surface px-4 py-3.5 text-left active:scale-[0.99]"
                >
                  <span className="min-w-0 flex-1 truncate text-[14.5px]">{p.title}</span>
                  <span className="ml-3 shrink-0 text-[12px] text-faint">
                    {p.parkedUntil ? relativeDay(isoDate(new Date(p.parkedUntil))) : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-10 text-center text-[12px] text-faint/80">Dine tanker bliver på din telefon.</p>
      </div>
    </div>
  )
}

function Chip({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="focus-ring flex min-h-[48px] shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-4 text-[13.5px] active:scale-[0.97]"
    >
      <span className="text-faint">{icon}</span>
      {label}
    </button>
  )
}

function WorldBubble({
  id,
  index,
  title,
  dark,
  onClick,
}: {
  id: string
  index: number
  title: string
  dark: boolean
  onClick: () => void
}) {
  const map = useStore((s) => s.map)
  const count = visibleChildren(map, id).length
  const tone = toneFor(id, index, ROOT_ID, dark)
  return (
    <button onClick={onClick} className="focus-ring flex w-[88px] flex-col items-center gap-2 active:scale-95 transition">
      <span
        className="grid h-[70px] w-[70px] place-items-center rounded-full"
        style={{
          background: `linear-gradient(150deg, ${tone.from} 0%, ${tone.to} 100%)`,
          color: tone.text,
          boxShadow: `0 1px 4px ${tone.shadow}, 0 12px 26px -14px ${tone.shadow}`,
        }}
      >
        <span className="text-[13px] font-medium opacity-70">{count || ''}</span>
      </span>
      <span className="text-center text-[12.5px] leading-tight">{title}</span>
    </button>
  )
}
