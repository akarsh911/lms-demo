'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { TrendingDown, TrendingUp } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDay } from '@/lib/dates';
import type { ExamMarkCell, StudentExamRecord, StudentGrades } from '@/types/grades';

import { MARK_STATE, pct1, pctTone } from './mark-states';
import { MarkDetailDialog } from './mark-detail-dialog';

const toPct = (cell: ExamMarkCell): number | null => (cell.marks === null || cell.max === 0 ? null : Math.round((cell.marks / cell.max) * 1000) / 10);

function Mark({ cell, onOpen }: { cell: ExamMarkCell; onOpen: (markId: string) => void }): React.ReactElement {
  if (cell.mark_id === null) {
    return (
      <Typography component="span" variant="body2" color="text.secondary">
        {MARK_STATE[cell.status].label}
      </Typography>
    );
  }
  return (
    <Button size="small" onClick={() => onOpen(cell.mark_id ?? '')} sx={{ minWidth: 0, px: 1, fontVariantNumeric: 'tabular-nums' }}>
      {cell.marks === null ? MARK_STATE[cell.status].label : `${cell.marks} / ${cell.max}`}
    </Button>
  );
}

function Delta({ mine, average }: { mine: number | null; average: number | null }): React.ReactElement {
  if (mine === null || average === null) return <>—</>;
  const diff = Math.round((mine - average) * 10) / 10;
  return (
    <Typography component="span" variant="body2" sx={{ color: diff >= 0 ? 'success.main' : 'error.main', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
      {diff >= 0 ? '+' : ''}
      {diff}
    </Typography>
  );
}

interface Fact {
  label: string;
  value: string;
  note?: string;
  tone?: 'red' | 'amber' | 'green' | 'grey';
  icon?: React.ReactNode;
}

function Facts({ facts }: { facts: readonly Fact[] }): React.ReactElement {
  const theme = useTheme();
  return (
    <Card>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${facts.length}, minmax(0, 1fr))` }, '& > * + *': { borderLeft: { md: `1px solid ${theme.brand.line}` } } }}>
        {facts.map((fact) => (
          <Box key={fact.label} sx={{ px: 2.5, py: 2, minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary" noWrap>
              {fact.label}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5, color: fact.tone === 'red' ? theme.hues.red : fact.tone === 'green' ? theme.hues.green : 'text.primary' }}>
              <Typography variant="h3" component="p" noWrap sx={{ color: 'inherit' }}>
                {fact.value}
              </Typography>
              {fact.icon}
            </Stack>
            {fact.note ? (
              <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.25 }}>
                {fact.note}
              </Typography>
            ) : null}
          </Box>
        ))}
      </Box>
    </Card>
  );
}

// One examination for this pupil, every subject or just the chosen one, each against the section's average.
function ExamCard({ exam, subject, onOpen, emphasis = false }: { exam: StudentExamRecord; subject?: string; onOpen: (markId: string) => void; emphasis?: boolean }): React.ReactElement {
  const rows = subject ? exam.subjects.filter((s) => s.subject === subject) : exam.subjects;
  return (
    <Card>
      <CardHeader
        title={exam.name}
        slotProps={emphasis ? { title: { variant: 'h3' } } : undefined}
        subheader={`${formatDay(exam.start)}${exam.published ? '' : ' · not yet held'}${exam.rank ? ` · Rank ${exam.rank} of ${exam.of} in the section` : ''}`}
        action={
          exam.pct !== null ? (
            <Stack sx={{ alignItems: 'flex-end' }}>
              <Typography variant={emphasis ? 'h2' : 'h3'} component="p" sx={(theme) => ({ color: pctTone(exam.pct) === 'red' ? theme.hues.red : 'text.primary' })}>
                {pct1(exam.pct)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {exam.total} of {exam.max} · section {pct1(exam.class_average_pct)}
              </Typography>
            </Stack>
          ) : undefined
        }
      />
      {rows.length === 0 || exam.pct === null ? (
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            {exam.published ? (subject ? `${subject} was not examined for this pupil.` : 'No marks were recorded for this pupil.') : 'Scheduled; marks appear once it is held and published.'}
          </Typography>
        </CardContent>
      ) : (
        <TableContainer sx={{ border: 0, borderRadius: 0 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Subject</TableCell>
                <TableCell align="right">Marks</TableCell>
                <TableCell align="right">%</TableCell>
                <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                  Section avg
                </TableCell>
                <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                  vs avg
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const mine = toPct(row.mark);
                return (
                  <TableRow key={row.subject} hover>
                    <TableCell>{row.subject}</TableCell>
                    <TableCell align="right">
                      <Mark cell={row.mark} onOpen={onOpen} />
                    </TableCell>
                    <TableCell align="right">{mine === null ? '—' : <EmergeChip label={pct1(mine)} tone={pctTone(mine)} />}</TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' }, color: 'text.secondary' }}>
                      {pct1(row.class_average_pct)}
                    </TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      <Delta mine={mine} average={row.class_average_pct} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Card>
  );
}

// A pupil's examinations in a session, read three ways: the whole year, one subject across it, or one examination.
export function StudentGradesView({ data, examId, subject, onExam, onOpenMark }: { data: StudentGrades; examId: string; subject: string; onExam: (next: string) => void; onOpenMark?: (markId: string) => void }): React.ReactElement {
  const theme = useTheme();
  const [mark, setMark] = React.useState<string | null>(null);
  const open = onOpenMark ?? setMark;
  const held = data.exams.filter((exam) => exam.pct !== null);
  const chosenExam = data.exams.find((exam) => exam.exam_id === examId) ?? null;
  const subjectTrend = subject ? data.subjects.find((s) => s.subject === subject) : undefined;

  if (held.length === 0 && !chosenExam) {
    return (
      <Card>
        <EmptyState title="No examinations held yet" body="Marks, the trend and the subject picture appear here once an examination is published." />
      </Card>
    );
  }

  // One examination: it leads, and the others are a row of chips to switch to without leaving.
  if (chosenExam) {
    const bestSubject = [...chosenExam.subjects].map((s) => ({ s, p: toPct(s.mark) })).filter((x) => x.p !== null).sort((a, b) => (b.p ?? 0) - (a.p ?? 0));
    const facts: Fact[] = [
      { label: 'Overall', value: pct1(chosenExam.pct), note: chosenExam.pct === null ? 'Not held yet' : `${chosenExam.total} of ${chosenExam.max}`, tone: pctTone(chosenExam.pct) },
      { label: 'Rank in section', value: chosenExam.rank ? `${chosenExam.rank} of ${chosenExam.of}` : '—' },
      { label: 'Section average', value: pct1(chosenExam.class_average_pct), note: chosenExam.pct !== null && chosenExam.class_average_pct !== null ? `${chosenExam.pct >= chosenExam.class_average_pct ? '+' : ''}${Math.round((chosenExam.pct - chosenExam.class_average_pct) * 10) / 10} against it` : undefined },
      { label: 'Best subject here', value: bestSubject[0]?.s.subject ?? '—', note: bestSubject[0] ? pct1(bestSubject[0].p) : undefined },
      { label: 'Weakest here', value: bestSubject.length > 1 ? (bestSubject[bestSubject.length - 1]?.s.subject ?? '—') : '—', note: bestSubject.length > 1 ? pct1(bestSubject[bestSubject.length - 1]?.p) : undefined },
    ];
    return (
      <Stack spacing={2}>
        <Facts facts={facts} />
        <ExamCard exam={chosenExam} subject={subject || undefined} onOpen={open} emphasis />
        {data.exams.length > 1 ? (
          <Card>
            <CardHeader title="Other examinations this year" subheader="Switch without leaving" />
            <CardContent sx={{ pt: 0 }}>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                {data.exams.map((exam) => (
                  <Chip key={exam.exam_id} label={`${exam.name} · ${exam.pct === null ? (exam.published ? '—' : 'upcoming') : pct1(exam.pct)}`} color={exam.exam_id === examId ? 'primary' : 'default'} variant={exam.exam_id === examId ? 'filled' : 'outlined'} onClick={() => onExam(exam.exam_id)} />
                ))}
                <Chip label="Whole year" variant="outlined" onClick={() => onExam('')} />
              </Stack>
            </CardContent>
          </Card>
        ) : null}
        {mark ? <MarkDetailDialog markId={mark} onClose={() => setMark(null)} /> : null}
      </Stack>
    );
  }

  // One subject across the year.
  if (subject && subjectTrend) {
    const seen = subjectTrend.points.map((p, i) => ({ exam: data.exams[i], p })).filter((x): x is { exam: StudentExamRecord; p: number } => x.exam !== undefined && x.p !== null);
    const sectionLine = seen.map((x) => x.exam.subjects.find((s) => s.subject === subject)?.class_average_pct ?? null);
    const first = seen[0]?.p ?? null;
    const last = seen[seen.length - 1]?.p ?? null;
    const facts: Fact[] = [
      { label: `${subject} this year`, value: pct1(subjectTrend.average_pct), note: `Across ${seen.length} examinations`, tone: pctTone(subjectTrend.average_pct) },
      { label: 'Best', value: pct1(subjectTrend.best_pct), note: seen.find((x) => x.p === subjectTrend.best_pct)?.exam.name },
      { label: 'Movement', value: first !== null && last !== null && seen.length > 1 ? `${last - first >= 0 ? '+' : ''}${Math.round((last - first) * 10) / 10}` : '—', note: seen.length > 1 ? `${seen[0]?.exam.name} to ${seen[seen.length - 1]?.exam.name}` : 'One examination so far', tone: first !== null && last !== null ? (last >= first ? 'green' : 'red') : 'grey', icon: first !== null && last !== null && seen.length > 1 ? (last >= first ? <TrendingUp size={18} aria-hidden /> : <TrendingDown size={18} aria-hidden />) : undefined },
      { label: 'Against the section', value: sectionLine.length > 0 ? pct1(sectionLine.reduce<number>((t, p) => t + (p ?? 0), 0) / sectionLine.length) : '—', note: 'Section average in this subject' },
    ];
    return (
      <Stack spacing={2}>
        <Facts facts={facts} />
        <Card>
          <CardHeader title={`${subject} across the year`} subheader="Percentage per examination, against the section's average in the subject" />
          <CardContent>
            <LineChart
              height={240}
              xAxis={[{ data: seen.map((x) => x.exam.code), scaleType: 'point', valueFormatter: (code: string, context: { location: string }) => (context.location === 'tick' ? code : (seen.find((x) => x.exam.code === code)?.exam.name ?? code)) }]}
              yAxis={[{ min: 0, max: 100, valueFormatter: (v: number) => `${v}%` }]}
              series={[
                { data: seen.map((x) => x.p), label: data.name, color: theme.palette.primary.main, curve: 'monotoneX', valueFormatter: (v: number | null) => pct1(v) },
                { data: sectionLine, label: 'Section average', color: theme.hues.blue, curve: 'monotoneX', valueFormatter: (v: number | null) => pct1(v) },
              ]}
              margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
              grid={{ horizontal: true }}
            />
          </CardContent>
        </Card>
        {data.exams.map((exam) => (
          <ExamCard key={exam.exam_id} exam={exam} subject={subject} onOpen={open} />
        ))}
        {mark ? <MarkDetailDialog markId={mark} onClose={() => setMark(null)} /> : null}
      </Stack>
    );
  }

  // The whole year.
  const latest = held[held.length - 1] ?? null;
  const trendUp = held.length >= 2 && (held[held.length - 1]?.pct ?? 0) >= (held[held.length - 2]?.pct ?? 0);
  const strongest = data.subjects.find((s) => s.subject === data.strongest);
  const weakest = data.subjects.find((s) => s.subject === data.weakest);
  const facts: Fact[] = [
    { label: 'Average this year', value: pct1(data.overall_pct), note: `Across ${held.length} examinations`, tone: pctTone(data.overall_pct) },
    { label: latest ? `Latest · ${latest.name}` : 'Latest', value: pct1(latest?.pct), note: latest?.rank ? `Rank ${latest.rank} of ${latest.of} in the section` : undefined, icon: held.length >= 2 ? (trendUp ? <TrendingUp size={18} aria-hidden /> : <TrendingDown size={18} aria-hidden />) : undefined, tone: held.length >= 2 ? (trendUp ? 'green' : 'red') : 'grey' },
    { label: 'Strongest subject', value: data.strongest ?? '—', note: strongest ? `Averaging ${pct1(strongest.average_pct)}` : undefined },
    { label: 'Needs attention', value: data.weakest ?? '—', note: weakest ? `Averaging ${pct1(weakest.average_pct)}` : undefined },
  ];

  return (
    <Stack spacing={2}>
      <Facts facts={facts} />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 7fr) minmax(0, 5fr)' } }}>
        <Card>
          <CardHeader title="Across the year" subheader="Overall percentage per examination, against the section's average" />
          <CardContent>
            <LineChart
              height={240}
              xAxis={[{ data: held.map((exam) => exam.code), scaleType: 'point', valueFormatter: (code: string, context: { location: string }) => (context.location === 'tick' ? code : (held.find((exam) => exam.code === code)?.name ?? code)) }]}
              yAxis={[{ min: 0, max: 100, valueFormatter: (v: number) => `${v}%` }]}
              series={[
                { data: held.map((exam) => exam.pct), label: data.name, color: theme.palette.primary.main, curve: 'monotoneX', valueFormatter: (v: number | null) => pct1(v) },
                { data: held.map((exam) => exam.class_average_pct), label: 'Section average', color: theme.hues.blue, curve: 'monotoneX', valueFormatter: (v: number | null) => pct1(v) },
              ]}
              margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
              grid={{ horizontal: true }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="By subject" subheader="Average across the examinations held" />
          <CardContent>
            <BarChart
              height={Math.max(200, data.subjects.length * 30 + 40)}
              layout="horizontal"
              yAxis={[{ data: data.subjects.map((s) => s.subject), width: 120 }]}
              xAxis={[{ min: 0, max: 100, tickNumber: 5, valueFormatter: (v: number) => `${v}%` }]}
              series={[{ data: data.subjects.map((s) => s.average_pct ?? 0), color: theme.palette.primary.main, valueFormatter: (v: number | null) => pct1(v) }]}
              hideLegend
              borderRadius={6}
              margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
              grid={{ vertical: true }}
            />
          </CardContent>
        </Card>
      </Box>
      {data.exams.map((exam) => (
        <ExamCard key={exam.exam_id} exam={exam} onOpen={open} />
      ))}
      {mark ? <MarkDetailDialog markId={mark} onClose={() => setMark(null)} /> : null}
    </Stack>
  );
}
