import { AnimatePresence, motion } from 'framer-motion'
import {
  AlarmClock, ArrowDownToLine, Banknote, CalendarClock, Check, ChevronRight, CircleDashed, Clock,
  Play, Plus, Split, Trash2, UserPlus, X,
} from 'lucide-react'
import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { humanMinutes, parkPresets, PART_LABELS, PARTS, relativeDay, isoDate } from '@/lib/time'
import { whenLabel } from '@/lib/deadlines'
import { calibratedMinutes } from '@/lib/calibration'
import { useCalibration } from '@/store/useStore'
import { canFocus, visibleChildren } from '@/lib/nodes'
import { haptic } from '@/lib/haptics'

/**
 * Everything you can do to one loop.
 *
 * Section 19 of the brief made flesh: done is not the only way to close a
 * loop. Parking, dropping and delegating are first-class, equally sized
 * choices — deciding "this isn't important" also gives you your head back.
 */
export function NodeSheet({ nodeId }: { nodeId: string }) {
  const node = useStore((s) => s.map[nodeId])
  const map = useStore((s) => s.map)
  const complete = useStore((s) => s.completeNode)
  const drop = useStore((s) => s.dropNode)
  const delegate = useStore((s) => s.delegateNode)
  const park = useStore((s) => s.parkNode)
  const unpark = useStore((s) => s.unparkNode)
  const breakDown = useStore((s) => s.breakDown)
  const toggleStep = useStore((s) => s.toggleStep)
  const rename = useStore((s) => s.renameNode)
  const remove = useStore((s) => s.deleteNode)
  const schedule = useStore((s) => s.schedule)
  const setDue = useStore((s) => s.setDue)
  const openOverlay = useStore((s) => s.openOverlay)
  const setFocus = useStore((s) => s.setFocus)
  const focusId = useStore((s) => s.focusId)
  const close = useStore((s) => s.closeOverlay)
  const goodEnoughMode = useStore((s) => s.prefs.goodEnoughMode)

  const [showPark, setShowPark] = useState(false)
  const [showTime, setShowTime] = useState(false)
  const [showValue, setShowValue] = useState(false)
  const [value, setValue] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const cal = useCalibration()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [title, setTitle] = useState(node?.title ?? '')
  const [editing, setEditing] = useState(false)

  if (!node) return null

  const kids = visibleChildren(map, node.id)
  const isRoot = node.parentId === null
  const parked = node.status === 'parked'

  return (
    <div className="pb-6">
      {editing ? (
        <div className="flex gap-2">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-h-[50px] flex-1 rounded-xl2 border border-line bg-raised px-4 text-[17px] outline-none focus:border-ink/20"
          />
          <button
            onClick={async () => {
              if (title.trim()) await rename(node.id, title)
              setEditing(false)
            }}
            className="focus-ring grid h-[50px] w-[50px] place-items-center rounded-xl2 bg-ink text-canvas"
            aria-label="Gem"
          >
            <Check size={18} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            setTitle(node.title)
            setEditing(true)
          }}
          className="focus-ring flex min-h-[44px] w-full items-center text-left"
        >
          <h2 className="text-[23px] font-semibold leading-tight tracking-[-0.025em]">{node.title}</h2>
        </button>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-faint">
        {!node.isArea && <span>{humanMinutes(calibratedMinutes(node.estimatedMinutes, cal))}</span>}
        {kids.length > 0 && (
          <>
            {!node.isArea && <span className="opacity-40">·</span>}
            <span>{kids.length} indeni</span>
          </>
        )}
        {node.scheduledDate && (
          <>
            <span className="opacity-40">·</span>
            <span>
              {relativeDay(node.scheduledDate)}
              {node.scheduledPart ? `, ${PART_LABELS[node.scheduledPart].toLowerCase()}` : ''}
            </span>
          </>
        )}
        {parked && (
          <>
            <span className="opacity-40">·</span>
            <span>Parkeret til {node.parkedUntil ? relativeDay(isoDate(new Date(node.parkedUntil))) : ''}</span>
          </>
        )}
      </div>

      {node.dueAt && (
        <p
          className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium ${
            node.dueKind === 'appointment' ? 'bg-warm/15 text-warm' : 'bg-accent-soft text-ink/75'
          }`}
        >
          {node.dueKind === 'appointment' ? <CalendarClock size={13} /> : <AlarmClock size={13} />}
          {whenLabel(node)}
        </p>
      )}

      {goodEnoughMode && node.goodEnoughNote && (
        <p className="mt-4 rounded-xl2 bg-accent-soft/60 px-4 py-3 text-[14px] leading-relaxed text-ink/80">
          Godt nok: {node.goodEnoughNote}
        </p>
      )}

      {/* Primary actions */}
      {!isRoot && (
        <div className="mt-5 space-y-2.5">
          {!node.isArea && kids.length === 0 && (
            <button
              onClick={() => openOverlay({ kind: 'start', nodeId: node.id })}
              className="focus-ring flex min-h-[54px] w-full items-center justify-center gap-2 rounded-xl2 bg-ink text-[16px] font-medium text-canvas active:scale-[0.98]"
            >
              <Play size={17} fill="currentColor" />
              Start
            </button>
          )}
          <button
            onClick={async () => {
              await complete(node.id, 'manual')
              close()
            }}
            className="focus-ring flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl2 bg-accent-soft text-[16px] font-medium active:scale-[0.98]"
          >
            <Check size={18} />
            Færdig
          </button>
        </div>
      )}

      {/* Steps */}
      {node.steps.length > 0 && (
        <div className="mt-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Småting</p>
          <div className="mt-3 space-y-1.5">
            {node.steps.map((s) => (
              <button
                key={s.id}
                onClick={() => void toggleStep(node.id, s.id)}
                className="focus-ring flex w-full items-center gap-3 rounded-xl2 border border-line bg-surface px-4 py-3 text-left active:scale-[0.99]"
              >
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                    s.done ? 'border-calm bg-calm/20' : 'border-line'
                  }`}
                >
                  {s.done && <Check size={12} className="text-calm" />}
                </span>
                <span className={`text-[15px] ${s.done ? 'text-faint line-through' : ''}`}>{s.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Children */}
      {kids.length > 0 && (
        <div className="mt-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Indeni</p>
          <div className="mt-3 space-y-1.5">
            {kids.slice(0, 8).map((k) => (
              <button
                key={k.id}
                onClick={() => {
                  // One level per step: if the child is two levels away from
                  // where she is standing, walk into this circle first — the
                  // one she tapped is then right in front of her.
                  setFocus(canFocus(map, focusId, k.id) ? k.id : node.id)
                  close()
                }}
                className="focus-ring flex w-full items-center justify-between rounded-xl2 border border-line bg-surface px-4 py-3.5 text-left active:scale-[0.99]"
              >
                <span className="min-w-0 flex-1 truncate text-[15px]">{k.title}</span>
                <ChevronRight size={16} className="ml-2 shrink-0 text-faint" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Secondary actions */}
      <div className="mt-6 grid grid-cols-2 gap-2">
        <SmallAction
          icon={<Plus size={16} />}
          label="Tilføj indeni"
          onClick={() => openOverlay({ kind: 'quickadd', parentId: node.id })}
        />
        {!node.isArea && (
          <SmallAction
            icon={<Split size={16} />}
            label="Del den op"
            onClick={async () => {
              const ok = await breakDown(node.id)
              if (!ok) haptic('soft')
            }}
          />
        )}
        {!isRoot && (
          <SmallAction
            icon={<CircleDashed size={16} />}
            label={parked ? 'Hent tilbage' : 'Parkér'}
            onClick={() => (parked ? void unpark(node.id) : setShowPark((v) => !v))}
          />
        )}
        {!isRoot && (
          <SmallAction
            icon={<Clock size={16} />}
            label={node.dueAt ? 'Ret tidspunkt' : 'Har den en rigtig tid?'}
            onClick={() => {
              if (node.dueAt) {
                const d = new Date(node.dueAt)
                setDueDate(isoDate(d))
                setDueTime(node.dueHasTime ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '')
              }
              setShowTime((v) => !v)
            }}
          />
        )}
        {!isRoot && !node.isArea && (
          <SmallAction
            icon={<Banknote size={16} />}
            label={node.valueDKK ? `${node.valueDKK} kr.` : 'Er den penge værd?'}
            onClick={() => {
              setValue(node.valueDKK ? String(node.valueDKK) : '')
              setShowValue((v) => !v)
            }}
          />
        )}
        {!isRoot && (
          <SmallAction
            icon={<X size={16} />}
            label="Ikke vigtig alligevel"
            onClick={async () => {
              await drop(node.id)
              close()
            }}
          />
        )}
        {!isRoot && (
          <SmallAction
            icon={<UserPlus size={16} />}
            label="En anden gør det"
            onClick={async () => {
              await delegate(node.id)
              close()
            }}
          />
        )}
      </div>

      <AnimatePresence>
        {showPark && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-xl2 border border-line bg-surface p-4">
              <p className="text-[14px] text-muted">Hvornår skal den tilbage i hovedet?</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {parkPresets().map((p) => (
                  <button
                    key={p.label}
                    onClick={async () => {
                      await park(node.id, p.until)
                      close()
                    }}
                    className="focus-ring min-h-[44px] rounded-full border border-line bg-raised px-4 text-[14px] active:scale-95"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[12.5px] leading-relaxed text-faint">
                Perfekt. Så behøver du ikke holde den i hovedet indtil da.
              </p>
            </div>
          </motion.div>
        )}

        {showValue && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-xl2 border border-line bg-surface p-4">
              <p className="text-[14px] text-muted">
                Hvad er den her værd, når den er lukket? Fx en kundeopgave.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                  placeholder="kr."
                  className="min-h-[48px] flex-1 rounded-xl2 border border-line bg-raised px-4 text-[16px] outline-none focus:border-ink/20"
                />
                <button
                  onClick={async () => {
                    await useStore.getState().updateNode(node.id, {
                      valueDKK: value ? Number(value) : undefined,
                    })
                    setShowValue(false)
                  }}
                  className="focus-ring min-h-[48px] rounded-xl2 bg-ink px-5 text-[15px] font-medium text-canvas active:scale-[0.98]"
                >
                  Gem
                </button>
              </div>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-faint">
                Det tæller med i statistikken inde i indstillinger. Helt frivilligt.
              </p>
            </div>
          </motion.div>
        )}

        {showTime && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-xl2 border border-line bg-surface p-4">
              <p className="text-[14px] leading-relaxed text-muted">
                Kun hvis den har en <strong className="font-medium text-ink">rigtig</strong> tid — en
                lægetid, en eksamen, en frist. De fleste ting har ikke en, og så er det bedre at lade
                være.
              </p>

              <div className="mt-3.5 flex gap-2">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="min-h-[50px] flex-1 rounded-xl2 border border-line bg-raised px-3.5 text-[15px] outline-none focus:border-ink/20"
                  aria-label="Dato"
                />
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="min-h-[50px] w-[112px] rounded-xl2 border border-line bg-raised px-3.5 text-[15px] outline-none focus:border-ink/20"
                  aria-label="Klokkeslæt"
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={async () => {
                    await setDue(node.id, dueDate, dueTime, 'appointment')
                    setShowTime(false)
                  }}
                  disabled={!dueDate}
                  className={`focus-ring min-h-[52px] rounded-xl2 border px-3 text-[14px] leading-tight active:scale-[0.98] ${
                    dueDate ? 'border-line bg-raised' : 'border-line/60 opacity-40'
                  } ${node.dueKind === 'appointment' ? 'border-ink/25 bg-accent-soft' : ''}`}
                >
                  Fast tid
                  <span className="mt-0.5 block text-[11.5px] text-faint">Lægetid, eksamen</span>
                </button>
                <button
                  onClick={async () => {
                    await setDue(node.id, dueDate, dueTime, 'deadline')
                    setShowTime(false)
                  }}
                  disabled={!dueDate}
                  className={`focus-ring min-h-[52px] rounded-xl2 border px-3 text-[14px] leading-tight active:scale-[0.98] ${
                    dueDate ? 'border-line bg-raised' : 'border-line/60 opacity-40'
                  } ${node.dueKind === 'deadline' ? 'border-ink/25 bg-accent-soft' : ''}`}
                >
                  Frist
                  <span className="mt-0.5 block text-[11.5px] text-faint">Skal være klar inden</span>
                </button>
              </div>

              <p className="mt-3 text-[12px] leading-relaxed text-faint">
                En fast tid bliver aldrig foreslået som "start nu" — den vises bare, når dagen kommer.
                En frist rykker op i rækkefølgen, jo tættere den kommer.
              </p>

              {node.dueAt && (
                <button
                  onClick={() => void useStore.getState().updateNode(node.id, { dueAt: undefined, dueKind: undefined, dueHasTime: undefined, urgency: 'none' })}
                  className="focus-ring mt-2 flex min-h-[44px] items-center text-[13px] text-faint"
                >
                  Fjern tidspunktet igen
                </button>
              )}

              <div className="mt-4 border-t border-line pt-3">
                <p className="text-[12.5px] text-faint">Eller læg den løst på en dag, uden krav:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[0, 1, 2, 7].map((d) => {
                    const date = isoDate(new Date(Date.now() + d * 86_400_000))
                    return (
                      <button
                        key={d}
                        onClick={() => void schedule(node.id, date, node.scheduledPart)}
                        className={`focus-ring min-h-[44px] rounded-full border px-4 text-[13.5px] active:scale-95 ${
                          node.scheduledDate === date ? 'border-ink/25 bg-accent-soft' : 'border-line bg-raised'
                        }`}
                      >
                        {relativeDay(date)}
                      </button>
                    )
                  })}
                  {PARTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => void schedule(node.id, node.scheduledDate ?? isoDate(new Date()), p)}
                      className={`focus-ring min-h-[44px] rounded-full border px-4 text-[13.5px] active:scale-95 ${
                        node.scheduledPart === p ? 'border-ink/25 bg-accent-soft' : 'border-line bg-raised'
                      }`}
                    >
                      {PART_LABELS[p]}
                    </button>
                  ))}
                </div>
                {node.scheduledDate && (
                  <button
                    onClick={() => void schedule(node.id, undefined, undefined)}
                    className="focus-ring mt-2 flex min-h-[44px] items-center text-[13px] text-faint"
                  >
                    Fjern dagen igen
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      {!isRoot && (
        <div className="mt-8 border-t border-line pt-4">
          {confirmDelete ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] text-muted">Slet helt? Det kan ikke fortrydes.</span>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="focus-ring min-h-[44px] rounded-xl2 border border-line px-4 text-[14px]">
                  Nej
                </button>
                <button
                  onClick={async () => {
                    await remove(node.id)
                  }}
                  className="focus-ring min-h-[44px] rounded-xl2 bg-ink px-4 text-[14px] text-canvas"
                >
                  Slet
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="focus-ring -my-2 flex min-h-[44px] items-center gap-2 text-[13.5px] text-faint"
            >
              <Trash2 size={14} />
              Slet
            </button>
          )}
        </div>
      )}

      {node.avoidanceCount >= 2 && (
        <div className="mt-6 rounded-xl2 bg-accent-soft/50 p-4">
          <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink/70">
            <ArrowDownToLine size={15} className="mt-0.5 shrink-0 text-ink/50" />
            Den her bliver tit udsat. Det er ikke en anklage — skal jeg gøre den nemmere?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={async () => {
                await breakDown(node.id)
              }}
              className="focus-ring min-h-[44px] rounded-full border border-line bg-raised px-4 text-[13.5px] active:scale-95"
            >
              Gør første skridt mindre
            </button>
            <button
              onClick={() => openOverlay({ kind: 'bodydouble', nodeId: node.id })}
              className="focus-ring min-h-[44px] rounded-full border border-line bg-raised px-4 text-[13.5px] active:scale-95"
            >
              Bliv hos mig imens
            </button>
            <button
              onClick={() => openOverlay({ kind: 'coach', nodeId: node.id })}
              className="focus-ring min-h-[44px] rounded-full border border-line bg-raised px-4 text-[13.5px] active:scale-95"
            >
              Snak om den
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SmallAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="focus-ring flex min-h-[62px] items-center gap-2.5 rounded-xl2 border border-line bg-surface px-4 text-left active:scale-[0.98]"
    >
      <span className="shrink-0 text-faint">{icon}</span>
      <span className="text-[13.5px] leading-tight">{label}</span>
    </button>
  )
}
