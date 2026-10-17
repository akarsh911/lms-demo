'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

import { AttentionIcon } from '@/components/home/overview/attention-icon';
import { EmergeChip } from '@/components/ui/chip';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { usePendingTasks, useYearEnrollments, useYearTransition } from '@/hooks/query/use-foundation';
import { formatDay } from '@/lib/dates';
import { isUnassigned } from '@/lib/school/enrollments';
import { paths } from '@/paths';
import { issueHref } from '@/components/school/classes/issue-list';
import { ROUTE_INDEX } from '@/routes/registry';
import type { PendingTask, YearEnrollment, YearTab } from '@/types/foundation';
import type { AcademicSession } from '@/types/mdm';

import { LeaverDocumentsDialog } from './leaver-documents-dialog';
import { PlaceStudentDialog } from './place-student-dialog';

const ICON_KIND: Readonly<Record<PendingTask['scope'], 'attendance' | 'room' | 'staff' | 'setup' | 'timetable'>> = {
  student: 'attendance',
  class: 'room',
  teacher: 'staff',
  room: 'room',
  year: 'timetable',
};

const owes = (row: YearEnrollment): boolean => row.documents.some((document) => document.state === 'pending');

// Everything in a running year that is waiting on somebody, with the way to clear it beside it.
export function YearActions({ year, personaSlug, onOpen }: { year: AcademicSession; personaSlug: string; onOpen: (tab: YearTab, view?: string) => void }): React.ReactElement {
  const tasks = usePendingTasks(year.id);
  const enrollments = useYearEnrollments(year.id);
  const transition = useYearTransition(year.id);
  const [placing, setPlacing] = React.useState<YearEnrollment | null>(null);
  const [documents, setDocuments] = React.useState<YearEnrollment | null>(null);

  if (tasks.isPending || enrollments.isPending) return <WidgetLoading rows={6} />;
  if (tasks.isError) return <WidgetError error={tasks.error} onRetry={() => void tasks.refetch()} />;
  if (enrollments.isError) return <WidgetError error={enrollments.error} onRetry={() => void enrollments.refetch()} />;

  const rows = enrollments.data;
  const unplaced = rows.filter(isUnassigned);
  const owed = rows.filter(owes);
  const undecided = transition.data?.plans.undecided ?? 0;
  const list = tasks.data;

  if (list.length === 0 && undecided === 0) {
    return (
      <Card>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', p: 3, color: 'success.main' }}>
          <CheckCircle2 size={22} aria-hidden />
          <Typography variant="body1" color="text.primary">
            Nothing in this year is waiting on anybody.
          </Typography>
        </Stack>
      </Card>
    );
  }

  const inline = (task: PendingTask): React.ReactNode => {
    if (task.kind === 'placement') {
      return (
        <List disablePadding dense>
          {unplaced.map((row, index) => (
            <ListItem
              key={row.id}
              disableGutters
              divider={index < unplaced.length - 1}
              secondaryAction={
                <Button size="small" variant="outlined" onClick={() => setPlacing(row)}>
                  Place
                </Button>
              }
            >
              <ListItemText primary={row.name} secondary={`${row.class_name} · admitted ${formatDay(row.joined)}`} />
            </ListItem>
          ))}
        </List>
      );
    }
    if (task.kind === 'documents') {
      return (
        <List disablePadding dense>
          {owed.map((row, index) => (
            <ListItem
              key={row.id}
              disableGutters
              divider={index < owed.length - 1}
              secondaryAction={
                <Button size="small" variant="outlined" onClick={() => setDocuments(row)}>
                  Complete
                </Button>
              }
            >
              <ListItemText primary={row.name} secondary={`${row.class_name}${row.section_name ? ` ${row.section_name}` : ''} · left ${formatDay(row.left ?? undefined)} · ${row.documents.filter((d) => d.state === 'pending').map((d) => d.label).join(', ')} pending`} />
            </ListItem>
          ))}
        </List>
      );
    }
    return null;
  };

  const action = (task: PendingTask): React.ReactNode => {
    if (task.target) {
      return (
        <Button component={NextLink} href={paths.personaSection(personaSlug, issueHref({ path: `school/years/${year.id}/classes` }, task.target))} size="small" variant="outlined" endIcon={<ArrowRight size={14} />}>
          Fix
        </Button>
      );
    }
    const record = task.route ? ROUTE_INDEX.get(task.route) : undefined;
    if (record) {
      return (
        <Button component={NextLink} href={paths.personaSection(personaSlug, record.path)} size="small" variant="outlined" endIcon={<ArrowRight size={14} />}>
          Open {record.node.title}
        </Button>
      );
    }
    if (task.tab === 'actions') return null;
    return (
      <Button size="small" variant="outlined" endIcon={<ArrowRight size={14} />} onClick={() => onOpen(task.tab, task.view)}>
        Review
      </Button>
    );
  };

  return (
    <Stack spacing={2}>
      {list.map((task) => (
        <Card key={task.id}>
          <CardHeader
            avatar={
              <Box sx={(theme) => ({ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: `${theme.band.radius.md}px`, bgcolor: theme.tints.amber, color: theme.onTint.amber })}>
                <AttentionIcon kind={ICON_KIND[task.scope]} size={22} />
              </Box>
            }
            title={
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <span>{task.title}</span>
                <EmergeChip label={String(task.count)} tone="amber" />
              </Stack>
            }
            subheader={task.detail}
            action={action(task)}
          />
          {inline(task) ? <CardContent sx={{ pt: 0 }}>{inline(task)}</CardContent> : null}
        </Card>
      ))}

      {undecided > 0 ? (
        <Card>
          <CardHeader
            avatar={
              <Box sx={(theme) => ({ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: `${theme.band.radius.md}px`, bgcolor: theme.tints.amber, color: theme.onTint.amber })}>
                <AttentionIcon kind="setup" size={22} />
              </Box>
            }
            title={
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <span>{undecided} students have no decision for next year</span>
                <EmergeChip label={String(undecided)} tone="amber" />
              </Stack>
            }
            subheader="Promote, retain or mark as not returning before the year turns over. Decisions are recorded with the Students module."
          />
        </Card>
      ) : null}

      {placing ? <PlaceStudentDialog student={placing} rows={rows} onClose={() => setPlacing(null)} /> : null}
      {documents ? <LeaverDocumentsDialog student={documents} onClose={() => setDocuments(null)} /> : null}
    </Stack>
  );
}
