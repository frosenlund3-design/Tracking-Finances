/**
 * Danish dictation.
 *
 * Uses the browser's own speech recognition (`webkitSpeechRecognition`), set to
 * da-DK. On iPhone that is Safari's dictation engine, the same one behind the
 * microphone key on the keyboard, and it handles Danish well.
 *
 * HONESTY NOTE, this matters, because the app promises that her thoughts stay
 * on her phone:
 *  - Speech recognition is the one part of Loops that is not purely local. On
 *    iOS and Chrome the audio is sent to Apple's or Google's servers to be
 *    turned into text. The app says so before the first use, and the setting
 *    can be turned off. Everything after the text appears is local as usual.
 *  - It is not, and cannot be, 100% accurate, no dictation is. So the
 *    transcript always lands in an editable field first. She reads it and
 *    sends it; the app never acts on unheard words.
 *  - Where the browser has no speech recognition, the button is not shown at
 *    all rather than shown broken. The iPhone keyboard's own microphone key
 *    still works everywhere, and does the same job.
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string
}
interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: SpeechRecognitionAlternativeLike
  length: number
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: { length: number; [index: number]: SpeechRecognitionResultLike }
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function ctor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function speechSupported(): boolean {
  return ctor() !== null
}

export type DictationError = 'denied' | 'no-speech' | 'network' | 'unknown'

export interface DictationHandlers {
  /** Fires continuously while she speaks, so the text appears as it is heard. */
  onText: (text: string, isFinal: boolean) => void
  onError: (error: DictationError) => void
  onEnd: () => void
}

/**
 * One dictation session. Keeps the finalised text separate from the interim
 * guess, so the field does not flicker between corrections.
 */
export class Dictation {
  private recognition: SpeechRecognitionLike | null = null
  private settled = ''

  start(handlers: DictationHandlers): boolean {
    const Ctor = ctor()
    if (!Ctor) return false

    const recognition = new Ctor()
    recognition.lang = 'da-DK'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    this.settled = ''

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) this.settled += text
        else interim += text
      }
      const combined = (this.settled + interim).replace(/\s+/g, ' ').trimStart()
      handlers.onText(combined, interim === '')
    }

    recognition.onerror = (event) => {
      const code: DictationError =
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'denied'
          : event.error === 'no-speech'
            ? 'no-speech'
            : event.error === 'network'
              ? 'network'
              : 'unknown'
      handlers.onError(code)
    }

    recognition.onend = () => handlers.onEnd()

    try {
      recognition.start()
      this.recognition = recognition
      return true
    } catch {
      return false
    }
  }

  stop(): void {
    try {
      this.recognition?.stop()
    } catch {
      /* already stopped */
    }
    this.recognition = null
  }
}

export const DICTATION_ERRORS: Record<DictationError, string> = {
  denied: 'Loops må ikke bruge mikrofonen. Du kan give lov i browserens indstillinger.',
  'no-speech': 'Jeg hørte ikke noget. Prøv igen, eller skriv i stedet.',
  network: 'Diktering kræver internet. Skriv i stedet, resten af appen virker offline.',
  unknown: 'Dikteringen stoppede. Prøv igen, eller skriv i stedet.',
}
