import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { deriveBrainProfile } from '@/lib/brainProfiles'
import type {
  EnergyPeak,
  ListReaction,
  Motivator,
  ProcrastinationReason,
  ToneChoice,
  UserProfile,
} from '@/db/types'
import { Button } from './ui/Button'
import { haptic } from '@/lib/haptics'
import { BrainDumpPanel } from './BrainDump'
import { BRAIN_PROFILES as BRAIN } from '@/lib/brainProfiles'

/**
 * Onboarding.
 *
 * No account, no email, no workspace. Seven taps, one question per screen,
 * each answer auto-advances. It ends with her actually using the app — the
 * last step is a real brain dump, not a "you're all set" screen.
 */

type Answers = {
  procrastinationReasons: ProcrastinationReason[]
  listReaction: ListReaction | null
  energyPeak: EnergyPeak | null
  motivators: Motivator[]
  tone: ToneChoice | null
  theme: UserProfile['theme'] | null
  reduced: boolean | null
}

const EMPTY: Answers = {
  procrastinationReasons: [],
  listReaction: null,
  energyPeak: null,
  motivators: [],
  tone: null,
  theme: null,
  reduced: null,
}

export function Onboarding() {
  const saveProfile = useStore((s) => s.saveProfile)
  const savePrefs = useStore((s) => s.savePrefs)
  const [step, setStep] = useState(0)
  const [a, setA] = useState<Answers>(EMPTY)

  const next = () => setStep((s) => s + 1)

  const toggleMulti = <T,>(list: T[], value: T, max: number): T[] => {
    if (list.includes(value)) return list.filter((v) => v !== value)
    if (list.length >= max) return [...list.slice(1), value]
    return [...list, value]
  }

  const profile = deriveBrainProfile({
    procrastinationReasons: a.procrastinationReasons,
    listReaction: a.listReaction ?? 'shutdown',
    motivators: a.motivators,
  })

  const finish = async () => {
    await saveProfile({
      onboarded: true,
      procrastinationReasons: a.procrastinationReasons,
      listReaction: a.listReaction ?? 'shutdown',
      energyPeak: a.energyPeak ?? 'varies',
      motivators: a.motivators.length ? a.motivators : ['quiet-head'],
      tone: a.tone ?? 'calm',
      theme: a.theme ?? 'warm',
      brainProfileId: profile.id,
      density: profile.density,
      defaultTaskMinutes: profile.defaultTaskMinutes,
      autoBreakdown: profile.autoBreakdown,
    })
    await savePrefs({ reducedStimulation: a.reduced ?? false })
  }

  const steps = [
    <Welcome key="welcome" onNext={next} />,

    <Question
      key="q1"
      eyebrow="1 af 7"
      title="Når du udsætter noget, er det oftest fordi…"
      hint="Vælg op til to. Der er ikke noget rigtigt svar."
      options={[
        { value: 'dont-know-where-to-start', label: 'Jeg ved ikke hvor jeg skal starte' },
        { value: 'boring', label: 'Det føles kedeligt' },
        { value: 'too-many-steps', label: 'Der er for mange steps' },
        { value: 'forget', label: 'Jeg glemmer det' },
        { value: 'no-energy', label: 'Jeg mangler energi' },
        { value: 'perfectionism', label: 'Jeg bliver perfektionistisk' },
      ]}
      selected={a.procrastinationReasons}
      multi
      onSelect={(v) => setA({ ...a, procrastinationReasons: toggleMulti(a.procrastinationReasons, v as ProcrastinationReason, 2) })}
      onNext={next}
      canNext={a.procrastinationReasons.length > 0}
    />,

    <Question
      key="q2"
      eyebrow="2 af 7"
      title="Når nogen giver dig en lang to-do-liste…"
      options={[
        { value: 'love', label: 'Jeg elsker det' },
        { value: 'shutdown', label: 'Mit hoved lukker ned' },
        { value: 'ignore', label: 'Jeg ignorerer den 😂' },
      ]}
      selected={a.listReaction ? [a.listReaction] : []}
      onSelect={(v) => {
        setA({ ...a, listReaction: v as ListReaction })
        setTimeout(next, 220)
      }}
    />,

    <Question
      key="q3"
      eyebrow="3 af 7"
      title="Hvornår har du mest energi?"
      options={[
        { value: 'morning', label: 'Morgen' },
        { value: 'midday', label: 'Midt på dagen' },
        { value: 'evening', label: 'Aften' },
        { value: 'varies', label: 'Det skifter totalt' },
      ]}
      selected={a.energyPeak ? [a.energyPeak] : []}
      onSelect={(v) => {
        setA({ ...a, energyPeak: v as EnergyPeak })
        setTimeout(next, 220)
      }}
    />,

    <Question
      key="q4"
      eyebrow="4 af 7"
      title="Hvad motiverer dig mest?"
      hint="Vælg op til to."
      options={[
        { value: 'progress', label: 'At kunne se progress' },
        { value: 'rewards', label: 'Små belønninger' },
        { value: 'cheering', label: 'Nogen der hepper på mig' },
        { value: 'self-competition', label: 'Konkurrence med mig selv' },
        { value: 'quiet-head', label: 'At få ro i hovedet' },
      ]}
      selected={a.motivators}
      multi
      onSelect={(v) => setA({ ...a, motivators: toggleMulti(a.motivators, v as Motivator, 2) })}
      onNext={next}
      canNext={a.motivators.length > 0}
    />,

    <Question
      key="q5"
      eyebrow="5 af 7"
      title="Hvordan vil du helst tales til?"
      options={[
        { value: 'calm', label: 'Roligt' },
        { value: 'warm', label: 'Kærligt' },
        { value: 'blunt', label: 'Kort og kontant' },
        { value: 'humor', label: 'Med humor' },
        { value: 'peptalk', label: 'Pep-talk' },
      ]}
      selected={a.tone ? [a.tone] : []}
      onSelect={(v) => {
        setA({ ...a, tone: v as ToneChoice })
        setTimeout(next, 220)
      }}
    />,

    <ThemeStep
      key="q6"
      selected={a.theme}
      onSelect={(t) => {
        setA({ ...a, theme: t })
        document.documentElement.setAttribute('data-theme', t)
        setTimeout(next, 260)
      }}
    />,

    <Question
      key="q7"
      eyebrow="7 af 7"
      title="Hvor meget må der ske på skærmen?"
      hint="Du kan altid ændre det bagefter."
      options={[
        { value: 'normal', label: 'Bevægelse og små effekter er fint' },
        { value: 'reduced', label: 'Hold det roligt og forudsigeligt' },
      ]}
      selected={a.reduced === null ? [] : [a.reduced ? 'reduced' : 'normal']}
      onSelect={(v) => {
        const reduced = v === 'reduced'
        setA({ ...a, reduced })
        document.documentElement.setAttribute('data-calm', reduced ? 'on' : 'off')
        setTimeout(next, 220)
      }}
    />,

    <Reveal key="reveal" profileId={profile.id} onNext={next} />,

    <FirstDump key="dump" onDone={finish} />,
  ]

  return (
    <div className="h-safe-screen w-full overflow-hidden bg-canvas">
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
          className="h-full"
        >
          {steps[Math.min(step, steps.length - 1)]}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 pb-safe text-center">
      <motion.div
        className="relative mb-10 h-40 w-40"
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 140, damping: 18 }}
      >
        <div className="breathe absolute inset-4 rounded-full border-2 border-ink/85 bg-transparent" />
        {[0, 1, 2, 3, 4].map((i) => {
          const angle = (i / 5) * Math.PI * 2 - Math.PI / 2
          const tints = [
            'rgb(var(--c-accent))',
            'rgb(var(--c-warm))',
            'rgb(var(--c-calm))',
            'rgb(var(--c-faint))',
            'rgb(var(--c-accent) / 0.6)',
          ]
          const sizes = [30, 24, 20, 26, 22]
          return (
            <motion.div
              key={i}
              className="absolute rounded-full shadow-soft"
              style={{
                width: sizes[i],
                height: sizes[i],
                background: tints[i],
                left: `calc(50% + ${Math.cos(angle) * 88}px - ${sizes[i] / 2}px)`,
                top: `calc(50% + ${Math.sin(angle) * 88}px - ${sizes[i] / 2}px)`,
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.25 + i * 0.08, type: 'spring', stiffness: 200, damping: 16 }}
            />
          )
        })}
      </motion.div>

      <h1 className="text-[38px] font-semibold tracking-[-0.035em]">Loops</h1>
      <p className="mt-4 max-w-[19rem] text-[17px] leading-relaxed text-muted">
        Din hjerne skal ikke være databasen.
        <br />
        Skriv det ned. Jeg organiserer det.
      </p>

      <div className="mt-12 w-full max-w-[19rem]">
        <Button full onClick={onNext}>
          Kom i gang
        </Button>
        <p className="mt-4 text-[12.5px] text-faint">
          Ingen konto. Ingen mail. Alt bliver på din telefon.
        </p>
      </div>
    </div>
  )
}

