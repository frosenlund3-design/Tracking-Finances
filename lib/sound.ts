/**
 * Lyden.
 *
 * Syntetiseret i WebAudio frem for hentet ned som filer. Det er ikke for at
 * spare plads — det er fordi en lyd der skal downloades kommer for sent. En
 * kvittering på et tryk skal falde inden for firs millisekunder, ellers hører
 * hjernen den ikke som svar på trykket, og så er der ingen dopamin i den.
 *
 * Alt er korte toner i en dur-skala, så to lyde der falder oven i hinanden
 * stadig lyder som musik. Ingen af dem er skarpe: den lyd der spiller tyve
 * gange i træk må ikke være den man slår fra.
 */

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let muted = false;

const STORAGE_KEY = 'kroner.lyd';

/** Toner i C-dur, som halvtoner fra A4 = 440 Hz. */
const NOTE: Record<string, number> = {
  C4: -9, D4: -7, E4: -5, F4: -4, G4: -2, A4: 0, B4: 2,
  C5: 3, D5: 5, E5: 7, F5: 8, G5: 10, A5: 12, B5: 14, C6: 15, E6: 19, G6: 22,
};

function hz(note: string): number {
  return 440 * Math.pow(2, (NOTE[note] ?? 0) / 12);
}

export function soundEnabled(): boolean {
  return !muted;
}

export function loadSoundPreference(): void {
  if (typeof window === 'undefined') return;
  try {
    muted = window.localStorage.getItem(STORAGE_KEY) === 'fra';
  } catch {
    // Privat vindue, eller lagring slået fra. Lyden er så bare til.
    muted = false;
  }
}

export function setSoundEnabled(on: boolean): void {
  muted = !on;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? 'til' : 'fra');
  } catch {
    // Uden lagring holder valget kun til næste indlæsning. Det er i orden.
  }
}

/**
 * Skaffer konteksten.
 *
 * Browsere laver den først når brugeren har rørt siden, så alt der spiller
 * lyd skal tåle at få null tilbage og bare lade være.
 */
function audio(): Ctx | null {
  if (typeof window === 'undefined' || muted) return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    }
    // Safari suspenderer konteksten når fanen har været i baggrunden.
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Kaldes fra det første tryk, hvor browseren tillader at åbne lyd. */
export function primeSound(): void {
  audio();
}

interface ToneOptions {
  note: string;
  /** Sekunder. */
  duration?: number;
  /** Forsinkelse fra nu, i sekunder. */
  delay?: number;
  type?: OscillatorType;
  gain?: number;
  /** Glid op eller ned til denne tone undervejs. */
  slideTo?: string;
}

function tone(options: ToneOptions): void {
  const context = audio();
  if (!context || !master) return;

  const start = context.currentTime + (options.delay ?? 0);
  const duration = options.duration ?? 0.12;
  const osc = context.createOscillator();
  const gain = context.createGain();

  osc.type = options.type ?? 'sine';
  osc.frequency.setValueAtTime(hz(options.note), start);
  if (options.slideTo) {
    osc.frequency.exponentialRampToValueAtTime(hz(options.slideTo), start + duration);
  }

  // Blød indsats og udtoning. En firkantet envelope klikker.
  const peak = options.gain ?? 0.6;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Kort støjklik, til tryk og til at markere noget fysisk. */
function noise(duration = 0.06, gainValue = 0.25, highpass = 1200): void {
  const context = audio();
  if (!context || !master) return;

  const frames = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    // Aftagende støj, så det lyder som et anslag og ikke som en radio.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;

  const filter = context.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = highpass;

  const gain = context.createGain();
  gain.gain.value = gainValue;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start();
}

export type SoundName =
  | 'tap'
  | 'trin'
  | 'rigtigt'
  | 'forkert'
  | 'fangst'
  | 'xp'
  | 'niveau'
  | 'figur'
  | 'tik'
  | 'faerdig'
  | 'start'
  | 'svirp';

/** Spiller en lyd. Gør ingenting hvis lyden er slået fra eller ikke kan åbnes. */
export function play(name: SoundName): void {
  switch (name) {
    case 'tap':
      noise(0.04, 0.18, 2200);
      tone({ note: 'E5', duration: 0.05, gain: 0.3 });
      break;

    case 'trin':
      // Et trin krydset af: op ad en terts.
      tone({ note: 'E5', duration: 0.09, gain: 0.5 });
      tone({ note: 'G5', duration: 0.11, delay: 0.055, gain: 0.45 });
      break;

    case 'rigtigt':
      tone({ note: 'C5', duration: 0.09, gain: 0.5 });
      tone({ note: 'E5', duration: 0.09, delay: 0.06, gain: 0.5 });
      tone({ note: 'G5', duration: 0.16, delay: 0.12, gain: 0.45 });
      break;

    case 'forkert':
      // Nedad, men blødt. Et forkert svar må ikke lyde som en fejlmeddelelse.
      tone({ note: 'E4', duration: 0.16, gain: 0.35, type: 'triangle', slideTo: 'C4' });
      break;

    case 'fangst':
      // Sektoren er dækket: kort svirp og en klar tone.
      noise(0.07, 0.2, 900);
      tone({ note: 'A5', duration: 0.1, gain: 0.5, type: 'triangle' });
      tone({ note: 'E6', duration: 0.14, delay: 0.07, gain: 0.35, type: 'triangle' });
      break;

    case 'xp':
      tone({ note: 'B5', duration: 0.07, gain: 0.4, type: 'triangle' });
      tone({ note: 'E6', duration: 0.13, delay: 0.05, gain: 0.32, type: 'triangle' });
      break;

    case 'niveau':
      for (const [i, note] of ['C5', 'E5', 'G5', 'C6'].entries()) {
        tone({ note, duration: 0.2, delay: i * 0.085, gain: 0.5, type: 'triangle' });
      }
      break;

    case 'figur':
      // Større fanfare. Den skal kunne bære at stoppe alt andet.
      for (const [i, note] of ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'].entries()) {
        tone({ note, duration: 0.26, delay: i * 0.07, gain: 0.45, type: 'triangle' });
      }
      break;

    case 'tik':
      tone({ note: 'A4', duration: 0.035, gain: 0.22 });
      break;

    case 'faerdig':
      tone({ note: 'G5', duration: 0.3, gain: 0.45, type: 'triangle' });
      tone({ note: 'C6', duration: 0.42, delay: 0.1, gain: 0.4, type: 'triangle' });
      break;

    case 'start':
      tone({ note: 'C5', duration: 0.1, gain: 0.4, type: 'triangle', slideTo: 'G5' });
      break;

    case 'svirp':
      noise(0.13, 0.14, 500);
      break;
  }
}

/** Kort vibration, hvor telefonen tillader det. */
export function buzz(pattern: number | number[] = 15): void {
  if (muted) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // iOS Safari har den ikke. Lyden bærer alene.
  }
}

/** Lyd og vibration sammen — det der føles som ét svar på et tryk. */
export function feedback(name: SoundName, vibration: number | number[] = 12): void {
  play(name);
  buzz(vibration);
}
