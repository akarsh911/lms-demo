'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';

import { EmergeChip } from '@/components/ui/chip';
import { StepStrip, type StripStep } from '@/components/ui/step-strip';
import { WidgetError } from '@/components/widgets/widget-states';
import { useRetryReport } from '@/hooks/mutation/use-debate';
import { useDebateReport } from '@/hooks/query/use-debate';
import { debateErrorMessage } from '@/lib/debate/failure';
import { debateService } from '@/services/debate';
import type { DebateSession } from '@/types/debate';

import { DebateHeading } from './debate-heading';
import { DebateReportView } from './debate-report-view';
import { useClipPlayer } from './use-clip-player';

const STAGES: readonly (StripStep & { key: string })[] = [
  { key: 'delivery', title: 'Measuring your delivery' },
  { key: 'fact_check', title: 'Checking your facts' },
  { key: 'evaluation', title: 'Scoring your arguments' },
];

function stageIndex(stage: string | null): number {
  if (stage === 'complete') return STAGES.length;
  return Math.max(0, STAGES.findIndex((s) => s.key === stage));
}

export function DebateClosingStage({
  session,
  onRestart,
}: {
  session: DebateSession;
  onRestart: () => void;
}): React.ReactElement {
  const report = useDebateReport(session.id, true);
  const retry = useRetryReport(session.id);
  const { play, stop } = useClipPlayer();
  const closing = session.host?.closing ?? null;
  const script = React.useRef(closing);
  React.useEffect(() => {
    script.current = closing;
  });
  const firstClip = closing?.[0]?.id ?? null;

  React.useEffect(() => {
    const clips = script.current;
    if (!firstClip || !clips) return undefined;
    void play(clips.map((c) => ({ ...c, url: debateService.clipUrl(session.id, c.id) })));
    return stop;
  }, [firstClip, play, stop, session.id]);

  const envelope = report.data;

  if (envelope?.status === 'ready' && envelope.report) {
    return <DebateReportView report={envelope.report} onRestart={onRestart} />;
  }

  const failed = envelope?.status === 'failed';

  return (
    <Stack spacing={3}>
      <DebateHeading
        title={session.topic}
        status={<EmergeChip label={session.end_reason === 'time_limit' ? 'Time is up' : 'Ended'} tone="grey" />}
        subtitle={failed ? 'The report could not be written' : 'Preparing your report'}
        actions={
          <Button variant="outlined" onClick={onRestart}>
            New debate
          </Button>
        }
      />
      <Card>
        <CardHeader title="Report" subheader={failed ? 'Your debate is saved' : 'Delivery, facts, then scores'} />
        <CardContent>
          {failed ? (
            <Alert
              severity="warning"
              variant="outlined"
              action={
                <Button size="small" variant="contained" onClick={() => retry.mutate()} loading={retry.isPending}>
                  Try again
                </Button>
              }
            >
              <AlertTitle>Report failed</AlertTitle>
              Ask for it again.
            </Alert>
          ) : (
            <StepStrip ariaLabel="Report progress" steps={STAGES} current={stageIndex(envelope?.stage ?? session.report_stage)} />
          )}
          {report.error ? <WidgetError error={report.error} onRetry={() => void report.refetch()} /> : null}
          {retry.error ? (
            <Alert severity="warning" variant="outlined" sx={{ mt: 2 }}>
              {debateErrorMessage(retry.error)}
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </Stack>
  );
}
