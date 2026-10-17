'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ListItemButton from '@mui/material/ListItemButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { AlarmClock, ArrowRight, Check, UserRound } from 'lucide-react';

import { EmergeChip, type ChipTone } from '@/components/ui/chip';
import { RowMenu } from '@/components/ui/row-menu';
import { useToast } from '@/components/ui/toast';
import { useQuickAction, useResolveAction, useSnoozeAction } from '@/hooks/mutation/use-actions';
import { formatRelativeTime } from '@/lib/dates';
import { paths } from '@/paths';
import type { ActionItem } from '@/types/actions';

import { CATEGORY } from './action-meta';

const DAY = 86_400_000;

// "Overdue 3 days", "Due today", "Due in 4 days", against the time the list was fetched.
export function dueLabel(due: string | null, now: number): { text: string; tone: ChipTone } | null {
  if (!due) return null;
  const days = Math.floor((Date.parse(`${due.slice(0, 10)}T00:00:00Z`) - Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`)) / DAY);
  if (days < 0) return { text: `Overdue ${-days} ${days === -1 ? 'day' : 'days'}`, tone: 'red' };
  if (days === 0) return { text: 'Due today', tone: 'red' };
  if (days === 1) return { text: 'Due tomorrow', tone: 'amber' };
  return { text: `Due in ${days} days`, tone: days <= 7 ? 'amber' : 'grey' };
}

export const snoozeUntil = (days: number, now: number): string => {
  const d = new Date(now + days * DAY);
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
};

const BAR = { urgent: 'error.main', high: 'warning.main', normal: 'transparent' } as const;

export function ActionRow({ item, now, personaSlug, onOpen }: { item: ActionItem; now: number; personaSlug: string; onOpen: () => void }): React.ReactElement {
  const notify = useToast();
  const quick = useQuickAction(item.id);
  const snooze = useSnoozeAction(item.id);
  const resolve = useResolveAction(item.id);
  const due = item.status === 'open' ? dueLabel(item.due_at, now) : null;
  const meta = CATEGORY[item.category];

  return (
    <ListItemButton onClick={onOpen} divider sx={{ alignItems: 'flex-start', gap: 2, pl: 0, pr: 2, py: 1.75 }}>
      <Box aria-hidden sx={{ alignSelf: 'stretch', width: 4, borderRadius: 2, bgcolor: BAR[item.priority], flexShrink: 0 }} />
      <Box sx={(theme) => ({ display: 'grid', placeItems: 'center', flexShrink: 0, width: 38, height: 38, borderRadius: `${theme.band.radius.sm}px`, bgcolor: theme.tints[meta.tone], color: theme.onTint[meta.tone] })}>{meta.icon}</Box>
      <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" component="span" sx={{ overflowWrap: 'anywhere' }}>
          {item.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {item.detail}
        </Typography>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, pt: 0.25 }}>
          {due ? <EmergeChip label={due.text} tone={due.tone} dot={due.tone === 'red'} /> : null}
          {item.status === 'snoozed' && item.snoozed_until ? <EmergeChip label={`Snoozed until ${new Date(item.snoozed_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`} tone="blue" /> : null}
          <EmergeChip label={item.about} tone="grey" />
          {item.owner ? <EmergeChip label={item.owner} tone="violet" /> : null}
          <Typography variant="caption" color="text.secondary">
            Raised {formatRelativeTime(item.raised_at, now)}
          </Typography>
        </Stack>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0, display: { xs: 'none', md: 'flex' } }} onClick={(e) => e.stopPropagation()}>
        {item.status === 'open' && item.quick ? (
          <Button size="small" variant="outlined" loading={quick.isPending} onClick={() => quick.mutate(undefined, { onSuccess: () => notify(`${item.quick}: recorded`) })}>
            {item.quick}
          </Button>
        ) : null}
        {item.link ? (
          <Button size="small" component={NextLink} href={paths.personaSection(personaSlug, item.link.path)} endIcon={<ArrowRight size={14} />}>
            {item.link.label}
          </Button>
        ) : null}
      </Stack>
      <Box onClick={(e) => e.stopPropagation()} sx={{ pt: 0.25 }}>
        <RowMenu
          label={`More for ${item.title}`}
          actions={[
            { label: 'Hand to someone', icon: <UserRound size={16} />, onSelect: onOpen },
            { label: 'Snooze until tomorrow', icon: <AlarmClock size={16} />, onSelect: () => snooze.mutate(snoozeUntil(1, now), { onSuccess: () => notify('Snoozed until tomorrow morning') }), disabled: item.status !== 'open' },
            { label: 'Snooze for a week', icon: <AlarmClock size={16} />, onSelect: () => snooze.mutate(snoozeUntil(7, now), { onSuccess: () => notify('Snoozed for a week') }), disabled: item.status !== 'open' },
            { label: 'Mark done', icon: <Check size={16} />, onSelect: () => resolve.mutate('', { onSuccess: () => notify('Marked done') }), disabled: item.status === 'done' },
          ]}
        />
      </Box>
    </ListItemButton>
  );
}
