import { motion } from 'framer-motion'
import { NotebookPen, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { MicButton } from './ui/MicButton'

/**
 * "Hovedet", the things she wrote down that are not tasks.
 *
 * Worries, context, half-formed thoughts, facts worth keeping. They live here
 * precisely so they do not live in the loop tree: a note adds nothing to the
 * mental load number and never appears as something to start, because you
 * cannot finish a worry by doing it.
 *
 * Any note can still become a task later, when it turns out there was an
 * action hiding in it.
 */
export function Notes() {
  const notes = useStore((s) => s.notes)
  const map = useStore((s) => s.map)
  const addNote = useStore((s) => s.addNote)
  const deleteNote = useStore((s) => s.deleteNote)
  const addNode = useStore((s) => s.addNode)
  const openOverlay = useStore((s) => s.openOverlay)
  const [draft, setDraft] = useState('')

  const save = async () => {
    if (!draft.trim()) return
    await addNote(draft)
    setDraft('')
  }

  return (
    <div className="pb-6">
      <p className="text-[14.5px] leading-relaxed text-muted">
        Ting du bare vil have ud af hovedet, uden at de bliver til opgaver. De tæller ikke med i din
        mental load.
      </p>

      <div className="mt-4 flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Skriv en tanke…"
          className="min-h-[64px] flex-1 resize-none rounded-xl2 border border-line bg-surface p-3.5 text-[16px] leading-relaxed outline-none placeholder:text-faint focus:border-ink/20"
        />
        <MicButton onText={setDraft} existing={draft} label="Sig noten i stedet" />
      </div>
      <button
        onClick={save}
        disabled={!draft.trim()}
        className={`focus-ring mt-2 min-h-[48px] w-full rounded-xl2 bg-ink text-[15px] font-medium text-canvas active:scale-[0.99] ${
          draft.trim() ? '' : 'opacity-35'
        }`}
      >
        Gem som note
      </button>

      <div className="mt-6 space-y-2">
        {notes.length === 0 && (
          <p className="py-6 text-center text-[14.5px] text-faint">Ingen noter endnu.</p>
        )}
        {notes.map((n) => {
          const host = n.nodeId ? map[n.nodeId] : null
          return (
            <motion.div
              key={n.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl2 border border-line bg-surface p-4"
            >
              <div className="flex items-start gap-3">
                <NotebookPen size={15} className="mt-1 shrink-0 text-faint" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-snug">{n.text}</p>
                  {host && (
                    <button
                      onClick={() => openOverlay({ kind: 'node', nodeId: host.id })}
                      className="focus-ring mt-1 flex min-h-[44px] items-center text-[12.5px] text-faint"
                    >
                      Hører til: {host.title}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => void deleteNote(n.id)}
                  aria-label="Slet note"
                  className="focus-ring -mr-1 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-faint"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <button
                onClick={async () => {
                  const node = await addNode({
                    title: n.text.length > 60 ? `${n.text.slice(0, 57)}…` : n.text,
                    parentId: host?.parentId ?? host?.id ?? 'root',
                  })
                  await deleteNote(n.id)
                  openOverlay({ kind: 'node', nodeId: node.id })
                }}
                className="focus-ring mt-2 flex min-h-[44px] items-center gap-1.5 text-[13px] text-muted"
              >
                <Plus size={13} />
                Der gemmer sig en opgave i den
              </button>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
