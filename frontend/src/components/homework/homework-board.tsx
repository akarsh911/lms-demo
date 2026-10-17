'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ClipboardList, Plus } from 'lucide-react';

import { useUrlState } from '@/components/school/url-state';
import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FactStrip } from '@/components/ui/fact-strip';
import { PageActions } from '@/components/ui/page-actions';
import { Pager } from '@/components/ui/pager';
import { RecordList, type RecordColumn } from '@/components/ui/record-list';
import { SearchField } from '@/components/ui/search-field';
import { Segmented } from '@/components/ui/segmented';
import { TabLabel } from '@/components/ui/tab-label';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useHomeworkList, useHomeworkSummary } from '@/hooks/query/use-homework';
import { formatMoment } from '@/lib/dates';
import { paths } from '@/paths';
import type { Homework, HomeworkScope, HomeworkState } from '@/types/homework';
import { useCapabilities } from '@/hooks/query/use-capabilities';
import { capabilityFor } from '@/lib/core/fields';

import { HomeworkComposer } from './homework-composer';
import { TYPE } from './homework-meta';

const VIEWS = ['open', 'scheduled', 'draft', 'closed'] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABEL: Readonly<Record<View, string>> = { open: 'Open', scheduled: 'Scheduled', draft: 'Drafts', closed: 'Closed' };
const IN_VIEW: Readonly<Record<View, readonly HomeworkState[]>> = { open: ['open', 'due'], scheduled: ['scheduled'], draft: ['draft'], closed: ['closed'] };
const PAGE = 25;
const percent = (value: number, total: number): number => (total === 0 ? 0 : Math.round((value / total) * 100));

const columns = (now: number): RecordColumn<Homework>[] => [
  {
    key: 'title',
    label: 'Assignment',
    width: 'minmax(0, 2.6fr)',
    cell: (h) => (
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 1.25, minWidth: 0 }}>
        <Box sx={(theme) => ({ display: 'grid', placeItems: 'center', flexShrink: 0, width: 36, height: 36, borderRadius: `${theme.band.radius.sm}px`, bgcolor: theme.tints[TYPE[h.type].tone], color: theme.onTint[TYPE[h.type].tone] })}>
          {TYPE[h.type].icon}
        </Box>
        <Stack sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap>
            {h.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {h.subject} · {h.section}
            {h.students_only !== null ? ` · ${h.students_only} chosen students` : ''}
          </Typography>
        </Stack>
      </Stack>
    ),
  },
  { key: 'teacher', label: 'Teacher', width: 'minmax(0, 1.1fr)', cell: (h) => <Typography variant="body2" noWrap>{h.teacher}</Typography> },
  {
    key: 'due',
    label: 'Due',
    width: '170px',
    cell: (h) => {
      const soon = h.state === 'open' && Date.parse(h.due_at) - now < 2 * 86_400_000;
      return (
        <Stack spacing={0.25}>
          <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatMoment(h.due_at)}
          </Typography>
          {h.state === 'due' ? <EmergeChip label="Due date passed" tone="grey" /> : soon ? <EmergeChip label="Due soon" tone="amber" /> : h.state === 'scheduled' ? <Typography variant="caption" color="text.secondary">Opens {formatMoment(h.available_from)}</Typography> : null}
        </Stack>
      );
    },
  },
  {
    key: 'progress',
    label: 'Handed in',
    width: '190px',
    hideOnNarrow: false,
    cell: (h) =>
      h.state === 'draft' || h.state === 'scheduled' ? (
        <Typography variant="body2" color="text.secondary">
          {h.assigned} students
        </Typography>
      ) : (
        <Stack spacing={0.5}>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {h.submitted} / {h.assigned}
            </Typography>
            <Typography variant="caption" color={h.submitted - h.graded > 0 ? 'primary.main' : 'text.secondary'} sx={{ fontWeight: 600 }}>
              {h.submitted - h.graded > 0 ? `${h.submitted - h.graded} to grade` : h.average !== null ? `Avg ${h.average}%` : ''}
            </Typography>
          </Stack>
          <LinearProgress variant="determinate" value={percent(h.submitted, h.assigned)} sx={{ height: 5, borderRadius: 3 }} />
          {h.missing > 0 ? (
            <Typography variant="caption" color="error.main">
              {h.missing} missing
            </Typography>
          ) : null}
        </Stack>
      ),
  },
];

