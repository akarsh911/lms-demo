'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';

import type { ReadbackPrompt, ReadbackResponse } from '@/types/grasp';

const TAP_LOCK_MS = 140;
const STAGGER_MS = 220;

const rise = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
`;

const beat = keyframes`
  0% { opacity: 0; transform: scale(1.6); }
  30% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.9); }
`;

function Countdown({ onDone }: { onDone: () => void }): React.ReactElement {
  const [n, setN] = React.useState(3);
  React.useEffect(() => {
    if (n === 0) {
      onDone();
      return;
    }
    const t = setTimeout(() => setN(n - 1), 800);
    return () => clearTimeout(t);
  }, [n, onDone]);
  return (
    <Stack sx={{ my: 'auto', alignItems: 'center' }}>
      <Typography key={n} sx={(t) => ({ fontFamily: t.typography.display.fontFamily, fontWeight: 800, fontSize: 120, color: t.palette.primary.main, animation: `${beat} 800ms ease-out both` })}>
        {n || ''}
      </Typography>
    </Stack>
  );
}

// One timed question. The options fade as the clock runs down, so the answer has to come from memory, not from reading.
function TimedQuestion({ prompt, index, total, onAnswer }: { prompt: ReadbackPrompt; index: number; total: number; onAnswer: (r: ReadbackResponse) => void }): React.ReactElement {
  const limit = (prompt.seconds ?? 7) * 1000;
  const started = React.useRef(0);
  const [elapsed, setElapsed] = React.useState(0);
  const [picked, setPicked] = React.useState<number | null>(null);
  const finished = React.useRef(false);

  const finish = React.useCallback(
    (choice: number | null) => {
      if (finished.current) return;
      finished.current = true;
      const ms = Math.round(performance.now() - started.current);
      setPicked(choice);
      setTimeout(() => onAnswer({ itemId: prompt.id, choice, ms: choice === null ? limit : ms }), choice === null ? 300 : 380);
    },
    [limit, onAnswer, prompt.id],
  );

  React.useEffect(() => {
    started.current = performance.now();
    let frame = 0;
    const tick = (): void => {
      const e = performance.now() - started.current;
      setElapsed(e);
      if (e >= limit) finish(null);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [finish, limit]);

  const left = Math.max(0, limit - elapsed);
  const fade = elapsed < limit * 0.4 ? 1 : Math.max(0.06, 1 - (elapsed - limit * 0.4) / (limit * 0.6));

  return (
    <Stack spacing={3} sx={{ my: 'auto' }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="eyebrow" color="text.secondary">
          {index + 1} of {total}
        </Typography>
        <Typography sx={(t) => ({ fontFamily: t.typography.display.fontFamily, fontWeight: 800, fontSize: 28, color: left < 2500 ? t.palette.error.main : t.brand.ink, fontVariantNumeric: 'tabular-nums' })}>{Math.ceil(left / 1000)}</Typography>
      </Stack>
      <Box sx={(t) => ({ height: 6, borderRadius: 99, bgcolor: t.brand.sunken, overflow: 'hidden' })}>
        <Box sx={(t) => ({ height: '100%', width: `${(left / limit) * 100}%`, bgcolor: left < 2500 ? t.palette.error.main : t.palette.primary.main })} />
      </Box>
      <Typography variant="h3" component="h2" sx={{ minHeight: '3.2em' }}>
        {prompt.prompt}
      </Typography>
      <Stack spacing={1.25}>
        {prompt.options.map((o, i) => (
          <Box key={o} sx={{ display: 'flex', animation: `${rise} 260ms ease-out ${i * STAGGER_MS}ms both` }}>
            <ButtonBase
              disabled={picked !== null}
              onClick={() => performance.now() - started.current > TAP_LOCK_MS && finish(i)}
              sx={(t) => ({
                justifyContent: 'flex-start',
                textAlign: 'left',
                px: 2.25,
                py: 2,
                borderRadius: `${t.band.radius.md}px`,
                border: `2px solid ${picked === i ? t.palette.primary.main : t.brand.line}`,
                bgcolor: picked === i ? t.tints.rose : t.brand.surface,
                fontSize: 18,
                fontWeight: 600,
                color: t.brand.ink,
                flex: 1,
                opacity: picked === i ? 1 : fade,
                transition: 'background-color 120ms, border-color 120ms',
              })}
            >
              {o}
            </ButtonBase>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}

function SlowQuestion({ prompt, onAnswer }: { prompt: ReadbackPrompt; onAnswer: (r: ReadbackResponse) => void }): React.ReactElement {
  const started = React.useRef(0);
  const [picked, setPicked] = React.useState<number | null>(null);
  React.useEffect(() => {
    started.current = performance.now();
  }, []);
  return (
    <Stack spacing={3} sx={{ my: 'auto' }}>
      <div>
        <Typography variant="eyebrow" color="text.secondary">
          Last one · no clock
        </Typography>
        <Typography variant="h3" component="h2" sx={{ mt: 1 }}>
          {prompt.prompt}
        </Typography>
      </div>
      <Stack spacing={1.25}>
        {prompt.options.map((o, i) => (
          <ButtonBase
            key={o}
            onClick={() => setPicked(i)}
            sx={(t) => ({ justifyContent: 'flex-start', textAlign: 'left', px: 2.25, py: 1.75, borderRadius: `${t.band.radius.md}px`, border: `2px solid ${picked === i ? t.palette.primary.main : t.brand.line}`, bgcolor: picked === i ? t.tints.rose : t.brand.surface, fontSize: 16, fontWeight: 500, color: t.brand.ink, animation: `${rise} 260ms ease-out ${i * 80}ms both` })}
          >
            {o}
          </ButtonBase>
        ))}
      </Stack>
      <Button variant="contained" size="large" disabled={picked === null} onClick={() => onAnswer({ itemId: prompt.id, choice: picked, ms: Math.round(performance.now() - started.current) })}>
        Hand it in
      </Button>
    </Stack>
  );
}

export function ReadbackRun({ prompts, onFinish }: { prompts: readonly ReadbackPrompt[]; onFinish: (responses: ReadbackResponse[]) => void }): React.ReactElement {
  const [counting, setCounting] = React.useState(true);
  const [responses, setResponses] = React.useState<ReadbackResponse[]>([]);
  const timed = prompts.filter((p) => p.kind === 'fast');
  const current = prompts[responses.length];
  const done = React.useCallback(() => setCounting(false), []);

  const answer = React.useCallback((r: ReadbackResponse) => setResponses((prev) => (prev.some((x) => x.itemId === r.itemId) ? prev : [...prev, r])), []);
  const sent = React.useRef(false);
  React.useEffect(() => {
    if (sent.current || responses.length < prompts.length) return;
    sent.current = true;
    onFinish(responses);
  }, [responses, prompts.length, onFinish]);

  if (counting) return <Countdown onDone={done} />;
  if (!current) return <Box />;
  return current.kind === 'fast' ? <TimedQuestion key={current.id} prompt={current} index={responses.length} total={timed.length} onAnswer={answer} /> : <SlowQuestion key={current.id} prompt={current} onAnswer={answer} />;
}
