import * as React from 'react';

import { CAPTURE_SAMPLE_RATE, encodeWav } from '@/lib/debate/wav';

export const MAX_KEPT_SAMPLES = CAPTURE_SAMPLE_RATE * 660;

interface KeptSegment {
  seq: number;
  pcm: Int16Array;
}

interface Store {
  sessionId: string | null;
  turns: Map<number, KeptSegment[]>;
  samples: number;
  version: number;
  playing: string | null;
}

const store: Store = { sessionId: null, turns: new Map(), samples: 0, version: 0, playing: null };
const listeners = new Set<() => void>();
let audio: HTMLAudioElement | null = null;
let source: string | null = null;

function changed(): void {
  store.version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function keepRecording(sessionId: string, turnIndex: number, seq: number, pcm: Int16Array): boolean {
  if (store.sessionId !== sessionId) {
    stopRecording();
    store.sessionId = sessionId;
    store.turns = new Map();
    store.samples = 0;
  }
  if (pcm.length === 0 || store.samples + pcm.length > MAX_KEPT_SAMPLES) return false;
  const turn = store.turns.get(turnIndex) ?? [];
  turn.push({ seq, pcm });
  turn.sort((a, b) => a.seq - b.seq);
  store.turns.set(turnIndex, turn);
  store.samples += pcm.length;
  changed();
  return true;
}

export function recordedMs(sessionId: string, turnIndex: number): number {
  if (store.sessionId !== sessionId) return 0;
  const samples = (store.turns.get(turnIndex) ?? []).reduce((sum, s) => sum + s.pcm.length, 0);
  return Math.round((samples / CAPTURE_SAMPLE_RATE) * 1000);
}

export function turnRecording(sessionId: string, turnIndex: number): Blob | null {
  if (store.sessionId !== sessionId) return null;
  const segments = store.turns.get(turnIndex);
  if (!segments || segments.length === 0) return null;
  const joined = new Int16Array(segments.reduce((sum, s) => sum + s.pcm.length, 0));
  let offset = 0;
  for (const segment of segments) {
    joined.set(segment.pcm, offset);
    offset += segment.pcm.length;
  }
  return new Blob([encodeWav(joined)], { type: 'audio/wav' });
}

export function forgetRecordings(): void {
  stopRecording();
  store.sessionId = null;
  store.turns = new Map();
  store.samples = 0;
  changed();
}

function release(): void {
  if (audio) {
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
  }
  if (source) URL.revokeObjectURL(source);
  audio = null;
  source = null;
}

export function stopRecording(): void {
  release();
  if (store.playing === null) return;
  store.playing = null;
  changed();
}

export async function playBlob(key: string, blob: Blob): Promise<boolean> {
  stopRecording();
  source = URL.createObjectURL(blob);
  const own = new Audio(source);
  audio = own;
  store.playing = key;
  changed();
  const finished = (): void => {
    if (audio === own) stopRecording();
  };
  own.onended = finished;
  own.onerror = finished;
  try {
    await own.play();
    return true;
  } catch {
    finished();
    return false;
  }
}

export function playRecording(sessionId: string, turnIndex: number): Promise<boolean> {
  const blob = turnRecording(sessionId, turnIndex);
  if (!blob) return Promise.resolve(false);
  return playBlob(`${sessionId}:${turnIndex}`, blob);
}

export function useRecordings(): { version: number; playing: string | null } {
  const version = React.useSyncExternalStore(
    subscribe,
    () => store.version,
    () => 0,
  );
  return { version, playing: store.playing };
}
