import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Check, ChevronDown, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { parseBrainDump, type ParsedLoop } from '@/lib/brainDump'
import { WORLDS } from '@/db/seed'
import { useStore } from '@/store/useStore'
import { Button } from './ui/Button'
import { humanMinutes } from '@/lib/time'
import { haptic } from '@/lib/haptics'

/**
 * "Få det ud af hovedet".
 *
 * One text field. No project picker, no category, no deadline, no priority.
 * The user writes the thought; the app does the filing and only asks
 * "does this look right?" at the end.
 */

interface Props {
  onCommitted?: (count: number) => void
  footer?: ReactNode
  /** Called after the user confirms, so onboarding can move on. */
  autoFinish?: () => void
}

const PLACEHOLDER = `Skriv løs. Fx:

Jeg skal have styr på SOME og ringe til tandlægen, og jeg mangler også at købe vaskemiddel og poste på Instagram`

export function BrainDumpPanel({ onCommitted, footer, autoFinish }: Props) {
  const commit = useStore((s) => s.commitBrainDump)
  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState<ParsedLoop[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState<number | null>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const worlds = useMemo(() => WORLDS.map((w) => w.title), [])

  const analyse = () => {
    const result = parseBrainDump(raw)
    if (!result.length) return
    haptic('tap')
    setParsed(result)
  }

  const save = async () => {
    if (!parsed) return
    const n = await commit(raw, parsed)
    setSaved(n)
    setParsed(null)
    setRaw('')
    setEditing(false)
    onCommitted?.(n)
  }

  if (saved !== null) {
    return (
      <div className="flex h-full flex-col">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-1 flex-col items-center justify-center py-10 text-center"
        >
          <div className="grid h-20 w-20 place-items-center rounded-full bg-accent-soft">
            <Check size={30} className="text-ink/70" />
          </div>
          <p className="mt-6 text-[20px] font-semibold tracking-[-0.02em]">Ude af hovedet</p>
          <p className="mt-2 max-w-[17rem] text-[15px] leading-relaxed text-muted">
            {saved} {saved === 1 ? 'ting' : 'ting'} ligger nu i appen. Du behøver ikke huske dem mere.
          </p>
          <div className="mt-8 flex w-full max-w-[16rem] flex-col gap-2">
            <Button full variant="soft" onClick={() => setSaved(null)}>
              Skriv mere
            </Button>
            {autoFinish && (
              <Button full onClick={autoFinish}>
                Videre
              </Button>
            )}
          </div>
        </motion.div>
        {!autoFinish && footer}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <AnimatePresence mode="wait">
        {!parsed ? (
          <motion.div key="write" className="flex min-h-0 flex-1 flex-col" exit={{ opacity: 0 }}>
            <textarea
              ref={areaRef}
              autoFocus
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={PLACEHOLDER}
              className="min-h-[190px] flex-1 resize-none rounded-xl2 border border-line bg-surface p-5 text-[17px] leading-relaxed outline-none placeholder:text-faint/80 focus:border-ink/20"
            />
            <div className="pt-4">
              <Button full onClick={analyse} disabled={raw.trim().length < 2} className={raw.trim().length < 2 ? 'opacity-35' : ''}>
                <Sparkles size={17} className="mr-2 -mt-0.5 inline" />
                Sortér det for mig
              </Button>
              <p className="mt-3 text-center text-[12.5px] text-faint">
                Alt bliver på din telefon. Intet sendes nogen steder.
              </p>
            </div>
            {footer}
          </motion.div>
        ) : (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex items-baseline justify-between">
              <p className="text-[17px] font-semibold tracking-[-0.02em]">Ser det rigtigt ud?</p>
              <button
                onClick={() => setEditing((e) => !e)}
                className="focus-ring -my-2 -mr-2 flex min-h-[44px] min-w-[44px] items-center justify-end rounded-full px-3 text-[13.5px] text-muted"
              >
                <Pencil size={13} className="mr-1 -mt-0.5 inline" />
                {editing ? 'Færdig' : 'Ret'}
              </button>
            </div>

            <div className="mt-3 min-h-0 flex-1 space-y-2.5 overflow-y-auto no-scrollbar pb-2">
              {parsed.map((item, i) => (
                <ParsedRow
                  key={item.key}
                  item={item}
                  editing={editing}
                  worlds={worlds}
                  onChange={(next) => setParsed(parsed.map((p, j) => (j === i ? next : p)))}
                  onRemove={() => setParsed(parsed.filter((_, j) => j !== i))}
                />
              ))}
              {parsed.length === 0 && (
                <p className="py-8 text-center text-[15px] text-faint">Ikke noget tilbage. Gå tilbage og skriv igen.</p>
              )}
            </div>

            <div className="flex gap-2.5 pt-3">
              <Button variant="ghost" onClick={() => setParsed(null)} className="flex-1">
                Tilbage
              </Button>
              <Button onClick={save} disabled={!parsed.length} className="flex-[2]">
                Ja, perfekt <ArrowRight size={16} className="ml-1 -mt-0.5 inline" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ParsedRow({
  item,
  editing,
  worlds,
  onChange,
  onRemove,
}: {
  item: ParsedLoop
  editing: boolean
  worlds: string[]
  onChange: (next: ParsedLoop) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl2 border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border border-ink/25" />
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              value={item.title}
              onChange={(e) => onChange({ ...item, title: e.target.value })}
              className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-[15.5px] outline-none focus:border-ink/20"
            />
          ) : (
            <p className="text-[16px] font-medium leading-snug">{item.title}</p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-faint">
            <span>{item.path.join(' › ')}</span>
            <span className="opacity-40">·</span>
            <span>{humanMinutes(item.estimatedMinutes)}</span>
            {item.steps.length > 0 && (
              <>
                <span className="opacity-40">·</span>
                <button
                  onClick={() => setOpen((o) => !o)}
                  className="focus-ring -my-3 flex min-h-[44px] items-center rounded px-1 text-muted"
                >
                  {item.steps.length} steps
                  <ChevronDown size={12} className={`ml-0.5 inline transition ${open ? 'rotate-180' : ''}`} />
                </button>
              </>
            )}
          </div>

          {editing && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {worlds.map((w) => (
                <button
                  key={w}
                  onClick={() => onChange({ ...item, path: [w] })}
                  className={`focus-ring rounded-full border px-3 py-1.5 text-[12.5px] ${
                    item.path[0] === w ? 'border-ink/25 bg-accent-soft' : 'border-line'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          )}

          <AnimatePresence>
            {open && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-2 overflow-hidden space-y-1"
              >
                {item.steps.map((s) => (
                  <li key={s} className="flex gap-2 text-[13.5px] text-muted">
                    <span className="text-faint">○</span>
                    {s}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>

        {editing && (
          <button onClick={onRemove} aria-label="Fjern" className="focus-ring -mr-1 -mt-1 grid h-10 w-10 place-items-center rounded-full text-faint">
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
