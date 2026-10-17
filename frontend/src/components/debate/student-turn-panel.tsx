'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { keyframes, useTheme } from '@mui/material/styles';
import { Mic } from 'lucide-react';

import { debateErrorMessage } from '@/lib/debate/failure';
import type { CapturedSegment } from '@/lib/debate/segmenter';
import { encodeWav } from '@/lib/debate/wav';
import { debateService } from '@/services/debate';
import type { DebateSegment, DebateSession } from '@/types/debate';

import { MicLevelMeter } from './mic-level-meter';
import { keepRecording, stopRecording } from './turn-recordings';
import { MIC_PROBLEM, useMicCapture, type MicState } from './use-mic-capture';

interface LocalSegment {
  seq: number;
  status: 'sending' | 'done' | 'failed';
  text: string;
}

export interface MicReading {
  state: MicState;
  level: number;
  speaking: boolean;
  sending: boolean;
}

const MIC_OFF: ReadonlySet<MicState> = new Set(['denied', 'unavailable', 'busy', 'failed']);

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
`;

function LiveMic({ state, level, device }: { state: MicState; level: number; device: string }): React.ReactElement | null {
  const theme = useTheme();
  const on = state === 'listening';
  if (!on && state !== 'requesting') return null;

  return (
    <Stack
      direction="row"
      spacing={1.25}
      role="status"
      aria-label={on ? 'Microphone on, recording your turn' : 'Waiting for the microphone'}
      sx={{
        alignItems: 'center',
        px: 1.5,
        py: 1,
        borderRadius: `${theme.band.radius.md}px`,
        backgroundColor: on ? theme.tints.red : theme.tints.grey,
        color: on ? theme.onTint.red : theme.onTint.grey,
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 8,
          height: 8,
          flex: 'none',
          borderRadius: '50%',
          backgroundColor: 'currentColor',
          animation: on ? `${pulse} 1.2s ease-in-out infinite` : 'none',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      />
      <Mic size={16} aria-hidden style={{ flex: 'none' }} />
      <Typography variant="subtitle2" sx={{ flex: 'none' }}>
        {on ? 'Mic on' : 'Starting mic…'}
      </Typography>
      <MicLevelMeter level={on ? level : 0} label="Your microphone level" />
      {on && device ? (
        <Typography variant="caption" noWrap sx={{ display: { xs: 'none', sm: 'block' }, maxWidth: 160 }} title={device}>
          {device}
        </Typography>
      ) : null}
    </Stack>
  );
}

export function StudentTurnPanel({
  session,
  turnIndex,
  onFinish,
  onLiveText,
  onMic,
  flushRef,
}: {
  session: DebateSession;
  turnIndex: number;
  onFinish: (seqs: number[]) => Promise<boolean>;
  onLiveText: (text: string) => void;
  onMic: (reading: MicReading) => void;
  flushRef: React.RefObject<(() => Promise<void>) | null>;
}): React.ReactElement {
  const typed = debateService.acceptsTypedTurns(session.id);
  const nextSeq = React.useRef(0);
  const uploads = React.useRef<Promise<unknown>[]>([]);
  const transcribed = React.useRef(new Set<number>());
  const [segments, setSegments] = React.useState<LocalSegment[]>([]);
  const [uploadError, setUploadError] = React.useState<unknown>(null);
  const [finishing, setFinishing] = React.useState(false);
  const [draft, setDraft] = React.useState('');

  const track = React.useCallback((seq: number, request: Promise<DebateSegment>): void => {
    setSegments((s) => [...s, { seq, status: 'sending', text: '' }]);
    const settled = request.then(
      (segment) => {
        transcribed.current.add(seq);
        setSegments((s) => s.map((x) => (x.seq === seq ? { ...x, status: 'done', text: segment.text } : x)));
      },
      (cause: unknown) => {
        setUploadError(cause);
        setSegments((s) => s.map((x) => (x.seq === seq ? { ...x, status: 'failed' } : x)));
      },
    );
    uploads.current.push(settled);
  }, []);

  const send = React.useCallback(
    (segment: CapturedSegment): void => {
      const seq = nextSeq.current++;
      keepRecording(session.id, turnIndex, seq, segment.pcm);
      const wav = new Blob([encodeWav(segment.pcm)], { type: 'audio/wav' });
      track(seq, debateService.addSegment(session.id, turnIndex, seq, wav, segment.durationMs, segment.metrics));
    },
    [session.id, turnIndex, track],
  );

  const mic = useMicCapture(send);
  const { start, stop } = mic;

  React.useEffect(() => {
    stopRecording();
    void start();
  }, [start]);

  React.useEffect(() => {
    flushRef.current = async () => {
      const last = stop();
      if (last) send(last);
      await Promise.allSettled(uploads.current);
    };
    return () => {
      flushRef.current = null;
    };
  }, [flushRef, stop, send]);

  const liveText = segments
    .filter((s) => s.status === 'done' && s.text)
    .map((s) => s.text)
    .join(' ');
  const sending = segments.some((s) => s.status === 'sending');

  React.useEffect(() => {
    onLiveText(sending ? `${liveText}${liveText ? ' ' : ''}…` : liveText);
  }, [liveText, sending, onLiveText]);

  React.useEffect(() => {
    onMic({ state: mic.state, level: mic.level, speaking: mic.speaking, sending });
  }, [mic.state, mic.level, mic.speaking, sending, onMic]);

  const addTyped = (): void => {
    const text = draft.trim();
    if (!text) return;
    const seq = nextSeq.current++;
    setDraft('');
    track(seq, debateService.addTypedSegment(session.id, turnIndex, seq, text));
  };

  const finish = async (): Promise<void> => {
    setFinishing(true);
    addTyped();
    const last = stop();
    if (last) send(last);
    await Promise.allSettled(uploads.current);
    const handed = await onFinish([...transcribed.current].sort((a, b) => a - b));
    if (!handed) {
      setFinishing(false);
      void start();
    }
  };

  const micMessage = MIC_PROBLEM[mic.state];
  const typingFirst = typed && MIC_OFF.has(mic.state);
  const retryMic =
    micMessage ? (
      <Button size="small" onClick={() => void start()}>
        Retry
      </Button>
    ) : undefined;

  return (
    <Stack spacing={1.5}>
      <LiveMic state={mic.state} level={mic.level} device={mic.device} />

      {micMessage && !typingFirst ? (
        <Alert
          severity="warning"
          variant="outlined"
          action={retryMic}
        >
          {micMessage}
        </Alert>
      ) : null}

      {uploadError ? (
        <Alert severity="warning" variant="outlined" onClose={() => setUploadError(null)}>
          {debateErrorMessage(uploadError)}
        </Alert>
      ) : null}

      {typed ? (
        <Stack
          component="form"
          spacing={0.5}
          onSubmit={(e) => {
            e.preventDefault();
            addTyped();
          }}
        >
          <TextField
            fullWidth
            size="small"
            label={typingFirst ? 'Type your argument' : 'Or type instead'}
            helperText="Enter adds it to your turn. Finish sends anything still in the box."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={finishing}
            autoFocus={typingFirst}
          />
          {typingFirst && micMessage ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                {micMessage} Your turn is typed.
              </Typography>
              {retryMic}
            </Stack>
          ) : null}
        </Stack>
      ) : null}

      <Tooltip title={`Each pause sends what you said. Up to ${Math.round(session.limits.max_student_turn_s / 60)} min a turn.`}>
        <span>
          <Button variant="contained" size="large" fullWidth onClick={() => void finish()} disabled={finishing}>
            {finishing ? 'Handing over…' : draft.trim() ? 'Send and finish my turn' : 'Finish my turn'}
          </Button>
        </span>
      </Tooltip>
    </Stack>
  );
}
