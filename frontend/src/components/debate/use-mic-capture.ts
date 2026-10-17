'use client';

import * as React from 'react';

import { SpeechSegmenter, type CapturedSegment } from '@/lib/debate/segmenter';
import { Downsampler } from '@/lib/debate/wav';

import { openMicStream, preferredMic } from './mic-preference';

export type MicState = 'idle' | 'requesting' | 'listening' | 'denied' | 'unavailable' | 'busy' | 'failed';

export const MIC_PROBLEM: Partial<Record<MicState, string>> = {
  denied: 'Microphone blocked. Allow it in the address bar, then retry.',
  unavailable: 'No microphone found. Plug one in, then retry.',
  busy: 'Another app is using your microphone. Close it, then retry.',
  failed: 'The microphone could not start. Retry, or reload the page.',
};

const WORKLET_URL = '/debate/capture-worklet.js';
const LEVEL_EVERY_MS = 120;

export interface CaptureRig {
  stream: MediaStream;
  context: AudioContext;
  node: AudioWorkletNode;
  label: string;
}

export function micFailure(cause: unknown): MicState {
  if (!(cause instanceof DOMException)) return 'failed';
  if (cause.name === 'NotAllowedError' || cause.name === 'SecurityError') return 'denied';
  if (cause.name === 'NotFoundError' || cause.name === 'OverconstrainedError') return 'unavailable';
  if (cause.name === 'NotReadableError' || cause.name === 'AbortError') return 'busy';
  return 'failed';
}

export function captureSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof AudioWorkletNode !== 'undefined';
}

export async function openCapture(onChunk: (samples: Float32Array, sampleRate: number) => void): Promise<CaptureRig> {
  const stream = await openMicStream(preferredMic());
  let context: AudioContext | null = null;
  try {
    context = new AudioContext();
    await context.audioWorklet.addModule(WORKLET_URL);
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, 'debate-capture');
    const silent = context.createGain();
    silent.gain.value = 0;
    source.connect(node);
    node.connect(silent);
    silent.connect(context.destination);
    await context.resume();
    const rate = context.sampleRate;
    node.port.onmessage = (event: MessageEvent<Float32Array>) => onChunk(event.data, rate);
    return { stream, context, node, label: stream.getAudioTracks()[0]?.label ?? '' };
  } catch (cause) {
    stream.getTracks().forEach((t) => t.stop());
    void context?.close();
    throw cause;
  }
}

export function closeCapture(rig: CaptureRig): void {
  rig.node.port.onmessage = null;
  rig.node.disconnect();
  rig.stream.getTracks().forEach((t) => t.stop());
  void rig.context.close();
}

interface Rig {
  capture: CaptureRig;
  segmenter: SpeechSegmenter;
}

export function useMicCapture(onSegment: (segment: CapturedSegment) => void): {
  state: MicState;
  level: number;
  speaking: boolean;
  device: string;
  start: () => Promise<void>;
  stop: () => CapturedSegment | null;
} {
  const [state, setState] = React.useState<MicState>('idle');
  const [level, setLevel] = React.useState(0);
  const [speaking, setSpeaking] = React.useState(false);
  const [device, setDevice] = React.useState('');
  const rig = React.useRef<Rig | null>(null);
  const handler = React.useRef(onSegment);
  const lastLevel = React.useRef(0);

  React.useEffect(() => {
    handler.current = onSegment;
  }, [onSegment]);

  const generation = React.useRef(0);

  const teardown = React.useCallback((): CapturedSegment | null => {
    generation.current += 1;
    const current = rig.current;
    rig.current = null;
    if (!current) return null;
    closeCapture(current.capture);
    setSpeaking(false);
    setLevel(0);
    return current.segmenter.flush();
  }, []);

  const start = React.useCallback(async (): Promise<void> => {
    if (rig.current) return;
    if (!captureSupported()) {
      setState('unavailable');
      return;
    }
    const own = generation.current;
    setState('requesting');
    const segmenter = new SpeechSegmenter();
    let downsampler: Downsampler | null = null;
    try {
      const capture = await openCapture((samples, rate) => {
        if (own !== generation.current) return;
        downsampler ??= new Downsampler(rate);
        for (const segment of segmenter.push(downsampler.process(samples))) handler.current(segment);
        const now = performance.now();
        if (now - lastLevel.current > LEVEL_EVERY_MS) {
          lastLevel.current = now;
          setLevel(segmenter.level);
          setSpeaking(segmenter.speaking);
        }
      });
      if (own !== generation.current || rig.current) {
        closeCapture(capture);
        return;
      }
      rig.current = { capture, segmenter };
      setDevice(capture.label);
      setState('listening');
    } catch (cause) {
      if (own === generation.current) setState(micFailure(cause));
    }
  }, []);

  const stop = React.useCallback((): CapturedSegment | null => {
    const last = teardown();
    setState((s) => (s === 'listening' || s === 'requesting' ? 'idle' : s));
    return last;
  }, [teardown]);

  React.useEffect(
    () => () => {
      const last = teardown();
      if (last) handler.current(last);
    },
    [teardown],
  );

  return { state, level, speaking, device, start, stop };
}
