'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CheckCircle2, ClipboardCheck, DoorOpen, ListOrdered, Pencil, UserRound, UsersRound } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { Avatar } from '@/components/ui/row';
import { useAttendanceRoster } from '@/hooks/query/use-attendance-roster';
import { useSectionWeek } from '@/hooks/query/use-classroom';
import { useIdentity } from '@/hooks/query/use-identity';
import { useSection } from '@/hooks/query/use-section';
import { useTeacherOptions } from '@/hooks/query/use-structure';
import { clockOf, todayInSchool } from '@/lib/classroom/week';
import { formatDay } from '@/lib/dates';
import type { YearEnrollment } from '@/types/foundation';
import type { StructureClass, StructureSection } from '@/types/structure';

import { IssueList } from './issue-list';
import type { SectionAct } from './section-act';
import { ClassRolesCard } from './class-roles-card';
import { SectionGroups } from './section-groups';
import type { StructureBase, StructureMode } from './structure-mode';
import { mayAct, useStructureRights } from './use-structure-rights';


function Tile({ icon, label, children, action, warn = false }: { icon: React.ReactNode; label: string; children: React.ReactNode; action?: React.ReactNode; warn?: boolean }): React.ReactElement {
  return (
    <Card sx={(theme) => ({ p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.25, minHeight: 148, outline: warn ? `1px solid ${theme.hues.amber}` : 'none', bgcolor: warn ? theme.tints.amber : undefined })}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: warn ? 'warning.dark' : 'text.secondary' }}>
        {icon}
        <Typography variant="eyebrow" sx={{ color: 'inherit' }}>
          {label}
        </Typography>
      </Stack>
      <Box sx={{ flex: 1 }}>{children}</Box>
      {action}
    </Card>
  );
}

