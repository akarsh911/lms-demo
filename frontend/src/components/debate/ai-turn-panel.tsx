'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import { SkipForward } from 'lucide-react';

import { debateService } from '@/services/debate';
import type { DebateSession, DebateTurn } from '@/types/debate';

import { useClipPlayer } from './use-clip-player';

export function AiTurnPanel({
  session,
  turn,
  onPlayed,
  onLevel,
}: {
  session: DebateSession;
  turn: DebateTurn;
  onPlayed: () => void;
  onLevel: (level: number) => void;
}): React.ReactElement {
  const { level, play, stop } = useClipPlayer();
  const handed = React.useRef(false);
  const clips = turn.clips ?? [{ id: `turn-${turn.index}-0`, text: turn.text }];
  const playlist = React.useRef(clips);
  const played = React.useRef(onPlayed);
  React.useEffect(() => {
    playlist.current = clips;
    played.current = onPlayed;
  });

  React.useEffect(() => {
    onLevel(level);
  }, [level, onLevel]);

  const handBack = React.useCallback((): void => {
    if (handed.current) return;
    handed.current = true;
    played.current();
  }, []);

  React.useEffect(() => {
    let live = true;
    void play(playlist.current.map((c) => ({ ...c, url: debateService.clipUrl(session.id, c.id) }))).then(() => {
      if (live) handBack();
    });
    return () => {
      live = false;
      stop();
    };
  }, [turn.index, session.id, play, stop, handBack]);

  return (
    <Button
      size="small"
      color="inherit"
      startIcon={<SkipForward size={16} />}
      onClick={() => {
        stop();
        handBack();
      }}
    >
      Skip to my turn
    </Button>
  );
}
