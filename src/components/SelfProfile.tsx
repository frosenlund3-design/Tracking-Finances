import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import type { SelfDescription } from '@/db/types'
import { useStore } from '@/store/useStore'

/**
 * Hvad coachen ved om dig.
 *
 * Alt her er skrevet af hende selv. Appen gætter aldrig på en diagnose og
 * udleder den aldrig af adfærd, den ville før eller siden gætte forkert og
 * så tale skråsikkert om et helt andet menneske. Derfor: kun det, hun selv
 * har skrevet, og hun kan altid slette det igen.
 *
 * Feltet styrer to ting i coachen:
 *  1. Hvilke begreber der overhovedet må bringes op (monotropi f.eks. nævnes
 *     kun, hvis hun har skrevet autisme/autistiske træk).
 *  2. Hvor grundlæggende den må være. "Ved det meste" slår al forklaring af
 *     hvad ADHD er fra, den går direkte til mekanismen.
 */

const COMMON_DIAGNOSES = [
  'ADHD',
  'ADD',
  'Autisme',
  'Autistiske træk',
  'Asperger',
  'Angst',
  'Depression',
  'OCD',
  'PTSD',
  'Dysleksi',
  'Højtbegavet',
]

const COMMON_CHALLENGES = [
  'Perfektionisme',
  'Procrastination',
  'Overspringshandlinger',
  'Tidsblindhed',
  'Følelsesregulering',
  'Udmattelse',
  'Søvn',
  'Kravmodstand',
  'Afvisningsfølsomhed',
  'Hyperfokus',
  'Overblik',
  'Kronisk smerte',
  'Alene om det hele',
]

const FAMILIARITY: Array<{ id: SelfDescription['familiarity']; label: string; hint: string }> = [
  { id: 'new', label: 'Det er nyt for mig', hint: 'Så forklarer jeg mere undervejs.' },
  { id: 'some', label: 'Jeg ved en del', hint: 'Jeg springer det mest grundlæggende over.' },
  {
    id: 'expert',
    label: 'Jeg ved det meste',
    hint: 'Så siger jeg aldrig “del det op i mindre bidder”. Vi går direkte til mekanismen.',
  },
]

/**
 * Common triggers, phrased the way a person would say them rather than the way
 * a clinician would. They are only suggestions: the important ones are usually
 * the specific ones she types herself.
 */
const COMMON_TRIGGERS = [
  'Hvis nogen virker sure på mig',
  'Regninger og økonomi',
  'Telefonopkald',
  'At blive rettet',
  'Uåbnet post',
  'e-Boks',
  'Rod og uorden',
  'At komme for sent',
  'Høje lyde',
  'At blive spurgt hvorfor',
  'Deadlines der nærmer sig',
  'At skulle bede om hjælp',
]

const EMPTY: SelfDescription = {
  diagnoses: [],
  challenges: [],
  triggers: [],
  freeText: '',
  familiarity: 'some',
}

