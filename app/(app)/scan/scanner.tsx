'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useCelebrate } from '@/components/play/celebrate';
import { feedback, play, primeSound } from '@/lib/sound';
import { cancelSpeech, say, speechAvailable } from '@/lib/speech';
import {
  DWELL_MS,
  SECTOR_COUNT,
  coverage,
  emptySectors,
  nextHint,
  sectorAt,
  tasksFor,
  tickSweep,
  type Sector,
} from '@/lib/games/sweep';
import { finishGameAction } from '../spil/actions';

/**
 * Rum-scanneren.
 *
 * Kameraet er tændt, og skærmen viser en ring af sektorer der bliver grønne
 * efterhånden som du drejer rundt. Der er lyd på hver gang en sektor tages,
 * og en dansk stemme siger hvilken vej du skal dreje — for begge hænder er
 * optaget, og den der står midt i rummet kigger på rummet.
 *
 * Hvad det er, og hvad det ikke er: telefonen ved hvilken vej den peger, ikke
 * hvad der ligger på gulvet. WebXR's plandetektion findes ikke i Safari, så
 * en app der påstod at genkende dit rum ville lyve. Det den svarer på er
 * "har jeg kigget hele vejen rundt", og det viser sig at være det spørgsmål
 * der betyder noget når man står midt i noget rod.
 *
 * Uden gyroskop — en laptop, en telefon der siger nej — bliver det manuelt:
 * du drejer selv og trykker. Samme spil, samme point.
 */

type Phase = 'klar' | 'scanner' | 'opgaver' | 'faerdig';

