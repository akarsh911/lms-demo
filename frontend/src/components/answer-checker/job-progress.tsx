'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { queryKeys } from '@/constants/query-keys';
import { failureText } from '@/lib/exams/exam';
import { jobFinished, useCheckerJob } from '@/hooks/query/use-answer-checker';

const JOB_TITLES: Readonly<Record<string, string>> = {
  compile_rubric: 'Reading the key',
  split_upload: 'Splitting the scan',
  mark_exam: 'Marking',
  finish_session: 'Preparing booklets',
};

export function JobProgress({ jobId, onFinished }: { jobId: string; onFinished: () => void }): React.ReactElement | null {
  const client = useQueryClient();
  const job = useCheckerJob(jobId);
  const finished = jobFinished(job.data);
  const settledRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!finished || !job.data || settledRef.current === jobId) return;
    settledRef.current = jobId;
    void client.invalidateQueries({ queryKey: queryKeys.answerChecker.all }).then(() => {
      if (job.data?.state === 'done') onFinished();
    });
  }, [client, finished, job.data, jobId, onFinished]);

  if (job.isError) {
    return (
      <Alert severity="warning" variant="outlined">
        {failureText(job.error)}
      </Alert>
    );
  }
  const data = job.data;
  if (!data) return <LinearProgress aria-label="Waiting for the checker" />;

  const title = JOB_TITLES[data.kind] ?? 'Working';
  if (data.state === 'failed' || data.state === 'cancelled') {
    return (
      <Alert severity="error" variant="outlined">
        {title} failed. {data.error || data.message}
      </Alert>
    );
  }
  if (data.state === 'done') return null;

  return (
    <Stack spacing={0.5} aria-live="polite">
      <Typography variant="caption" color="text.secondary">
        {title}
        {data.total > 0 ? ` · ${data.done}/${data.total}` : ''}
      </Typography>
      <LinearProgress variant={data.total > 0 ? 'determinate' : 'indeterminate'} value={Math.round(data.progress * 100)} />
    </Stack>
  );
}
