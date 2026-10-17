'use client';

import * as React from 'react';

import type { Lang } from '@/lib/jerry/brain';

interface RecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { transcript: string };
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  abort: () => void;
}

type RecognitionCtor = new () => Recognition;

const LOCALE: Readonly<Record<Lang, string>> = { en: 'en-IN', hi: 'hi-IN', gu: 'gu-IN' };

// What went wrong, in words a teacher at a demo can act on.
const PROBLEM: Readonly<Record<string, string>> = {
  insecure: 'The mic only works on localhost or an https link. Open Jerry from one of those.',
  'not-allowed': 'The microphone is blocked. Click the lock icon in the address bar, allow the microphone, and try again.',
  'service-not-allowed': 'The browser blocked speech recognition here. Try Chrome or Edge.',
  'audio-capture': 'No microphone was found. Check that one is plugged in and not used by another app.',
  network: 'Voice needs an internet connection for speech recognition. Check the connection.',
  'no-speech': "I didn't hear anything. Tap the mic and speak a little louder.",
  unsupported: 'Voice needs Chrome or Edge. You can still type to Jerry.',
};

// Natural-sounding voices first; any voice in the language after that.
const PREFERRED: Readonly<Record<Lang, readonly RegExp[]>> = {
  en: [/Google UK English Female/i, /Google US English/i, /Google.*English/i, /Microsoft (Neerja|Aria|Jenny|Zira|Heera)/i, /en-IN/i, /^en[-_]/i],
  hi: [/Google हिन्दी/i, /Microsoft (Swara|Kalpana)/i, /^hi[-_]/i],
  gu: [/Google ગુજરાતી/i, /Microsoft (Dhwani|Niranjan)/i, /^gu[-_]/i],
};

function bestVoice(voices: readonly SpeechSynthesisVoice[], lang: Lang): SpeechSynthesisVoice | null {
  for (const want of PREFERRED[lang]) {
    const v = voices.find((x) => want.test(x.lang) || want.test(x.name));
    if (v) return v;
  }
  return null;
}

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const subscribeNone = (): (() => void) => () => undefined;

