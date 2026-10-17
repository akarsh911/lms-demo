'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';

import { pct1, pctTone } from '@/components/grades/mark-states';
import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useExams } from '@/hooks/query/use-grades';
import { dayRange } from '@/lib/dates';
import { paths } from '@/paths';
import type { AcademicSession } from '@/types/mdm';

import { FactStrip } from '@/components/ui/fact-strip';

const TYPE_LABEL: Readonly<Record<string, string>> = { unit_test: 'Unit test', term: 'Term', practice: 'Practice', board: 'Board' };

// Every examination the year held, in order, with who sat it and how it went. A row opens the examination with this year as its way back.
export function YearExaminations({ year, personaSlug }: { year: AcademicSession; personaSlug: string }): React.ReactElement {
  const router = useRouter();
  const { data, isPending, isError, error, refetch } = useExams(year.id);

  if (isPending) return <WidgetLoading rows={5} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;

  const exams = [...data].sort((a, b) => a.start.localeCompare(b.start));
  const held = exams.filter((exam) => exam.published);
  const averages = held.map((exam) => exam.average_pct).filter((p): p is number => p !== null);
  const best = held.reduce<(typeof held)[number] | null>((top, exam) => (top === null || (exam.average_pct ?? 0) > (top.average_pct ?? 0) ? exam : top), null);

  return (
    <Stack spacing={2}>
      <FactStrip
        facts={[
          { label: 'Examinations', value: exams.length, note: `${held.length} held · ${exams.length - held.length} scheduled` },
          { label: 'Average across the year', value: averages.length === 0 ? '—' : pct1(averages.reduce((t, p) => t + p, 0) / averages.length), note: 'Mean of the examinations held' },
          { label: 'Best examination', value: best ? pct1(best.average_pct) : '—', note: best?.name },
          { label: 'Papers set', value: exams.reduce((t, exam) => t + exam.subjects * exam.classes, 0), note: 'One per subject per class' },
        ]}
      />
      <Card>
        <CardHeader title="Examinations" subheader={`Held in ${year.name}, earliest first`} />
        {exams.length === 0 ? (
          <EmptyState title="No examinations in this year" body="Examinations appear here once they are scheduled." />
        ) : (
          <TableContainer sx={{ border: 0, borderRadius: 0 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Examination</TableCell>
                  <TableCell>Dates</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>For</TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    Appeared
                  </TableCell>
                  <TableCell align="right">Average</TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    Pass rate
                  </TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {exams.map((exam) => (
                  <TableRow key={exam.id} hover sx={{ cursor: 'pointer' }} onClick={() => router.push(paths.personaSection(personaSlug, `grades/exams/${exam.id}?from=year`))}>
                    <TableCell>
                      <Typography variant="subtitle1" component="p">
                        {exam.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {TYPE_LABEL[exam.exam_type] ?? exam.exam_type} · {exam.subjects} subjects
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{dayRange(exam.start, exam.end)}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, color: 'text.secondary' }}>{exam.class_names}</TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' }, fontVariantNumeric: 'tabular-nums' }}>
                      {exam.appeared > 0 ? exam.appeared.toLocaleString('en-IN') : '—'}
                    </TableCell>
                    <TableCell align="right">{exam.average_pct === null ? '—' : <EmergeChip label={pct1(exam.average_pct)} tone={pctTone(exam.average_pct)} />}</TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' }, fontVariantNumeric: 'tabular-nums' }}>
                      {pct1(exam.pass_pct)}
                    </TableCell>
                    <TableCell>{exam.published ? <EmergeChip label="Results out" tone="green" dot /> : <EmergeChip label="Scheduled" tone="amber" dot />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </Stack>
  );
}
