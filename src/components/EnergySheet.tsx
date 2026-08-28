import { useStore } from '@/store/useStore'
import type { EnergyLevel } from '@/db/types'
import { useMentalLoad } from '@/store/useStore'

const LEVELS: Array<{ value: EnergyLevel; label: string; hint: string }> = [
  { value: 10, label: '10%', hint: 'Tomt. Vi finder noget der tager 2 minutter — eller parkerer noget.' },
  { value: 30, label: '30%', hint: 'Lidt tilbage. Korte, nemme ting.' },
  { value: 60, label: '60%', hint: 'Almindelig dag. Det meste kan lade sig gøre.' },
  { value: 100, label: '100%', hint: 'Fuld tank. Nu tager vi det store.' },
]

/** Energy is a first-class input to the engine, not a mood diary. */
export function EnergySheet() {
  const energy = useStore((s) => s.prefs.currentEnergy)
  const setEnergy = useStore((s) => s.setEnergy)
  const close = useStore((s) => s.closeOverlay)
  const load = useMentalLoad()

  return (
    <div className="pb-6">
      <p className="text-[15px] leading-relaxed text-muted">
        Det ændrer hvad jeg foreslår dig. Der er ikke noget forkert svar.
      </p>

      <div className="mt-5 space-y-2.5">
        {LEVELS.map((l) => (
          <button
            key={l.value}
            onClick={async () => {
              await setEnergy(l.value)
              close()
            }}
            className={`focus-ring flex w-full flex-col gap-1 rounded-xl2 border px-5 py-4 text-left transition active:scale-[0.99] ${
              energy === l.value ? 'border-ink/25 bg-accent-soft' : 'border-line bg-surface'
            }`}
          >
            <span className="text-[17px] font-medium">{l.label}</span>
            <span className="text-[13.5px] leading-snug text-muted">{l.hint}</span>
          </button>
        ))}
      </div>

      <div className="mt-7 rounded-xl2 border border-line bg-surface p-4">
        <p className="text-[13.5px] leading-relaxed text-muted">{load.sentence}</p>
        {load.parked > 0 && (
          <p className="mt-1.5 text-[13px] text-faint">
            {load.parked} {load.parked === 1 ? 'ting er' : 'ting er'} parkeret og fylder næsten ingenting.
          </p>
        )}
      </div>
    </div>
  )
}