export function SelfProfile() {
  const stored = useStore((s) => s.profile.self)
  const saveProfile = useStore((s) => s.saveProfile)
  const close = useStore((s) => s.closeOverlay)

  const [self, setSelf] = useState<SelfDescription>(stored ? { ...EMPTY, ...stored } : EMPTY)
  const [saved, setSaved] = useState(false)

  const patch = (p: Partial<SelfDescription>) => {
    setSelf((s) => ({ ...s, ...p }))
    setSaved(false)
  }

  const toggle = (key: 'diagnoses' | 'challenges' | 'triggers', value: string) => {
    const list = self[key]
    patch({
      [key]: list.some((v) => v.toLowerCase() === value.toLowerCase())
        ? list.filter((v) => v.toLowerCase() !== value.toLowerCase())
        : [...list, value],
    } as Partial<SelfDescription>)
  }

  const save = async () => {
    await saveProfile({
      self: {
        diagnoses: self.diagnoses,
        challenges: self.challenges,
        triggers: self.triggers,
        freeText: self.freeText?.trim() || undefined,
        familiarity: self.familiarity,
      },
    })
    setSaved(true)
  }

  return (
    <div className="pb-8">
      <p className="text-[15px] leading-relaxed text-muted">
        Coachen taler ud fra det her, og kun det her. Den gætter aldrig selv, og den siger det ikke
        videre nogen steder. Du kan lade det stå tomt, og du kan slette det igen.
      </p>

      <Block
        title="Diagnoser"
        sub="Det du selv har fået at vide, eller er ret sikker på. Der er ingen der tjekker."
      >
        <ChipRow
          options={COMMON_DIAGNOSES}
          selected={self.diagnoses}
          onToggle={(v) => toggle('diagnoses', v)}
        />
        <FreeAdd
          placeholder="Skriv en anden…"
          existing={self.diagnoses}
          onAdd={(v) => patch({ diagnoses: [...self.diagnoses, v] })}
        />
        <Custom
          values={self.diagnoses}
          known={COMMON_DIAGNOSES}
          onRemove={(v) => patch({ diagnoses: self.diagnoses.filter((d) => d !== v) })}
        />
      </Block>

      <Block title="Andet du døjer med" sub="Behøver ikke have et navn i en journal for at tælle.">
        <ChipRow
          options={COMMON_CHALLENGES}
          selected={self.challenges}
          onToggle={(v) => toggle('challenges', v)}
        />
        <FreeAdd
          placeholder="Skriv noget andet…"
          existing={self.challenges}
          onAdd={(v) => patch({ challenges: [...self.challenges, v] })}
        />
        <Custom
          values={self.challenges}
          known={COMMON_CHALLENGES}
          onRemove={(v) => patch({ challenges: self.challenges.filter((d) => d !== v) })}
        />
      </Block>

      <Block
        title="Det der sætter noget i gang i dig"
        sub="Ikke hvad du er dårlig til. Det der rammer, før du når at tænke."
      >
        <p className="rounded-xl2 border border-line bg-surface p-4 text-[13.5px] leading-relaxed text-muted">
          Når en opgave eller en samtale rører ved noget herfra, holder jeg op med at give gode
          råd. Så siger jeg det først, og så finder vi en vej udenom i stedet for igennem.
        </p>
        <ChipRow
          options={COMMON_TRIGGERS}
          selected={self.triggers}
          onToggle={(v) => toggle('triggers', v)}
        />
        <FreeAdd
          placeholder="Fx “hvis nogen virker sure på mig”"
          existing={self.triggers}
          onAdd={(v) => patch({ triggers: [...self.triggers, v] })}
        />
        <Custom
          values={self.triggers}
          known={COMMON_TRIGGERS}
          onRemove={(v) => patch({ triggers: self.triggers.filter((d) => d !== v) })}
        />
      </Block>

      <Block title="Hvor meget ved du om det i forvejen?" sub="Det afgør, hvor grundlæggende jeg må være.">
        <div className="space-y-2">
          {FAMILIARITY.map((f) => (
            <button
              key={f.id}
              onClick={() => patch({ familiarity: f.id })}
              className={`focus-ring flex w-full flex-col gap-0.5 rounded-xl2 border px-4 py-3.5 text-left active:scale-[0.99] ${
                self.familiarity === f.id ? 'border-ink/25 bg-accent-soft' : 'border-line bg-surface'
              }`}
            >
              <span className="text-[15px] font-medium">{f.label}</span>
              <span className="text-[13px] leading-snug text-muted">{f.hint}</span>
            </button>
          ))}
        </div>
      </Block>

      <Block
        title="Noget jeg skal vide"
        sub="Fx “jeg hader at blive spurgt hvorfor” eller “jeg er alene med to børn”."
      >
        <textarea
          value={self.freeText ?? ''}
          onChange={(e) => patch({ freeText: e.target.value })}
          rows={4}
          placeholder="Skriv frit…"
          className="focus-ring w-full resize-none rounded-xl2 border border-line bg-surface p-4 text-[15px] leading-relaxed placeholder:text-faint"
        />
      </Block>

      <div className="mt-7 flex gap-2.5">
        <button
          onClick={() => void save()}
          className="focus-ring min-h-[52px] flex-1 rounded-xl2 bg-ink text-[16px] font-medium text-paper active:scale-[0.99]"
        >
          {saved ? 'Gemt' : 'Gem'}
        </button>
        <button
          onClick={close}
          className="focus-ring min-h-[52px] rounded-xl2 border border-line bg-surface px-6 text-[15px] text-muted active:scale-[0.99]"
        >
          Luk
        </button>
      </div>
    </div>
  )
}

function Block({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="mt-7">
      <p className="text-[15px] font-medium">{title}</p>
      <p className="mt-0.5 text-[13px] leading-snug text-faint">{sub}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  )
}

function ChipRow({
  options,
  selected,
  onToggle,
}: {
  options: string[]
  selected: string[]
  onToggle: (v: string) => void
}) {
  const has = (v: string) => selected.some((s) => s.toLowerCase() === v.toLowerCase())
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onToggle(o)}
          className={`focus-ring min-h-[44px] rounded-full border px-4 text-[14px] active:scale-95 ${
            has(o) ? 'border-ink/25 bg-accent-soft font-medium' : 'border-line bg-surface text-muted'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

/** Free-typed entries, shown separately so they can be removed again. */
function Custom({
  values,
  known,
  onRemove,
}: {
  values: string[]
  known: string[]
  onRemove: (v: string) => void
}) {
  const extra = values.filter((v) => !known.some((k) => k.toLowerCase() === v.toLowerCase()))
  if (extra.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {extra.map((v) => (
        <span
          key={v}
          className="flex min-h-[44px] items-center gap-2 rounded-full border border-ink/25 bg-accent-soft px-4 text-[14px] font-medium"
        >
          {v}
          <button onClick={() => onRemove(v)} aria-label={`Fjern ${v}`} className="focus-ring text-muted">
            <X size={15} />
          </button>
        </span>
      ))}
    </div>
  )
}

function FreeAdd({
  placeholder,
  existing,
  onAdd,
}: {
  placeholder: string
  existing: string[]
  onAdd: (v: string) => void
}) {
  const [text, setText] = useState('')
  const commit = () => {
    const v = text.trim()
    if (!v) return
    if (!existing.some((e) => e.toLowerCase() === v.toLowerCase())) onAdd(v)
    setText('')
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        commit()
      }}
      className="flex gap-2"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="focus-ring min-h-[46px] flex-1 rounded-xl2 border border-line bg-surface px-4 text-[15px] placeholder:text-faint"
      />
      {/* Lit only when there is something to add, so it never looks broken. */}
      <button
        type="submit"
        aria-label="Tilføj"
        disabled={!text.trim()}
        className={`focus-ring flex min-h-[46px] w-[46px] items-center justify-center rounded-xl2 border transition ${
          text.trim() ? 'border-ink/25 bg-accent-soft text-ink active:scale-95' : 'border-line bg-surface text-faint/60'
        }`}
      >
        <Plus size={18} />
      </button>
    </form>
  )
}
