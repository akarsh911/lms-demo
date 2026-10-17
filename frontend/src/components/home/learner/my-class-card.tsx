'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Award, Sparkles } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useMyClassRole } from '@/hooks/query/use-class-roles';

// A pupil's own class: who looks after it, who leads it, and what they themselves hold in it.
export function MyClassCard({ title }: { title: string }): React.ReactElement | null {
  const { data, isPending, isError, error, refetch } = useMyClassRole();
  if (isPending) return <Card sx={{ p: 2.5, height: '100%' }}><WidgetLoading rows={3} /></Card>;
  if (isError) return <Card sx={{ p: 2.5, height: '100%' }}><WidgetError error={error} onRetry={() => void refetch()} /></Card>;
  if (!data) return null;
  const office = data.office === 'monitor' ? 'Class monitor' : data.office === 'vice_monitor' ? 'Vice-monitor' : null;

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title={title} subheader={data.label} />
      <Stack spacing={2} sx={{ px: 3, pb: 3 }}>
        {office || data.duties.length > 0 ? (
          <Stack direction="row" spacing={1.5} sx={(theme) => ({ alignItems: 'center', p: 1.5, borderRadius: `${theme.band.radius.sm}px`, bgcolor: theme.tints.rose, color: theme.onTint.rose })}>
            {office ? <Award size={20} aria-hidden /> : <Sparkles size={20} aria-hidden />}
            <Box>
              <Typography variant="subtitle2" sx={{ color: 'inherit' }}>
                {office ?? 'Your duties'}
              </Typography>
              {data.duties.length > 0 ? (
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                  {data.duties.map((d) => <EmergeChip key={d} label={d} tone="rose" />)}
                </Stack>
              ) : null}
            </Box>
          </Stack>
        ) : null}
        <Box component="dl" sx={{ m: 0, display: 'grid', gap: 1.5 }}>
          <Field label="Class teacher" quiet={!data.class_teacher}>
            {data.class_teacher ?? 'To be named'}
          </Field>
          <Field label="Monitor" quiet={!data.monitor}>
            {data.monitor ?? 'Not chosen yet'}
          </Field>
        </Box>
      </Stack>
    </Card>
  );
}
