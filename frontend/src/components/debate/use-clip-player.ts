'use client';

import * as React from 'react';

export interface PlayableClip {
  id: string;
  text: string;
  url: string | null;
}

const SPOKEN_WORDS_PER_SECOND = 2.6;
const LEVEL_EVERY_MS = 90;

function estimatedMs(text: string): number {
  return (text.split(/\s+/).filter(Boolean).length / SPOKEN_WORDS_PER_SECOND) * 1000 + 600;
}

function speak(text: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(finish, estimatedMs(text) + 2500);
    let settled = false;
    function finish(): void {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    }
    signal.addEventListener('abort', finish);
    if (typeof window.speechSynthesis === 'undefined') return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    utterance.rate = 1.02;
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  });
}

function playAudio(audio: HTMLAudioElement, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (ok: boolean) => () => {
      audio.onended = null;
      audio.onerror = null;
      signal.removeEventListener('abort', aborted);
      resolve(ok);
    };
    const aborted = (): void => {
      audio.pause();
      done(true)();
    };
    signal.addEventListener('abort', aborted);
    audio.onended = done(true);
    audio.onerror = done(false);
    audio.play().catch(done(false));
  });
}

const syntheticLevel = (): number => 0.25 + 0.2 * Math.abs(Math.sin(performance.now() / 160));

export function useClipPlayer(): {
  current: string | null;
  level: number;
  play: (clips: readonly PlayableClip[]) => Promise<void>;
  stop: () => void;
} {
  const [current, setCurrent] = React.useState<string | null>(null);
  const [level, setLevel] = React.useState(0);
  const controller = React.useRef<AbortController | null>(null);
  const context = React.useRef<AudioContext | null>(null);
  const frame = React.useRef<number | null>(null);

  const stopMeter = React.useCallback((): void => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = null;
    setLevel(0);
  }, []);

  const analyse = React.useCallback(async (audio: HTMLAudioElement): Promise<(() => number) | null> => {
    if (typeof AudioContext === 'undefined') return null;
    try {
      context.current ??= new AudioContext();
      await context.current.resume();
      if (context.current.state !== 'running') return null;
      const analyser = context.current.createAnalyser();
      analyser.fftSize = 1024;
      context.current.createMediaElementSource(audio).connect(analyser);
      analyser.connect(context.current.destination);
      const buffer = new Float32Array(analyser.fftSize);
      return () => {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (const s of buffer) sum += s * s;
        return Math.min(1, Math.sqrt(sum / buffer.length) * 6);
      };
    } catch {
      return null;
    }
  }, []);

  const meter = React.useCallback(
    async (audio: HTMLAudioElement | null): Promise<void> => {
      stopMeter();
      const read = (audio ? await analyse(audio) : null) ?? syntheticLevel;
      let last = 0;
      const tick = (now: number): void => {
        if (now - last > LEVEL_EVERY_MS) {
          last = now;
          setLevel(read());
        }
        frame.current = window.requestAnimationFrame(tick);
      };
      frame.current = window.requestAnimationFrame(tick);
    },
    [stopMeter, analyse],
  );

  const stop = React.useCallback((): void => {
    controller.current?.abort();
    controller.current = null;
    if (typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel();
    stopMeter();
    setCurrent(null);
  }, [stopMeter]);

  const play = React.useCallback(
    async (clips: readonly PlayableClip[]): Promise<void> => {
      stop();
      const own = new AbortController();
      controller.current = own;
      const preloaded = clips.map((clip) => {
        if (!clip.url) return null;
        const audio = new Audio(clip.url);
        audio.preload = 'auto';
        return audio;
      });
      for (const [i, clip] of clips.entries()) {
        if (own.signal.aborted) return;
        setCurrent(clip.id);
        const audio = preloaded[i] ?? null;
        await meter(audio);
        const played = audio ? await playAudio(audio, own.signal) : false;
        if (!played && !own.signal.aborted) {
          await meter(null);
          await speak(clip.text, own.signal);
        }
      }
      if (controller.current === own) {
        controller.current = null;
        stopMeter();
        setCurrent(null);
      }
    },
    [stop, meter, stopMeter],
  );

  React.useEffect(
    () => () => {
      stop();
      void context.current?.close();
      context.current = null;
    },
    [stop],
  );

  return { current, level, play, stop };
}
