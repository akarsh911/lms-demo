'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';

import { useMarkClass } from '@/hooks/mutation/use-answer-checker';
import { useCheckerHealth } from '@/hooks/query/use-answer-checker';
import { failureText } from '@/lib/exams/exam';
import type { CheckerExamDetail, PresetStrictness } from '@/types/answer-checker';

const LEVELS: readonly PresetStrictness[] = ['easy', 'medium', 'strict'];

export function MarkBar({ exam, onStarted }: { exam: CheckerExamDetail; onStarted: (jobId: string) => void }): React.ReactElement {
  const health = useCheckerHealth();
  const mark = useMarkClass(exam.id);
  const current = exam.strictness.default;
  const [level, setLevel] = React.useState<PresetStrictness>(current === 'custom' ? 'medium' : current);
  const confirmed = exam.counts.confirmed + exam.counts.failed;
  const profiles = health.data?.strictness;
  const blocked = !exam.rubric_approved ? 'Approve the marking scheme first.' : confirmed === 0 ? 'Confirm at least one booklet first.' : null;

  return (
    <Stack spacing={1} sx={{ alignItems: { xs: 'stretch', sm: 'flex-end' } }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Tooltip title={profiles?.[level]?.description ?? ''} placement="top">
          <TextField
            select
            size="small"
            label="Strictness"
            value={level}
            disabled={!profiles}
            onChange={(event) => setLevel(event.target.value as PresetStrictness)}
            sx={{ minWidth: 140 }}
          >
            {LEVELS.map((option) => (
              <MenuItem key={option} value={option}>
                {profiles?.[option]?.label ?? option}
              </MenuItem>
            ))}
          </TextField>
        </Tooltip>
        <Tooltip title={blocked ?? ''}>
          <span>
            <Button variant="contained" disabled={blocked !== null || mark.isPending} onClick={() => void mark.mutateAsync(level).then((job) => onStarted(job.id), () => undefined)}>
              {mark.isPending ? 'Starting…' : `Mark ${confirmed}`}
            </Button>
          </span>
        </Tooltip>
      </Stack>
      {mark.isError || health.isError ? (
        <Alert severity="error" variant="outlined">
          {failureText(mark.error ?? health.error)}
        </Alert>
      ) : null}
    </Stack>
  );
}
