'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, UserPlus } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { Segmented } from '@/components/ui/segmented';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useYearEnrollments } from '@/hooks/query/use-foundation';
import { STUDENT_VIEWS, VIEW_LABEL, groupByClass, inView, type StudentView } from '@/lib/school/enrollments';
import { yearLifecycle } from '@/lib/school/years';
import { paths } from '@/paths';
import type { YearEnrollment } from '@/types/foundation';
import type { AcademicSession } from '@/types/mdm';

import { EnrollmentGrid } from './enrollment-grid';
import { EnrollmentOutline, type OutlinePick } from './enrollment-outline';
import { LeaverDocumentsDialog } from './leaver-documents-dialog';
import { PlaceStudentDialog } from './place-student-dialog';
import { useYearReadOnly } from './year-mode';

const LAYOUTS = [
  { value: 'list', label: 'List' },
  { value: 'classes', label: 'By class' },
] as const;

type Layout = (typeof LAYOUTS)[number]['value'];

// The students belonging to this year. Not the permanent directory of people: these are enrolments, one per pupil per year.
export function YearStudents({
  year,
  personaSlug,
  view,
  onView,
}: {
  year: AcademicSession;
  personaSlug: string;
  view: StudentView;
  onView: (next: StudentView) => void;
}): React.ReactElement {
  const router = useRouter();
  const { data, isPending, isError, error, refetch } = useYearEnrollments(year.id);
  const readOnly = useYearReadOnly();
  const [search, setSearch] = React.useState('');
  const [gradeId, setGradeId] = React.useState('');
  const [section, setSection] = React.useState('');
  const [layout, setLayout] = React.useState<Layout>('classes');
  const [pick, setPick] = React.useState<OutlinePick | null>(null);
  const [placing, setPlacing] = React.useState<YearEnrollment | null>(null);
  const [documents, setDocuments] = React.useState<YearEnrollment | null>(null);

  const rows = React.useMemo(() => data ?? [], [data]);
  const classes = React.useMemo(
    () => [...new Map(rows.map((row) => [row.grade_level_id, row])).values()].sort((a, b) => a.class_order - b.class_order),
    [rows],
  );
  const sections = React.useMemo(
    () => [...new Set(rows.filter((row) => row.grade_level_id === gradeId && row.section_name).map((row) => row.section_name ?? ''))].sort(),
    [rows, gradeId],
  );

  const needle = search.trim().toLowerCase();
  // Search and the class filters narrow first; the status counts are then of what is left, so they always add up.
  const scoped = React.useMemo(
    () =>
      rows.filter(
        (row) =>
          (needle === '' || row.name.toLowerCase().includes(needle) || row.admission_number.toLowerCase().includes(needle)) &&
          (gradeId === '' || row.grade_level_id === gradeId) &&
          (section === '' || row.section_name === section),
      ),
    [rows, needle, gradeId, section],
  );
  const shown = React.useMemo(() => scoped.filter((row) => inView(row, view)), [scoped, view]);
  const groups = React.useMemo(() => groupByClass(shown), [shown]);
  // The outline keeps its own choice; the first class stands in until one is made or the chosen one filters away.
  const current = (pick && groups.find((group) => group.grade_level_id === pick.grade_level_id) ? pick : null) ?? (groups[0] ? { grade_level_id: groups[0].grade_level_id, section: null } : null);
  const picked = groups.find((group) => group.grade_level_id === current?.grade_level_id);
  const pickedSection = picked?.sections.find((section) => section.key === current?.section);
  const inPick = pickedSection?.rows ?? picked?.rows ?? [];

  if (isPending) return <WidgetLoading rows={8} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;

  const life = yearLifecycle(year);
  const workspace = `school/years/${year.id}/classes`;
  // A student opens inside the year, with this year's enrolment and marks; the permanent record stays under People.
  const open = (row: YearEnrollment): void => router.push(paths.personaSection(personaSlug, `school/years/${year.id}/students/${row.student_id}`));
  const place = readOnly ? undefined : setPlacing;
  const issue = readOnly ? undefined : setDocuments;
  const filtering = needle !== '' || gradeId !== '' || section !== '' || view !== 'all';
  const clear = (): void => {
    setSearch('');
    setGradeId('');
    setSection('');
    onView('all');
  };

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No students in this year yet"
          body={life === 'draft' ? 'Students arrive here when they are promoted into this year or admitted to it. Both happen in setup.' : 'Nobody is enrolled in this year.'}
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Students"
        subheader={`Enrolled in ${year.name}. A pupil's permanent record is under People.`}
        action={
          readOnly || life !== 'active' ? undefined : (
            <Button component={NextLink} href={paths.personaSection(personaSlug, 'people/students')} variant="outlined" size="small" startIcon={<UserPlus size={16} />}>
              Add New Admission
            </Button>
          )
        }
      />
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }} role="group" aria-label="Show students by enrollment status">
            {STUDENT_VIEWS.map((option) => {
              const count = scoped.filter((row) => inView(row, option)).length;
              // A status nobody in this year has is not offered, except the one being looked at.
              if (count === 0 && option !== 'all' && option !== view) return null;
              return (
                <Chip
                  key={option}
                  label={`${VIEW_LABEL[option]} ${count.toLocaleString('en-IN')}`}
                  onClick={() => onView(option)}
                  color={option === view ? 'primary' : 'default'}
                  variant={option === view ? 'filled' : 'outlined'}
                  aria-pressed={option === view}
                />
              );
            })}
          </Stack>

          <CardToolbar
            start={<SearchField label="Search students" value={search} onChange={setSearch} width={260} />}
            summary={filtering ? `${shown.length.toLocaleString('en-IN')} of ${rows.length.toLocaleString('en-IN')} students` : `${rows.length.toLocaleString('en-IN')} students`}
          >
            <TextField
              select
              size="small"
              label="Class"
              value={gradeId}
              onChange={(event) => {
                setGradeId(event.target.value);
                setSection('');
              }}
              sx={{ minWidth: 130 }}
            >
              <MenuItem value="">Any</MenuItem>
              {classes.map((row) => (
                <MenuItem key={row.grade_level_id} value={row.grade_level_id}>
                  {row.class_name}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Section" value={section} onChange={(event) => setSection(event.target.value)} disabled={gradeId === ''} sx={{ minWidth: 120 }}>
              <MenuItem value="">Any</MenuItem>
              {sections.map((name) => (
                <MenuItem key={name} value={name}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
            <Segmented ariaLabel="How to lay the students out" value={layout} onChange={setLayout} options={LAYOUTS} />
          </CardToolbar>

          {shown.length === 0 ? (
            <EmptyState
              title="No students match your filters."
              action={
                <Button variant="outlined" onClick={clear}>
                  Clear filters
                </Button>
              }
            />
          ) : layout === 'list' ? (
            <EnrollmentGrid rows={shown} onOpen={open} onPlace={place} onDocuments={issue} />
          ) : (
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '240px minmax(0, 1fr)' }, alignItems: 'start' }}>
              {current ? <EnrollmentOutline groups={groups} pick={current} onPick={setPick} /> : null}
              <Stack spacing={1.5} sx={{ minWidth: 0 }}>
                <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 2, px: 0.5 }}>
                  <Typography variant="h4" component="h3">
                    {picked?.class_name}
                    {pickedSection ? ` · ${pickedSection.name}` : ''}
                  </Typography>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      {inPick.length.toLocaleString('en-IN')} students
                    </Typography>
                    {picked ? (
                      <Button component={NextLink} href={paths.personaSection(personaSlug, `${workspace}/${picked.grade_level_id}${pickedSection ? (pickedSection.key === 'unassigned' ? '/arrange' : `/${pickedSection.rows[0]?.section_id ?? ''}`) : '?tab=students'}`)} size="small" variant="outlined" endIcon={<ArrowRight size={14} />}>
                        {pickedSection ? (pickedSection.key === 'unassigned' ? 'Place Them' : `Open ${picked.class_name.replace(/^Class\s+/, '')}${pickedSection.key}`) : `View all ${picked.class_name} students`}
                      </Button>
                    ) : null}
                  </Stack>
                </Stack>
                <EnrollmentGrid rows={inPick} hide={pickedSection ? ['class_name', 'section_name'] : ['class_name']} onOpen={open} onPlace={place} onDocuments={issue} />
              </Stack>
            </Box>
          )}
        </Stack>
      </CardContent>

      {placing ? <PlaceStudentDialog student={placing} rows={rows} onClose={() => setPlacing(null)} /> : null}
      {documents ? <LeaverDocumentsDialog student={documents} onClose={() => setDocuments(null)} /> : null}
    </Card>
  );
}