interface QuestionProps {
  eyebrow: string
  title: string
  hint?: string
  options: Array<{ value: string; label: string }>
  selected: string[]
  multi?: boolean
  onSelect: (value: string) => void
  onNext?: () => void
  canNext?: boolean
}

function Question({ eyebrow, title, hint, options, selected, multi, onSelect, onNext, canNext }: QuestionProps) {
  return (
    <div className="flex h-full flex-col px-6 pt-safe pb-safe">
      <div className="pt-8">
        <p className="text-[11px] uppercase tracking-[0.16em] text-faint">{eyebrow}</p>
        <h2 className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.025em]">{title}</h2>
        {hint && <p className="mt-2 text-[14px] text-muted">{hint}</p>}
      </div>

      <div className="mt-7 flex flex-1 flex-col gap-2.5 overflow-y-auto no-scrollbar pb-4">
        {options.map((o) => {
          const on = selected.includes(o.value)
          return (
            <button
              key={o.value}
              onClick={() => {
                haptic('tap')
                onSelect(o.value)
              }}
              className={`focus-ring flex min-h-[58px] items-center justify-between rounded-xl2 border px-5 text-left text-[16px] transition-all duration-200 active:scale-[0.99] ${
                on ? 'border-ink/25 bg-accent-soft shadow-soft' : 'border-line bg-surface'
              }`}
            >
              <span>{o.label}</span>
              {on && <Check size={18} className="shrink-0 text-ink/70" />}
            </button>
          )
        })}
      </div>

      {multi && onNext && (
        <div className="pb-4">
          <Button full onClick={onNext} disabled={!canNext} className={canNext ? '' : 'opacity-35'}>
            Videre <ArrowRight size={17} className="ml-1 inline -mt-0.5" />
          </Button>
        </div>
      )}
    </div>
  )
}

