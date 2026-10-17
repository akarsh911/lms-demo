'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';

import { EmptyState } from '@/components/ui/empty-state';
import type { HomeworkDetail, WorkStatus } from '@/types/homework';

import { WORK } from './homework-meta';

const BANDS = [
  { label: 'Under 40%', from: 0, to: 40 },
  { label: '40–59%', from: 40, to: 60 },
  { label: '60–74%', from: 60, to: 75 },
  { label: '75–89%', from: 75, to: 90 },
  { label: '90% and up', from: 90, to: 101 },
] as const;
const ORDER: readonly WorkStatus[] = ['returned', 'graded', 'late', 'submitted', 'pending', 'missing', 'excused'];

// How the marked work came out, and where every student stands with it.
export function HomeworkResults({ homework }: { homework: HomeworkDetail }): React.ReactElement {
  const theme = useTheme();
  const marked = homework.work.filter((w) => w.marks !== null);
  const share = (marks: number): number => (homework.max_marks === 0 ? 0 : (marks / homework.max_marks) * 100);
  const bands = BANDS.map((b) => ({ ...b, count: marked.filter((w) => share(w.marks ?? 0) >= b.from && share(w.marks ?? 0) < b.to).length }));
  const total = homework.work.length;
  const statuses = ORDER.map((s) => ({ status: s, count: homework.work.filter((w) => w.status === s).length })).filter((s) => s.count > 0);
  const top = [...marked].sort((a, b) => (b.marks ?? 0) - (a.marks ?? 0)).slice(0, 3);
  const low = [...marked].sort((a, b) => (a.marks ?? 0) - (b.marks ?? 0)).filter((w) => share(w.marks ?? 0) < 50).slice(0, 3);

  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 7fr) minmax(0, 5fr)' }, alignItems: 'start' }}>
      <Card>
        <CardHeader title="Spread of marks" subheader={marked.length === 0 ? 'Nothing marked yet' : `${marked.length} marked · average ${homework.average ?? 0}%`} />
        {marked.length === 0 ? (
          <EmptyState title="No marks to show yet" body="The spread appears as work is graded." />
        ) : (
          <BarChart
            height={260}
            xAxis={[{ data: bands.map((b) => b.label), colorMap: { type: 'ordinal', colors: [theme.hues.red, theme.hues.amber, theme.palette.primary.light, theme.palette.primary.main, theme.hues.green] } }]}
            series={[{ data: bands.map((b) => b.count), label: 'Students' }]}
            hideLegend
            borderRadius={6}
            margin={{ left: 8, right: 16, top: 16, bottom: 8 }}
            grid={{ horizontal: true }}
          />
        )}
      </Card>
      <Stack spacing={2}>
        <Card>
          <CardHeader title="Where everyone stands" />
          <CardContent>
            <Stack spacing={1.5}>
              <Box sx={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden' }}>
                {statuses.map((s) => (
                  <Box key={s.status} title={`${WORK[s.status].label}: ${s.count}`} sx={(t) => ({ width: `${(s.count / total) * 100}%`, bgcolor: t.onTint[WORK[s.status].tone], opacity: 0.85 })} />
                ))}
              </Box>
              {statuses.map((s) => (
                <Stack key={s.status} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Box sx={(t) => ({ width: 10, height: 10, borderRadius: '50%', bgcolor: t.onTint[WORK[s.status].tone] })} />
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {WORK[s.status].label}
                  </Typography>
                  <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {s.count}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
        {marked.length > 0 ? (
          <Card>
            <CardHeader title="Worth a word" subheader="Highest marks, and those under half" />
            <CardContent>
              <Stack spacing={0.75}>
                {[...top.map((w) => ({ w, tone: 'success.main' })), ...low.map((w) => ({ w, tone: 'error.main' }))].map(({ w, tone }) => (
                  <Stack key={w.student_id} direction="row" sx={{ justifyContent: 'space-between' }}>
                    <Typography variant="body2">{w.name}</Typography>
                    <Typography variant="body2" sx={{ color: tone, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {w.marks} / {homework.max_marks}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        ) : null}
      </Stack>
    </Box>
  );
}
