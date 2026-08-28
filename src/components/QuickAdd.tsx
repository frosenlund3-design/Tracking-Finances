import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { decompose } from '@/lib/decompose'
import { Button } from './ui/Button'
import { pathOf } from '@/lib/nodes'

/** One field, one button. The breakdown preview appears as she types. */
export function QuickAdd({ parentId }: { parentId: string }) {
  const addNode = useStore((s) => s.addNode)
  const map = useStore((s) => s.map)
  const close = useStore((s) => s.closeOverlay)
  const [title, setTitle] = useState('')

  const preview = title.trim().length > 2 ? decompose(title) : null
  const where = pathOf(map, parentId)
    .map((n) => n.title)
    .join(' › ')

  return (
    <div className="pb-4">
      <p className="text-[12.5px] text-faint">Lægges i {where}</p>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === 'Enter' && title.trim()) {
            await addNode({ title, parentId })
            close()
          }
        }}
        placeholder="Hvad er det?"
        className="mt-3 min-h-[56px] w-full rounded-xl2 border border-line bg-surface px-4 text-[17px] outline-none placeholder:text-faint focus:border-ink/20"
      />

      {preview && (
        <div className="mt-4 rounded-xl2 border border-line bg-surface p-4">
          <p className="flex items-center gap-2 text-[12.5px] text-faint">
            <Sparkles size={13} />
            Jeg deler den automatisk op i:
          </p>
          <ul className="mt-2.5 space-y-1">
            {preview.steps.map((s) => (
              <li key={s} className="flex gap-2 text-[14px] text-muted">
                <span className="text-faint">○</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5">
        <Button
          full
          disabled={!title.trim()}
          className={title.trim() ? '' : 'opacity-35'}
          onClick={async () => {
            await addNode({ title, parentId })
            close()
          }}
        >
          Læg den ind
        </Button>
      </div>
    </div>
  )
}
