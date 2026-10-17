'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CircleAlert } from 'lucide-react';

import { TopStudents } from '@/components/grades/analytics-panel';
import { pct1, pctTone } from '@/components/grades/mark-states';
import { EmergeChip } from '@/components/ui/chip';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { usePendingTasks, useSetupAreas, useYearClasses, useYearEvents, useYearRegister, useYearTeaching, useYearTransition } from '@/hooks/query/use-foundation';
import { useExam, useExams } from '@/hooks/query/use-grades';
import { formatDay } from '@/lib/dates';
import { PLAN_LABEL } from '@/lib/school/enrollments';
import { KIND_LABEL, KIND_TONE } from '@/lib/school/events';
import { paths } from '@/paths';
import type { NextYearDisposition, YearRegister, YearTab } from '@/types/foundation';
import type { AcademicSession } from '@/types/mdm';

import { AREA_STATE, AreaStateChip, AreaStateIcon } from './setup-area-state';
import { FactStrip } from '@/components/ui/fact-strip';

const count = (n: number): string => n.toLocaleString('en-IN');

interface Segment {
  label: string;
  value: number;
  tone: 'green' | 'blue' | 'grey' | 'amber' | 'violet' | 'rose';
}

// One bar for how the roll is made up, with the legend beside it, so the numbers are read once.
function Composition({ title, subheader, segments, footnote }: { title: string; subheader: string; segments: readonly Segment[]; footnote?: string }): React.ReactElement {
  const total = segments.reduce((t, s) => t + s.value, 0);
  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title={title} subheader={subheader} />
      <CardContent>
        <Box sx={(theme) => ({ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', bgcolor: theme.brand.sunken })}>
          {segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <Box key={s.label} title={`${s.label}: ${count(s.value)}`} sx={(theme) => ({ width: `${(s.value / Math.max(total, 1)) * 100}%`, bgcolor: theme.onTint[s.tone], opacity: 0.85 })} />
            ))}
        </Box>
        <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 2, rowGap: 1, m: 0, mt: 2 }}>
          {segments.map((s) => (
            <Stack key={s.label} direction="row" spacing={1} sx={{ alignItems: 'baseline', minWidth: 0 }}>
              <Box sx={(theme) => ({ width: 10, height: 10, borderRadius: '50%', bgcolor: theme.onTint[s.tone], flex: 'none', alignSelf: 'center' })} />
              <Typography component="dd" variant="subtitle1" sx={{ m: 0, fontVariantNumeric: 'tabular-nums' }}>
                {count(s.value)}
              </Typography>
              <Typography component="dt" variant="body2" color="text.secondary" noWrap>
                {s.label}
              </Typography>
            </Stack>
          ))}
        </Box>
        {footnote ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            {footnote}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ClassesChart({ yearId }: { yearId: string }): React.ReactElement {
  const theme = useTheme();
  const { data, isPending } = useYearClasses(yearId);
  const rows = data ?? [];
  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title="Classes" subheader={rows.length > 0 ? `${rows.reduce((t, r) => t + r.sections, 0)} sections · pupils per class` : 'Pupils per class'} />
      <CardContent>
        {isPending ? (
          <WidgetLoading rows={4} />
        ) : (
          <BarChart
            height={220}
            xAxis={[{ data: rows.map((row) => row.class_name.replace('Class ', '')), label: 'Class' }]}
            series={[{ data: rows.map((row) => row.students), label: 'Pupils', color: theme.palette.primary.main, valueFormatter: (v: number | null) => (v === null ? '' : `${count(v)} pupils`) }]}
            hideLegend
            borderRadius={6}
            margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
            grid={{ horizontal: true }}
          />
        )}
      </CardContent>
    </Card>
  );
}

