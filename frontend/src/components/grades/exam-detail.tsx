'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Checkbox from '@mui/material/Checkbox';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { useUrlState } from '@/components/school/url-state';
import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { ClassOutline, type OutlineChoice } from '@/components/ui/class-outline';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { Segmented } from '@/components/ui/segmented';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useExam } from '@/hooks/query/use-grades';
import { dayRange } from '@/lib/dates';
import { paths } from '@/paths';
import type { ExamMarkCell, ExamStudentRow } from '@/types/grades';

import { AnalyticsPanel } from './analytics-panel';
import { MARK_STATE, pct1, pctTone } from './mark-states';
import { DateSheet } from './date-sheet';
import { MarkDetailDialog } from './mark-detail-dialog';

const LAYOUTS = [
  { value: 'all', label: 'All students' },
  { value: 'classes', label: 'By class' },
] as const;

type Layout = (typeof LAYOUTS)[number]['value'];

function MarkButton({ cell, onOpen }: { cell: ExamMarkCell; onOpen: (markId: string) => void }): React.ReactElement {
  if (cell.max === 0) {
    return (
      <Typography component="span" variant="body2" color="text.disabled">
        —
      </Typography>
    );
  }
  if (cell.mark_id === null) {
    return (
      <Typography component="span" variant="body2" color="text.secondary">
        {MARK_STATE[cell.status].label}
      </Typography>
    );
  }
  const low = cell.marks !== null && cell.marks < cell.max * 0.33;
  return (
    <Button
      size="small"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(cell.mark_id ?? '');
      }}
      sx={{ minWidth: 0, px: 0.75, fontVariantNumeric: 'tabular-nums', color: low ? 'error.main' : undefined }}
    >
      {cell.marks === null ? MARK_STATE[cell.status].label : cell.marks}
    </Button>
  );
}