// Every assignment in the school, or in the classes a teacher takes: what is open, what needs grading, and who has not handed in.
export function HomeworkBoard({ personaSlug, scope }: { personaSlug: string; scope?: HomeworkScope }): React.ReactElement {
  const { get, put } = useUrlState();
  const list = useHomeworkList();
  const capabilities = useCapabilities();
  const summary = useHomeworkSummary();
  const [search, setSearch] = React.useState('');
  const [composing, setComposing] = React.useState(false);
  const [offset, setOffset] = React.useState(0);
  const view: View = VIEWS.find((v) => v === get('view')) ?? 'open';
  const gradeId = get('class') ?? '';
  const sectionId = get('section') ?? '';
  const subject = get('subject') ?? '';
  const teacher = get('teacher') ?? '';
  const toGrade = get('grading') === '1';
  const now = list.dataUpdatedAt;

  const filter = (changes: Record<string, string | null>): void => {
    setOffset(0);
    put(changes);
  };

  const writes = !scope?.readOnly && capabilityFor(capabilities.data?.capabilities ?? [], 'core.assignments.write') !== undefined;
  const newButton = !writes ? null : (
    <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setComposing(true)}>
      New Assignment
    </Button>
  );
  const action = scope || !writes ? null : (
    <PageActions>
      <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setComposing(true)}>
        New Assignment
      </Button>
    </PageActions>
  );

  if (list.isPending) return <WidgetLoading rows={8} />;
  if (list.isError) return <WidgetError error={list.error} onRetry={() => void list.refetch()} />;

  const all = scope ? list.data.filter((h) => h.offering_id === scope.offering_id) : list.data;
  const unique = <T,>(rows: readonly T[], key: (r: T) => string): T[] => [...new Map(rows.map((r) => [key(r), r])).values()];
  const classes = unique(all, (h) => h.grade_level_id).sort((a, b) => a.class_name.localeCompare(b.class_name, 'en', { numeric: true }));
  const sections = unique(all.filter((h) => h.grade_level_id === gradeId), (h) => h.section_id).sort((a, b) => a.section.localeCompare(b.section, 'en', { numeric: true }));
  const subjects = unique(all, (h) => h.subject).sort((a, b) => a.subject.localeCompare(b.subject));
  const teachers = unique(all, (h) => h.teacher_id).sort((a, b) => a.teacher.localeCompare(b.teacher));
  const q = search.trim().toLowerCase();
  const scoped = all.filter(
    (h) =>
      (!gradeId || h.grade_level_id === gradeId) &&
      (!sectionId || h.section_id === sectionId) &&
      (!subject || h.subject === subject) &&
      (!teacher || h.teacher_id === teacher) &&
      (!toGrade || h.submitted > h.graded) &&
      (!q || h.title.toLowerCase().includes(q) || h.teacher.toLowerCase().includes(q)),
  );
  const count = (v: View): number => scoped.filter((h) => IN_VIEW[v].includes(h.state)).length;
  const rows = scoped.filter((h) => IN_VIEW[view].includes(h.state));
  const shown = view === 'closed' ? [...rows].reverse() : rows;
  const filtered = Boolean(gradeId || subject || teacher || toGrade || q);

  return (
    <Stack spacing={2}>
      {action}
      {summary.data && !scope ? (
        <FactStrip
          facts={[
            { label: 'Open', value: summary.data.open, note: `${summary.data.due_this_week} due this week · ${summary.data.past_due} past due` },
            { label: 'To grade', value: summary.data.to_grade.toLocaleString('en-IN'), note: 'Handed in, not yet marked' },
            { label: 'Missing work', value: summary.data.missing.toLocaleString('en-IN'), note: 'Past the due date, not handed in' },
            { label: 'Average score', value: summary.data.average === null ? '—' : `${summary.data.average}%`, note: 'Across all graded work' },
          ]}
        />
      ) : null}
      <Card>
        <CardHeader action={scope ? newButton : null} title={scope ? 'Assignments' : VIEW_LABEL[view] === 'Open' ? 'Open assignments' : VIEW_LABEL[view]} subheader={view === 'open' ? 'Soonest due first; those past their date stay here until closed' : view === 'closed' ? 'Most recent first' : 'Not yet visible to students'} />
        <CardToolbar
          start={
            <Segmented<View>
              ariaLabel="Which assignments"
              value={view}
              onChange={(next) => filter({ view: next === 'open' ? null : next })}
              options={VIEWS.map((v) => ({ value: v, label: <TabLabel label={VIEW_LABEL[v]} count={v === 'open' ? 0 : count(v)} /> }))}
            />
          }
          summary={`${rows.length} shown`}
        >
          <SearchField label="Search title or teacher" value={search} onChange={(next) => (setSearch(next), setOffset(0))} width={220} />
          {scope ? null : (
            <>
          <TextField select size="small" value={gradeId} onChange={(e) => filter({ class: e.target.value || null, section: null })} sx={{ minWidth: 120 }} slotProps={{ select: { displayEmpty: true } }} aria-label="Class">
            <MenuItem value="">Any class</MenuItem>
            {classes.map((c) => (
              <MenuItem key={c.grade_level_id} value={c.grade_level_id}>
                {c.class_name}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" value={sectionId} disabled={!gradeId} onChange={(e) => filter({ section: e.target.value || null })} sx={{ minWidth: 120 }} slotProps={{ select: { displayEmpty: true } }} aria-label="Section">
            <MenuItem value="">Any section</MenuItem>
            {sections.map((s) => (
              <MenuItem key={s.section_id} value={s.section_id}>
                {s.section}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" value={subject} onChange={(e) => filter({ subject: e.target.value || null })} sx={{ minWidth: 140 }} slotProps={{ select: { displayEmpty: true } }} aria-label="Subject">
            <MenuItem value="">Any subject</MenuItem>
            {subjects.map((s) => (
              <MenuItem key={s.subject} value={s.subject}>
                {s.subject}
              </MenuItem>
            ))}
          </TextField>
          {teachers.length > 1 ? (
            <TextField select size="small" value={teacher} onChange={(e) => filter({ teacher: e.target.value || null })} sx={{ minWidth: 150 }} slotProps={{ select: { displayEmpty: true } }} aria-label="Teacher">
              <MenuItem value="">Any teacher</MenuItem>
              {teachers.map((t) => (
                <MenuItem key={t.teacher_id} value={t.teacher_id}>
                  {t.teacher}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
            </>
          )}
          <Chip label="Needs grading" variant="outlined" color={toGrade ? 'primary' : 'default'} sx={toGrade ? { bgcolor: 'primary.main', color: 'primary.contrastText' } : undefined} onClick={() => filter({ grading: toGrade ? null : '1' })} aria-pressed={toGrade} />
        </CardToolbar>
        {shown.length === 0 ? (
          <EmptyState
            art={<ClipboardList size={40} aria-hidden />}
            title={filtered ? 'Nothing matches these filters' : `No ${VIEW_LABEL[view].toLowerCase()} assignments`}
            body={filtered ? 'Clear a filter to see more.' : 'A new assignment can open now, open later, or wait as a draft.'}
            action={
              filtered ? (
                <Button variant="outlined" onClick={() => (setSearch(''), filter({ class: null, section: null, subject: null, teacher: null, grading: null }))}>
                  Clear Filters
                </Button>
              ) : writes ? (
                <Button variant="outlined" startIcon={<Plus size={16} />} onClick={() => setComposing(true)}>
                  New Assignment
                </Button>
              ) : null
            }
          />
        ) : (
          <Box sx={{ p: 2 }}>
            <RecordList ariaLabel="Assignments" columns={columns(now)} rows={shown.slice(offset, offset + PAGE)} rowKey={(h) => h.id} hrefOf={(h) => paths.personaSection(personaSlug, `assignments/${h.id}`)} />
          </Box>
        )}
        {shown.length > PAGE ? (
          <CardActions>
            <Pager offset={offset} shown={Math.min(PAGE, shown.length - offset)} pageSize={PAGE} hasMore={offset + PAGE < shown.length} onChange={setOffset} />
          </CardActions>
        ) : null}
      </Card>
      {composing ? <HomeworkComposer homework={null} scope={scope} onClose={() => setComposing(false)} /> : null}
    </Stack>
  );
}
