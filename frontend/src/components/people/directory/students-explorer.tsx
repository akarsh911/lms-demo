'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';

import { EnrollmentGrid } from '@/components/school/years/enrollment-grid';
import { useUrlState } from '@/components/school/url-state';
import { CardToolbar } from '@/components/ui/card-toolbar';
import { ClassOutline, type OutlineChoice } from '@/components/ui/class-outline';
import { EmptyState } from '@/components/ui/empty-state';
import { FactStrip } from '@/components/ui/fact-strip';
import { SearchField } from '@/components/ui/search-field';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useYearEnrollments } from '@/hooks/query/use-foundation';
import { useMdmSessions } from '@/hooks/query/use-mdm';
import { STUDENT_VIEWS, VIEW_LABEL, groupByClass, inView, type StudentView } from '@/lib/school/enrollments';
import { paths } from '@/paths';

// Every pupil of the year, found the way the year and the grade explorer find them: a class, then a section, then the list.
export function StudentsExplorer({ personaSlug, base = 'people/students' }: { personaSlug: string; base?: string }): React.ReactElement {
  const router = useRouter();
  const sessions = useMdmSessions();
  const { get, put } = useUrlState();
  const years = [...(sessions.data?.rows ?? [])].filter((row) => row.status !== 'upcoming').sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''));
  const yearId = get('year') ?? years.find((row) => row.is_current)?.id ?? '';
  const { data, isPending, isError, error, refetch } = useYearEnrollments(yearId);
  const [search, setSearch] = React.useState('');
  const view = STUDENT_VIEWS.find((v) => v === get('view')) ?? 'all';
  const choice: OutlineChoice = { group: get('class'), section: get('section') };

  const rows = React.useMemo(() => data ?? [], [data]);
  const needle = search.trim().toLowerCase();
  const searched = React.useMemo(() => rows.filter((row) => needle === '' || row.name.toLowerCase().includes(needle) || row.admission_number.toLowerCase().includes(needle)), [rows, needle]);
  const inViewRows = React.useMemo(() => searched.filter((row) => inView(row, view)), [searched, view]);
  const groups = React.useMemo(() => groupByClass(inViewRows), [inViewRows]);

  if (sessions.isPending || (yearId && isPending)) return <WidgetLoading rows={8} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;

  const picked = groups.find((g) => g.grade_level_id === choice.group);
  const pickedSection = picked?.sections.find((s) => s.key === choice.section);
  const shown = pickedSection?.rows ?? picked?.rows ?? inViewRows;
  const active = rows.filter((row) => row.status !== 'withdrawn');
  const outline = groups.map((g) => ({ id: g.grade_level_id, name: g.class_name, count: g.rows.length, sections: g.sections.map((s) => ({ id: s.key, name: s.name, count: s.rows.length })) }));
  const open = (studentId: string): void => router.push(paths.personaSection(personaSlug, `${base}/${studentId}`));

  return (
    <Stack spacing={2}>
      <FactStrip
        facts={[
          { label: 'Students', value: active.length.toLocaleString('en-IN'), note: `${groups.length} classes` },
          { label: 'New admissions', value: rows.filter((row) => row.status === 'new_admission').length, note: 'This year' },
          { label: 'Without a section', value: rows.filter((row) => row.status !== 'withdrawn' && !row.section_id).length, note: 'Need placing' },
          { label: 'Withdrawn', value: rows.filter((row) => row.status === 'withdrawn').length, note: 'Records kept' },
        ]}
      />
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <CardToolbar start={<SearchField label="Search by name or admission number" value={search} onChange={setSearch} width={300} />} summary={`${shown.length.toLocaleString('en-IN')} students`}>
              <TextField select size="small" label="Academic year" value={yearId} onChange={(event) => put({ year: event.target.value, class: null, section: null })} sx={{ minWidth: 170 }}>
                {years.map((row) => (
                  <MenuItem key={row.id} value={row.id}>
                    {row.name}
                    {row.is_current ? ' · current' : ''}
                  </MenuItem>
                ))}
              </TextField>
            </CardToolbar>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }} role="group" aria-label="Show students by status">
              {STUDENT_VIEWS.map((option: StudentView) => {
                const count = searched.filter((row) => inView(row, option)).length;
                if (count === 0 && option !== 'all' && option !== view) return null;
                return (
                  <Chip
                    key={option}
                    label={`${VIEW_LABEL[option]} ${count.toLocaleString('en-IN')}`}
                    onClick={() => put({ view: option === 'all' ? null : option })}
                    color={option === view ? 'primary' : 'default'}
                    variant={option === view ? 'filled' : 'outlined'}
                    aria-pressed={option === view}
                  />
                );
              })}
            </Stack>
            {rows.length === 0 ? (
              <EmptyState title="Nobody is enrolled in this year." />
            ) : (
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '240px minmax(0, 1fr)' }, alignItems: 'start' }}>
                <ClassOutline groups={outline} choice={choice} onChoose={(next) => put({ class: next.group, section: next.section })} total={inViewRows.length} />
                <Stack spacing={1.5} sx={{ minWidth: 0 }}>
                  <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 2, px: 0.5 }}>
                    <Typography variant="h4" component="h3">
                      {picked ? `${picked.class_name}${pickedSection ? ` · ${pickedSection.name}` : ''}` : 'All classes'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {shown.length.toLocaleString('en-IN')} students
                    </Typography>
                  </Stack>
                  {shown.length === 0 ? (
                    <EmptyState title="No students match." />
                  ) : (
                    <EnrollmentGrid rows={shown} hide={pickedSection ? ['class_name', 'section_name'] : picked ? ['class_name'] : []} onOpen={(row) => open(row.student_id)} />
                  )}
                </Stack>
              </Box>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