// The examinations of the year as a column: held ones with their average, the next one with its date.
function Examinations({ year, personaSlug }: { year: AcademicSession; personaSlug: string }): React.ReactElement {
  const { data, isPending } = useExams(year.id);
  const exams = [...(data ?? [])].sort((a, b) => a.start.localeCompare(b.start));
  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title="Examinations" subheader={exams.length > 0 ? `${exams.filter((e) => e.published).length} held of ${exams.length}` : 'None scheduled'} />
      {isPending ? (
        <CardContent>
          <WidgetLoading rows={3} />
        </CardContent>
      ) : (
        <List disablePadding sx={{ px: 1, py: 0.5 }}>
          {exams.map((exam) => (
            <ListItemButton key={exam.id} component={NextLink} href={paths.personaSection(personaSlug, `grades/exams/${exam.id}?from=year`)} sx={{ borderRadius: 2, gap: 1.5 }}>
              <ListItemText primary={exam.name} secondary={exam.published ? `${formatDay(exam.start)} · ${count(exam.appeared)} sat · ${pct1(exam.pass_pct)} passed` : `${formatDay(exam.start)} · scheduled`} slotProps={{ primary: { variant: 'subtitle2' }, secondary: { variant: 'body2', noWrap: true } }} sx={{ my: 0 }} />
              {exam.published ? <EmergeChip label={pct1(exam.average_pct)} tone={pctTone(exam.average_pct)} /> : <EmergeChip label="Upcoming" tone="amber" />}
            </ListItemButton>
          ))}
        </List>
      )}
    </Card>
  );
}