// Browser speech both ways, no API key. Sound lives only while this page is open and visible: leaving the page, switching tab or pressing Esc silences it.
export function useVoice(lang: Lang): {
  canListen: boolean;
  listening: boolean;
  speaking: boolean;
  heard: string;
  problem: string | null;
  listen: (onHeard: (text: string) => void) => void;
  speak: (text: string, onStart: () => void, onEnd: () => void) => void;
  stop: () => void;
  canSpeak: (lang: Lang) => boolean;
} {
  const canListen = React.useSyncExternalStore(subscribeNone, () => recognitionCtor() !== null, () => false);
  const [listening, setListening] = React.useState(false);
  const [speaking, setSpeaking] = React.useState(false);
  const [heard, setHeard] = React.useState('');
  const [problem, setProblem] = React.useState<string | null>(null);
  const live = React.useRef(false);
  const rec = React.useRef<Recognition | null>(null);
  const generation = React.useRef(0);

  const stop = React.useCallback((): void => {
    generation.current += 1;
    window.speechSynthesis?.cancel();
    // Chrome can start an utterance that was queued a moment before cancel; a second cancel catches it.
    setTimeout(() => window.speechSynthesis?.cancel(), 60);
    rec.current?.abort();
    rec.current = null;
    setSpeaking(false);
    setListening(false);
  }, []);

  React.useEffect(() => {
    // The mic policy is fixed when a document loads, so arriving here by in-app navigation keeps the rest of the app's "no microphone". Reload once to pick up this page's policy.
    const policy = (document as unknown as { featurePolicy?: { allowsFeature: (f: string) => boolean } }).featurePolicy;
    try {
      if (policy?.allowsFeature('microphone')) sessionStorage.removeItem('jerry.mic-reload');
      else if (policy && sessionStorage.getItem('jerry.mic-reload') !== location.pathname) {
        sessionStorage.setItem('jerry.mic-reload', location.pathname);
        location.reload();
      }
    } catch {
      // Storage blocked: skip the reload rather than risk a loop.
    }
  }, []);

  React.useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.getVoices();
    // Chrome fills the voice list in late; asking again once it changes makes it ready for the first reply.
    const warm = (): void => void synth.getVoices();
    synth.addEventListener?.('voiceschanged', warm);
    return () => synth.removeEventListener?.('voiceschanged', warm);
  }, []);

  React.useEffect(() => {
    live.current = true;
    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') stop();
    };
    // Losing focus to another window silences Jerry's voice; the mic is left alone, because Chrome's own permission prompt takes focus too.
    const onBlur = (): void => {
      generation.current += 1;
      window.speechSynthesis?.cancel();
      setSpeaking(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') stop();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', stop);
    window.addEventListener('blur', onBlur);
    window.addEventListener('keydown', onKey);
    return () => {
      live.current = false;
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', stop);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKey);
      stop();
    };
  }, [stop]);

  const listen = (onHeard: (text: string) => void): void => {
    const Ctor = recognitionCtor();
    setProblem(null);
    setHeard('');
    if (!window.isSecureContext) return setProblem(PROBLEM.insecure ?? null);
    if (!Ctor) return setProblem(PROBLEM.unsupported ?? null);
    if (listening || !live.current) return;
    window.speechSynthesis?.cancel();
    setListening(true);

    // Asking for the mic first gives a clear permission prompt and a clear failure, which speech recognition alone does not.
    const ask = navigator.mediaDevices?.getUserMedia ? navigator.mediaDevices.getUserMedia({ audio: true }) : Promise.resolve(null);
    void ask
      .then((stream) => {
        stream?.getTracks().forEach((t) => t.stop());
        if (!live.current) return;
        const r = new Ctor();
        r.lang = LOCALE[lang];
        r.interimResults = true;
        r.continuous = false;
        r.maxAlternatives = 1;
        let finalText = '';
        let lastInterim = '';
        r.onresult = (e) => {
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i += 1) {
            const result = e.results[i];
            if (!result) continue;
            if (result.isFinal) finalText += result[0].transcript;
            else interim += result[0].transcript;
          }
          if (interim) lastInterim = interim;
          setHeard(finalText || interim);
        };
        r.onerror = (e) => setProblem(e.error === 'aborted' ? null : (PROBLEM[e.error] ?? `Voice stopped (${e.error}). Try again or type instead.`));
        r.onend = () => {
          setListening(false);
          rec.current = null;
          const said = (finalText || lastInterim).trim();
          if (said && live.current) onHeard(said);
        };
        rec.current = r;
        r.start();
      })
      .catch((e: unknown) => {
        setListening(false);
        const name = e instanceof DOMException ? e.name : '';
        setProblem(name === 'NotFoundError' ? (PROBLEM['audio-capture'] ?? null) : (PROBLEM['not-allowed'] ?? null));
      });
  };

  const speak = (text: string, onStart: () => void, onEnd: () => void): void => {
    const synth = window.speechSynthesis;
    if (!synth || !live.current || document.visibilityState === 'hidden' || !document.hasFocus()) {
      onEnd();
      return;
    }
    if (synth.speaking || synth.pending) synth.cancel();
    const mine = generation.current;
    const voice = bestVoice(synth.getVoices(), lang);
    // With no voice for the language, Chrome would read the script with an English voice; staying quiet is better.
    if (!voice && lang === 'gu') {
      onEnd();
      return;
    }
    // Short pieces: Chrome's online voices crackle and cut off on long utterances.
    const pieces = text
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
      .split(/(?<=[.!?।])\s+/)
      .map((piece) => piece.trim())
      .filter(Boolean);
    if (pieces.length === 0) {
      onEnd();
      return;
    }
    let started = false;
    pieces.forEach((piece, i) => {
      const u = new SpeechSynthesisUtterance(piece);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? (lang === 'en' ? 'en-US' : LOCALE[lang]);
      u.rate = lang === 'en' ? 1 : 0.95;
      u.pitch = lang === 'en' ? 1.2 : 1.05;
      u.onstart = () => {
        if (mine !== generation.current || !live.current) {
          synth.cancel();
          return;
        }
        if (!started) {
          started = true;
          setSpeaking(true);
          onStart();
        }
      };
      const last = i === pieces.length - 1;
      u.onend = () => {
        if (last) {
          setSpeaking(false);
          onEnd();
        }
      };
      u.onerror = () => {
        setSpeaking(false);
        onEnd();
      };
      synth.speak(u);
    });
  };

  const canSpeak = (l: Lang): boolean => (typeof window === 'undefined' || !window.speechSynthesis ? false : bestVoice(window.speechSynthesis.getVoices(), l) !== null);

  return { canListen, listening, speaking, heard, problem, listen, speak, stop, canSpeak };
}
