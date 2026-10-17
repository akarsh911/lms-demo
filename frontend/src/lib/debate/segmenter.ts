import type { SegmentMetrics } from '@/types/debate';

import { CAPTURE_SAMPLE_RATE, floatToPcm16 } from './wav';

export interface CapturedSegment {
  pcm: Int16Array;
  durationMs: number;
  metrics: SegmentMetrics;
}

export interface SegmenterOptions {
  frameMs: number;
  pauseCutMs: number;
  hardCutMs: number;
  minVoicedMs: number;
  prerollMs: number;
  trailMs: number;
  longPauseMs: number;
  minThreshold: number;
}

export const DEFAULT_SEGMENTER: SegmenterOptions = {
  frameMs: 20,
  pauseCutMs: 900,
  hardCutMs: 20000,
  minVoicedMs: 300,
  prerollMs: 200,
  trailMs: 240,
  longPauseMs: 2000,
  minThreshold: 0.012,
};

interface OpenSegment {
  frames: Float32Array[];
  voicedMs: number;
  pauseBeforeMs: number;
  silenceMs: number;
  longPauses: number;
  longestPauseMs: number;
}

export class SpeechSegmenter {
  private readonly options: SegmenterOptions;
  private readonly frameSize: number;
  private pending: Float32Array = new Float32Array(0);
  private preroll: Float32Array[] = [];
  private open: OpenSegment | null = null;
  private idleMs = 0;
  private noiseFloor = 0;
  level = 0;
  speaking = false;

  constructor(options: SegmenterOptions = DEFAULT_SEGMENTER, sampleRate: number = CAPTURE_SAMPLE_RATE) {
    this.options = options;
    this.frameSize = Math.round((sampleRate * options.frameMs) / 1000);
  }

  push(samples: Float32Array): CapturedSegment[] {
    const joined = new Float32Array(this.pending.length + samples.length);
    joined.set(this.pending);
    joined.set(samples, this.pending.length);
    const emitted: CapturedSegment[] = [];
    let offset = 0;
    for (; offset + this.frameSize <= joined.length; offset += this.frameSize) {
      const segment = this.frame(joined.slice(offset, offset + this.frameSize));
      if (segment) emitted.push(segment);
    }
    this.pending = joined.slice(offset);
    return emitted;
  }

  flush(): CapturedSegment | null {
    const segment = this.open ? this.close(this.open, 0) : null;
    this.open = null;
    this.speaking = false;
    return segment;
  }

  private frame(frame: Float32Array): CapturedSegment | null {
    const { frameMs, pauseCutMs, hardCutMs, longPauseMs, minThreshold } = this.options;
    const rms = Math.sqrt(frame.reduce((acc, s) => acc + s * s, 0) / frame.length);
    const voiced = rms > Math.max(minThreshold, this.noiseFloor * 3);
    if (!voiced) this.noiseFloor = this.noiseFloor === 0 ? rms : this.noiseFloor * 0.95 + rms * 0.05;
    this.level = rms;
    this.speaking = voiced;

    if (!this.open) {
      if (!voiced) {
        this.idleMs += frameMs;
        this.preroll = [...this.preroll, frame].slice(-Math.ceil(this.options.prerollMs / frameMs));
        return null;
      }
      this.open = {
        frames: [...this.preroll, frame],
        voicedMs: frameMs,
        pauseBeforeMs: this.idleMs,
        silenceMs: 0,
        longPauses: 0,
        longestPauseMs: 0,
      };
      this.preroll = [];
      this.idleMs = 0;
      return null;
    }

    const open = this.open;
    open.frames.push(frame);
    if (voiced) {
      if (open.silenceMs > 0) {
        if (open.silenceMs >= longPauseMs) open.longPauses += 1;
        open.longestPauseMs = Math.max(open.longestPauseMs, open.silenceMs);
      }
      open.voicedMs += frameMs;
      open.silenceMs = 0;
    } else {
      open.silenceMs += frameMs;
    }

    if (open.silenceMs >= pauseCutMs) {
      this.open = null;
      this.idleMs = open.silenceMs;
      return this.close(open, open.silenceMs);
    }
    if (open.frames.length * frameMs >= hardCutMs) {
      this.open = null;
      this.idleMs = 0;
      return this.close(open, open.silenceMs);
    }
    return null;
  }

  private close(open: OpenSegment, trailingSilenceMs: number): CapturedSegment | null {
    const { frameMs, minVoicedMs, trailMs } = this.options;
    if (open.voicedMs < minVoicedMs) return null;
    const dropFrames = Math.max(0, Math.floor((trailingSilenceMs - trailMs) / frameMs));
    const kept = open.frames.slice(0, open.frames.length - dropFrames);
    const total = kept.reduce((acc, f) => acc + f.length, 0);
    const samples = new Float32Array(total);
    let at = 0;
    for (const f of kept) {
      samples.set(f, at);
      at += f.length;
    }
    const durationMs = kept.length * frameMs;
    return {
      pcm: floatToPcm16(samples),
      durationMs,
      metrics: {
        voiced_ms: Math.min(open.voicedMs, durationMs),
        pause_before_ms: open.pauseBeforeMs,
        long_pauses: open.longPauses,
        longest_pause_ms: open.longestPauseMs,
      },
    };
  }
}
