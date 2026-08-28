import { motion } from 'framer-motion'
import { Mic, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Dictation, DICTATION_ERRORS, speechSupported, type DictationError } from '@/lib/speech'
import { haptic } from '@/lib/haptics'
import { useStore } from '@/store/useStore'

interface Props {
  /** Called with the running transcript. The caller owns the text. */
  onText: (text: string) => void
  /** Text already in the field, so dictation appends rather than replaces. */
  existing?: string
  size?: 'sm' | 'lg'
  label?: string
}

/**
 * Push-to-talk in Danish.
 *
 * Renders nothing at all when the browser has no speech recognition — a dead
 * microphone button is worse than none, and the iPhone keyboard's own
 * microphone key does the same job anyway.
 *
 * The transcript always goes into the editable field, never straight into a
 * message. Dictation is not perfect in any language; she reads it first.
 */
export function MicButton({ onText, existing = '', size = 'sm', label }: Props) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consented, setConsented] = useState(false)
  const dictation = useRef(new Dictation())
  const base = useRef('')
  const voiceAllowed = useStore((s) => s.prefs.voiceEnabled !== false)
  const seenNotice = useStore((s) => s.prefs.voiceNoticeSeen === true)
  const savePrefs = useStore((s) => s.savePrefs)

  useEffect(() => () => dictation.current.stop(), [])

  if (!speechSupported() || !voiceAllowed) return null

  /** The gate: the notice is shown once, before the first word is recorded. */
  const begin = () => {
    if (!seenNotice && !consented) {
      setConsented(true)
      return
    }
    startListening()
  }

  const startListening = () => {
    setError(null)
    base.current = existing ? `${existing.trimEnd()} ` : ''
    const ok = dictation.current.start({
      onText: (text) => onText(base.current + text),
      onError: (e: DictationError) => {
        setError(DICTATION_ERRORS[e])
        setListening(false)
      },
      onEnd: () => setListening(false),
    })
    if (ok) {
      setListening(true)
      haptic('tap')
    } else {
      setError(DICTATION_ERRORS.unknown)
    }
  }

  const end = () => {
    dictation.current.stop()
    setListening(false)
    haptic('soft')
  }

  const dimension = size === 'lg' ? 'h-[54px] w-[54px]' : 'h-[50px] w-[50px]'

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => (listening ? end() : begin())}
        aria-label={listening ? 'Stop diktering' : (label ?? 'Tal i stedet for at skrive')}
        className={`focus-ring relative grid ${dimension} place-items-center rounded-xl2 border transition active:scale-95 ${
          listening ? 'border-transparent bg-warm text-canvas' : 'border-line bg-surface text-muted'
        }`}
      >
        {listening ? <Square size={16} fill="currentColor" /> : <Mic size={19} />}
        {listening && (
          <motion.span
            className="absolute inset-0 rounded-xl2 border-2 border-warm"
            animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.18, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            aria-hidden
          />
        )}
      </button>

      {listening && (
        <span className="absolute -top-6 right-0 whitespace-nowrap text-[11.5px] text-warm">
          Jeg lytter…
        </span>
      )}

      {(error || (consented && !seenNotice)) && (
        <div className="absolute bottom-full right-0 z-20 mb-3 w-[min(78vw,20rem)] rounded-xl2 border border-line bg-raised p-4 shadow-lift">
          {error ? (
            <p className="text-[13px] leading-relaxed text-muted">{error}</p>
          ) : (
            <>
              <p className="text-[13px] leading-relaxed text-muted">
                Diktering bruger telefonens egen stemmegenkendelse. Det er det ene sted, hvor lyden
                forlader telefonen — den sendes til Apple eller Google for at blive lavet om til
                tekst. Resten af Loops bliver liggende hos dig.
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                Teksten lander i feltet, så du kan læse den igennem, før du sender.
              </p>
            </>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                setError(null)
                setConsented(false)
              }}
              className="focus-ring min-h-[44px] flex-1 rounded-xl2 border border-line text-[14px]"
            >
              {error ? 'Okay' : 'Ikke nu'}
            </button>
            {!error && (
              <button
                onClick={async () => {
                  await savePrefs({ voiceNoticeSeen: true })
                  setConsented(false)
                  // Call the recorder directly: `begin` would still be reading
                  // the pre-save value of `seenNotice` from this render and
                  // would just show the notice again.
                  startListening()
                }}
                className="focus-ring min-h-[44px] flex-1 rounded-xl2 bg-ink text-[14px] text-canvas"
              >
                Forstået
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
