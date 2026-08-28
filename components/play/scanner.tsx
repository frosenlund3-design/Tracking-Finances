'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Barcode scanning that works on an iPhone.
 *
 * Two paths, in this order:
 *
 *   1. `BarcodeDetector`, the browser's own decoder. Fast, native, zero
 *      download — and absent from Safari, which is most of the phones this
 *      app is for.
 *   2. ZXing, loaded on demand only when the native one is missing. About
 *      250 KB, so it is never in the bundle of any other screen.
 *
 * The camera stream is stopped on every exit path, including an early return
 * and an unmount mid-start: a page that leaves the torch on is a page people
 * force-quit.
 */

export type ScannerState = 'idle' | 'starting' | 'scanning' | 'denied' | 'unsupported';

interface Controls {
  stop: () => void;
}

export function useBarcodeScanner(onDetected: (barcode: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<Controls | null>(null);
  const loopRef = useRef<number | null>(null);
  const liveRef = useRef(true);
  const [state, setState] = useState<ScannerState>('idle');
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    liveRef.current = false;
    if (loopRef.current !== null) {
      cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }
    controlsRef.current?.stop();
    controlsRef.current = null;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    setState('idle');
  }, []);

  // Belt and braces: unmount, and also a phone being locked mid-scan.
  useEffect(() => () => stop(), [stop]);

  const start = useCallback(async () => {
    setError(null);
    liveRef.current = true;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      return;
    }

    setState('starting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unsupported');
      return;
    }

    // The component may have unmounted while the permission prompt was up.
    if (!liveRef.current) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }

    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }

    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    try {
      await video.play();
    } catch {
      // Autoplay was refused; the poster and the manual field still work.
    }
    setState('scanning');

    const Native = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (Native) {
      const detector = new Native({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
      });
      const tick = async () => {
        if (!liveRef.current || !videoRef.current) return;
        try {
          const found = await detector.detect(videoRef.current);
          const value = found[0]?.rawValue?.trim();
          if (value) {
            onDetected(value);
            return;
          }
        } catch {
          // A frame that could not be read is not an error worth surfacing.
        }
        loopRef.current = requestAnimationFrame(() => void tick());
      };
      loopRef.current = requestAnimationFrame(() => void tick());
      return;
    }

    // Safari, and anything else without a native decoder.
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      if (!liveRef.current || !videoRef.current) return;
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoElement(videoRef.current, (result) => {
        const value = result?.getText()?.trim();
        if (value && liveRef.current) onDetected(value);
      });
      controlsRef.current = { stop: () => controls.stop() };
    } catch {
      setError('The camera opened but the barcode reader could not start.');
      setState('unsupported');
    }
  }, [onDetected]);

  return { videoRef, state, error, start, stop };
}

interface BarcodeDetectorCtor {
  new (options: { formats: string[] }): {
    detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
  };
}
