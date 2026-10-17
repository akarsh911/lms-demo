'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { EmergeChip, type ChipTone } from '@/components/ui/chip';
import { FactStrip, type Fact } from '@/components/ui/fact-strip';
import { TYPED_REASON, type DebateReport, type ReportPoint } from '@/types/debate';

import { DebateHeading } from './debate-heading';
import { DebateTranscript } from './debate-transcript';
import { ReportArguments } from './report-arguments';
import { ReportCategories } from './report-categories';
import { ReportDelivery } from './report-delivery';
import { ReportFactChecks, factSummary } from './report-fact-checks';
import { ReportSection } from './report-section';
import { recordedMs, useRecordings } from './turn-recordings';

function minutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return s ? `${m}m ${s}s` : `${m} min`;
}

function scoreTone(score: number): ChipTone {
  if (score >= 70) return 'green';
  return score >= 50 ? 'amber' : 'red';
}

function PointsCard({ title, points }: { title: string; points: readonly ReportPoint[] }): React.ReactElement {
  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title={title} subheader={`${points.length} noted`} />
      {points.length === 0 ? (
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            Nothing noted.
          </Typography>
        </CardContent>
      ) : (
        <List disablePadding sx={{ px: 3, py: 1 }}>
          {points.map((p, index) => (
            <ListItem key={`${p.title}-${index}`} disableGutters divider={index < points.length - 1}>
              <ListItemText
                primary={p.title}
                secondary={p.detail}
                slotProps={{ primary: { variant: 'subtitle2' }, secondary: { variant: 'body2' } }}
                sx={{ my: 0 }}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Card>
  );
}

export function DebateReportView({
  report,
  onRestart,
}: {
  report: DebateReport;
  onRestart: () => void;
}): React.ReactElement {
  const [more, setMore] = React.useState(false);
  useRecordings();
  const recorded = report.transcript.some((t) => t.speaker === 'student' && recordedMs(report.session_id, t.index) > 0);
  const m = report.delivery.metrics;
  const score = report.overall_score;

  const spoken = m.measured && Boolean(m.words_per_minute);
  const facts: Fact[] = [
    { label: 'Overall', value: score === null ? '—' : `${score} / 100`, note: report.insufficient ? 'Not scored' : report.difficulty_label },
    ...(spoken ? [{ label: 'Pace', value: `${m.words_per_minute} wpm`, note: m.pace ?? undefined }] : []),
    {
      label: m.reason === TYPED_REASON ? 'Words typed' : 'Words spoken',
      value: report.student_words,
      note: `${report.student_turns} turn${report.student_turns === 1 ? '' : 's'}`,
    },
  ];

  return (
    <Stack spacing={3}>
      <DebateHeading
        title={report.topic}
        status={score === null ? <EmergeChip label="Not scored" tone="grey" /> : <EmergeChip label={`${score} / 100`} tone={scoreTone(score)} />}
        subtitle={`You argued ${report.student_position === 'FOR' ? 'for' : 'against'} · ${minutes(report.actual_duration_s)} of ${minutes(report.configured_duration_s)}${report.end_reason === 'time_limit' ? ' · ended at the buzzer' : ''}`}
        actions={
          <Button variant="contained" onClick={onRestart}>
            New debate
          </Button>
        }
      />

      <FactStrip facts={facts} />

      {report.insufficient ? (
        <Alert severity="info" variant="outlined">
          <AlertTitle>Not scored</AlertTitle>
          {report.insufficient_reason}
        </Alert>
      ) : (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 7fr) minmax(0, 5fr)' }, alignItems: 'stretch' }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Scores" subheader={`${report.categories.length} dimensions`} />
            <CardContent sx={{ pt: 1 }}>
              <ReportCategories categories={report.categories} />
            </CardContent>
          </Card>
          <Stack spacing={2}>
            <PointsCard title="Strengths" points={report.strengths} />
            <PointsCard title="To improve" points={report.weaknesses} />
          </Stack>
        </Box>
      )}

      <Card>
        <CardHeader title="Fact-check" subheader={factSummary(report.fact_check)} />
        <ReportFactChecks factCheck={report.fact_check} />
      </Card>

      <Card>
        <CardHeader
          title="More feedback"
          subheader={recorded ? 'Arguments, delivery, plan, and the transcript with your recordings' : 'Arguments, delivery, plan and transcript'}
          action={
            <Button variant="outlined" size="small" onClick={() => setMore((v) => !v)} aria-expanded={more}>
              {more ? 'Hide' : 'Show'}
            </Button>
          }
        />
        <Collapse in={more} unmountOnExit>
          <CardContent>
            <Stack spacing={3}>
              <ReportArguments report={report} />
              <ReportDelivery report={report} />
              <ReportSection title="Transcript">
                <Stack spacing={1.5}>
                  {recorded ? (
                    <Typography variant="body2" color="text.secondary">
                      Your recordings stay in this browser only and are cleared when you leave the page.
                    </Typography>
                  ) : null}
                  <DebateTranscript turns={report.transcript} sessionId={report.session_id} />
                </Stack>
              </ReportSection>
            </Stack>
          </CardContent>
        </Collapse>
      </Card>
    </Stack>
  );
}
