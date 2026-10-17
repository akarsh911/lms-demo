'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { ArrowRight } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useExams } from '@/hooks/query/use-grades';
import { useMdmSessions } from '@/hooks/query/use-mdm';
import { dayRange } from '@/lib/dates';
import { paths } from '@/paths';
import type { ExamSummary } from '@/types/grades';

import { pct1, pctTone } from './mark-states';

const TYPE_LABEL: Readonly<Record<string, string>> = { unit_test: 'Unit test', term: 'Term examination', practice: 'Practice', board: 'Board' };

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'amber' | 'green' | 'grey' }): React.ReactElement {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary" noWrap>
        {label}
      </Typography>
      <Typography variant="h3" component="p" sx={(theme) => ({ color: tone === 'red' ? theme.hues.red : tone === 'green' ? theme.hues.green : 'text.primary' })}>
        {value}
      </Typography>
    </Box>
  );
}

function ExamCard({ exam, href }: { exam: ExamSummary; href: string }): React.ReactElement {
  return (
    <Card>
      <CardActionArea component={NextLink} href={href} sx={{ height: '100%' }}>
        <CardHeader
          title={exam.name}
          subheader={`${exam.start === exam.end ? dayRange(exam.start, exam.end).split(' to ')[0] : dayRange(exam.start, exam.end)} · ${exam.subjects} ${exam.subjects === 1 ? 'subject' : 'subjects'} · ${exam.classes} ${exam.classes === 1 ? 'class' : 'classes'}`}
          action={
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
              <EmergeChip label={TYPE_LABEL[exam.exam_type] ?? exam.exam_type} tone="grey" />
              {exam.published ? <EmergeChip label="Results out" tone="green" dot /> : <EmergeChip label="Scheduled" tone="amber" dot />}
            </Stack>
          }
        />
        <CardContent>
          {exam.appeared === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No marks have been recorded yet.
            </Typography>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 2 }}>
              <Figure label="Appeared" value={exam.appeared.toLocaleString('en-IN')} />
              <Figure label="Average" value={pct1(exam.average_pct)} tone={pctTone(exam.average_pct)} />
              <Figure label="Pass rate" value={pct1(exam.pass_pct)} tone={exam.pass_pct !== null && exam.pass_pct < 90 ? 'amber' : 'green'} />
              <Figure label="Highest" value={pct1(exam.highest_pct)} />
            </Box>
          )}
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mt: 2, color: 'primary.main' }}>
            <Typography variant="subtitle2" component="span">
              {exam.appeared === 0 ? 'Open the schedule' : 'Open results and analytics'}
            </Typography>
            <ArrowRight size={14} aria-hidden />
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

// Every examination the school has held, one card each, newest first; a session filter for the record.
export function ExamCatalogue({ personaSlug }: { personaSlug: string }): React.ReactElement {
  const sessions = useMdmSessions();
  const [sessionId, setSessionId] = React.useState('');
  const current = sessions.data?.rows.find((row) => row.is_current)?.id ?? '';
  const chosen = sessionId || current;
  const exams = useExams(chosen || undefined);

  if (sessions.isPending || exams.isPending) return <WidgetLoading rows={6} />;
  if (sessions.isError) return <WidgetError error={sessions.error} onRetry={() => void sessions.refetch()} />;
  if (exams.isError) return <WidgetError error={exams.error} onRetry={() => void exams.refetch()} />;

  const held = exams.data.filter((exam) => exam.published);
  const coming = exams.data.filter((exam) => !exam.published);
  const years = [...sessions.data.rows].filter((row) => row.status !== 'upcoming').sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''));

  return (
    <Stack spacing={2}>
      <CardToolbar summary={`${held.length} held · ${coming.length} scheduled`}>
        <TextField select size="small" label="Academic year" value={chosen} onChange={(event) => setSessionId(event.target.value)} sx={{ minWidth: 180 }}>
          {years.map((row) => (
            <MenuItem key={row.id} value={row.id}>
              {row.name}
              {row.is_current ? ' · current' : ''}
            </MenuItem>
          ))}
        </TextField>
      </CardToolbar>
      {exams.data.length === 0 ? (
        <EmptyState title="No examinations in this year" body="Examinations appear here once they are scheduled." />
      ) : (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' } }}>
          {exams.data.map((exam) => (
            <ExamCard key={exam.id} exam={exam} href={paths.personaSection(personaSlug, `grades/exams/${exam.id}`)} />
          ))}
        </Box>
      )}
    </Stack>
  );
}
