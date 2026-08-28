import { motion } from 'framer-motion'
import { Award, ChevronLeft, ExternalLink, Gift, Info, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useStore, useAvailableXP, useClosedToday } from '@/store/useStore'
import { levelFor } from '@/lib/rewards'
import { GIFT_CARD_STORES, storeById, storesFor, XP_PER_KRONE } from '@/lib/giftcards'
import { Button } from './ui/Button'

/**
 * Points, levels and the gift-card savings goal.
 *
 * The honesty rule from the brief applies hardest here: Loops cannot buy a
 * gift card, so it does not pretend to. It converts closed loops into points,
 * tells her when she has genuinely earned the reward, and links to shops that
 * really sell a digital gift card in that amount. She buys it for herself.
 */
export function Rewards() {
  const prefs = useStore((s) => s.prefs)
  const rewards = useStore((s) => s.rewards)
  const completions = useStore((s) => s.completions)
  const claimed = useStore((s) => s.claimed)
  const setGoal = useStore((s) => s.setRewardGoal)
  const clearGoal = useStore((s) => s.clearRewardGoal)
  const claim = useStore((s) => s.claimReward)
  const setScreen = useStore((s) => s.setScreen)
  const available = useAvailableXP()
  const closedToday = useClosedToday()

  const [amount, setAmount] = useState<50 | 100 | 200>(100)
  const [justClaimed, setJustClaimed] = useState<{ storeId: string; amount: number } | null>(null)

  const level = levelFor(prefs.totalXP)
  const goal = prefs.rewardGoal
  const goalStore = goal ? storeById(goal.storeId) : undefined
  const progress = goal ? Math.min(1, available / goal.xpTarget) : 0
  const reached = goal ? available >= goal.xpTarget : false

  const achievements = buildAchievements(completions.length, prefs.streak, rewards.length, claimed.length)

  // What a closed loop has actually paid her, so the target can be stated in
  // loops rather than in an abstract number. Falls back to a middling loop
  // until she has closed enough for her own average to mean anything.
  const perLoop = completions.length >= 5
    ? Math.max(4, Math.round(completions.reduce((sum, c) => sum + c.xp, 0) / completions.length))
    : 15
  const loopsFor = (amountDKK: number) => Math.round((amountDKK * XP_PER_KRONE) / perLoop / 5) * 5

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28">
      <div className="px-6 pt-safe">
        <div className="flex items-center gap-2 pt-3">
          <button
            onClick={() => setScreen('home')}
            aria-label="Tilbage"
            className="focus-ring -ml-2 grid h-11 w-11 place-items-center rounded-full text-faint active:scale-95"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-[24px] font-semibold tracking-[-0.028em]">Point og belønning</h1>
        </div>

        {/* Level */}
        <div className="mt-6 rounded-xl3 border border-line bg-surface p-6 shadow-soft">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Niveau {level.level}</p>
              <p className="mt-1.5 text-[22px] font-semibold tracking-[-0.025em]">{level.title}</p>
            </div>
            <p className="text-[15px] font-medium text-muted">{available} point</p>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={{ width: 0 }}
              animate={{ width: `${level.progress * 100}%` }}
              transition={{ type: 'spring', stiffness: 90, damping: 20 }}
            />
          </div>
          <p className="mt-2.5 text-[12.5px] text-faint">
            {level.xpForNext - level.xpInto} point til næste niveau · {completions.length} loops lukket i alt
            {closedToday > 0 && ` · ${closedToday} i dag`}
          </p>
        </div>

        {/* Gift card goal */}
        <div className="mt-5 rounded-xl3 border border-line bg-surface p-6 shadow-soft">
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-faint">
            <Gift size={13} />
            Gavekort-sparegris
          </p>

          {!goal ? (
            <>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                Vælg et gavekort, du sparer op til. Hver gang du lukker et loop, kommer du tættere på.
              </p>

              <div className="mt-4 flex gap-2">
                {([50, 100, 200] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAmount(a)}
                    className={`focus-ring min-h-[52px] flex-1 rounded-xl2 border text-[15px] transition ${
                      amount === a ? 'border-ink/25 bg-accent-soft font-medium' : 'border-line bg-raised text-muted'
                    }`}
                  >
                    {a} kr.
                  </button>
                ))}
              </div>
              {/*
                A bare "5000 point" is just a wall. What she needs to know is
                whether it is reachable, so say it in loops — measured from her
                own closed ones where there are any, not from an invented
                average.
              */}
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-faint">
                {amount} kr. = {(amount * XP_PER_KRONE).toLocaleString('da-DK')} point. Du har{' '}
                {available.toLocaleString('da-DK')}.
                <span className="mt-0.5 block">
                  Det er cirka {loopsFor(amount)} lukkede loops. Der er ingen tidsfrist.
                </span>
              </p>

              <p className="mt-5 text-[13px] font-medium text-muted">Hvor?</p>
              <div className="mt-2.5 space-y-2">
                {storesFor(amount).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => void setGoal(s.id, amount)}
                    className="focus-ring flex w-full items-start gap-3 rounded-xl2 border border-line bg-raised p-4 text-left active:scale-[0.99]"
                  >
                    <span className="text-[18px] leading-none">{s.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium">{s.name}</span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-faint">{s.blurb}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="mt-3 text-[20px] font-semibold tracking-[-0.02em]">
                {goalStore?.emoji} {goalStore?.name} · {goal.amountDKK} kr.
              </p>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-line">
                <motion.div
                  className="h-full rounded-full bg-warm"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ type: 'spring', stiffness: 90, damping: 20 }}
                />
              </div>
              <p className="mt-2.5 text-[13px] text-muted">
                {available} af {goal.xpTarget} point
                {!reached && ` · ${goal.xpTarget - available} tilbage`}
              </p>

              {reached ? (
                <div className="mt-5">
                  <p className="text-[15px] leading-relaxed">
                    Du har sparet det op. Det er dine loops, der blev til det her.
                  </p>
                  <div className="mt-4 space-y-2.5">
                    <Button
                      full
                      onClick={async () => {
                        const c = await claim()
                        if (c) setJustClaimed({ storeId: c.storeId, amount: c.amountDKK })
                      }}
                    >
                      <Sparkles size={16} className="mr-2 -mt-0.5 inline" />
                      Indløs {goal.amountDKK} kr.
                    </Button>
                    {goalStore?.url && (
                      <a
                        href={goalStore.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="focus-ring flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl2 border border-line bg-raised text-[15px] text-muted active:scale-[0.99]"
                      >
                        Åbn {goalStore.name}
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => void clearGoal()}
                  className="focus-ring mt-2 flex min-h-[44px] items-center text-[13px] text-faint"
                >
                  Vælg noget andet
                </button>
              )}
            </>
          )}

          <div className="mt-5 flex items-start gap-2.5 rounded-xl2 bg-canvas p-4">
            <Info size={14} className="mt-0.5 shrink-0 text-faint" />
            <p className="text-[12px] leading-relaxed text-faint">
              Loops sælger ikke gavekort og kan ikke købe et til dig — appen har ingen server og ingen betaling.
              Den holder styr på opsparingen og siger til, når du har fortjent det. Selve gavekortet køber du
              selv i butikken.
            </p>
          </div>
        </div>

        {justClaimed && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-xl2 border border-line bg-accent-soft/60 p-5 text-center"
          >
            <p className="text-[17px] font-semibold tracking-[-0.02em]">Værsgo 💛</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink/75">
              {justClaimed.amount} kr. til {storeById(justClaimed.storeId)?.name}. Du har lukket loops for det.
            </p>
          </motion.div>
        )}

        {/* Achievements */}
        <div className="mt-8">
          <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Undervejs</p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {achievements.map((a) => (
              <div
                key={a.title}
                className={`rounded-xl2 border p-4 ${a.unlocked ? 'border-line bg-surface' : 'border-line/60 bg-surface/40'}`}
              >
                <Award size={17} className={a.unlocked ? 'text-warm' : 'text-faint/50'} />
                <p className={`mt-2 text-[14px] font-medium leading-snug ${a.unlocked ? '' : 'text-faint'}`}>{a.title}</p>
                <p className="mt-0.5 text-[12px] leading-snug text-faint">{a.hint}</p>
              </div>
            ))}
          </div>
        </div>

        {/* History */}
        {claimed.length > 0 && (
          <div className="mt-8">
            <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Indløst</p>
            <div className="mt-3 space-y-2">
              {claimed.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl2 border border-line bg-surface px-4 py-3">
                  <span className="text-[14.5px]">
                    {storeById(c.storeId)?.emoji} {storeById(c.storeId)?.name ?? 'Gavekort'}
                  </span>
                  <span className="text-[13px] text-faint">{c.amountDKK} kr.</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8">
          <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Seneste point</p>
          <div className="mt-3 space-y-1.5">
            {rewards.slice(0, 12).map((r) => (
              <div key={r.id} className="flex items-center justify-between px-1 py-2 text-[14px]">
                <span className="min-w-0 flex-1 truncate text-muted">{r.label}</span>
                <span className="ml-3 shrink-0 text-faint">+{r.xp}</span>
              </div>
            ))}
            {rewards.length === 0 && <p className="py-4 text-[14px] text-faint">Ingen endnu. De kommer af sig selv.</p>}
          </div>
        </div>

        <p className="mt-10 text-center text-[12px] leading-relaxed text-faint/80">
          Point gives for at starte, for at lukke loops, for at tømme hovedet — og ekstra for det, du har
          gået og undgået. Ikke for at bruge appen længe.
        </p>
      </div>
    </div>
  )
}

interface Achievement {
  title: string
  hint: string
  unlocked: boolean
}

function buildAchievements(closed: number, streak: number, events: number, claims: number): Achievement[] {
  return [
    { title: 'Første loop', hint: 'Luk én ting', unlocked: closed >= 1 },
    { title: 'Ti ude af hovedet', hint: '10 lukkede loops', unlocked: closed >= 10 },
    { title: 'Halvtreds', hint: '50 lukkede loops', unlocked: closed >= 50 },
    { title: 'Tre dage i træk', hint: 'Uden pres', unlocked: streak >= 3 },
    { title: 'Hovedet tømt', hint: 'Brug brain dump', unlocked: events >= 1 },
    { title: 'Første gavekort', hint: 'Spar op og indløs', unlocked: claims >= 1 },
  ]
}

export { GIFT_CARD_STORES }