function ComingUp({ year, closed }: { year: AcademicSession; closed: boolean }): React.ReactElement {
  const { data, isPending } = useYearEvents(year.id);
  const today = new Date().toISOString().slice(0, 10);
  const events = (data ?? []).filter((event) => closed || event.end >= today).filter((event) => closed ? event.kind !== 'holiday' : true).slice(0, 5);
  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title={closed ? 'What the year held' : 'Coming up'} subheader={closed ? 'The events on its calendar' : 'The next events on the calendar'} />
      {isPending ? (
        <CardContent>
          <WidgetLoading rows={3} />
        </CardContent>
      ) : (
        <List disablePadding sx={{ px: 3, py: 1 }}>
          {events.map((event, index) => (
            <ListItem key={event.id} disableGutters divider={index < events.length - 1} sx={{ gap: 1.5 }}>
              <Box sx={{ width: 44, textAlign: 'center', flex: 'none' }}>
                <Typography variant="h4" component="p" sx={{ lineHeight: 1 }}>
                  {Number(event.start.slice(8, 10))}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {new Date(`${event.start}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}
                </Typography>
              </Box>
              <ListItemText primary={event.title} secondary={event.audience ?? KIND_LABEL[event.kind]} slotProps={{ primary: { variant: 'subtitle2', noWrap: true }, secondary: { variant: 'body2', noWrap: true } }} sx={{ my: 0 }} />
              <EmergeChip label={KIND_LABEL[event.kind]} tone={KIND_TONE[event.kind]} />
            </ListItem>
          ))}
        </List>
      )}
    </Card>
  );
}

function Staffing({ yearId }: { yearId: string }): React.ReactElement {
  const { data, isPending } = useYearTeaching(yearId);
  const changes = (data?.changes ?? []).slice(0, 4);
  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title="Staffing" subheader={data ? `${data.teachers ?? 0} teachers · ${data.class_teachers.value} of ${data.class_teachers.total} sections with a class teacher` : 'Teachers and changes'} />
      {isPending ? (
        <CardContent>
          <WidgetLoading rows={3} />
        </CardContent>
      ) : changes.length === 0 ? (
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            No staffing changes were recorded.
          </Typography>
        </CardContent>
      ) : (
        <List disablePadding sx={{ px: 3, py: 1 }}>
          {changes.map((change, index) => (
            <ListItem key={change.id} disableGutters divider={index < changes.length - 1}>
              <ListItemText primary={change.title} secondary={formatDay(change.date)} slotProps={{ primary: { variant: 'subtitle2' }, secondary: { variant: 'body2' } }} sx={{ my: 0 }} />
            </ListItem>
          ))}
        </List>
      )}
    </Card>
  );
}

// The pupils who finished the year's last examination at the top, from that examination's own analytics.
function Toppers({ year, personaSlug }: { year: AcademicSession; personaSlug: string }): React.ReactElement {
  const router = useRouter();
  const exams = useExams(year.id);
  const last = [...(exams.data ?? [])].filter((exam) => exam.published).sort((a, b) => b.start.localeCompare(a.start))[0];
  const detail = useExam(last?.id ?? '', {});
  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title="Top of the year" subheader={last ? `By overall percentage in the ${last.name.toLowerCase()}` : 'No examination was held'} />
      <CardContent sx={{ pt: detail.data ? 0 : undefined }}>
        {!last || !detail.data ? <WidgetLoading rows={3} /> : <TopStudents analytics={detail.data.analytics} onOpen={(studentId) => router.push(paths.personaSection(personaSlug, `grades/students/${studentId}?session=${year.id}`))} />}
      </CardContent>
    </Card>
  );
}

const PLANS: readonly NextYearDisposition[] = ['promote', 'retain', 'graduate', 'not_returning', 'undecided'];

function composition(register: YearRegister): { segments: Segment[]; subheader: string; footnote?: string } {
  if (register.lifecycle === 'closed') {
    return {
      subheader: `${count(register.enrolled)} enrolled over the year`,
      segments: [
        { label: 'Promoted', value: register.promoted, tone: 'green' },
        { label: 'Graduated', value: register.graduated, tone: 'violet' },
        { label: 'Retained', value: register.retained, tone: 'amber' },
        { label: 'Withdrew', value: register.withdrawn, tone: 'grey' },
      ],
      footnote: 'Each pupil who moved up has a new enrolment in the following year; this record was never rewritten.',
    };
  }
  const continuing = register.active - register.new_admissions - register.retained - register.promoted;
  return {
    subheader: `${count(register.active)} on the roll · ${register.withdrawn} withdrawn so far`,
    segments: [
      { label: 'Promoted in', value: register.promoted, tone: 'green' },
      { label: 'Continuing', value: Math.max(0, continuing), tone: 'blue' },
      { label: 'New admissions', value: register.new_admissions, tone: 'rose' },
      { label: 'Retained', value: register.retained, tone: 'amber' },
    ],
    footnote: register.unassigned > 0 ? `${register.unassigned} of them have no section yet.` : undefined,
  };
}

// The year as a dashboard: the roll, the classes, the examinations, the calendar and the staff, each once.
export function YearOverview({ year, personaSlug, setupHref, onOpen }: { year: AcademicSession; personaSlug: string; setupHref: string; onOpen: (tab: YearTab, view?: string) => void }): React.ReactElement {
  const register = useYearRegister(year.id);
  const transition = useYearTransition(year.id);
  const areas = useSetupAreas(year.id);
  const tasks = usePendingTasks(year.id);

  if (register.isPending) return <WidgetLoading rows={6} />;
  if (register.isError) return <WidgetError error={register.error} onRetry={() => void register.refetch()} />;

  const data = register.data;
  const plans = transition.data?.plans;
  const next = transition.data?.next ?? null;
  const open = (areas.data ?? []).filter((area) => area.key !== 'review' && area.state !== 'ready');
  const draft = data.lifecycle === 'draft';
  const closed = data.lifecycle === 'closed';
  const yearHref = (id: string, setup: boolean): string => paths.personaSection(personaSlug, `school/years/${id}${setup ? '/setup' : ''}`);
  const waiting = tasks.data ?? [];

  if (draft) {
    return (
      <Stack spacing={2}>
        <FactStrip
          facts={[
            { label: 'Students expected', value: count((plans?.promote ?? 0) + (plans?.retain ?? 0)), note: 'From last year, before admissions' },
            { label: 'Sections', value: data.sections, note: `${data.sections_with_room} with a room` },
            { label: 'Teachers assigned', value: data.teachers === null ? 'None' : data.teachers },
            { label: 'Setup', value: `${data.areas_ready} of ${data.areas_total}`, note: 'Areas ready' },
          ]}
        />
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 5fr) minmax(0, 7fr)' }, alignItems: 'start' }}>
          <Composition
            title="Students expected"
            subheader="Who the outgoing year expects to send"
            segments={[
              { label: 'Moving up', value: plans?.promote ?? 0, tone: 'green' },
              { label: 'Repeating', value: plans?.retain ?? 0, tone: 'amber' },
              { label: 'New so far', value: data.new_admissions, tone: 'rose' },
              { label: 'Undecided', value: plans?.undecided ?? 0, tone: 'grey' },
            ]}
            footnote={plans?.not_returning ? `${plans.not_returning} are not returning.` : undefined}
          />
          <Card>
            <CardHeader
              title="Setup still open"
              subheader="What this year needs before it can start"
              action={
                <Button component={NextLink} href={setupHref} variant="contained" size="small" endIcon={<ArrowRight size={16} />}>
                  Continue Setup
                </Button>
              }
            />
            {areas.isPending ? (
              <CardContent>
                <WidgetLoading rows={4} />
              </CardContent>
            ) : (
              <List disablePadding sx={{ px: 3, py: 1 }}>
                {open.map((area, index) => (
                  <ListItem key={area.key} disableGutters divider={index < open.length - 1} sx={{ gap: 1.5 }}>
                    <ListItemIcon sx={{ minWidth: 0, color: AREA_STATE[area.state].colour }}>
                      <AreaStateIcon state={area.state} />
                    </ListItemIcon>
                    <ListItemText primary={area.title} secondary={area.summary} slotProps={{ primary: { variant: 'subtitle1' }, secondary: { variant: 'body2' } }} />
                    <AreaStateChip state={area.state} />
                  </ListItem>
                ))}
              </List>
            )}
          </Card>
        </Box>
      </Stack>
    );
  }

  const roll = composition(data);

  return (
    <Stack spacing={2}>
      <FactStrip
        facts={
          closed
            ? [
                { label: 'Final enrolments', value: count(data.enrolled - data.withdrawn), note: `${count(data.enrolled)} over the year` },
                { label: 'Sections', value: data.sections, note: `${data.sections_with_class_teacher} with a class teacher` },
                { label: 'Graduated', value: data.graduated, note: 'From the final class' },
                { label: 'Teachers', value: data.teachers === null ? 'None recorded' : data.teachers },
              ]
            : [
                { label: 'Students enrolled', value: count(data.active), note: data.unassigned > 0 ? `${data.unassigned} without a section` : 'Everyone placed' },
                { label: 'Sections', value: data.sections, note: `${data.sections_with_room} with a room` },
                { label: 'Teachers assigned', value: data.teachers === null ? 'None' : data.teachers },
                { label: 'Needs action', value: data.pending_items, note: data.pending_items > 0 ? 'Open in Actions' : 'Nothing waiting' },
              ]
        }
      />

      {!closed && waiting.length > 0 ? (
        <Card>
          <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 2, px: 3, py: 1.5 }}>
            <Box sx={{ color: 'warning.main', display: 'flex' }}>
              <CircleAlert size={22} aria-hidden />
            </Box>
            <Typography variant="body1" sx={{ flex: '1 1 240px' }} noWrap>
              {waiting
                .slice(0, 3)
                .map((task) => task.title)
                .join(' · ')}
              {waiting.length > 3 ? ` · ${waiting.length - 3} more` : ''}
            </Typography>
            <Button variant="outlined" size="small" endIcon={<ArrowRight size={14} />} onClick={() => onOpen('actions')}>
              Open Actions
            </Button>
          </Stack>
        </Card>
      ) : null}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' }, alignItems: 'stretch' }}>
        <Composition title={closed ? 'How the roll ended' : 'The roll'} subheader={roll.subheader} segments={roll.segments} footnote={roll.footnote} />
        <ClassesChart yearId={year.id} />
        <Examinations year={year} personaSlug={personaSlug} />
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' }, alignItems: 'stretch' }}>
        {closed ? (
          <Staffing yearId={year.id} />
        ) : (
          <Card sx={{ height: '100%' }}>
            <CardHeader
              title="Into next year"
              subheader={next ? `${next.name} · ${next.areas_ready} of ${next.areas_total} areas ready` : 'No year has been created to follow this one'}
              action={
                next ? (
                  <Button component={NextLink} href={yearHref(next.id, true)} variant="contained" size="small" endIcon={<ArrowRight size={14} />}>
                    Setup
                  </Button>
                ) : (
                  <Button component={NextLink} href={paths.personaSection(personaSlug, 'school/years')} variant="outlined" size="small">
                    Add year
                  </Button>
                )
              }
            />
            <CardContent>
              <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 1, m: 0, alignItems: 'baseline' }}>
                {PLANS.map((plan) => {
                  const flagged = plan === 'undecided' && (plans?.[plan] ?? 0) > 0;
                  return (
                    <React.Fragment key={plan}>
                      <Typography component="dd" variant="subtitle1" sx={{ m: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: flagged ? 'warning.dark' : 'text.primary' }}>
                        {count(plans?.[plan] ?? 0)}
                      </Typography>
                      <Typography component="dt" variant="body2" sx={{ color: flagged ? 'warning.dark' : 'text.secondary' }}>
                        {PLAN_LABEL[plan]}
                      </Typography>
                    </React.Fragment>
                  );
                })}
              </Box>
            </CardContent>
          </Card>
        )}
        <ComingUp year={year} closed={closed} />
        {closed ? <Toppers year={year} personaSlug={personaSlug} /> : <Staffing yearId={year.id} />}
      </Box>
    </Stack>
  );
}
