'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ClipboardList } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Segmented } from '@/components/ui/segmented';
import { TabLabel } from '@/components/ui/tab-label';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useMyWork } from '@/hooks/query/use-homework';
import { formatMoment } from '@/lib/dates';
import type { MyWork as Work } from '@/types/homework';

import { TYPE } from './homework-meta';
import { MyWorkDialog } from './my-work-dialog';
import { MY_STATUS } from './my-work-status';

const VIEWS = [
  { value: 'todo', label: 'To do' },
  { value: 'in', label: 'Handed in' },
  { value: 'marked', label: 'Marked' },
] as const;
type View = (typeof VIEWS)[number]['value'];

const viewOf = (w: Work): View => (w.status === 'graded' || w.status === 'returned' || w.status === 'excused' ? 'marked' : w.status === 'submitted' || w.status === 'late' ? 'in' : 'todo');

const DAY = 86_400_000;
function dueText(w: Work, now: number): { text: string; urgent: boolean } {
  const days = Math.ceil((Date.parse(w.due_at) - now) / DAY);
  if (w.status === 'missing') return { text: `Was due ${formatMoment(w.due_at)}`, urgent: true };
  if (viewOf(w) !== 'todo') return { text: `Due ${formatMoment(w.due_at)}`, urgent: false };
  if (days <= 0) return { text: 'Due today', urgent: true };
  if (days === 1) return { text: 'Due tomorrow', urgent: true };
  return { text: `Due in ${days} days`, urgent: false };
}

// A pupil's own assignments: what is still to do, what they have handed in, and what has come back marked.
export function MyWork({ offeringId }: { offeringId?: string }): React.ReactElement {
  const { data, isPending, isError, error, refetch, dataUpdatedAt } = useMyWork();
  const [view, setView] = React.useState<View>('todo');
  const [opened, setOpened] = React.useState<string | null>(null);
  if (isPending) return <WidgetLoading rows={6} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;

  const all = offeringId ? data.filter((w) => w.offering_id === offeringId) : data;
  const rows = all.filter((w) => viewOf(w) === view).sort((a, b) => (view === 'todo' ? a.due_at.localeCompare(b.due_at) : b.due_at.localeCompare(a.due_at)));
  const missing = all.filter((w) => w.status === 'missing').length;
  const work = data.find((w) => w.id === opened);

  return (
    <Card>
      <CardHeader
        title={offeringId ? 'Assignments' : 'My work'}
        subheader={missing > 0 ? `${missing} missing, hand ${missing === 1 ? 'it' : 'them'} in if you still can` : 'Soonest due first'}
        action={<Segmented<View> ariaLabel="Which work" value={view} onChange={setView} options={VIEWS.map((v) => ({ value: v.value, label: <TabLabel label={v.label} count={all.filter((w) => viewOf(w) === v.value).length} /> }))} />}
        sx={{ flexWrap: 'wrap', rowGap: 1.5, '& .MuiCardHeader-action': { alignSelf: 'center', m: 0 } }}
      />
      {rows.length === 0 ? (
        <EmptyState art={<ClipboardList size={40} aria-hidden />} title={view === 'todo' ? 'Nothing to do' : view === 'in' ? 'Nothing waiting to be marked' : 'Nothing marked yet'} body={view === 'todo' ? 'New work from your teachers shows here.' : 'Work moves here as it goes along.'} />
      ) : (
        <List disablePadding>
          {rows.map((w) => {
            const due = dueText(w, dataUpdatedAt);
            return (
              <ListItemButton key={w.id} onClick={() => setOpened(w.id)} sx={(theme) => ({ gap: 2, px: 3, py: 1.5, borderTop: `1px solid ${theme.brand.line}` })}>
                <Stack sx={(theme) => ({ width: 40, height: 40, flexShrink: 0, borderRadius: `${theme.band.radius.sm}px`, alignItems: 'center', justifyContent: 'center', bgcolor: theme.tints[TYPE[w.type].tone], color: theme.onTint[TYPE[w.type].tone] })}>{TYPE[w.type].icon}</Stack>
                <Stack sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" noWrap>
                    {w.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {offeringId ? TYPE[w.type].label : w.subject} · {w.teacher}
                  </Typography>
                </Stack>
                <Stack spacing={0.5} sx={{ alignItems: 'flex-end', flexShrink: 0 }}>
                  {view === 'marked' && w.marks !== null ? (
                    <Typography variant="subtitle1" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {w.marks} / {w.max_marks}
                    </Typography>
                  ) : (
                    <EmergeChip label={MY_STATUS[w.status].label} tone={MY_STATUS[w.status].tone} dot />
                  )}
                  <Typography variant="caption" color={due.urgent ? 'error.main' : 'text.secondary'}>
                    {due.text}
                  </Typography>
                </Stack>
              </ListItemButton>
            );
          })}
        </List>
      )}
      {work ? <MyWorkDialog key={work.id} work={work} onClose={() => setOpened(null)} /> : null}
    </Card>
  );
}
