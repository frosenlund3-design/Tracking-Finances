import { motion } from 'framer-motion'
import { useState } from 'react'
import { Check, Eye, EyeOff, Lock as LockIcon } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { PASSWORD_RULES, isStrongEnough } from '@/lib/vault'
import { Button } from './ui/Button'

/**
 * Create the local profile.
 *
 * The password is typed twice and must satisfy three requirements, shown live
 * so she is never told "too weak" without being told what would fix it.
 *
 * The copy is careful about what this is: there is no account and no server,
 * so there is also no "forgot password" email. That has to be said before she
 * chooses a code, not after she loses one.
 */
export function CreateProfile({
  onDone,
  onSkip,
  compact,
}: {
  onDone: () => void
  onSkip?: () => void
  compact?: boolean
}) {
  const createLock = useStore((s) => s.createLock)
  const [name, setName] = useState('')
  const [pw, setPw] = useState('')
  const [repeat, setRepeat] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const strong = isStrongEnough(pw)
  const matches = repeat.length > 0 && pw === repeat
  const canSubmit = strong && matches && !busy

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    const res = await createLock(pw, name)
    setBusy(false)
    if (res.ok) onDone()
    else setError(res.error ?? 'Noget gik galt.')
  }

  return (
    <div className={compact ? '' : 'flex h-full flex-col px-6 pt-safe pb-safe'}>
      {!compact && (
        <div className="pt-8">
          <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.025em]">
            Vil du låse Loops med en kode?
          </h2>
          <p className="mt-2.5 text-[15px] leading-relaxed text-muted">
            Så er dine tanker kun dine — også hvis nogen låner telefonen.
          </p>
        </div>
      )}

      <div className={compact ? 'space-y-3' : 'mt-7 flex-1 space-y-3'}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dit navn (valgfrit)"
          autoComplete="nickname"
          className="min-h-[54px] w-full rounded-xl2 border border-line bg-surface px-4 text-[16px] outline-none placeholder:text-faint focus:border-ink/20"
        />

        <div className="relative">
          <input
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            type={show ? 'text' : 'password'}
            placeholder="Vælg en kode"
            autoComplete="new-password"
            className="min-h-[54px] w-full rounded-xl2 border border-line bg-surface px-4 pr-14 text-[16px] outline-none placeholder:text-faint focus:border-ink/20"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Skjul kode' : 'Vis kode'}
            className="focus-ring absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-faint"
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <input
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          type={show ? 'text' : 'password'}
          placeholder="Skriv koden igen"
          autoComplete="new-password"
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          className="min-h-[54px] w-full rounded-xl2 border border-line bg-surface px-4 text-[16px] outline-none placeholder:text-faint focus:border-ink/20"
        />

        <ul className="space-y-1.5 pt-1">
          {PASSWORD_RULES.map((r) => {
            const ok = r.test(pw)
            return (
              <li key={r.id} className={`flex items-center gap-2.5 text-[13.5px] ${ok ? 'text-calm' : 'text-faint'}`}>
                <span
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                    ok ? 'border-calm bg-calm/20' : 'border-line'
                  }`}
                >
                  {ok && <Check size={10} />}
                </span>
                {r.label}
              </li>
            )
          })}
          <li
            className={`flex items-center gap-2.5 text-[13.5px] ${
              matches ? 'text-calm' : repeat.length ? 'text-warm' : 'text-faint'
            }`}
          >
            <span
              className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                matches ? 'border-calm bg-calm/20' : 'border-line'
              }`}
            >
              {matches && <Check size={10} />}
            </span>
            De to koder er ens
          </li>
        </ul>

        {error && <p className="text-[13.5px] text-warm">{error}</p>}

        <div className="rounded-xl2 border border-line bg-surface p-4">
          <p className="text-[12.5px] leading-relaxed text-faint">
            Koden bliver på telefonen — den sendes ingen steder, og der er ingen konto at nulstille
            den fra. Glemmer du den, kan indholdet ikke låses op igen. Tag en backup i
            indstillinger, hvis du vil være helt sikker.
          </p>
        </div>
      </div>

      <div className={compact ? 'mt-4 space-y-2' : 'space-y-2 pb-4'}>
        <Button full onClick={submit} disabled={!canSubmit} className={canSubmit ? '' : 'opacity-35'}>
          {busy ? 'Låser…' : 'Opret profil'}
        </Button>
        {onSkip && (
          <button onClick={onSkip} className="focus-ring min-h-[48px] w-full text-[14.5px] text-faint">
            Ikke nu — jeg vil bare i gang
          </button>
        )}
      </div>
    </div>
  )
}

/** The screen shown on launch when a code exists. Nothing is loaded behind it. */
export function LockScreen() {
  const unlock = useStore((s) => s.unlock)
  const name = useStore((s) => s.authName)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!pw || busy) return
    setBusy(true)
    setError(null)
    const res = await unlock(pw)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? 'Koden passer ikke.')
      setPw('')
    }
  }

  return (
    <div className="flex h-safe-screen flex-col items-center justify-center bg-canvas px-8 pb-safe">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22 }}
        className="grid h-20 w-20 place-items-center rounded-full bg-surface shadow-node"
      >
        <LockIcon size={26} className="text-muted" />
      </motion.div>

      <h1 className="mt-7 text-[24px] font-semibold tracking-[-0.03em]">
        {name ? `Hej ${name}` : 'Velkommen tilbage'}
      </h1>
      <p className="mt-2 text-center text-[14.5px] text-muted">Skriv din kode for at åbne Loops.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        className="mt-8 w-full max-w-[19rem] space-y-3"
      >
        <input
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Din kode"
          className="min-h-[56px] w-full rounded-xl2 border border-line bg-surface px-4 text-center text-[17px] outline-none placeholder:text-faint focus:border-ink/20"
        />
        {error && <p className="text-center text-[13.5px] text-warm">{error}</p>}
        <Button full type="submit" disabled={!pw || busy} className={!pw || busy ? 'opacity-35' : ''}>
          {busy ? 'Åbner…' : 'Luk mig ind'}
        </Button>
      </form>

      <p className="mt-8 max-w-[19rem] text-center text-[12px] leading-relaxed text-faint/80">
        Der er ingen konto og ingen server, så koden kan ikke nulstilles pr. mail.
      </p>
    </div>
  )
}
