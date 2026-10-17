'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import { SectionHeader } from '@/components/ui/layout';
import {
  canRaiseSeconds,
  coreReasons,
  failureVoice,
  nextSeconds,
  refusedByArithmetic,
  secondsLabel,
  solveQuality,
  violationGroups,
} from '@/lib/school/generation';
import type { GenerationJob } from '@/types/timetable-generation';

export interface GenerationOutcomeProps {
  job: GenerationJob;
  onRaiseSeconds: (seconds: number) => void;
}

export function GenerationOutcome({
  job,
  onRaiseSeconds,
}: GenerationOutcomeProps): React.ReactElement {
  if (job.status === 'queued' || job.status === 'running') return <RunningOutcome job={job} />;
  if (job.status === 'succeeded') return <SucceededOutcome job={job} />;
  if (job.status === 'infeasible') return <InfeasibleOutcome job={job} />;
  return <FailedOutcome job={job} onRaiseSeconds={onRaiseSeconds} />;
}

function Detail({ text }: { text: string }): React.ReactElement {
  return (
    <Box
      sx={{
        borderLeft: 3,
        borderColor: 'divider',
        pl: 1.5,
        my: 1.5,
      }}
    >
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
        {text}
      </Typography>
    </Box>
  );
}

function Warnings({ rows }: { rows: readonly string[] }): React.ReactElement | null {
  if (rows.length === 0) return null;
  return (
    <Card variant="outlined">
      <CardContent>
        <SectionHeader
          title="Noticed about this school while reading it"
          subtitle="Not reasons the week failed, and each is true whether a generator runs or not"
        />
        <Stack component="ul" spacing={0.75} sx={{ pl: 2.5, m: 0 }}>
          {rows.map((warning) => (
            <Typography key={warning} component="li" variant="body2">
              {warning}
            </Typography>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function RunningOutcome({ job }: { job: GenerationJob }): React.ReactElement {
  const started = job.status === 'running';
  return (
    <Alert severity="info" variant="outlined" icon={false}>
      <AlertTitle>
        {started ? 'Looking for a week' : 'Waiting for a solver slot'}
      </AlertTitle>
      <Typography variant="body2">
        {started
          ? `It stops on its own after ${job.max_seconds} seconds, whether or not it has found one. There is nothing to press.`
          : 'Every solver slot is busy. This run starts as soon as one frees up, and nothing is lost while it waits.'}
      </Typography>
      <LinearProgress sx={{ mt: 1.5 }} />
    </Alert>
  );
}

function SucceededOutcome({ job }: { job: GenerationJob }): React.ReactElement {
  const violations = violationGroups(job.soft_violations);
  const broken = job.soft_violations?.length ?? 0;
  const warnings = job.warnings ?? [];
  const quality = solveQuality(job);
  const clean = broken === 0;

  return (
    <Stack spacing={2}>
      <Alert severity={clean ? 'success' : 'warning'} variant="outlined">
        <AlertTitle>
          {clean
            ? `A week that meets every requirement, ${job.slots_written} lessons written`
            : `A week written with ${broken} ${broken === 1 ? 'compromise' : 'compromises'}, ${job.slots_written} lessons`}
        </AlertTitle>
        {job.detail ? <Detail text={job.detail} /> : null}
        <Typography variant="body2">
          {clean
            ? 'Nothing it was asked to avoid happened. The draft now holds the week; publish it to put it in force.'
            : 'The lessons are placed and the draft holds them. What it could not satisfy is listed below, and it is listed because nobody is going to find it by reading the grid.'}
        </Typography>
        <Stack
          direction="row"
          spacing={1}
          sx={{ mt: 1.5, flexWrap: 'wrap', alignItems: 'center', rowGap: 1 }}
        >
          {quality ? (
            <EmergeChip label={quality.label} tone={quality.proven ? 'green' : 'amber'} dot />
          ) : null}
          <EmergeChip label={`Solved in ${secondsLabel(job.wall_time_ms)}`} tone="grey" />
          {typeof job.objective === 'number' ? (
            <EmergeChip label={`Penalty score ${Math.round(job.objective)}`} tone="grey" />
          ) : null}
        </Stack>
      </Alert>

      {violations.length > 0 ? (
        <Card variant="outlined">
          <CardContent>
            <SectionHeader
              title="What this week does not satisfy"
              subtitle="Each of these was a preference rather than a rule, so the week stands with it broken"
            />
            <Stack spacing={2}>
              {violations.map((group) => (
                <Box key={group.kind}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: 'center', mb: 0.75, flexWrap: 'wrap' }}
                  >
                    <Typography variant="subtitle2">{group.label}</Typography>
                    <EmergeChip label={group.rows.length} tone="amber" />
                  </Stack>
                  <Stack component="ul" spacing={0.5} sx={{ pl: 2.5, m: 0 }}>
                    {group.rows.map((row) => (
                      <Typography key={`${row.kind}|${row.key}`} component="li" variant="body2">
                        {row.message}
                        {row.target !== row.actual ? (
                          <Typography component="span" variant="caption" color="text.secondary">
                            {` (asked ${row.target}, got ${row.actual})`}
                          </Typography>
                        ) : null}
                      </Typography>
                    ))}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      <Warnings rows={warnings} />
    </Stack>
  );
}

function InfeasibleOutcome({ job }: { job: GenerationJob }): React.ReactElement {
  const reasons = coreReasons(job.core_keys);
  const arithmetic = refusedByArithmetic(job.core_keys);

  return (
    <Stack spacing={2}>
      <Alert severity="info" variant="outlined">
        <AlertTitle>No week can meet these requirements at once</AlertTitle>
        <Typography variant="body2">
          {arithmetic
            ? 'This did not fail. It was settled by counting, before any searching started: what is being asked for does not fit in the week that exists.'
            : `This did not fail. The solver searched for ${secondsLabel(job.wall_time_ms)} and proved that no arrangement satisfies all of it.`}
        </Typography>
        {job.detail ? <Detail text={job.detail} /> : null}
        <Typography variant="body2">
          Nothing was written and the draft is exactly as it was. Something in the list
          below has to give: fewer lessons asked of a subject, a rule relaxed, another
          room or another teacher.
        </Typography>
      </Alert>

      {reasons.length > 0 ? (
        <Card variant="outlined">
          <CardContent>
            <SectionHeader
              title={`The ${reasons.length} ${reasons.length === 1 ? 'requirement' : 'requirements'} it could not satisfy together`}
              subtitle="Removing any one of these is enough to make the week possible again"
            />
            <Stack component="ul" spacing={1} sx={{ pl: 2.5, m: 0 }}>
              {reasons.map((reason) => (
                <Box key={reason.key} component="li">
                  <Typography variant="body2">{reason.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {reason.key}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      <Warnings rows={job.warnings ?? []} />
    </Stack>
  );
}

function FailedOutcome({
  job,
  onRaiseSeconds,
}: {
  job: GenerationJob;
  onRaiseSeconds: (seconds: number) => void;
}): React.ReactElement {
  const voice = failureVoice(job.failure_reason);
  const raised = nextSeconds(job.max_seconds);
  const mayRaise = job.failure_reason === 'timeout' && canRaiseSeconds(job.max_seconds);

  return (
    <Stack spacing={2}>
      <Alert severity={voice.severity} variant="outlined">
        <AlertTitle>{voice.heading}</AlertTitle>
        {job.detail ? <Detail text={job.detail} /> : null}
        <Typography variant="body2">{voice.advice}</Typography>
        <Stack
          direction="row"
          spacing={1}
          sx={{ mt: 1.5, flexWrap: 'wrap', alignItems: 'center', rowGap: 1 }}
        >
          <EmergeChip
            label={job.failure_reason ?? 'unrecorded'}
            tone={voice.severity === 'error' ? 'red' : 'amber'}
            dot
          />
          {job.wall_time_ms > 0 ? (
            <EmergeChip label={`Ran for ${secondsLabel(job.wall_time_ms)}`} tone="grey" />
          ) : null}
          <EmergeChip label={`Limit was ${job.max_seconds}s`} tone="grey" />
        </Stack>
        {mayRaise ? (
          <Button
            size="small"
            variant="contained"
            sx={{ mt: 1.5 }}
            onClick={() => onRaiseSeconds(raised)}
          >
            {`Ask again with ${raised} seconds`}
          </Button>
        ) : null}
      </Alert>

      <Warnings rows={job.warnings ?? []} />
    </Stack>
  );
}
