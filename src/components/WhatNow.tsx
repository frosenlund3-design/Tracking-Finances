import { motion } from 'framer-motion'
import { Battery, Play, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useStore, useRanked } from '@/store/useStore'
import { scoreLabel } from '@/lib/scoring'
import { humanMinutes } from '@/lib/time'
import { calibratedMinutes } from '@/lib/calibration'
import { useCalibration } from '@/store/useStore'
import { whenLabel } from '@/lib/deadlines'
import { Button } from './ui/Button'
import type { EnergyLevel } from '@/db/types'

/**
 * "Hvad skal jeg gøre nu?"
 *
 * Shows ONE task. The ranked list exists underneath, but it is folded away —
 * the whole point is that she does not have to prioritise fifty things.
 *
 * The points shown are the same number the engine ranked on, so the advice is
 * transparent instead of magic.
 */
export function WhatNow() {
  const ranked = useRanked()
  const skipped = useStore((s) => s.skipped)
  const postpone = useStore((s) => s.postponeNode)
  const openOverlay = useStore((s) => s.openOverlay)
  const energy = useStore((s) => s.prefs.currentEnergy)
  const setEnergy = useStore((s) => s.setEnergy)
  const [showList, setShowList] = useState(false)
  const cal = useCalibration()

  const fresh = ranked.filter((t) => !skipped.includes(t.node.id))
  const pick = fresh[0] ?? ranked[0] ?? null

  if (!pick) {
    return (
      <div className="py-14 text-center">
        <p className="text-[19px] font-semibold tracking-[-0.02em]">Der er ikke noget at vælge imellem</p>
        <p className="mt-2.5 text-[15px] leading-relaxed text-muted">
          Alt er lukket eller parkeret. Det er faktisk en god ting.
        </p>
      </div>
    )
  }

  return (
    <div className="pb-6">
      <div className="flex items-center gap-2 pb-4">
        <Battery size={15} className="text-faint" />
        <span className="text-[13px] text-faint">Hvor meget har du i tanken?</span>
      </div>
      <div className="flex gap-2">
        {([10, 30, 60, 100] as EnergyLevel[]).map((e) => (
          <button
            key={e}
            onClick={() => void setEnergy(e)}
            className={`focus-ring min-h-[46px] flex-1 rounded-xl2 border text-[14.5px] transition ${
              energy === e ? 'border-ink/25 bg-accent-soft font-medium' : 'border-line bg-surface text-muted'
            }`}
          >
            {e}%
          </button>
        ))}
      </div>

      <motion.div
        key={pick.node.id}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 26 }}
        className="mt-6 rounded-xl3 border border-line bg-surface p-6 text-center shadow-soft"
      >
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-line bg-raised shadow-node">
          <span className="text-[12.5px] text-faint">
            {humanMinutes(calibratedMinutes(pick.node.estimatedMinutes, cal))}
          </span>
        </div>

        <h2 className="mx-auto mt-5 max-w-[17rem] text-[24px] font-semibold leading-tight tracking-[-0.025em]">
          {pick.node.title}
        </h2>

        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5 text-[12.5px] font-medium text-ink/75">
          {pick.score} point · {scoreLabel(pick.score)}
        </div>

        {pick.reasons.length > 0 && (
          <ul className="mt-4 space-y-1">
            {pick.reasons.map((r) => (
              <li key={r} className="text-[14px] text-muted">
                {r}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 space-y-2.5">
          <Button full onClick={() => openOverlay({ kind: 'start', nodeId: pick.node.id })}>
            <Play size={17} fill="currentColor" className="mr-2 -mt-0.5 inline" />
            Start nu
          </Button>
          <button
            onClick={() => void postpone(pick.node.id)}
            className="focus-ring min-h-[48px] w-full rounded-xl2 border border-line bg-raised text-[15px] text-muted active:scale-[0.99]"
          >
            <RefreshCw size={15} className="mr-2 -mt-0.5 inline" />
            Giv mig en anden
          </button>
        </div>

        <p className="mt-4 text-[12.5px] text-faint">Okay. Kun den her.</p>
      </motion.div>

      <button
        onClick={() => setShowList((v) => !v)}
        className="focus-ring mt-5 w-full py-3 text-[13.5px] text-faint"
      >
        {showList ? 'Skjul listen igen' : `Vis alle ${ranked.length} muligheder`}
      </button>

      {showList && (
        <div className="space-y-2">
          {ranked.slice(0, 25).map((t) => (
            <button
              key={t.node.id}
              onClick={() => openOverlay({ kind: 'start', nodeId: t.node.id })}
              className="focus-ring flex w-full items-center gap-3 rounded-xl2 border border-line bg-surface px-4 py-3.5 text-left active:scale-[0.99]"
            >
              <span className="w-11 shrink-0 text-[12.5px] font-medium text-faint">{t.score}p</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{t.node.title}</span>
                <span className="block text-[12px] text-faint">
                  {humanMinutes(calibratedMinutes(t.node.estimatedMinutes, cal))}
                  {t.node.dueAt ? ` · ${whenLabel(t.node)}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
