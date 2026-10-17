'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useRouter } from 'next/navigation';

import { useUrlState } from '@/components/school/url-state';
import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FactStrip } from '@/components/ui/fact-strip';
import { Avatar } from '@/components/ui/row';
import { SearchField } from '@/components/ui/search-field';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useTeacherDirectory } from '@/hooks/query/use-directory';
import { useMdmSessions } from '@/hooks/query/use-mdm';
import { paths } from '@/paths';
import type { TeacherEntry, TeacherStatus } from '@/types/directory';

const STATUS = {
  active: { label: 'Active', tone: 'green' },
  on_leave: { label: 'On leave', tone: 'amber' },
  new: { label: 'Joined this year', tone: 'blue' },
} as const satisfies Record<TeacherStatus, { label: string; tone: string }>;

const LOADS = [
  { key: 'none', label: 'No periods', test: (n: number) => n === 0 },
  { key: 'light', label: 'Light, under 20', test: (n: number) => n > 0 && n < 20 },
  { key: 'normal', label: 'Normal, 20 to 30', test: (n: number) => n >= 20 && n <= 30 },
  { key: 'heavy', label: 'Heavy, over 30', test: (n: number) => n > 30 },
] as const;

const DUTIES = [
  { key: 'class', label: 'Class teachers' },
  { key: 'subject', label: 'Subject teachers only' },
] as const;

const FILTERS = ['class', 'section', 'subject', 'duty', 'status', 'load'] as const;
type FilterKey = (typeof FILTERS)[number];

// A custom cell lays out as a block; this centres it in the row the way plain text is.
const Cell = ({ children }: { children: React.ReactNode }): React.ReactElement => <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', minWidth: 0 }}>{children}</Box>;

// "Mathematics: 6A 6B · Science: 7C", so a row says what someone teaches without a second click.
function teachesLine(row: TeacherEntry): string {
  const bySubject = new Map<string, string[]>();
  for (const t of row.teaching) bySubject.set(t.subject, [...(bySubject.get(t.subject) ?? []), `${t.class_name.replace('Class ', '')}${t.section}`]);
  return [...bySubject.entries()].map(([subject, classes]) => `${subject}: ${classes.join(' ')}`).join(' · ');
}

