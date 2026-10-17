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
import { CheckCircle2, ClipboardCheck, ClipboardList, PenLine } from 'lucide-react';

import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import type { ChipTone } from '@/components/ui/chip';
import { useRegisters } from '@/hooks/query/use-attendance-day';
import { useHomeworkList } from '@/hooks/query/use-homework';
import { useIdentity } from '@/hooks/query/use-identity';
import { todayInSchool } from '@/lib/classroom/week';
import { formatMoment } from '@/lib/dates';
import { paths } from '@/paths';

interface Need {
  key: string;
  icon: React.ReactElement;
  tone: ChipTone;
  title: string;
  detail: string;
  href: string;
}

const DAY = 86_400_000;

// What a teacher owes today: the register of the class they lead, work waiting to be marked, and work falling due.
export function NeedsYou({ title, personaSlug }: { title: string; personaSlug: string }): React.ReactElement {
  const identity = useIdentity();
  const today = todayInSchool(identity.data?.school?.timezone);
  const registers = useRegisters(today);
  const homework = useHomeworkList();

  if (registers.isPending || homework.isPending) return <Card sx={{ p: 2.5, height: '100%' }}><WidgetLoading rows={4} /></Card>;
  if (registers.isError) return <Card sx={{ p: 2.5, height: '100%' }}><WidgetError error={registers.error} onRetry={() => void registers.refetch()} /></Card>;
  if (homework.isError) return <Card sx={{ p: 2.5, height: '100%' }}><WidgetError error={homework.error} onRetry={() => void homework.refetch()} /></Card>;

  const now = homework.dataUpdatedAt;
  const mine = homework.data.filter((h) => h.mine);
  const needs: Need[] = [
    ...registers.data
      .filter((r) => r.led && r.marked < r.total)
      .map((r) => ({
        key: `register-${r.section_id}`,
        icon: <ClipboardCheck size={18} />,
        tone: 'rose' as const,
        title: `Take the ${r.label} register`,
        detail: r.marked === 0 ? `Not taken yet${r.on_leave > 0 ? ` · ${r.on_leave} on leave` : ''}` : `${r.marked} of ${r.total} marked`,
        href: paths.personaSection(personaSlug, `attendance?section=${r.section_id}`),
      })),
    ...mine
      .filter((h) => h.submitted - h.graded > 0)
      .sort((a, b) => b.submitted - b.graded - (a.submitted - a.graded))
      .slice(0, 3)
      .map((h) => ({
        key: `grade-${h.id}`,
        icon: <PenLine size={18} />,
        tone: 'violet' as const,
        title: `Mark ${h.title}`,
        detail: `${h.section} · ${h.submitted - h.graded} handed in, waiting`,
        href: paths.personaSection(personaSlug, `assignments/${h.id}`),
      })),
    ...mine
      .filter((h) => h.state === 'open' && Date.parse(h.due_at) - now < 2 * DAY)
      .slice(0, 2)
      .map((h) => ({
        key: `due-${h.id}`,
        icon: <ClipboardList size={18} />,
        tone: 'amber' as const,
        title: `${h.title} is due ${formatMoment(h.due_at)}`,
        detail: `${h.section} · ${h.assigned - h.submitted} still to hand in`,
        href: paths.personaSection(personaSlug, `assignments/${h.id}`),
      })),
  ];

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardHeader title={title} subheader={needs.length === 0 ? 'Nothing waiting on you' : `${needs.length} ${needs.length === 1 ? 'thing' : 'things'} today`} />
      {needs.length === 0 ? (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 3, py: 3, color: 'success.main' }}>
          <CheckCircle2 size={20} aria-hidden />
          <Typography variant="body1" color="text.primary">
            Registers taken and marking up to date.
          </Typography>
        </Stack>
      ) : (
        <List disablePadding sx={{ flex: 1 }}>
          {needs.map((n) => (
            <ListItemButton key={n.key} component={NextLink} href={n.href} divider sx={{ gap: 1.5, px: 3, py: 1.25 }}>
              <Box sx={(theme) => ({ display: 'grid', placeItems: 'center', flexShrink: 0, width: 34, height: 34, borderRadius: `${theme.band.radius.sm}px`, bgcolor: theme.tints[n.tone], color: theme.onTint[n.tone] })}>{n.icon}</Box>
              <Stack sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle2" noWrap>
                  {n.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {n.detail}
                </Typography>
              </Stack>
            </ListItemButton>
          ))}
        </List>
      )}
      <Box sx={{ px: 3, py: 1.5 }}>
        <Button component={NextLink} href={paths.personaSection(personaSlug, 'assignments')} size="small" variant="outlined">
          All Assignments
        </Button>
      </Box>
    </Card>
  );
}
