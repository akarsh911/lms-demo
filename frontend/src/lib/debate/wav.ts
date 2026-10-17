export const CAPTURE_SAMPLE_RATE = 16000;

export function floatToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function encodeWav(pcm: Int16Array, sampleRate: number = CAPTURE_SAMPLE_RATE): ArrayBuffer {
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  new Int16Array(buffer, 44, pcm.length).set(pcm);
  return buffer;
}

export class Downsampler {
  private readonly ratio: number;
  private position = 0;
  private sum = 0;
  private count = 0;

  constructor(fromRate: number, toRate: number = CAPTURE_SAMPLE_RATE) {
    this.ratio = fromRate / toRate;
  }

  process(input: Float32Array): Float32Array {
    if (this.ratio === 1) return input.slice();
    const out: number[] = [];
    for (const sample of input) {
      this.sum += sample;
      this.count += 1;
      this.position += 1;
      if (this.position >= this.ratio) {
        out.push(this.sum / this.count);
        this.position -= this.ratio;
        this.sum = 0;
        this.count = 0;
      }
    }
    return Float32Array.from(out);
  }
}