// Every teacher in one list, narrowed by the class they teach, the section, the subject, whether they are a class teacher, and how loaded they are.
export function TeachersDirectory({ personaSlug }: { personaSlug: string }): React.ReactElement {
  const router = useRouter();
  const sessions = useMdmSessions();
  const yearId = sessions.data?.rows.find((row) => row.is_current)?.id;
  const { data, isPending, isError, error, refetch } = useTeacherDirectory(yearId);
  const { get, put } = useUrlState();
  const [search, setSearch] = React.useState('');

  const rows = React.useMemo(() => data ?? [], [data]);
  const f: Record<FilterKey, string> = { class: get('class') ?? '', section: get('section') ?? '', subject: get('subject') ?? '', duty: get('duty') ?? '', status: get('status') ?? '', load: get('load') ?? '' };

  const classes = React.useMemo(() => {
    const seen = new Map<string, { id: string; name: string; order: number; sections: Map<string, string> }>();
    for (const row of rows)
      for (const t of row.teaching) {
        const c = seen.get(t.grade_level_id) ?? { id: t.grade_level_id, name: t.class_name, order: t.class_order, sections: new Map() };
        c.sections.set(t.section_id, t.section);
        seen.set(t.grade_level_id, c);
      }
    return [...seen.values()].sort((a, b) => a.order - b.order);
  }, [rows]);
  const subjects = React.useMemo(() => [...new Set(rows.flatMap((row) => row.subjects))].sort(), [rows]);
  const chosenClass = classes.find((c) => c.id === f.class);
  const load = LOADS.find((l) => l.key === f.load);
  const needle = search.trim().toLowerCase();

  const shown = rows.filter(
    (row) =>
      (needle === '' || `${row.name} ${row.code} ${row.employee_code} ${row.specialization ?? ''}`.toLowerCase().includes(needle)) &&
      (f.class === '' || row.teaching.some((t) => t.grade_level_id === f.class && (f.section === '' || t.section_id === f.section)) || row.class_teacher_of?.grade_level_id === f.class) &&
      (f.subject === '' || row.subjects.includes(f.subject)) &&
      (f.duty === '' || (f.duty === 'class' ? row.class_teacher_of !== null : row.class_teacher_of === null)) &&
      (f.status === '' || row.status === f.status) &&
      (!load || load.test(row.periods)),
  );

  if (isPending || sessions.isPending) return <WidgetLoading rows={8} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;

  const active = FILTERS.filter((key) => f[key] !== '');
  const label = (key: FilterKey): string =>
    key === 'class'
      ? (chosenClass?.name ?? 'Class')
      : key === 'section'
        ? `Section ${chosenClass?.sections.get(f.section) ?? ''}`
        : key === 'duty'
          ? (DUTIES.find((r) => r.key === f.duty)?.label ?? '')
          : key === 'status'
            ? STATUS[f.status as TeacherStatus]?.label ?? f.status
            : key === 'load'
              ? (load?.label ?? '')
              : f.subject;
  const clear = (): void => {
    setSearch('');
    put({ class: null, section: null, subject: null, duty: null, status: null, load: null });
  };
  const select = (key: FilterKey, text: string, options: readonly { value: string; label: string }[], disabled = false): React.ReactElement => (
    <TextField
      select
      size="small"
      label={text}
      value={f[key]}
      disabled={disabled}
      onChange={(event) => put(key === 'class' ? { class: event.target.value || null, section: null } : { [key]: event.target.value || null })}
      slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
      sx={{ minWidth: 140 }}
    >
      <MenuItem value="">Any</MenuItem>
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );

  const columns: GridColDef<TeacherEntry>[] = [
    {
      field: 'name',
      headerName: 'Teacher',
      flex: 1.2,
      minWidth: 200,
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', height: '100%', minWidth: 0 }}>
          <Avatar name={row.name} size={32} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" component="p" noWrap>
              {row.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap component="p">
              {row.code} · {row.specialization ?? 'No specialisation'}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    {
      field: 'class_teacher_of',
      headerName: 'Class teacher',
      width: 130,
      valueGetter: (_, row) => row.class_teacher_of?.label ?? '',
      renderCell: ({ row }) => <Cell>{row.class_teacher_of ? <EmergeChip label={row.class_teacher_of.label} tone="rose" /> : <Typography variant="body2" color="text.disabled">—</Typography>}</Cell>,
    },
    {
      field: 'teaches',
      headerName: 'Teaches',
      flex: 2,
      minWidth: 240,
      sortable: false,
      valueGetter: (_, row) => teachesLine(row),
      renderCell: ({ row }) => (
        <Cell>
          <Typography variant="body2" noWrap title={teachesLine(row)} sx={{ color: row.teaching.length ? 'text.primary' : 'text.disabled' }}>
            {row.teaching.length ? teachesLine(row) : 'Nothing assigned this year'}
          </Typography>
        </Cell>
      ),
    },
    { field: 'periods', headerName: 'Periods', description: 'Periods a week on the published timetable', type: 'number', width: 100 },
    {
      field: 'status',
      headerName: 'Status',
      width: 150,
      valueGetter: (_, row) => STATUS[row.status].label,
      renderCell: ({ row }) => <EmergeChip label={STATUS[row.status].label} tone={STATUS[row.status].tone} dot />,
    },
  ];

  const avg = rows.length === 0 ? 0 : Math.round(rows.reduce((t, row) => t + row.periods, 0) / rows.length);

  return (
    <Stack spacing={2}>
      <FactStrip
        facts={[
          { label: 'Teachers', value: rows.length, note: `${subjects.length} subjects taught` },
          { label: 'Class teachers', value: rows.filter((row) => row.class_teacher_of).length, note: 'One per section' },
          { label: 'On leave', value: rows.filter((row) => row.status === 'on_leave').length, note: `${rows.filter((row) => row.status === 'new').length} joined this year` },
          { label: 'Average load', value: `${avg}`, note: 'Periods a week' },
        ]}
      />
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <CardToolbar start={<SearchField label="Search by name, code or subject" value={search} onChange={setSearch} width={280} />} summary={`${shown.length} of ${rows.length} teachers`}>
              {select('class', 'Teaches class', classes.map((c) => ({ value: c.id, label: c.name })))}
              {select('section', 'Section', [...(chosenClass?.sections.entries() ?? [])].sort(([, a], [, b]) => a.localeCompare(b)).map(([id, name]) => ({ value: id, label: name })), !chosenClass)}
              {select('subject', 'Subject', subjects.map((s) => ({ value: s, label: s })))}
              {select('duty', 'Duty', DUTIES.map((r) => ({ value: r.key, label: r.label })))}
              {select('status', 'Status', (Object.keys(STATUS) as TeacherStatus[]).map((s) => ({ value: s, label: STATUS[s].label })))}
              {select('load', 'Load', LOADS.map((l) => ({ value: l.key, label: l.label })))}
            </CardToolbar>
            {active.length > 0 ? (
              <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                {active.map((key) => (
                  <Chip key={key} label={label(key)} onDelete={() => put(key === 'class' ? { class: null, section: null } : { [key]: null })} />
                ))}
                <Button size="small" onClick={clear}>
                  Clear all
                </Button>
              </Stack>
            ) : null}
            {shown.length === 0 ? (
              <EmptyState title="No teacher matches." action={<Button variant="outlined" onClick={clear}>Clear filters</Button>} />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                <DataGrid
                  rows={shown}
                  columns={columns}
                  rowHeight={60}
                  disableRowSelectionOnClick
                  onRowClick={({ row }) => router.push(paths.personaSection(personaSlug, `people/teachers/${row.id}`))}
                  initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                  pageSizeOptions={[25, 50, 100]}
                  hideFooter={shown.length <= 25}
                  sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
                />
              </Box>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
