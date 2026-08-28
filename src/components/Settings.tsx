import { BarChart3, ChevronLeft, Download, Info, Lock, LockOpen, Share, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { downloadBackup, importBackup, BackupError, wipeEverything } from '@/lib/backup'
import { hapticsSupported } from '@/lib/haptics'
import { BRAIN_PROFILES } from '@/lib/brainProfiles'
import type { UserProfile } from '@/db/types'
import { CreateProfile } from './Lock'

const THEMES: Array<{ id: UserProfile['theme']; label: string }> = [
  { id: 'warm', label: 'Varm' },
  { id: 'dawn', label: 'Rosa' },
  { id: 'fog', label: 'Kølig' },
  { id: 'dusk', label: 'Mørk' },
]

const TONES: Array<{ id: UserProfile['tone']; label: string }> = [
  { id: 'calm', label: 'Roligt' },
  { id: 'warm', label: 'Kærligt' },
  { id: 'blunt', label: 'Kort' },
  { id: 'humor', label: 'Humor' },
  { id: 'peptalk', label: 'Pep' },
]

export function Settings() {
  const profile = useStore((s) => s.profile)
  const prefs = useStore((s) => s.prefs)
  const saveProfile = useStore((s) => s.saveProfile)
  const savePrefs = useStore((s) => s.savePrefs)
  const setScreen = useStore((s) => s.setScreen)
  const nodes = useStore((s) => s.nodes)
  const loadDemo = useStore((s) => s.loadDemoData)
  const removeDemo = useStore((s) => s.removeDemoData)
  const reload = useStore((s) => s.reload)
  const clearCoach = useStore((s) => s.clearCoach)
  const authState = useStore((s) => s.authState)
  const authName = useStore((s) => s.authName)
  const lockNow = useStore((s) => s.lockNow)
  const removeLock = useStore((s) => s.removeLock)

  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [showCreateLock, setShowCreateLock] = useState(false)
  const [removePw, setRemovePw] = useState('')
  const [removing, setRemoving] = useState(false)
  const [lockError, setLockError] = useState<string | null>(null)

  const hasDemo = nodes.some((n) => n.demo)
  const brain = BRAIN_PROFILES[profile.brainProfileId] ?? BRAIN_PROFILES['quiet-brain']

  const onImport = async (file: File) => {
    try {
      const text = await file.text()
      const res = await importBackup(text)
      await reload()
      setMessage(`Hentet ind igen. ${res.nodes} ting gendannet.`)
    } catch (e) {
      setMessage(e instanceof BackupError ? e.message : 'Der skete en fejl under import.')
    }
  }

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
          <h1 className="text-[24px] font-semibold tracking-[-0.028em]">Indstillinger</h1>
        </div>

        <Section title="Det du har flyttet">
          <Row
            icon={<BarChart3 size={17} />}
            label="Se hvad det er blevet til"
            onClick={() => setScreen('stats')}
          />
        </Section>

        <Section title="Din profil">
          <div className="rounded-xl2 border border-line bg-surface p-5">
            <p className="text-[17px] font-semibold tracking-[-0.02em]">{brain.title}</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{brain.body[0]}</p>
          </div>
        </Section>

        <Section title="Profil og kode">
          {authState === 'unlocked' ? (
            <>
              <div className="rounded-xl2 border border-line bg-surface p-5">
                <p className="text-[15px] font-medium">{authName ? `${authName}s profil` : 'Din profil'}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                  Loops er låst med din kode. Det du skriver — titler, småting, brain dumps og
                  samtaler med coachen — ligger krypteret på telefonen.
                </p>
              </div>
              <Row icon={<Lock size={17} />} label="Lås appen nu" onClick={lockNow} />
              {removing ? (
                <div className="rounded-xl2 border border-line bg-surface p-4">
                  <p className="text-[14px] text-muted">Skriv din kode for at fjerne låsen.</p>
                  <input
                    type="password"
                    value={removePw}
                    onChange={(e) => setRemovePw(e.target.value)}
                    placeholder="Din kode"
                    className="mt-3 min-h-[50px] w-full rounded-xl2 border border-line bg-raised px-4 text-[16px] outline-none focus:border-ink/20"
                  />
                  {lockError && <p className="mt-2 text-[13px] text-warm">{lockError}</p>}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => {
                        setRemoving(false)
                        setRemovePw('')
                        setLockError(null)
                      }}
                      className="focus-ring min-h-[46px] flex-1 rounded-xl2 border border-line text-[14.5px]"
                    >
                      Behold låsen
                    </button>
                    <button
                      onClick={async () => {
                        const res = await removeLock(removePw)
                        if (res.ok) {
                          setRemoving(false)
                          setRemovePw('')
                          setLockError(null)
                          setMessage('Låsen er fjernet.')
                        } else setLockError(res.error ?? 'Der skete en fejl.')
                      }}
                      className="focus-ring min-h-[46px] flex-1 rounded-xl2 bg-ink text-[14.5px] text-canvas"
                    >
                      Fjern låsen
                    </button>
                  </div>
                </div>
              ) : (
                <Row icon={<LockOpen size={17} />} label="Fjern koden" onClick={() => setRemoving(true)} />
              )}
            </>
          ) : showCreateLock ? (
            <div className="rounded-xl2 border border-line bg-surface p-5">
              <CreateProfile compact onDone={() => setShowCreateLock(false)} onSkip={() => setShowCreateLock(false)} />
            </div>
          ) : (
            <>
              <div className="rounded-xl2 border border-line bg-surface p-5">
                <p className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-muted">
                  <Info size={15} className="mt-0.5 shrink-0 text-faint" />
                  Der er ingen kode på Loops lige nu. Du kan oprette en profil med en kode, så
                  appen låses — og det du skriver bliver krypteret på telefonen.
                </p>
              </div>
              <Row icon={<Lock size={17} />} label="Opret profil med kode" onClick={() => setShowCreateLock(true)} />
            </>
          )}
        </Section>

        <Section title="Udseende">
          <Chips
            options={THEMES.map((t) => ({ id: t.id, label: t.label }))}
            value={profile.theme}
            onChange={(v) => void saveProfile({ theme: v as UserProfile['theme'] })}
          />
        </Section>

        <Section title="Tone">
          <Chips
            options={TONES.map((t) => ({ id: t.id, label: t.label }))}
            value={profile.tone}
            onChange={(v) => void saveProfile({ tone: v as UserProfile['tone'] })}
          />
        </Section>

        <Section title="Hvor meget må der ske">
          <Toggle
            label="Reduceret stimulation"
            hint="Færre animationer, ingen overraskelser, roligere skærm."
            on={prefs.reducedStimulation}
            onChange={(v) => void savePrefs({ reducedStimulation: v })}
          />
          <Toggle
            label="Vibration"
            hint={
              hapticsSupported()
                ? 'Små vibrationer når noget lukkes.'
                : 'Din browser understøtter det ikke — på iPhone kan web-apps ikke vibrere.'
            }
            on={prefs.haptics}
            disabled={!hapticsSupported()}
            onChange={(v) => void savePrefs({ haptics: v })}
          />
          <Toggle
            label="Vis point"
            hint="Slå fra hvis tal stresser dig."
            on={prefs.showXP}
            onChange={(v) => void savePrefs({ showXP: v })}
          />
        </Section>

        <Section title="Sådan arbejder appen">
          <Toggle
            label="Godt nok-tilstand"
            hint="Målet bliver 'godt nok' i stedet for 'færdig'. Det tæller fuldt ud."
            on={prefs.goodEnoughMode}
            onChange={(v) => void savePrefs({ goodEnoughMode: v })}
          />
          <Toggle
            label="Del store opgaver op automatisk"
            hint="Vage opgaver bliver til små, konkrete skridt."
            on={profile.autoBreakdown}
            onChange={(v) => void saveProfile({ autoBreakdown: v })}
          />
          <Chips
            label="Hvor meget vil du se ad gangen"
            options={[
              { id: 'minimal', label: 'Lidt' },
              { id: 'balanced', label: 'Mellem' },
              { id: 'detailed', label: 'Mere' },
            ]}
            value={profile.density}
            onChange={(v) => void saveProfile({ density: v as UserProfile['density'] })}
          />
        </Section>

        <Section title="Dine data">
          <div className="rounded-xl2 border border-line bg-surface p-5">
            <p className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-muted">
              <Info size={15} className="mt-0.5 shrink-0 text-faint" />
              Alt ligger i din browser på den her telefon. Ingen konto, ingen server, ingen sporing,
              ingen reklamer. Tag en backup, hvis du vil kunne flytte det. Backup-filen er læsbar —
              også hvis du har sat en kode — så gem den et sted, du ville gemme en kontoudskrift.
            </p>
          </div>

          <Row icon={<Download size={17} />} label="Gem backup som fil" onClick={() => void downloadBackup()} />
          <Row icon={<Upload size={17} />} label="Hent backup ind igen" onClick={() => fileRef.current?.click()} />
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onImport(f)
              e.target.value = ''
            }}
          />
          {message && <p className="px-1 pt-1 text-[13px] text-muted">{message}</p>}

          <Row
            icon={<Share size={17} />}
            label={hasDemo ? 'Fjern eksempel-data' : 'Indlæs eksempel-data'}
            onClick={() => void (hasDemo ? removeDemo() : loadDemo())}
          />
          <Row icon={<Trash2 size={17} />} label="Ryd samtalen med coachen" onClick={() => void clearCoach()} />

          {confirmWipe ? (
            <div className="mt-2 rounded-xl2 border border-line bg-surface p-4">
              <p className="text-[14px] leading-relaxed text-muted">
                Sletter alt: cirkler, point, profil og coach-samtale. Det kan ikke fortrydes.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setConfirmWipe(false)}
                  className="focus-ring min-h-[46px] flex-1 rounded-xl2 border border-line text-[14.5px]"
                >
                  Behold
                </button>
                <button
                  onClick={() => void wipeEverything()}
                  className="focus-ring min-h-[46px] flex-1 rounded-xl2 bg-ink text-[14.5px] text-canvas"
                >
                  Slet alt
                </button>
              </div>
            </div>
          ) : (
            <Row icon={<Trash2 size={17} />} label="Slet alt og start forfra" onClick={() => setConfirmWipe(true)} />
          )}
        </Section>

        <Section title="Læg Loops på hjemmeskærmen">
          <div className="rounded-xl2 border border-line bg-surface p-5 text-[13.5px] leading-relaxed text-muted">
            <p>På iPhone:</p>
            <ol className="mt-2 list-inside list-decimal space-y-1">
              <li>Åbn Loops i Safari</li>
              <li>Tryk på del-ikonet nederst</li>
              <li>Vælg "Føj til hjemmeskærm"</li>
            </ol>
            <p className="mt-3">Så ligger den som en almindelig app — også uden internet.</p>
          </div>
        </Section>

        <p className="mt-10 text-center text-[12px] text-faint/80">Loops · lavet til hjerner der ikke kan lide kalendere</p>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-8">
      <p className="text-[11px] uppercase tracking-[0.16em] text-faint">{title}</p>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  )
}

