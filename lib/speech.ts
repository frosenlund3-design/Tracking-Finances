/**
 * Den talte vejledning.
 *
 * Bruges kun ét sted: mens kameraet er oppe og begge hænder er optaget. Der er
 * en skærm at kigge på, men den der står med telefonen strakt ud foran sig og
 * drejer rundt kigger på rummet — ikke på teksten.
 *
 * Alt er valgfrit. Findes stemmesyntesen ikke, eller er der ingen dansk
 * stemme, sker der ingenting, og skærmen siger det samme med bogstaver.
 */

let enabled = true;
let voice: SpeechSynthesisVoice | null = null;
let lastSaid = '';
let lastAt = 0;

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function setSpeechEnabled(on: boolean): void {
  enabled = on;
  if (!on) cancelSpeech();
}

export function speechEnabled(): boolean {
  return enabled;
}

/**
 * Finder en dansk stemme.
 *
 * Listen er tom lige efter indlæsning i de fleste browsere og fyldes ud
 * asynkront, så den skal hentes igen ved hvert kald frem for at blive
 * cachet én gang ved start.
 */
function danishVoice(): SpeechSynthesisVoice | null {
  if (!speechAvailable()) return null;
  if (voice) return voice;
  const voices = window.speechSynthesis.getVoices();
  voice =
    voices.find((v) => v.lang === 'da-DK') ??
    voices.find((v) => v.lang.startsWith('da')) ??
    null;
  return voice;
}

/**
 * Siger noget.
 *
 * Gentagelser inden for et par sekunder droppes. Uden det ville "drej til
 * højre" blive sagt tres gange i minuttet, og så er det ikke vejledning
 * længere, det er en alarm.
 */
export function say(text: string, options: { force?: boolean } = {}): void {
  if (!enabled || !speechAvailable()) return;
  const now = Date.now();
  if (!options.force && text === lastSaid && now - lastAt < 4000) return;

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'da-DK';
    const found = danishVoice();
    if (found) utterance.voice = found;
    utterance.rate = 1.05;
    utterance.pitch = 1;
    utterance.volume = 0.9;

    // Kun én ting ad gangen. En kø af beskeder fra et kamera der drejer er
    // ubrugelig — det der blev sagt for otte sekunder siden passer ikke mere.
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    lastSaid = text;
    lastAt = now;
  } catch {
    // Stemmesyntesen fejler forskelligt i forskellige browsere. Ingen af
    // fejlene er værd at afbryde et spil for.
  }
}

export function cancelSpeech(): void {
  if (!speechAvailable()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Se ovenfor.
  }
  lastSaid = '';
}
