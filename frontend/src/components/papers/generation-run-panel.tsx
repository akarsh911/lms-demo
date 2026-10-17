'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import { SectionHeader } from '@/components/ui/layout';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useGenerationRun } from '@/hooks/query/use-papers';
import {
  GENERATION_METHOD_LABELS,
  RUN_STATUS_LABELS,
  RUN_STATUS_TONES,
  costLine,
  modelLine,
  runWindowLabel,
  tokenLine,
} from '@/lib/papers/paper';
import type { GenerationRunRow } from '@/types/papers';
import { FactList, type Fact } from './fact-list';

const NOT_RECORDED = 'Not recorded';

export function GenerationRunPanel({ runId }: { runId: string }): React.ReactElement {
  const run = useGenerationRun(runId);

  return (
    <Box component="section">
      <SectionHeader
        title="What produced this paper"
        subtitle="The model call this paper came out of, and what it cost"
      />

      {run.isPending ? <WidgetLoading rows={2} /> : null}

      {run.isError ? (
        <WidgetError error={run.error} onRetry={() => void run.refetch()} />
      ) : null}

      {run.data ? <RunFacts run={run.data} /> : null}
    </Box>
  );
}

function RunFacts({ run }: { run: GenerationRunRow }): React.ReactElement {
  const status = run.status;
  const facts: Fact[] = [
    {
      label: 'How it was made',
      value: run.generation_method
        ? GENERATION_METHOD_LABELS[run.generation_method]
        : NOT_RECORDED,
    },
    { label: 'Model', value: modelLine(run) ?? NOT_RECORDED },
    {
      label: 'Prompt fingerprint',
      value: run.prompt_hash ?? NOT_RECORDED,
      caption: 'The hash of the prompt, so two runs can be told apart',
    },
    { label: 'Tokens', value: tokenLine(run) ?? NOT_RECORDED },
    {
      label: 'Cost',
      value: costLine(run) ?? NOT_RECORDED,
      caption: run.cost_amount !== undefined ? undefined : 'No amount was recorded',
    },
    { label: 'Ran', value: runWindowLabel(run) ?? NOT_RECORDED },
  ];

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {status ? (
          <EmergeChip
            dot
            tone={RUN_STATUS_TONES[status]}
            label={RUN_STATUS_LABELS[status]}
          />
        ) : null}
        <Typography variant="caption" color="text.secondary">
          Generation runs are started in paper-setter. This is the record of one.
        </Typography>
      </Stack>

      {run.failure_reason ? (
        <Alert severity="warning" variant="outlined">
          {run.failure_reason}
        </Alert>
      ) : null}

      <FactList facts={facts} />
    </Stack>
  );
}
