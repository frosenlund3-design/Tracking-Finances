import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { ChevronLeft, Info } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { areaLabel, humanHours, kr, loadStats, partLabel, type Stats as StatsData } from '@/lib/stats'

/**
 * "Det du har flyttet".
 *
 * Deliberately tucked away behind Settings. A number on the home screen turns
 * into a target, and a target turns into pressure — which is the one thing
 * this app is not allowed to add. Down here it does the other job: on a bad
 * day, evidence that the thing has actually been working.
 *
 * Every figure is either counted from real events or clearly marked as an
 * estimate built on a rate she set herself. The app never invents what her
 * work is worth.
 */
export function Stats() {
  const prefs = useStore((s) => s.prefs)
  const savePrefs = useStore((s) => s.savePrefs)
  const setScreen = useStore((s) => s.setScreen)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [rate, setRate] = useState(String(prefs.hourlyRateDKK ?? ''))

  useEffect(() => {
    void loadStats(prefs).then(setStats)
  }, [prefs])

  const money = stats ? stats.earnedExact + stats.earnedEstimated : 0

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-32">
      <div className="px-5 pt-safe">
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => setScreen('settings')}
            aria-label="Tilbage"
            className="focus-ring -ml-2 grid h-11 w-11 place-items-center rounded-full text-faint active:scale-95"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-[22px] font-semibold tracking-[-0.03em]">Det du har flyttet</h1>
        </div>

        {!stats ? (
          <p className="mt-10 text-center text-[14px] text-faint">Regner…</p>
        ) : stats.closed === 0 ? (
          <p className="mt-10 text-center text-[15px] leading-relaxed text-muted">
            Der er ikke noget at vise endnu. Luk et loop, så begynder det at samle sig her.
          </p>
        ) : (
          <>
            {/* Money — only ever from numbers she gave the app. */}
            {money > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 rounded-[26px] border border-line bg-surface p-6"
              >
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-faint">
                  Det har givet dig
                </p>
                <p className="mt-2.5 text-[36px] font-semibold leading-none tracking-[-0.035em]">
                  {kr(money)}
                </p>
                <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                  {stats.earnedExact > 0 && (
                    <>
                      {kr(stats.earnedExact)} fra opgaver, du selv har sat en værdi på.
                      {stats.earnedEstimated > 0 && ' '}
                    </>
                  )}
                  {stats.earnedEstimated > 0 && (
                    <>Resten er et skøn ud fra din timepris på lukket arbejde.</>
                  )}
                </p>
              </motion.div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Tile big value={String(stats.closed)} label="loops lukket i alt" />
              <Tile big value={humanHours(stats.minutesClosed)} label="taget ud af hovedet" />
              {stats.avoidedClosed > 0 && (
                <Tile
                  value={String(stats.avoidedClosed)}
                  label="ting du havde skubbet — og alligevel klarede"
                />
              )}
              <Tile value={String(stats.starts)} label="gange du er kommet i gang" />
              {stats.dropped > 0 && (
                <Tile value={String(stats.dropped)} label="ting du besluttede ikke var vigtige" />
              )}
              {stats.brainDumps > 0 && (
                <Tile value={String(stats.brainDumps)} label="gange du har tømt hovedet" />
              )}
              <Tile value={String(stats.activeDays)} label="dage hvor du lukkede noget" />
              {stats.claimedDKK > 0 && (
                <Tile value={kr(stats.claimedDKK)} label="gavekort du har sparet op til" />
              )}
            </div>

            {stats.bestPart && (
              <div className="mt-4 rounded-[26px] border border-line bg-surface p-5">
                <p className="text-[14.5px]">
                  Du lukker flest loops <strong className="font-semibold">{partLabel(stats.bestPart).toLowerCase()}</strong>.
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                  Ikke noget du skal rette dig efter — men det er værd at vide, hvornår det plejer at
                  være nemmest.
                </p>
              </div>
            )}

            {stats.byArea.length > 1 && (
              <div className="mt-4 rounded-[26px] border border-line bg-surface p-5">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-faint">
                  Hvor det er gået
                </p>
                <div className="mt-3.5 space-y-2.5">
                  {stats.byArea.slice(0, 5).map((a) => (
                    <div key={a.area} className="flex items-center gap-3">
                      <span className="w-[104px] shrink-0 text-[13.5px]">{areaLabel(a.area)}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${(a.count / stats.byArea[0].count) * 100}%` }}
                        />
                      </span>
                      <span className="w-6 shrink-0 text-right text-[12.5px] text-faint">{a.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* The rate, and the honest note about what it can and cannot mean. */}
        <div className="mt-5 rounded-[26px] border border-line bg-surface p-5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-faint">
            Hvad er din time værd?
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
            Sætter du et tal her, kan Loops anslå hvad dine lukkede arbejdsopgaver har været værd.
            Helt frivilligt — og du kan sætte et præcist beløb på den enkelte opgave i stedet.
          </p>
          <div className="mt-3.5 flex gap-2">
            <input
              value={rate}
              onChange={(e) => setRate(e.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              placeholder="fx 450"
              className="min-h-[50px] flex-1 rounded-xl2 border border-line bg-raised px-4 text-[16px] outline-none placeholder:text-faint focus:border-ink/20"
            />
            <button
              onClick={() => void savePrefs({ hourlyRateDKK: rate ? Number(rate) : undefined })}
              className="focus-ring min-h-[50px] rounded-xl2 bg-ink px-5 text-[15px] font-medium text-canvas active:scale-[0.98]"
            >
              Gem
            </button>
          </div>
          <p className="mt-2.5 text-[12px] text-faint">kr. i timen</p>
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-xl2 bg-canvas p-4">
          <Info size={14} className="mt-0.5 shrink-0 text-faint" />
          <p className="text-[12px] leading-relaxed text-faint">
            Beløb er kun det, du selv har fortalt appen — enten en værdi på en opgave eller din egen
            timepris. Loops ved ikke hvad dit arbejde koster, og gætter ikke.
          </p>
        </div>

        <p className="mt-8 text-center text-[12px] leading-relaxed text-faint/80">
          De her tal ligger med vilje herinde og ikke på forsiden. Et tal på forsiden bliver til et
          mål, og et mål bliver til pres.
        </p>
      </div>
    </div>
  )
}

function Tile({ value, label, big }: { value: string; label: string; big?: boolean }) {
  return (
    <div className="rounded-[26px] border border-line bg-surface p-5">
      <p className={`font-semibold tracking-[-0.03em] ${big ? 'text-[26px]' : 'text-[22px]'} leading-none`}>
        {value}
      </p>
      <p className="mt-2 text-[12.5px] leading-snug text-muted">{label}</p>
    </div>
  )
}