function Toggle({
  label,
  hint,
  on,
  onChange,
  disabled,
}: {
  label: string
  hint?: string
  on: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      className={`focus-ring flex w-full items-center gap-4 rounded-xl2 border border-line bg-surface p-4 text-left ${
        disabled ? 'opacity-55' : 'active:scale-[0.99]'
      }`}
      role="switch"
      aria-checked={on}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-[12.5px] leading-snug text-faint">{hint}</span>}
      </span>
      <span
        className={`relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors ${on ? 'bg-calm' : 'bg-line'}`}
      >
        <span
          className={`absolute top-[3px] h-6 w-6 rounded-full bg-raised shadow transition-all ${
            on ? 'left-[25px]' : 'left-[3px]'
          }`}
        />
      </span>
    </button>
  )
}

function Chips({
  label,
  options,
  value,
  onChange,
}: {
  label?: string
  options: Array<{ id: string; label: string }>
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      {label && <p className="px-1 pb-2 text-[13px] text-muted">{label}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`focus-ring min-h-[46px] rounded-xl2 border px-4 text-[14.5px] active:scale-95 ${
              value === o.id ? 'border-ink/25 bg-accent-soft font-medium' : 'border-line bg-surface text-muted'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Row({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="focus-ring flex min-h-[54px] w-full items-center gap-3.5 rounded-xl2 border border-line bg-surface px-4 text-left active:scale-[0.99]"
    >
      <span className="shrink-0 text-faint">{icon}</span>
      <span className="text-[15px]">{label}</span>
    </button>
  )
}
