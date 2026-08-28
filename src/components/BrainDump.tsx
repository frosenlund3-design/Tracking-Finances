import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, ArrowRight, Check, ChevronDown, ListTree, NotebookPen, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { CERTAIN, parseBrainDump, type ParsedLoop } from '@/lib/brainDump'
import { DEFAULT_GRANULARITY, GRANULARITIES, GRANULARITY_LABELS, decompose, type Granularity } from '@/lib/decompose'
import { WORLDS } from '@/db/seed'
import { useStore } from '@/store/useStore'
import { Button } from './ui/Button'
import { humanMinutes } from '@/lib/time'
import { haptic } from '@/lib/haptics'
import { MicButton } from './ui/MicButton'

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
  const [granularity, setGranularity] = useState<Granularity>(DEFAULT_GRANULARITY)
  const [saved, setSaved] = useState<number | null>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const worlds = useMemo(() => WORLDS.map((w) => w.title), [])

  const analyse = (g: Granularity = granularity) => {
    const result = parseBrainDump(raw, { granularity: g })
    if (!result.length) return
    haptic('tap')
    setParsed(result)
  }

  /** Flipping a row between task and note, and re-splitting to a new depth. */
  const setKind = (index: number, kind: ParsedLoop['kind']) => {
    if (!parsed) return
    setParsed(
      parsed.map((item, i) => {
        if (i !== index) return item
        if (kind === 'task') {
          const breakdown = decompose(item.title, { granularity })
          return { ...item, kind, confidence: 1, steps: breakdown?.steps ?? [], attachTo: undefined }
        }
        return { ...item, kind, confidence: 1, steps: [] }
      }),
    )
  }

  const changeGranularity = (g: Granularity) => {
    setGranularity(g)
    if (!parsed) return
    setParsed(
      parsed.map((item) =>
        item.kind === 'task'
          ? { ...item, steps: decompose(item.title, { granularity: g })?.steps ?? [] }
          : item,
      ),
    )
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
            <div className="relative flex min-h-0 flex-1 flex-col">
              <textarea
                ref={areaRef}
                autoFocus
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={PLACEHOLDER}
                className="min-h-[190px] flex-1 resize-none rounded-xl2 border border-line bg-surface p-5 pb-[72px] text-[17px] leading-relaxed outline-none placeholder:text-faint/80 focus:border-ink/20"
              />
              <div className="absolute bottom-3.5 right-3.5">
                <MicButton onText={setRaw} existing={raw} size="lg" label="Sig det i stedet for at skrive" />
              </div>
            </div>
            <div className="pt-4">
              <Button full onClick={() => analyse()} disabled={raw.trim().length < 2} className={raw.trim().length < 2 ? 'opacity-35' : ''}>
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

            <p className="mt-1 text-[12.5px] leading-relaxed text-faint">
              {parsed.filter((p) => p.kind === 'task').length} opgaver
              {parsed.some((p) => p.kind === 'note') &&
                ` · ${parsed.filter((p) => p.kind === 'note').length} gemmes som noter, ikke som opgaver`}
            </p>

            {parsed.some((p) => p.confidence < CERTAIN) && (
              <p className="mt-2 flex items-start gap-2 rounded-xl2 bg-warm/12 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink/75">
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-warm" />
                Jeg er i tvivl om dem med en streg. Tjek lige om de skal være opgaver eller noter —
                ét tryk skifter.
              </p>
            )}

            <div className="mt-3 rounded-xl2 border border-line bg-surface p-3.5">
              <p className="flex items-center gap-2 text-[12.5px] text-muted">
                <ListTree size={14} className="text-faint" />
                Hvor småt skal det deles op?
              </p>
              <div className="mt-2.5 flex gap-1.5 overflow-x-auto no-scrollbar">
                {GRANULARITIES.map((g) => (
                  <button
                    key={g}
                    onClick={() => changeGranularity(g)}
                    className={`focus-ring min-h-[44px] shrink-0 rounded-full border px-3.5 text-[13px] active:scale-95 ${
                      granularity === g ? 'border-ink/25 bg-accent-soft font-medium' : 'border-line bg-raised text-muted'
                    }`}
                  >
                    {GRANULARITY_LABELS[g]}
                  </button>
                ))}
              </div>
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
                  onKind={(kind) => setKind(i, kind)}
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
  onKind,
}: {
  item: ParsedLoop
  editing: boolean
  worlds: string[]
  onChange: (next: ParsedLoop) => void
  onRemove: () => void
  onKind: (kind: ParsedLoop['kind']) => void
}) {
  const [open, setOpen] = useState(false)

  if (item.kind === 'note') {
    return (
      <div className="rounded-xl2 border border-line bg-canvas p-4">
        <div className="flex items-start gap-3">
          <NotebookPen size={15} className="mt-1 shrink-0 text-faint" />
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] leading-snug text-muted">{item.title}</p>
            <p className="mt-1.5 text-[12px] text-faint">
              Gemmes som note{item.attachTo !== undefined ? ' på opgaven ovenfor' : ''} — ikke som en
              opgave, så den fylder ikke i din mental load.
            </p>
            <button
              onClick={() => onKind('task')}
              className="focus-ring mt-2 flex min-h-[40px] items-center gap-1.5 text-[13px] font-medium text-muted"
            >
              Nej — det er en opgave
            </button>
          </div>
          {editing && (
            <button
              onClick={onRemove}
              aria-label="Fjern"
              className="focus-ring -mr-1 -mt-1 grid h-10 w-10 place-items-center rounded-full text-faint"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    )
  }

  const unsure = item.confidence < CERTAIN

  return (
    <div
      className={`rounded-xl2 border bg-surface p-4 ${unsure ? 'border-warm/60' : 'border-line'}`}
    >
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

          {item.aside && <p className="mt-1 text-[13px] leading-snug text-muted">{item.aside}</p>}

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

          <button
            onClick={() => onKind('note')}
            className="focus-ring mt-2 flex min-h-[40px] items-center gap-1.5 text-[13px] text-faint"
          >
            <NotebookPen size={13} />
            Det er ikke en opgave — gem som note
          </button>

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