function TodayLessons({ sectionId, yearId }: { sectionId: string; yearId: string }): React.ReactElement {
  const identity = useIdentity();
  const today = todayInSchool(identity.data?.school?.timezone);
  const section = useSection(sectionId);
  const week = useSectionWeek(section.data?.branch_id ?? section.data?.edges?.branch?.id, sectionId, { from: today, to: today });
  const teachers = useTeacherOptions(yearId, true);
  const now = Number(new Date(week.dataUpdatedAt || 0).getHours()) * 60 + new Date(week.dataUpdatedAt || 0).getMinutes();
  const lessons = (week.data?.occurrences ?? []).filter((o) => o.period_kind === 'teaching' || o.subject_offering_id).sort((a, b) => a.start_minute - b.start_minute);
  const nameOf = (id: string | undefined): string => teachers.data?.find((t) => t.id === id)?.name ?? '—';

  return (
    <Card>
      <CardHeader title="Today's lessons" subheader={formatDay(today)} />
      {week.isPending && week.fetchStatus !== 'idle' ? (
        <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>
          Loading the day…
        </Typography>
      ) : lessons.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>
          No lessons today. It may be a holiday or a weekend.
        </Typography>
      ) : (
        <List disablePadding>
          {lessons.map((o) => {
            const live = now >= o.start_minute && now < o.end_minute;
            return (
              <ListItem key={o.id} divider sx={(theme) => ({ px: 3, gap: 2, bgcolor: live ? theme.tints.rose : undefined })}>
                <Typography variant="body2" sx={{ width: 96, flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                  {clockOf(o.start_minute)}–{clockOf(o.end_minute)}
                </Typography>
                <ListItemText primary={o.label ?? o.period_name ?? 'Lesson'} secondary={nameOf(o.teacher_id)} slotProps={{ primary: { variant: 'subtitle2' } }} />
                {live ? <EmergeChip label="Now" tone="rose" dot /> : null}
                {o.state !== 'planned' ? <EmergeChip label={o.state === 'substituted' ? 'Substitute' : o.state === 'cancelled' ? 'Cancelled' : o.state} tone={o.state === 'cancelled' ? 'red' : 'amber'} /> : null}
              </ListItem>
            );
          })}
        </List>
      )}
    </Card>
  );
}

// A section at a glance: who runs it, where it sits, how full it is, how today is going, and what is wrong.
export function SectionOverview({
  yearId,
  row,
  section,
  label,
  pupils,
  mode,
  base,
  personaSlug,
  onAct,
  onTab,
}: {
  yearId: string;
  row: StructureClass;
  section: StructureSection;
  label: string;
  pupils: readonly YearEnrollment[];
  mode: StructureMode;
  base: StructureBase;
  personaSlug: string;
  onAct: (act: SectionAct) => void;
  onTab: (tab: string) => void;
}): React.ReactElement {
  const may = useStructureRights(mode);
  // The set-up checklist is for the office and the class teacher; a subject teacher has nothing to close here.
  const checks = may.structure || may.lead(section.id);
  const identity = useIdentity();
  const today = todayInSchool(identity.data?.school?.timezone);
  const register = useAttendanceRoster(mode === 'active' ? section.id : null, today);
  const cramped = section.room?.capacity != null && section.students > section.room.capacity;
  const over = section.capacity !== null && section.students > section.capacity;
  const issues = row.issues.filter((issue) => issue.section_id === section.id);
  const moved = pupils.filter((p) => p.moves.length > 0);
  const senior = /\b1[12]$/.test(row.name) || section.groups.length > 0;
  const marked = register.data?.entries.filter((e) => e.status) ?? [];
  const absent = marked.filter((e) => e.status === 'absent').length;
  const change = (act: SectionAct, text: string, urgent: boolean): React.ReactNode =>
    mayAct(may, act, section.id) ? (
      <Button size="small" variant={urgent ? 'contained' : 'outlined'} startIcon={<Pencil size={14} />} onClick={() => onAct(act)} sx={{ alignSelf: 'flex-start' }}>
        {text}
      </Button>
    ) : null;

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' } }}>
        <Tile icon={<UserRound size={16} />} label="Class teacher" warn={!section.class_teacher} action={change('teacher', section.class_teacher ? 'Change teacher' : 'Choose a teacher', !section.class_teacher)}>
          {section.class_teacher ? (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Avatar name={section.class_teacher.name} size={40} />
              <Typography variant="h4" component="p">
                {section.class_teacher.name}
              </Typography>
            </Stack>
          ) : (
            <Typography variant="h4" component="p" color="warning.dark">
              Not chosen
            </Typography>
          )}
        </Tile>
        <Tile icon={<DoorOpen size={16} />} label="Room" warn={!section.room || cramped} action={change('room', section.room ? 'Change room' : 'Choose a room', !section.room)}>
          <Typography variant="h4" component="p" color={section.room ? 'text.primary' : 'warning.dark'}>
            {section.room?.name ?? 'Not chosen'}
          </Typography>
          {section.room ? (
            <Typography variant="body2" color={cramped ? 'warning.dark' : 'text.secondary'}>
              {section.room.capacity ?? '—'} seats{cramped ? `, ${section.students} students` : ''}
            </Typography>
          ) : null}
        </Tile>
        <Tile icon={<ListOrdered size={16} />} label="Students" warn={over || section.rolls.missing > 0} action={change(section.rolls.missing > 0 ? 'rolls' : 'edit', section.rolls.missing > 0 ? 'Assign roll numbers' : 'Change size', section.rolls.missing > 0)}>
          <Typography variant="figure" component="p">
            {section.students}
            {section.capacity !== null ? (
              <Typography component="span" variant="h4" color="text.secondary">
                {' '}
                / {section.capacity}
              </Typography>
            ) : null}
          </Typography>
          <Typography variant="body2" color={section.rolls.missing > 0 ? 'warning.dark' : 'text.secondary'}>
            {section.rolls.missing > 0 ? `${section.rolls.missing} without a roll number` : section.students === 0 ? 'No students yet' : 'Every roll number given'}
          </Typography>
        </Tile>
        <Tile
          icon={<UsersRound size={16} />}
          label="Today"
          action={
            mode === 'active' ? (
              <Button size="small" variant={marked.length === 0 ? 'contained' : 'outlined'} startIcon={<ClipboardCheck size={14} />} onClick={() => onTab('attendance')} sx={{ alignSelf: 'flex-start' }}>
                {marked.length === 0 && may.lead(section.id) ? 'Take attendance' : 'Open the register'}
              </Button>
            ) : null
          }
        >
          {mode !== 'active' ? (
            <Typography variant="body2" color="text.secondary">
              Attendance is kept while the year is running.
            </Typography>
          ) : marked.length === 0 ? (
            <Typography variant="h4" component="p" color="warning.dark">
              Not marked yet
            </Typography>
          ) : (
            <>
              <Typography variant="figure" component="p">
                {marked.length - absent}
                <Typography component="span" variant="h4" color="text.secondary">
                  {' '}
                  present
                </Typography>
              </Typography>
              <Typography variant="body2" color={absent > 0 ? 'error.main' : 'text.secondary'}>
                {absent > 0 ? `${absent} absent` : 'Nobody absent'}
              </Typography>
            </>
          )}
        </Tile>
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: checks ? 'minmax(0, 7fr) minmax(0, 5fr)' : '1fr' }, alignItems: 'start' }}>
        {mode === 'active' ? (
          <TodayLessons sectionId={section.id} yearId={yearId} />
        ) : (
          <Card sx={{ p: 3 }}>
            <Typography variant="subtitle1">Timetable</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {mode === 'setup' ? 'Lessons appear here once the year is running and its timetable is built.' : 'The year has ended; its timetable is on the Timetable tab.'}
            </Typography>
          </Card>
        )}
        <Stack spacing={2}>
          {!checks ? null : issues.length > 0 ? (
            <Card>
              <CardHeader title="Needs attention" subheader="Each opens where it is fixed" />
              <IssueList issues={issues} base={base} personaSlug={personaSlug} empty="" />
            </Card>
          ) : (
            <Card sx={{ p: 2.5 }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', color: 'success.main' }}>
                <CheckCircle2 size={20} aria-hidden />
                <Typography variant="subtitle1" color="text.primary">
                  {label} has everything it needs
                </Typography>
              </Stack>
            </Card>
          )}
          <ClassRolesCard sectionId={section.id} editable={may.lead(section.id)} />
          {senior ? <SectionGroups sectionId={section.id} label={label} groups={section.groups} pupils={pupils} editable={may.lead(section.id)} /> : null}
          {moved.length > 0 ? (
            <Card>
              <CardHeader title="Moved this year" subheader="Changes of section, kept on each record" />
              <List disablePadding sx={{ pb: 1 }}>
                {moved.flatMap((p) =>
                  p.moves.map((move) => (
                    <ListItem key={`${p.id}${move.date}`} sx={{ px: 3 }}>
                      <ListItemText primary={p.name} secondary={`${move.from} to ${move.to} on ${formatDay(move.date)} · ${move.reason}`} slotProps={{ primary: { variant: 'subtitle2' } }} />
                    </ListItem>
                  )),
                )}
              </List>
            </Card>
          ) : null}
        </Stack>
      </Box>
    </Stack>
  );
}
