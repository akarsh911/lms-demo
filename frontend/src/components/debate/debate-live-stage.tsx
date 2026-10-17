'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import { Square } from 'lucide-react';

import { debateErrorMessage } from '@/lib/debate/failure';
import type { DebateSession } from '@/types/debate';

import { AiTurnPanel } from './ai-turn-panel';
import { DebateArena } from './debate-arena';
import { PlayRecordingButton } from './play-recording-button';
import { StudentTurnPanel, type MicReading } from './student-turn-panel';
import { useServerClock } from './use-server-clock';

const IDLE_MIC: MicReading = { state: 'idle', level: 0, speaking: false, sending: false };

function micStatus(mic: MicReading): string {
  if (mic.state === 'requesting') return 'Allow the microphone';
  if (mic.state !== 'listening') return '';
  if (mic.sending) return 'Transcribing…';
  return mic.speaking ? 'Hearing you' : 'Listening';
}

export function DebateLiveStage({
  session,
  busy,
  error,
  onFinishTurn,
  onPlayed,
  onRetryAi,
  onEnd,
}: {
  session: DebateSession;
  busy: boolean;
  error: unknown;
  onFinishTurn: (turn: number, seqs: number[]) => Promise<boolean>;
  onPlayed: (turn: number) => void;
  onRetryAi: () => void;
  onEnd: (reason: 'manual' | 'time_limit') => void;
}): React.ReactElement {
  const [confirmEnd, setConfirmEnd] = React.useState(false);
  const [liveText, setLiveText] = React.useState('');
  const [mic, setMic] = React.useState<MicReading>(IDLE_MIC);
  const [aiLevel, setAiLevel] = React.useState(0);
  const flushStudent = React.useRef<(() => Promise<void>) | null>(null);
  const expire = React.useCallback(() => onEnd('time_limit'), [onEnd]);
  const [ending, setEnding] = React.useState(false);
  const endNow = async (): Promise<void> => {
    setEnding(true);
    await flushStudent.current?.();
    onEnd('manual');
    setEnding(false);
  };
  const remaining = useServerClock(session, expire);
  const active = session.active_turn_index === null ? undefined : session.turns[session.active_turn_index];
  const studentActive = session.phase === 'student_turn' && active?.speaker === 'student';
  const aiSpeaking = session.phase === 'ai_turn' && active?.speaker === 'ai';
  const thinking = session.phase === 'processing';
  const lastStudentTurn = [...session.turns].reverse().find((t) => t.speaker === 'student' && t.status !== 'open');

  const endControl = confirmEnd ? (
    <>
      <Button color="inherit" onClick={() => setConfirmEnd(false)}>
        Keep going
      </Button>
      <Button variant="outlined" color="error" onClick={() => void endNow()} disabled={busy || ending}>
        End now
      </Button>
    </>
  ) : (
    <Button variant="outlined" startIcon={<Square size={14} />} onClick={() => setConfirmEnd(true)} disabled={busy}>
      End debate
    </Button>
  );

  const aiControls = aiSpeaking && active ? (
    <AiTurnPanel key={active.index} session={session} turn={active} onLevel={setAiLevel} onPlayed={() => onPlayed(active.index)} />
  ) : thinking && session.pending_error ? (
    <Button variant="contained" onClick={onRetryAi} disabled={busy}>
      Try again
    </Button>
  ) : thinking ? (
    <CircularProgress size={20} aria-label="Your opponent is thinking" />
  ) : null;

  return (
    <Stack spacing={2}>
      <DebateArena
        session={session}
        remainingMs={remaining}
        floor={studentActive ? 'You' : 'Opponent'}
        live
        actions={endControl}
        student={{
          level: studentActive ? mic.level * 8 : 0,
          active: studentActive,
          status: studentActive ? micStatus(mic) : undefined,
          liveText: studentActive ? liveText : undefined,
          controls:
            !studentActive && lastStudentTurn ? (
              <PlayRecordingButton sessionId={session.id} turnIndex={lastStudentTurn.index} />
            ) : studentActive && active ? (
              <StudentTurnPanel
                key={active.index}
                session={session}
                turnIndex={active.index}
                onLiveText={setLiveText}
                onMic={setMic}
                onFinish={(seqs) => onFinishTurn(active.index, seqs)}
                flushRef={flushStudent}
              />
            ) : undefined,
        }}
        ai={{
          level: aiSpeaking ? aiLevel : 0,
          active: aiSpeaking || thinking,
          status: thinking ? (session.pending_error ? 'Could not reply' : 'Thinking…') : aiSpeaking ? 'Speaking' : undefined,
          controls: aiControls,
        }}
      />
      {error ? (
        <Alert severity="warning" variant="outlined">
          {debateErrorMessage(error)}
        </Alert>
      ) : null}
    </Stack>
  );
}
