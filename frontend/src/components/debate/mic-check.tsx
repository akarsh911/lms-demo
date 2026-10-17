import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Mic, Play, Square } from 'lucide-react';

import { CAPTURE_SAMPLE_RATE, Downsampler, encodeWav, floatToPcm16 } from '@/lib/debate/wav';

import { MicLevelMeter, meterValue } from './mic-level-meter';
import { preferMic, preferredMic } from './mic-preference';
import { playBlob, stopRecording, useRecordings } from './turn-recordings';
import { captureSupported, closeCapture, MIC_PROBLEM, micFailure, openCapture, type CaptureRig, type MicState } from './use-mic-capture';

export const TEST_MS = 3000;
const PLAYBACK_KEY = 'mic-test';
const DEFAULT_DEVICE = 'default-mic';
const HEARD_PERCENT = 12;
const LEVEL_EVERY_MS = 90;

type Stage = 'idle' | 'recording' | 'recorded';

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

function joinChunks(chunks: readonly Float32Array[]): Float32Array {
  const joined = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

async function listMics(): Promise<MediaDeviceInfo[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
}

export function MicCheck({ disabled = false, onTest }: { disabled?: boolean; onTest?: () => void }): React.ReactElement {
  const theme = useTheme();
  const { playing } = useRecordings();
  const [mics, setMics] = React.useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = React.useState<string>(() => preferredMic() ?? DEFAULT_DEVICE);
  const [stage, setStage] = React.useState<Stage>('idle');
  const [problem, setProblem] = React.useState<MicState | null>(null);
  const [level, setLevel] = React.useState(0);
  const [peak, setPeak] = React.useState(0);
  const [left, setLeft] = React.useState(0);
  const [take, setTake] = React.useState<Blob | null>(null);
  const rig = React.useRef<CaptureRig | null>(null);
  const timers = React.useRef<number[]>([]);
  const alive = React.useRef(true);
  const runs = React.useRef(0);
  const listings = React.useRef(0);

  const refreshMics = React.useCallback((): void => {
    const asked = ++listings.current;
    void listMics()
      .then((found) => {
        if (asked !== listings.current) return;
        setMics(found);
        if (found.length === 0) return;
        setDevice((current) => (current === DEFAULT_DEVICE || found.some((d) => d.deviceId === current) ? current : DEFAULT_DEVICE));
      })
      .catch(() => undefined);
  }, []);

  const release = React.useCallback((): void => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (rig.current) closeCapture(rig.current);
    rig.current = null;
    setLevel(0);
  }, []);

  React.useEffect(() => {
    alive.current = true;
    refreshMics();
    const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    media?.addEventListener?.('devicechange', refreshMics);
    return () => {
      alive.current = false;
      media?.removeEventListener?.('devicechange', refreshMics);
      release();
      stopRecording();
    };
  }, [refreshMics, release]);

  const test = async (): Promise<void> => {
    onTest?.();
    release();
    stopRecording();
    setProblem(null);
    setTake(null);
    setPeak(0);
    if (!captureSupported()) {
      setProblem('unavailable');
      return;
    }
    setStage('recording');
    setLeft(Math.ceil(TEST_MS / 1000));
    const run = ++runs.current;
    const target = (CAPTURE_SAMPLE_RATE * TEST_MS) / 1000;
    const chunks: Float32Array[] = [];
    let collected = 0;
    let done = false;
    let downsampler: Downsampler | null = null;
    let lastLevel = 0;
    let loudest = 0;
    const finish = (): void => {
      if (done || run !== runs.current || !alive.current) return;
      done = true;
      release();
      const pcm = floatToPcm16(joinChunks(chunks).subarray(0, target));
      if (pcm.length < CAPTURE_SAMPLE_RATE / 4) {
        setStage('idle');
        setProblem('failed');
        return;
      }
      setPeak(loudest);
      setTake(new Blob([encodeWav(pcm)], { type: 'audio/wav' }));
      setStage('recorded');
    };
    try {
      const opened = await openCapture((samples, rate) => {
        if (done) return;
        downsampler ??= new Downsampler(rate);
        const chunk = downsampler.process(samples);
        chunks.push(chunk);
        collected += chunk.length;
        loudest = Math.max(loudest, rms(samples));
        const now = performance.now();
        if (now - lastLevel > LEVEL_EVERY_MS) {
          lastLevel = now;
          setLevel(rms(samples));
          setLeft(Math.max(1, Math.ceil((target - collected) / CAPTURE_SAMPLE_RATE)));
        }
        if (collected >= target) window.setTimeout(finish, 0);
      });
      if (!alive.current || run !== runs.current) {
        closeCapture(opened);
        return;
      }
      rig.current = opened;
    } catch (cause) {
      if (!alive.current || run !== runs.current) return;
      release();
      setStage('idle');
      setProblem(micFailure(cause));
      return;
    }
    refreshMics();
    timers.current.push(window.setTimeout(finish, TEST_MS * 2));
  };

  const choose = (value: string): void => {
    runs.current += 1;
    setDevice(value);
    preferMic(value === DEFAULT_DEVICE ? null : value);
    release();
    stopRecording();
    setStage('idle');
    setTake(null);
  };

  const listening = stage === 'recording';
  const heard = meterValue(peak) >= HEARD_PERCENT;
  const replaying = playing === PLAYBACK_KEY;
  const message = problem ? MIC_PROBLEM[problem] : null;
  const verdict = listening
    ? `Recording. Say something… ${left}s`
    : stage === 'recorded'
      ? heard
        ? 'We heard you. Play it back to check it sounds clear.'
        : 'We heard almost nothing. Check your mic is not muted, or pick another one.'
      : 'Recording stays on this device. Nothing is sent until the debate starts.';

  return (
    <Card component="section" aria-labelledby="mic-check-title">
      <CardHeader
        title="Check your microphone"
        subheader="Pick a mic, say a sentence, then listen back"
        slotProps={{ title: { id: 'mic-check-title', component: 'h2' } }}
      />
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
            <TextField
              select
              size="small"
              label="Microphone"
              value={device}
              onChange={(e) => choose(e.target.value)}
              disabled={disabled || listening}
              sx={{ minWidth: 0, flex: { sm: '1 1 240px' } }}
            >
              <MenuItem value={DEFAULT_DEVICE}>System default</MenuItem>
              {mics.map((mic, index) => (
                <MenuItem key={mic.deviceId} value={mic.deviceId}>
                  {mic.label || `Microphone ${index + 1}`}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction="row" spacing={1} sx={{ flex: 'none', flexWrap: 'wrap', gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<Mic size={16} aria-hidden />}
                onClick={() => void test()}
                disabled={disabled || listening}
              >
                {listening ? `Listening… ${left}s` : stage === 'recorded' ? 'Test again' : 'Test: say something'}
              </Button>
              <Button
                variant="outlined"
                startIcon={replaying ? <Square size={14} aria-hidden /> : <Play size={16} aria-hidden />}
                onClick={() => {
                  if (replaying) stopRecording();
                  else if (take) void playBlob(PLAYBACK_KEY, take);
                }}
                disabled={disabled || !take || listening}
              >
                {replaying ? 'Stop playing' : 'Play test'}
              </Button>
            </Stack>
          </Stack>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box sx={{ display: 'flex', color: listening ? theme.onTint.green : theme.brand.tert }}>
              <Mic size={18} aria-hidden />
            </Box>
            <MicLevelMeter level={listening ? level : 0} label="Test microphone level" />
          </Stack>
          <Typography variant="body2" color="text.secondary" aria-live="polite">
            {verdict}
          </Typography>
          {message ? (
            <Alert
              severity="warning"
              variant="outlined"
              action={
                <Button size="small" onClick={() => void test()}>
                  Retry
                </Button>
              }
            >
              {message}
            </Alert>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
