'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { CheckCircle2 } from 'lucide-react';

import { TYPE } from '@/components/homework/homework-meta';
import { MY_STATUS } from '@/components/homework/my-work-status';
import { EmergeChip } from '@/components/ui/chip';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useMyWork } from '@/hooks/query/use-homework';
import { formatMoment } from '@/lib/dates';
import { paths } from '@/paths';

// What a pupil still has to hand in, missing work first, then by when it is due.
export function DueWork({ title, personaSlug }: { title: string; personaSlug: string }): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useMyWork();
  const open = (data ?? []).filter((w) => w.status === 'pending' || w.status === 'missing').sort((a, b) => Number(b.status === 'missing') - Number(a.status === 'missing') || a.due_at.localeCompare(b.due_at));

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardHeader title={title} subheader={isPending ? undefined : open.length === 0 ? 'Nothing to hand in' : `${open.length} to hand in`} />
      {isPending ? (
        <Box sx={{ px: 3, pb: 3 }}>
          <WidgetLoading rows={4} />
        </Box>
      ) : isError ? (
        <Box sx={{ px: 3, pb: 3 }}>
          <WidgetError error={error} onRetry={() => void refetch()} />
        </Box>
      ) : open.length === 0 ? (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 3, py: 3, color: 'success.main' }}>
          <CheckCircle2 size={20} aria-hidden />
          <Typography variant="body1" color="text.primary">
            You are up to date.
          </Typography>
        </Stack>
      ) : (
        <List disablePadding sx={{ flex: 1 }}>
          {open.slice(0, 5).map((w) => (
            <ListItemButton key={w.id} component={NextLink} href={paths.personaSection(personaSlug, 'assignments')} divider sx={{ gap: 1.5, px: 3, py: 1.25 }}>
              <Box sx={(theme) => ({ display: 'grid', placeItems: 'center', flexShrink: 0, width: 34, height: 34, borderRadius: `${theme.band.radius.sm}px`, bgcolor: theme.tints[TYPE[w.type].tone], color: theme.onTint[TYPE[w.type].tone] })}>{TYPE[w.type].icon}</Box>
              <Stack sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle2" noWrap>
                  {w.title}
                </Typography>
                <Typography variant="body2" color={w.status === 'missing' ? 'error.main' : 'text.secondary'} noWrap>
                  {w.subject} · {w.status === 'missing' ? 'was due' : 'due'} {formatMoment(w.due_at)}
                </Typography>
              </Stack>
              <EmergeChip label={MY_STATUS[w.status].label} tone={MY_STATUS[w.status].tone} dot />
            </ListItemButton>
          ))}
        </List>
      )}
      <Box sx={{ px: 3, py: 1.5 }}>
        <Button component={NextLink} href={paths.personaSection(personaSlug, 'assignments')} size="small" variant="outlined">
          All My Work
        </Button>
      </Box>
    </Card>
  );
}
