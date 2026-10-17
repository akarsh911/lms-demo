'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useParams } from 'next/navigation';
import { Copy, CopyPlus, SkipForward, Undo2 } from 'lucide-react';

import { QrImage } from '@/components/grasp/share-screen';
import { EmergeChip } from '@/components/ui/chip';
import { useGraspHost } from '@/hooks/query/use-grasp';
import { failureText } from '@/lib/exams/exam';
import { paths } from '@/paths';
import { answerCheckerService } from '@/services/answer-checker';
import type { ApiError } from '@/services/api';
import type { CaptureSession, CaptureSessionDetail } from '@/types/answer-checker';

import { ActionIcon } from './action-icon';

const POLL_MS = 1500;
const noSubscription = (): (() => void) => () => undefined;

function usePhoneUrl(examId: string, sessionId: string): { url: string; choices: { name: string; origin: string }[]; base: string; choose: (origin: string) => void } {
  const params = useParams<{ persona?: string }>();
  const host = useGraspHost();
  const [picked, setPicked] = React.useState<string | null>(null);
  const origin = React.useSyncExternalStore(noSubscription, () => window.location.origin, () => '');
  const local = /localhost|127\.0\.0\.1/.test(origin);
  const choices = local ? (host.data?.interfaces ?? (host.data?.origins ?? []).map((entry) => ({ name: entry, origin: entry }))) : [];
  const base = local ? (picked ?? choices[0]?.origin ?? origin) : origin;
  const path = paths.personaSection(params?.persona ?? 'teacher', `learning/answer-sheets/scan?exam=${encodeURIComponent(examId)}&session=${encodeURIComponent(sessionId)}`);
  return { url: `${base}${path}`, choices, base, choose: setPicked };
}

function Counter({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <Box sx={(theme) => ({ px: 2, py: 1.5, borderRadius: `${theme.band.radius.md}px`, border: `1px solid ${theme.brand.line}`, minWidth: 0 })}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h3" component="p" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
    </Box>
  );
}

function LivePanel({ examId, sessionId, onFinished }: { examId: string; sessionId: string; onFinished: (jobId: string) => void }): React.ReactElement {
  const phone = usePhoneUrl(examId, sessionId);
  const url = phone.url;
  const session = useQuery<CaptureSessionDetail, ApiError>({
    queryKey: ['answer-checker', 'capture', examId, sessionId],
    queryFn: ({ signal }) => answerCheckerService.getSession(examId, sessionId, signal),
    refetchInterval: (query) => (query.state.data?.state === 'active' ? POLL_MS : false),
  });
  const act = useMutation<unknown, ApiError, () => Promise<unknown>>({ mutationFn: (run) => run(), onSuccess: () => void session.refetch() });
  const finish = useMutation<{ job: { id: string } }, ApiError, void>({ mutationFn: () => answerCheckerService.finishSession(examId, sessionId) });
  const data = session.data;
  const active = data?.state === 'active';
  const recent = (data?.booklet_detail ?? []).filter((booklet) => booklet.pages.length > 0).slice(-12);

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '200px minmax(0, 1fr)' }, alignItems: 'start' }}>
        <Stack spacing={1} sx={{ alignItems: 'center' }}>
          <QrImage value={url} size={176} />
          <Typography variant="caption" sx={{ wordBreak: 'break-all', userSelect: 'all', maxWidth: 200, textAlign: 'center' }}>
            {url}
          </Typography>
          <ActionIcon label="Copy link" onClick={() => void navigator.clipboard?.writeText(url)}>
            <Copy size={14} />
          </ActionIcon>
          {phone.choices.length > 1 ? (
            <TextField
              select
              size="small"
              label="Phone reaches this computer at"
              value={phone.base}
              onChange={(event) => phone.choose(event.target.value)}
              sx={{ width: 200 }}
            >
              {phone.choices.map((choice) => (
                <MenuItem key={choice.origin} value={choice.origin}>
                  {`${choice.origin.replace(/^https?:\/\//, '')} · ${choice.name}`}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
        </Stack>
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <Counter label="Booklets" value={data?.booklets ?? 0} />
            <Counter label="Pages" value={data?.pages ?? 0} />
            <Counter label="This booklet" value={data?.current_booklet_pages ?? 0} />
          </Box>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }} aria-live="polite">
            {recent.map((booklet, index) => (
              <EmergeChip key={booklet.id} label={`${booklet.is_supplementary ? '+' : '#'}${index + 1 + Math.max(0, (data?.booklet_detail.length ?? 0) - recent.length)} · ${booklet.pages.length}p`} tone={booklet.closed ? 'green' : 'blue'} dot={!booklet.closed} />
            ))}
            {recent.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Scan the code with a phone and start turning pages.
              </Typography>
            ) : null}
          </Stack>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <ActionIcon label="Next student" disabled={!active || act.isPending} onClick={() => act.mutate(() => answerCheckerService.nextStudent(examId, sessionId, false))}>
              <SkipForward size={15} />
            </ActionIcon>
            <ActionIcon label="+ Same student" disabled={!active || act.isPending} onClick={() => act.mutate(() => answerCheckerService.nextStudent(examId, sessionId, true))}>
              <CopyPlus size={15} />
            </ActionIcon>
            <ActionIcon label="Undo last page" disabled={!active || act.isPending} onClick={() => act.mutate(() => answerCheckerService.undoPage(examId, sessionId))}>
              <Undo2 size={15} />
            </ActionIcon>
            <Box sx={{ flex: 1 }} />
            <Button variant="contained" size="small" disabled={!active || (data?.pages ?? 0) === 0 || finish.isPending} onClick={() => void finish.mutateAsync().then((done) => onFinished(done.job.id), () => undefined)}>
              {finish.isPending ? 'Finishing…' : 'Finish session'}
            </Button>
          </Stack>
        </Stack>
      </Box>
      {session.isError || finish.isError || act.isError ? (
        <Alert severity="error" variant="outlined">
          {failureText(session.error ?? finish.error ?? act.error)}
        </Alert>
      ) : null}
    </Stack>
  );
}

export function IntakeCopyCam({
  examId,
  sessionId,
  onSession,
  onFinished,
}: {
  examId: string;
  sessionId: string | null;
  onSession: (sessionId: string) => void;
  onFinished: (jobId: string) => void;
}): React.ReactElement {
  const start = useMutation<CaptureSession, ApiError, void>({ mutationFn: () => answerCheckerService.startSession(examId) });
  if (sessionId) return <LivePanel examId={examId} sessionId={sessionId} onFinished={onFinished} />;
  return (
    <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
      <Typography variant="body2" color="text.secondary">
        A phone photographs each booklet as its pages are turned.
      </Typography>
      <Button variant="contained" disabled={start.isPending} onClick={() => void start.mutateAsync().then((session) => onSession(session.id), () => undefined)}>
        {start.isPending ? 'Starting…' : 'Start Copy Cam'}
      </Button>
      {start.isError ? (
        <Alert severity="error" variant="outlined">
          {failureText(start.error)}
        </Alert>
      ) : null}
    </Stack>
  );
}
