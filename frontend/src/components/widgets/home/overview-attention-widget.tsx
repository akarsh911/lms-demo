'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

import { AttentionIcon } from '@/components/home/overview/attention-icon';
import { useSchoolOverview } from '@/hooks/query/use-foundation';
import { overviewHref } from '@/lib/school/overview';
import type { WidgetProps } from '@/types/widget';

import { WidgetError } from '../widget-states';

// The one thing that needs the administrator first. Exactly one, or a calm line saying there is none.
export function OverviewAttentionWidget({ personaSlug }: WidgetProps): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useSchoolOverview();

  if (isPending) return <Skeleton variant="rounded" height={92} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;

  const item = data.primary;
  if (!item) {
    return (
      <Card>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', p: 3 }}>
          <Box sx={{ color: 'success.main', display: 'flex' }}>
            <CheckCircle2 size={28} aria-hidden />
          </Box>
          <div>
            <Typography variant="h4" component="p">
              Everything important is on track today
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Attendance is submitted and nothing urgent is waiting.
            </Typography>
          </div>
        </Stack>
      </Card>
    );
  }

  const href = overviewHref(personaSlug, item.link);
  return (
    <Card>
      <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 2, px: 3, py: 2.5 }}>
        <Box sx={(theme) => ({ display: 'grid', placeItems: 'center', width: 52, height: 52, borderRadius: `${theme.band.radius.md}px`, bgcolor: theme.tints.rose, color: theme.onTint.rose, flex: 'none' })}>
          <AttentionIcon kind={item.kind} size={24} />
        </Box>
        <Box sx={{ flex: '1 1 280px', minWidth: 0 }}>
          <Typography variant="h3" component="p">
            {item.title}
          </Typography>
          {item.detail ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {item.detail}
            </Typography>
          ) : null}
        </Box>
        {href ? (
          <Button component={NextLink} href={href} variant="contained" endIcon={<ArrowRight size={16} />}>
            {item.action}
          </Button>
        ) : null}
      </Stack>
    </Card>
  );
}
