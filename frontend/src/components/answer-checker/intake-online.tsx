'use client';

import * as React from 'react';
import NextLink from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Radio from '@mui/material/Radio';
import Stack from '@mui/material/Stack';

import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { WidgetLoading } from '@/components/widgets/widget-states';
import { ONLINE_SOURCE_PREFIX } from '@/fixtures/online-test';
import { failureText } from '@/lib/exams/exam';
import { paths } from '@/paths';
import { answerCheckerService } from '@/services/answer-checker';
import type { ApiError } from '@/services/api';
import { onlineTestService } from '@/services/online-test';
import type { CheckerJob, OnlineSource } from '@/types/answer-checker';
import type { Paper } from '@/types/papersetter';

export function IntakeOnline({
  examId,
  paper,
  sectionCode,
  onImported,
  onUpload,
}: {
  examId: string;
  paper: Paper;
  sectionCode: string;
  onImported: (jobId: string) => void;
  onUpload: () => void;
}): React.ReactElement {
  const params = useParams<{ persona?: string }>();
  const sources = useQuery<OnlineSource[], ApiError>({ queryKey: ['answer-checker', 'online-sources', paper.paper_id, sectionCode], queryFn: () => onlineTestService.sources(paper, sectionCode) });
  const [picked, setPicked] = React.useState<string | null>(null);
  const chosen = sources.data?.find((source) => source.id === (picked ?? sources.data?.[0]?.id));
  const run = useMutation<CheckerJob, ApiError, OnlineSource>({
    mutationFn: async (source) => answerCheckerService.importTyped(examId, `${ONLINE_SOURCE_PREFIX}${source.id}`, await onlineTestService.sheets(paper, source.id)),
  });

  if (sources.isPending) return <WidgetLoading rows={2} />;
  if (!sources.data || sources.data.length === 0) {
    return (
      <EmptyState
        title="No online test for this class"
        body="Responses appear here once the class has taken this paper online, for example as a GRASP check."
        action={
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
            <Button variant="contained" component={NextLink} href={paths.personaSection(params?.persona ?? 'teacher', 'grasp')}>
              Set up a GRASP check
            </Button>
            <Button variant="outlined" onClick={onUpload}>
              Upload scans instead
            </Button>
          </Stack>
        }
      />
    );
  }

  return (
    <Stack spacing={2}>
      <List disablePadding sx={(theme) => ({ border: `1px solid ${theme.brand.line}`, borderRadius: `${theme.band.radius.md}px`, p: 0.75 })}>
        {sources.data.map((source) => (
          <ListItemButton key={source.id} selected={source.id === chosen?.id} onClick={() => setPicked(source.id)} sx={{ borderRadius: 2, gap: 1 }}>
            <Radio checked={source.id === chosen?.id} size="small" tabIndex={-1} slotProps={{ input: { 'aria-label': source.label } }} />
            <ListItemText primary={source.label} secondary={source.detail} slotProps={{ primary: { variant: 'subtitle2' }, secondary: { variant: 'body2' } }} sx={{ my: 0 }} />
            <EmergeChip label={`${source.responses} responses`} tone="blue" />
          </ListItemButton>
        ))}
      </List>
      <Box>
        <Button variant="contained" disabled={!chosen || run.isPending} onClick={() => chosen && void run.mutateAsync(chosen).then((job) => onImported(job.id), () => undefined)}>
          {run.isPending ? 'Importing…' : `Import ${chosen?.responses ?? 0} responses`}
        </Button>
      </Box>
      {run.isError ? (
        <Alert severity="error" variant="outlined">
          {failureText(run.error)}
        </Alert>
      ) : null}
    </Stack>
  );
}