const THEMES: Array<{ id: UserProfile['theme']; label: string; swatch: string[] }> = [
  { id: 'warm', label: 'Varm', swatch: ['#F6F1E9', '#E3D9CB', '#8C7AA5'] },
  { id: 'dawn', label: 'Rosa', swatch: ['#FAF2F0', '#EBD8D5', '#BE8082'] },
  { id: 'fog', label: 'Kølig', swatch: ['#F0F1F3', '#DBDFE4', '#748AA0'] },
  { id: 'dusk', label: 'Mørk', swatch: ['#1A181A', '#3E393C', '#AC9AC6'] },
]

function ThemeStep({ selected, onSelect }: { selected: UserProfile['theme'] | null; onSelect: (t: UserProfile['theme']) => void }) {
  return (
    <div className="flex h-full flex-col px-6 pt-safe pb-safe">
      <div className="pt-8">
        <p className="text-[11px] uppercase tracking-[0.16em] text-faint">6 af 7</p>
        <h2 className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.025em]">Hvilken stemning?</h2>
        <p className="mt-2 text-[14px] text-muted">Du kan skifte når som helst.</p>
      </div>

      <div className="mt-8 grid flex-1 grid-cols-2 content-start gap-3">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              haptic('tap')
              onSelect(t.id)
            }}
            className={`focus-ring flex min-h-[124px] flex-col justify-between rounded-xl2 border p-4 text-left transition active:scale-[0.98] ${
              selected === t.id ? 'border-ink/25 shadow-soft' : 'border-line'
            }`}
            style={{ background: t.swatch[0] }}
          >
            <div className="flex gap-1.5">
              {t.swatch.map((c) => (
                <span key={c} className="h-6 w-6 rounded-full border border-black/5" style={{ background: c }} />
              ))}
            </div>
            <span className="text-[15px] font-medium" style={{ color: t.id === 'dusk' ? '#F0EAE4' : '#2E2721' }}>
              {t.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Reveal({ profileId, onNext }: { profileId: string; onNext: () => void }) {
  const p = BRAIN[profileId]
  return (
    <div className="flex h-full flex-col justify-center px-7 pb-safe pt-safe">
      <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Din hjerneprofil</p>
      <h2 className="mt-3 text-[30px] font-semibold leading-tight tracking-[-0.03em]">{p.title}</h2>

      <div className="mt-5 space-y-1.5">
        {p.body.map((line) => (
          <p key={line} className="text-[16.5px] leading-relaxed text-muted">
            {line}
          </p>
        ))}
      </div>

      <div className="mt-8 rounded-xl2 border border-line bg-surface p-5">
        <p className="text-[13px] font-medium text-muted">Så Loops kommer til at:</p>
        <ul className="mt-3 space-y-2">
          {p.promises.map((line) => (
            <li key={line} className="flex gap-2.5 text-[15px] leading-snug">
              <Check size={16} className="mt-0.5 shrink-0 text-calm" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-5 text-[12.5px] leading-relaxed text-faint">
        Det her er en måde at indstille appen på — ikke en test eller en diagnose.
      </p>

      <div className="mt-8">
        <Button full onClick={onNext}>
          Ja, det passer
        </Button>
      </div>
    </div>
  )
}

function FirstDump({ onDone }: { onDone: () => void }) {
  const [done, setDone] = useState(false)
  return (
    <div className="flex h-full flex-col px-6 pt-safe pb-safe">
      <div className="pt-8">
        <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.025em]">Så prøver vi det med det samme</h2>
        <p className="mt-2.5 text-[15px] leading-relaxed text-muted">
          Skriv alt det, du går og husker på lige nu. Rodet. Uden rækkefølge.
          <br />
          Jeg sorterer det bagefter.
        </p>
      </div>

      <div className="mt-6 min-h-0 flex-1">
        <BrainDumpPanel
          onCommitted={() => setDone(true)}
          footer={
            <button onClick={onDone} className="focus-ring w-full py-3 text-[14.5px] text-faint">
              {done ? 'Færdig — vis mig appen' : 'Spring over for nu'}
            </button>
          }
          autoFinish={onDone}
        />
      </div>
    </div>
  )
}
