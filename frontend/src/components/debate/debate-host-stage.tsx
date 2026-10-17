'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Mic, Volume2 } from 'lucide-react';

import { debateErrorMessage } from '@/lib/debate/failure';
import { debateService } from '@/services/debate';
import type { DebateSession } from '@/types/debate';

import { DebateArena } from './debate-arena';
import { MicCheck } from './mic-check';
import { useClipPlayer } from './use-clip-player';

export function DebateHostStage({
  session,
  busy,
  error,
  onIntro,
  onBegin,
  onCancel,
}: {
  session: DebateSession;
  busy: boolean;
  error: unknown;
  onIntro: () => void;
  onBegin: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const { current, play, stop } = useClipPlayer();
  const [heard, setHeard] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const opening = session.host?.opening ?? null;
  const script = React.useRef(opening);
  React.useEffect(() => {
    script.current = opening;
  });
  const firstClip = opening?.[0]?.id ?? null;
  const intro = React.useRef(onIntro);
  React.useEffect(() => {
    intro.current = onIntro;
  });

  React.useEffect(() => {
    if (session.phase === 'ready') intro.current();
  }, [session.phase]);

  React.useEffect(() => {
    const clips = script.current;
    if (!listening || !firstClip || !clips) return undefined;
    let live = true;
    void play(clips.map((c) => ({ ...c, url: debateService.clipUrl(session.id, c.id) }))).then(() => {
      if (live) setHeard(true);
    });
    return () => {
      live = false;
      stop();
    };
  }, [listening, firstClip, play, stop, session.id]);

  const line = opening?.find((c) => c.id === current)?.text ?? (heard ? opening?.[opening.length - 1]?.text : opening?.[0]?.text);
  const playing = listening && !heard;

  const banner = (
    <Card>
      <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 2, px: 3, py: 1.5 }}>
        <Box sx={{ color: theme.onTint.blue, display: 'flex' }}>
          {opening ? <Volume2 size={22} aria-hidden /> : <CircularProgress size={20} color="inherit" />}
        </Box>
        <Typography variant="body1" aria-live="polite" sx={{ flex: '1 1 240px' }}>
          {line ?? 'The host is getting ready…'}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flex: 'none' }}>
        <Button color="inherit" onClick={onCancel} disabled={busy}>
          Leave
        </Button>
        {opening && !listening ? (
          <Button variant="outlined" startIcon={<Volume2 size={16} />} onClick={() => setListening(true)} disabled={busy}>
            Hear the intro
          </Button>
        ) : null}
        {opening ? (
          <Button
            variant="contained"
            startIcon={<Mic size={18} />}
            onClick={() => {
              stop();
              onBegin();
            }}
            disabled={busy}
          >
            {playing ? 'Skip intro' : 'Begin'}
          </Button>
        ) : (
          <Button variant="contained" onClick={onIntro} disabled={busy || !error}>
            Retry
          </Button>
        )}
        </Stack>
      </Stack>
    </Card>
  );

  return (
    <Stack spacing={2}>
      <DebateArena
        session={session}
        remainingMs={session.remaining_ms}
        floor={session.first_speaker === 'student' ? 'You open' : 'AI opens'}
        live={false}
        banner={
          <Stack spacing={2}>
            {banner}
            <MicCheck disabled={busy} onTest={stop} />
          </Stack>
        }
        student={{ level: 0, active: false }}
        ai={{ level: 0, active: false }}
      />
      {error ? (
        <Alert severity="warning" variant="outlined">
          {debateErrorMessage(error)}
        </Alert>
      ) : null}
    </Stack>
  );
}
