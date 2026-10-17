'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { CheckCircle2, Circle, Sparkles } from 'lucide-react';

import { useInterval } from '@/hooks/use-interval';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

import { CARD_PAD, INNER_GAP } from './spacing';

const STAGE_MS = 420;
const REDUCED_STAGE_MS = 120;

export function GenerateProgress({
  heading,
  stages,
  done,
  error,
  onFinished,
  onRetry,
  onBack,
}: {
  heading: string;
  stages: readonly string[];
  done: boolean;
  error: Error | null;
  onFinished: () => void;
  onRetry: () => void;
  onBack: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [reached, setReached] = React.useState(0);

  useInterval(
    () => {
      if (reached < stages.length) setReached(reached + 1);
      else if (done) onFinished();
    },
    reduced ? REDUCED_STAGE_MS : STAGE_MS,
    error === null,
  );

  const value = Math.round((Math.min(reached, stages.length) / Math.max(stages.length, 1)) * 100);

  return (
    <Card sx={{ p: CARD_PAD, maxWidth: 520, mx: 'auto', width: '100%' }}>
      <Stack spacing={CARD_PAD}>
        <Stack direction="row" spacing={INNER_GAP} sx={{ alignItems: 'center' }}>
          <Sparkles size={22} color={theme.brand.accent} aria-hidden />
          <Typography variant="h4" component="h3">
            {heading}
          </Typography>
        </Stack>
        <LinearProgress variant="determinate" value={value} aria-label="Plan generation progress" />
        <Stack component="ol" spacing={INNER_GAP} sx={{ m: 0, p: 0, listStyle: 'none' }} aria-live="polite">
          {stages.map((stage, index) => {
            const complete = index < reached;
            const current = index === reached && error === null;
            return (
              <Stack key={stage} component="li" direction="row" spacing={INNER_GAP} sx={{ alignItems: 'center', color: complete || current ? 'text.primary' : 'text.secondary' }}>
                {complete ? (
                  <CheckCircle2 size={18} color={theme.hues.green} aria-label="Done" />
                ) : current ? (
                  <CircularProgress size={16} aria-label="Working" />
                ) : (
                  <Circle size={18} aria-hidden />
                )}
                <Typography variant="body2" sx={{ fontWeight: current ? 700 : 400 }}>
                  {stage}
                </Typography>
              </Stack>
            );
          })}
        </Stack>
        {error ? (
          <Alert
            severity="error"
            variant="outlined"
            role="alert"
            action={
              <Stack direction="row" spacing={INNER_GAP}>
                <Button size="small" onClick={onBack}>
                  Back
                </Button>
                <Button size="small" variant="contained" onClick={onRetry}>
                  Try again
                </Button>
              </Stack>
            }
          >
            {error.message}
          </Alert>
        ) : null}
      </Stack>
    </Card>
  );
}
