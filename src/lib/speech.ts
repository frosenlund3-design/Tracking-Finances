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

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

export type Availability = 'ok' | 'keyboard-only' | 'none'

/**
 * Whether Loops can run dictation itself.
 *
 * The awkward one is 'keyboard-only'. On an iPhone, a web app launched from the
 * home screen has `webkitSpeechRecognition` defined and it does not work:
 * starting it ends immediately with no words and often no error at all. So the
 * button looked fine, did nothing, and said nothing, which is the worst of the
 * three possible behaviours.
 *
 * The fix is not a workaround, because there is none. It is to say so, and to
 * point at the thing that does work everywhere on iOS: the microphone key on
 * the keyboard itself. That is Apple's own dictation, the same engine, in every
 * field in this app, and on newer iPhones it runs on the device.
 */
export function dictationAvailability(): Availability {
  if (!speechSupported()) return 'none'
  if (isIOS() && isStandalone()) return 'keyboard-only'
  return 'ok'
}

export type DictationError = 'denied' | 'no-speech' | 'network' | 'silent' | 'unknown'

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
  /** True while she still wants it running, so an automatic restart is allowed. */
  private wanted = false
  private restarts = 0
  private heardAnything = false
  private hadError = false

  start(handlers: DictationHandlers): boolean {
    this.wanted = true
    this.restarts = 0
    this.heardAnything = false
    this.settled = ''
    return this.open(handlers)
  }

  private open(handlers: DictationHandlers): boolean {
    const Ctor = ctor()
    if (!Ctor) return false

    const recognition = new Ctor()
    recognition.lang = 'da-DK'
    // Safari does not really do continuous: the session ends after a phrase, or
    // after a short silence. Asking for it and then reopening the session
    // ourselves behaves the way she expects, which is that it keeps listening
    // until she presses stop.
    recognition.continuous = !isIOS()
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    this.hadError = false

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) this.settled += text
        else interim += text
        if (text.trim()) this.heardAnything = true
      }
      const combined = (this.settled + interim).replace(/\s+/g, ' ').trimStart()
      handlers.onText(combined, interim === '')
    }

    recognition.onerror = (event) => {
      this.hadError = true
      // A silence timeout in the middle of a session is not a failure, it is
      // her thinking. Only report it if nothing at all was ever heard.
      if (event.error === 'no-speech' && this.heardAnything) return
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

    recognition.onend = () => {
      if (!this.wanted) {
        handlers.onEnd()
        return
      }
      if (this.hadError) {
        this.wanted = false
        handlers.onEnd()
        return
      }
      // Ended by itself while she still wants it. Reopen, up to a limit, so a
      // loop cannot run away if the platform refuses to start at all.
      if (this.restarts < 40 && (this.heardAnything || this.restarts < 2)) {
        this.restarts += 1
        if (this.open(handlers)) return
      }
      this.wanted = false
      // Nothing was ever heard and nothing went wrong: on iOS this is what a
      // home-screen web app does. Say so instead of stopping in silence.
      if (!this.heardAnything) handlers.onError('silent')
      handlers.onEnd()
    }

    try {
      recognition.start()
      this.recognition = recognition
      return true
    } catch {
      return false
    }
  }

  stop(): void {
    this.wanted = false
    try {
      this.recognition?.stop()
    } catch {
      /* already stopped */
    }
    this.recognition = null
  }
}

/** What to do instead, on a platform that will not let the app listen. */
export const KEYBOARD_MIC_HINT =
  'Brug mikrofon-tasten på tastaturet i stedet. Den sidder nederst til højre ved siden af mellemrumstasten, og det er den samme stemmegenkendelse. Den virker i alle felter i Loops.'

export const DICTATION_ERRORS: Record<DictationError, string> = {
  denied: 'Loops må ikke bruge mikrofonen. Du kan give lov i telefonens indstillinger under Safari.',
  'no-speech': 'Jeg hørte ikke noget. Prøv igen, eller skriv i stedet.',
  network: 'Diktering kræver internet. Skriv i stedet, resten af appen virker offline.',
  silent: `Det ser ud til, at telefonen ikke vil lade Loops lytte. ${KEYBOARD_MIC_HINT}`,
  unknown: 'Dikteringen stoppede. Prøv igen, eller skriv i stedet.',
}
