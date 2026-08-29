import { motion } from 'framer-motion'
import { Battery, Play, RefreshCw, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useStore, useFocus } from '@/store/useStore'
import { scoreLabel } from '@/lib/scoring'
import { cadenceLabel } from '@/lib/habits'
import { humanMinutes } from '@/lib/time'
import { calibratedMinutes } from '@/lib/calibration'
import { useCalibration } from '@/store/useStore'
import { whenLabel } from '@/lib/deadlines'
import { Button } from './ui/Button'
import type { EnergyLevel } from '@/db/types'

/**
 * "Hvad skal jeg gøre nu?"
 *
 * Shows ONE task, and now also says why that one. The reason is not decoration:
 * a ranking that cannot be interrogated is indistinguishable from a random
 * draw, and being handed one by an app is what makes a person stop trusting it
 * and start arguing with it instead of doing anything.
 *
 * Under the one task sits today's shortlist, which is three things and stays
 * three things all day. Under that, routines, in their own group, because a
 * loop that comes back tomorrow is not the same kind of object as a phone call
 * she has been avoiding for three weeks, and putting them in one list makes the
 * list look bottomless.
 */
export function WhatNow() {
  const focus = useFocus()
  const ensureFocus = useStore((s) => s.ensureFocus)
  const postpone = useStore((s) => s.postponeNode)
  const openOverlay = useStore((s) => s.openOverlay)
  const energy = useStore((s) => s.prefs.currentEnergy)
  const setEnergy = useStore((s) => s.setEnergy)
  const [showRest, setShowRest] = useState(false)
  const cal = useCalibration()

  useEffect(() => {
    void ensureFocus()
  }, [ensureFocus])

  const pick = focus.now
  const others = focus.shortlist.filter((t) => t.node.id !== pick?.node.id)

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

        {/*
          The sentence that was missing. Everything else on this card is a
          number; this is the only part she can disagree with, and being able
          to disagree is what makes the number worth anything.
        */}
        <p className="mx-auto mt-4 max-w-[19rem] text-[14px] leading-relaxed text-muted">{focus.why}</p>

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
      </motion.div>

      {others.length > 0 && (
        <div className="mt-6">
          <p className="px-1 text-[12px] uppercase tracking-[0.14em] text-faint">
            Og ellers i dag
          </p>
          <div className="mt-2.5 space-y-2">
            {others.map((t) => (
              <button
                key={t.node.id}
                onClick={() => openOverlay({ kind: 'start', nodeId: t.node.id })}
                className="focus-ring flex w-full items-center gap-3 rounded-xl2 border border-line bg-surface px-4 py-3.5 text-left active:scale-[0.99]"
              >
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
          <p className="mt-3 px-1 text-[12.5px] leading-relaxed text-faint">
            Tre ting. De bliver stående dagen ud, så listen ikke ser anderledes ud, hver gang du kigger.
          </p>
        </div>
      )}

      {focus.routines.length > 0 && (
        <div className="mt-6">
          <p className="px-1 text-[12px] uppercase tracking-[0.14em] text-faint">
            Vaner i dag
          </p>
          <div className="mt-2.5 space-y-2">
            {focus.routines.map((t) => (
              <button
                key={t.node.id}
                onClick={() => openOverlay({ kind: 'start', nodeId: t.node.id })}
                className="focus-ring flex w-full items-center gap-3 rounded-xl2 border border-line bg-surface/60 px-4 py-3 text-left active:scale-[0.99]"
              >
                <RotateCw size={14} className="shrink-0 text-faint" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px]">{t.node.title}</span>
                  <span className="block text-[12px] text-faint">
                    {cadenceLabel({ unit: t.node.repeat ?? 'day', every: t.node.repeatEvery ?? 1 })}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 px-1 text-[12.5px] leading-relaxed text-faint">
            De tæller ikke med i de tre. De kommer igen af sig selv, og der bliver ikke talt på dem, du
            springer over.
          </p>
        </div>
      )}

      {focus.rest.length > 0 && (
        <>
          <button
            onClick={() => setShowRest((v) => !v)}
            className="focus-ring mt-5 w-full py-3 text-[13.5px] text-faint"
          >
            {showRest ? 'Skjul resten igen' : `Resten ligger her (${focus.rest.length})`}
          </button>
          {showRest && (
            <div className="space-y-2">
              {focus.rest.slice(0, 25).map((t) => (
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
        </>
      )}
    </div>
  )
}