// One examination: when each paper was sat, the papers themselves, and every pupil's marks with the analytics of whatever is selected.
export function ExamDetail({ examId, personaSlug }: { examId: string; personaSlug: string }): React.ReactElement {
  const router = useRouter();
  const { get, put } = useUrlState();
  const gradeId = get('class') ?? '';
  const sectionId = get('section') ?? '';
  const subjectList = (get('subjects') ?? '').split(',').filter(Boolean);
  const from = get('from');
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useExam(examId, { grade_level_id: gradeId || undefined, section_id: sectionId || undefined, subjects: subjectList.length > 0 ? subjectList : undefined });
  const [layout, setLayout] = React.useState<Layout>('classes');
  const [search, setSearch] = React.useState('');
  const [mark, setMark] = React.useState<string | null>(null);

  if (isPending) return <WidgetLoading rows={8} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;

  const { exam, schedule, classes, sections, subjects, columns, rows, analytics } = data;
  const needle = search.trim().toLowerCase();
  const shown = needle === '' ? rows : rows.filter((row) => row.name.toLowerCase().includes(needle) || row.admission_number.toLowerCase().includes(needle));
  const choose = (next: OutlineChoice): void => put({ class: next.group, section: next.section });
  const openStudent = (studentId: string): void => router.push(paths.personaSection(personaSlug, `grades/students/${studentId}?session=${exam.session_id}&exam=${exam.id}`));
  const subject = subjectList.length === 1 ? (subjectList[0] ?? '') : '';
  const back = from === 'year' ? { href: paths.personaSection(personaSlug, `school/years/${exam.session_id}?tab=examinations`), label: `Examinations of ${exam.session_name}` } : { href: paths.personaSection(personaSlug, 'grades'), label: 'Examinations' };
  const groups = classes.map((cls) => ({
    id: cls.id,
    name: cls.name,
    count: cls.count,
    sections: sections.filter((section) => section.grade_level_id === cls.id).map((section) => ({ id: section.id, name: `Section ${section.name}`, count: section.count })),
  }));
  const scope = [gradeId ? classes.find((c) => c.id === gradeId)?.name : 'All classes', sectionId ? `Section ${sections.find((s) => s.id === sectionId)?.name ?? ''}` : null, subjectList.length === 0 ? 'All subjects' : subjectList.length === 1 ? subjectList[0] : `${subjectList.length} subjects`].filter(Boolean).join(' · ');

  const gridColumns: GridColDef<ExamStudentRow>[] = [
    { field: 'rank', headerName: 'Rank', width: 88, valueGetter: (_, row) => row.rank ?? Number.MAX_SAFE_INTEGER, renderCell: ({ row }) => row.rank ?? '—' },
    { field: 'roll_number', headerName: 'Roll', width: 68, valueGetter: (_, row) => row.roll_number ?? '' },
    {
      field: 'name',
      headerName: 'Student',
      flex: 1.2,
      minWidth: 170,
      renderCell: ({ row }) => (
        <Stack sx={{ justifyContent: 'center', height: '100%', minWidth: 0 }}>
          <Typography variant="subtitle2" component="span" noWrap>
            {row.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {row.admission_number}
          </Typography>
        </Stack>
      ),
    },
    ...(gradeId ? [] : [{ field: 'class_name', headerName: 'Class', width: 90 } satisfies GridColDef<ExamStudentRow>]),
    ...(sectionId ? [] : [{ field: 'section_name', headerName: 'Sec', width: 60, valueGetter: (_: unknown, row: ExamStudentRow) => row.section_name ?? '' } satisfies GridColDef<ExamStudentRow>]),
    ...columns.map(
      (column, index) =>
        ({
          field: `s${index}`,
          headerName: column.name,
          width: Math.max(84, Math.min(140, column.name.length * 8 + 24)),
          align: 'right',
          headerAlign: 'right',
          sortable: true,
          valueGetter: (_: unknown, row: ExamStudentRow) => row.cells[index]?.marks ?? -1,
          renderCell: ({ row }: { row: ExamStudentRow }) => <MarkButton cell={row.cells[index] ?? { mark_id: null, marks: null, max: 0, status: 'pending' }} onOpen={setMark} />,
        }) satisfies GridColDef<ExamStudentRow>,
    ),
    { field: 'total', headerName: 'Total', width: 90, align: 'right', headerAlign: 'right', valueGetter: (_, row) => row.total ?? -1, renderCell: ({ row }) => (row.total === null ? '—' : `${row.total} / ${row.max}`) },
    {
      field: 'pct',
      headerName: '%',
      width: 84,
      align: 'right',
      headerAlign: 'right',
      valueGetter: (_, row) => row.pct ?? -1,
      renderCell: ({ row }) => (row.pct === null ? '—' : <EmergeChip label={pct1(row.pct)} tone={pctTone(row.pct)} />),
    },
  ];

  const table = (
    <Box sx={{ display: 'flex', flexDirection: 'column', opacity: isPlaceholderData ? 0.55 : 1, transition: 'opacity 160ms' }}>
      <DataGrid
        rows={shown}
        getRowId={(row) => row.student_id}
        columns={gridColumns}
        disableRowSelectionOnClick
        onRowClick={({ row }) => openStudent(row.student_id)}
        sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } }, sorting: { sortModel: [{ field: 'rank', sort: 'asc' }] } }}
        pageSizeOptions={[25, 50, 100]}
        hideFooter={shown.length <= 25}
      />
    </Box>
  );

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
        <div>
          <Button component={NextLink} href={back.href} size="small" startIcon={<ArrowLeft size={14} />} sx={{ ml: -1, mb: 0.5 }}>
            {back.label}
          </Button>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography variant="h2" component="h1">
              {exam.name}
            </Typography>
            {exam.published ? <EmergeChip label="Results out" tone="green" dot /> : <EmergeChip label="Scheduled" tone="amber" dot />}
          </Stack>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
            {exam.session_name} · {dayRange(exam.start, exam.end)} · {exam.subjects} subjects · {exam.class_names}
          </Typography>
        </div>
      </Stack>

      <DateSheet detail={data} gradeId={gradeId} />

      {rows.length === 0 && !needle ? (
        <Card>
          <EmptyState title="No marks recorded yet" body="The analytics and the marks appear here once papers are checked and results published." />
        </Card>
      ) : (
        <>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <CardToolbar start={<SearchField label="Search students" value={search} onChange={setSearch} width={240} />} summary={`${shown.length.toLocaleString('en-IN')} students · ${scope}`}>
                  <TextField select size="small" label="Class" value={gradeId} onChange={(event) => put({ class: event.target.value || null, section: null })} sx={{ minWidth: 130 }}>
                    <MenuItem value="">All classes</MenuItem>
                    {classes.map((cls) => (
                      <MenuItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField select size="small" label="Section" value={sectionId} onChange={(event) => put({ section: event.target.value || null })} disabled={!gradeId} sx={{ minWidth: 110 }}>
                    <MenuItem value="">All</MenuItem>
                    {sections
                      .filter((section) => section.grade_level_id === gradeId)
                      .map((section) => (
                        <MenuItem key={section.id} value={section.id}>
                          {section.name}
                        </MenuItem>
                      ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="Subjects"
                    value={subjectList}
                    onChange={(event) => {
                      const value = event.target.value;
                      const next = (Array.isArray(value) ? value : String(value).split(',')).filter(Boolean);
                      put({ subjects: next.length === 0 || next.length === subjects.length ? null : next.join(',') });
                    }}
                    slotProps={{
                      inputLabel: { shrink: true },
                      select: { multiple: true, displayEmpty: true, renderValue: (selected) => { const list = selected as string[]; return list.length === 0 ? 'All subjects' : list.length === 1 ? (list[0] ?? '') : `${list.length} subjects`; } },
                    }}
                    sx={{ minWidth: 170 }}
                  >
                    {subjects.map((name) => (
                      <MenuItem key={name} value={name} dense>
                        <Checkbox size="small" checked={subjectList.includes(name)} sx={{ p: 0.5, mr: 1 }} />
                        <ListItemText primary={name} />
                      </MenuItem>
                    ))}
                  </TextField>
                  <Segmented ariaLabel="How to lay the students out" value={layout} onChange={setLayout} options={LAYOUTS} />
                </CardToolbar>
              </Stack>
            </CardContent>
          </Card>

          <Box sx={{ opacity: isPlaceholderData ? 0.55 : 1, transition: 'opacity 160ms' }}>
            <AnalyticsPanel analytics={analytics} subjectChosen={subject !== ''} classChosen={gradeId !== ''} onOpenStudent={openStudent} />
          </Box>

          <Card>
            <CardHeader title="Students" subheader={subjectList.length > 0 ? `${scope} · total and rank over the chosen subjects` : 'Every subject, with the total and the rank within the selection'} />
            <CardContent>
              {layout === 'classes' ? (
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '230px minmax(0, 1fr)' }, alignItems: 'start' }}>
                  <ClassOutline groups={groups} choice={{ group: gradeId || null, section: sectionId || null }} onChoose={choose} total={exam.appeared} />
                  <Box sx={{ minWidth: 0 }}>{shown.length === 0 ? <EmptyState title="No students match." /> : table}</Box>
                </Box>
              ) : shown.length === 0 ? (
                <EmptyState title="No students match." />
              ) : (
                table
              )}
            </CardContent>
          </Card>
        </>
      )}

      {mark ? <MarkDetailDialog markId={mark} onClose={() => setMark(null)} /> : null}
    </Stack>
  );
}
