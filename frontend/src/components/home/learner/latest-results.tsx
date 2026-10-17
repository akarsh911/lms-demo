'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';

import { FactStrip } from '@/components/ui/fact-strip';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useStudentGrades } from '@/hooks/query/use-grades';
import { paths } from '@/paths';

// A pupil's latest published examination: the overall figure against the section, and each subject beside it.
export function LatestResults({ title, studentId, personaSlug }: { title: string; studentId: string; personaSlug: string }): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useStudentGrades(studentId);
  const latest = [...(data?.exams ?? [])].filter((e) => e.published && e.pct !== null).sort((a, b) => b.start.localeCompare(a.start))[0];

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardHeader title={title} subheader={latest ? latest.name : undefined} />
      <Box sx={{ px: 3, pb: 2, flex: 1 }}>
        {isPending ? (
          <WidgetLoading rows={4} />
        ) : isError ? (
          <WidgetError error={error} onRetry={() => void refetch()} />
        ) : !latest ? (
          <WidgetEmpty message="No results published yet this year." />
        ) : (
          <Stack spacing={2}>
            <FactStrip
              facts={[
                { label: 'Overall', value: `${latest.pct ?? '—'}%`, note: latest.class_average_pct !== null ? `Section ${latest.class_average_pct}%` : '' },
                { label: 'Strongest', value: data?.strongest ?? '—', note: 'This year so far' },
                { label: 'To work on', value: data?.weakest ?? '—', note: 'This year so far' },
              ]}
            />
            <Stack spacing={1}>
              {latest.subjects.map((s) => {
                const pct = s.mark.max > 0 && s.mark.marks !== null ? Math.round((s.mark.marks / s.mark.max) * 100) : null;
                return (
                  <Stack key={s.subject} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Typography variant="body2" noWrap sx={{ width: 140, flexShrink: 0 }}>
                      {s.subject}
                    </Typography>
                    <Box sx={(theme) => ({ flex: 1, height: 8, borderRadius: 4, bgcolor: theme.brand.sunken, overflow: 'hidden' })}>
                      <Box sx={(theme) => ({ width: `${pct ?? 0}%`, height: 1, bgcolor: pct !== null && pct < 40 ? theme.hues.red : theme.palette.primary.main })} />
                    </Box>
                    <Typography variant="body2" sx={{ width: 64, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {s.mark.marks ?? '—'} / {s.mark.max}
                    </Typography>
                  </Stack>
                );
              })}
            </Stack>
          </Stack>
        )}
      </Box>
      <Box sx={{ px: 3, py: 1.5 }}>
        <Button component={NextLink} href={paths.personaSection(personaSlug, 'grades')} size="small" variant="outlined">
          All My Results
        </Button>
      </Box>
    </Card>
  );
}