export function RoomScanner({ best }: { best: number }) {
  const router = useRouter();
  const celebrate = useCelebrate();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const lastTick = useRef(0);
  const headingRef = useRef(0);
  const baseRef = useRef<number | null>(null);
  const sectorsRef = useRef<Sector[]>(emptySectors());
  const startedAt = useRef(0);

  const [phase, setPhase] = useState<Phase>('klar');
  const [sectors, setSectors] = useState<Sector[]>(emptySectors());
  const [heading, setHeading] = useState(0);
  const [hasOrientation, setHasOrientation] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hint, setHint] = useState('Drej langsomt hele vejen rundt');
  const [tasks, setTasks] = useState<string[]>([]);
  const [doneTasks, setDoneTasks] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  /*
   * Afgøres efter monteringen, ikke under rendering.
   *
   * `speechAvailable()` svarer falsk på serveren og sandt i browseren, og en
   * linje der kun findes det ene sted er præcis definitionen på en
   * hydreringsafvigelse.
   */
  const [canSpeak, setCanSpeak] = useState(false);
  useEffect(() => setCanSpeak(speechAvailable()), []);

  const covered = sectors.filter((s) => s.covered).length;
  const share = coverage(sectors);

  /* ------------------------------------------------------------- oprydning */

  const stopEverything = useCallback(() => {
    liveRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    cancelSpeech();
  }, []);

  // Kameraet skal slukkes uanset hvordan skærmen forlades — også hvis
  // telefonen låses midt i en scanning.
  useEffect(() => () => stopEverything(), [stopEverything]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') cancelSpeech();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  /* ------------------------------------------------------------ orientering */

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    // iOS giver webkitCompassHeading i grader med uret; alle andre giver alpha
    // mod uret. Retningen er relativ til der hvor scanningen begyndte, så det
    // eneste der betyder noget er at den er konsistent.
    const webkit = (event as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
    const raw = typeof webkit === 'number' ? webkit : event.alpha === null ? null : 360 - event.alpha;
    if (raw === null || Number.isNaN(raw)) return;

    if (baseRef.current === null) baseRef.current = raw;
    const relative = ((raw - baseRef.current) % 360 + 360) % 360;
    headingRef.current = relative;
    setHasOrientation(true);
  }, []);

  /* ------------------------------------------------------------------ start */

  const begin = useCallback(async () => {
    primeSound();
    setCameraError(null);
    liveRef.current = true;
    baseRef.current = null;
    sectorsRef.current = emptySectors();
    setSectors(sectorsRef.current);
    setDoneTasks(new Set());
    setScore(null);

    // Kamera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      if (!liveRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play().catch(() => undefined);
      }
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      setCameraError(
        name === 'NotAllowedError'
          ? 'Du sagde nej til kameraet. Du kan stadig spille — drej selv og tryk på “Tag den her”.'
          : 'Der er ikke noget kamera her. Drej selv og tryk på “Tag den her”.',
      );
    }

    // Orientering. iOS kræver at der spørges inde i et tryk.
    try {
      const Ctor = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (typeof Ctor?.requestPermission === 'function') {
        const answer = await Ctor.requestPermission();
        if (answer === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation, true);
        }
      } else if (typeof window.DeviceOrientationEvent !== 'undefined') {
        window.addEventListener('deviceorientation', handleOrientation, true);
      }
    } catch {
      // Ingen gyroskopadgang. Så bliver det manuelt, og det virker også.
    }

    startedAt.current = Date.now();
    lastTick.current = performance.now();
    setPhase('scanner');
    play('start');
    say('Drej langsomt hele vejen rundt.', { force: true });
  }, [handleOrientation]);

  /* -------------------------------------------------------------- løkken */

  useEffect(() => {
    if (phase !== 'scanner') return;

    const loop = (now: number) => {
      if (!liveRef.current) return;
      const delta = now - lastTick.current;
      lastTick.current = now;

      if (hasOrientation) {
        const update = tickSweep(sectorsRef.current, headingRef.current, delta);
        if (update.captured.length > 0) {
          sectorsRef.current = update.sectors;
          setSectors(update.sectors);
          feedback('fangst', [10, 30, 10]);
        } else if (update.sectors !== sectorsRef.current) {
          sectorsRef.current = update.sectors;
          setSectors(update.sectors);
        }
        setHeading(headingRef.current);

        const next = nextHint(sectorsRef.current, headingRef.current);
        if (next) {
          setHint(next);
          say(next);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [phase, hasOrientation]);

  /** Manuel optagelse, når der ikke er gyroskop. */
  function captureManually() {
    const first = sectorsRef.current.find((s) => !s.covered);
    if (!first) return;
    const next = sectorsRef.current.map((s) =>
      s.index === first.index ? { ...s, covered: true, dwell: DWELL_MS } : s,
    );
    sectorsRef.current = next;
    setSectors(next);
    feedback('fangst', [10, 30, 10]);
  }

  function check() {
    stopEverything();
    const picked = tasksFor(coverage(sectorsRef.current));
    setTasks(picked);
    setPhase('opgaver');
    play('rigtigt');
    say(`Du dækkede ${Math.round(coverage(sectorsRef.current) * 100)} procent. Her er hvad du skal gøre.`, {
      force: true,
    });
  }

  async function finish(doneCount: number) {
    setPhase('faerdig');
    setSaving(true);
    play(doneCount >= tasks.length ? 'faerdig' : 'trin');

    const result = await finishGameAction({
      gameId: 'rumsweep',
      difficulty: 'mellem',
      // Sektorerne og opgaverne tæller begge med, så en grundig scanning der
      // ender med to opgaver stadig er noget værd.
      done: covered + doneCount,
      total: SECTOR_COUNT + tasks.length,
      seconds: Math.round((Date.now() - startedAt.current) / 1000),
    });

    setSaving(false);
    if (!result.error) {
      setScore(result.score ?? 0);
      celebrate({
        xp: result.reward?.xp,
        levelUp: result.reward?.levelUp,
        unlocked: result.reward?.unlocked,
        message: result.isBest ? 'Ny personlig rekord' : undefined,
      });
      if (result.reward?.levelUp) play('niveau');
    }
    router.refresh();
  }

  /* ------------------------------------------------------------------ klar */

  if (phase === 'klar') {
    return (
      <div className="rise space-y-5" onPointerDownCapture={() => primeSound()}>
        <header>
          <h1 className="text-[28px] font-bold tracking-tight">Rum-scanner</h1>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
            Stil dig midt i rummet, hold telefonen op, og drej langsomt hele vejen rundt. Ringen
            bliver grøn efterhånden som du dækker rummet — og siger til når du mangler noget.
          </p>
        </header>

        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <p className="text-[14px] font-semibold">Sådan virker det — helt ærligt</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
            Telefonen ved hvilken vej den peger. Den ved ikke hvad der ligger på dit gulv — det gør
            ingen web-app, og en der påstod det ville lyve. Til gengæld svarer den præcist på “har
            jeg kigget hele vejen rundt”, og det er dét der afgør om et rum bliver ryddet eller
            halvt ryddet.
          </p>
          {canSpeak ? (
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-subtle">
              Der er lyd og dansk tale på, så du kan lade være med at kigge på skærmen.
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => void begin()}
          className="pressable w-full rounded-2xl py-4 text-[17px] font-bold text-white"
          style={{ background: 'var(--color-play-home)' }}
        >
          Tænd kameraet
        </button>

        {best > 0 ? (
          <p className="px-1 text-center text-[12.5px] text-ink-subtle">Bedste: {best}</p>
        ) : null}
      </div>
    );
  }

  /* -------------------------------------------------------------- scanner */

  if (phase === 'scanner') {
    return (
      <div className="rise space-y-4">
        <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-play-ink aspect-[3/4]">
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />

          {/* Det grønne slør ligger kun over den retning der er taget, så det
              er tydeligt hvad der er dækket og hvad der mangler. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 transition-colors duration-300"
            style={{
              background: sectors[sectorAt(heading)]?.covered
                ? 'rgba(34,197,94,0.28)'
                : 'transparent',
            }}
          />

          <Radar sectors={sectors} heading={heading} />

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
            <span className="rounded-full bg-black/45 px-3 py-1.5 text-[13px] font-bold text-white backdrop-blur-sm">
              {covered} / {SECTOR_COUNT}
            </span>
            <span className="rounded-full bg-black/45 px-3 py-1.5 text-[13px] font-bold text-white backdrop-blur-sm">
              {Math.round(share * 100)} %
            </span>
          </div>

          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[17px] font-bold text-white drop-shadow-lg">
            {hint}
          </p>
        </div>

        {cameraError ? (
          <p className="rounded-xl bg-notice-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-notice">
            {cameraError}
          </p>
        ) : null}

        {!hasOrientation ? (
          <button
            type="button"
            onClick={captureManually}
            disabled={covered >= SECTOR_COUNT}
            className="pressable w-full rounded-2xl border-2 border-border bg-surface py-3.5 text-[15px] font-semibold disabled:opacity-50"
          >
            Tag den her retning
          </button>
        ) : null}

        <button
          type="button"
          onClick={check}
          className="pressable w-full rounded-2xl py-4 text-[17px] font-bold text-white"
          style={{ background: share >= 0.9 ? 'var(--color-positive)' : 'var(--color-play-ink)' }}
        >
          {share >= 0.9 ? 'Tjek — du har hele rummet' : `Tjek (${covered} af ${SECTOR_COUNT})`}
        </button>

        <p className="px-1 text-center text-[12px] leading-relaxed text-ink-subtle">
          Du kan trykke tjek når som helst. Det du nåede tæller.
        </p>
      </div>
    );
  }

  /* -------------------------------------------------------------- opgaver */

  if (phase === 'opgaver') {
    return (
      <div className="rise space-y-4">
        <header className="text-center">
          <p className="numeral text-[44px] font-bold leading-none">{Math.round(share * 100)} %</p>
          <p className="mt-1 text-[14px] text-ink-muted">
            af rummet scannet · {tasks.length} ting at gøre
          </p>
        </header>

        <ul className="space-y-2">
          {tasks.map((task, i) => {
            const isDone = doneTasks.has(i);
            return (
              <li key={task}>
                <button
                  type="button"
                  aria-pressed={isDone}
                  onClick={() => {
                    const next = new Set(doneTasks);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    setDoneTasks(next);
                    feedback(next.has(i) ? 'trin' : 'tap', 12);
                  }}
                  className={cn(
                    'pressable flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left',
                    isDone ? 'border-positive bg-positive-soft' : 'border-border bg-surface',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
                      isDone ? 'bg-positive text-white' : 'bg-surface-muted text-ink-subtle',
                    )}
                  >
                    {isDone ? '✓' : i + 1}
                  </span>
                  <span
                    className={cn(
                      'text-[15px] leading-snug',
                      isDone && 'text-positive line-through decoration-2',
                    )}
                  >
                    {task}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={() => void finish(doneTasks.size)}
          className="pressable w-full rounded-2xl bg-play-ink py-4 text-[16px] font-bold text-white"
        >
          {doneTasks.size >= tasks.length ? 'Færdig' : `Gem ${doneTasks.size} af ${tasks.length}`}
        </button>
      </div>
    );
  }

  /* --------------------------------------------------------------- færdig */

  return (
    <div className="rise space-y-5">
      <header className="pt-8 text-center">
        <span aria-hidden="true" className="pop-in inline-block text-[56px]">
          {share >= 0.9 && doneTasks.size >= tasks.length ? '🎉' : '👏'}
        </span>
        <p className="numeral mt-2 text-[48px] font-bold leading-none">+{score ?? 0}</p>
        <p className="mt-1 text-[15px] text-ink-muted">
          {Math.round(share * 100)} % scannet · {doneTasks.size} af {tasks.length} gjort
        </p>
        {saving ? <p className="mt-2 text-[13px] text-ink-subtle">Gemmer…</p> : null}
      </header>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPhase('klar')}
          className="pressable flex-1 rounded-2xl py-3.5 text-[15px] font-bold text-white"
          style={{ background: 'var(--color-play-home)' }}
        >
          Scan et rum til
        </button>
        <Link
          href="/play"
          className="pressable flex-1 rounded-2xl border border-border bg-surface py-3.5 text-center text-[15px] font-semibold"
        >
          Tilbage
        </Link>
      </div>
    </div>
  );
}

/** Ringen: tolv felter der lyser op efterhånden som rummet dækkes. */
function Radar({ sectors, heading }: { sectors: Sector[]; heading: number }) {
  const size = 128;
  const centre = size / 2;
  const outer = 56;
  const inner = 26;
  const width = 360 / sectors.length;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      className="pointer-events-none absolute bottom-14 left-1/2 h-36 w-36 -translate-x-1/2 drop-shadow-lg"
    >
      {sectors.map((sector) => {
        // Sektoren tegnes om sin midterretning, ikke fra den.
        const start = ((sector.bearing - width / 2 - 90) * Math.PI) / 180;
        const end = ((sector.bearing + width / 2 - 90) * Math.PI) / 180;
        const path = [
          `M ${centre + inner * Math.cos(start)} ${centre + inner * Math.sin(start)}`,
          `L ${centre + outer * Math.cos(start)} ${centre + outer * Math.sin(start)}`,
          `A ${outer} ${outer} 0 0 1 ${centre + outer * Math.cos(end)} ${centre + outer * Math.sin(end)}`,
          `L ${centre + inner * Math.cos(end)} ${centre + inner * Math.sin(end)}`,
          `A ${inner} ${inner} 0 0 0 ${centre + inner * Math.cos(start)} ${centre + inner * Math.sin(start)}`,
          'Z',
        ].join(' ');

        const progress = Math.min(sector.dwell / 550, 1);
        return (
          <path
            key={sector.index}
            d={path}
            fill={sector.covered ? 'rgba(34,197,94,0.85)' : `rgba(255,255,255,${0.12 + progress * 0.3})`}
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="0.8"
          />
        );
      })}

      {/* Nålen: hvor telefonen peger lige nu. */}
      <g transform={`rotate(${heading} ${centre} ${centre})`}>
        <path
          d={`M ${centre} ${centre - outer - 6} l -5 9 l 10 0 Z`}
          fill="#fff"
          stroke="rgba(0,0,0,0.3)"
          strokeWidth="0.6"
        />
      </g>
      <circle cx={centre} cy={centre} r={inner - 4} fill="rgba(0,0,0,0.4)" />
    </svg>
  );
}
