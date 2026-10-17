'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { DataGrid, type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, ListOrdered } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { SearchField } from '@/components/ui/search-field';
import { formatDay } from '@/lib/dates';
import { paths } from '@/paths';
import type { YearEnrollment } from '@/types/foundation';
import type { StructureSection } from '@/types/structure';

import type { StructureMode } from './structure-mode';
import { useStructureRights } from './use-structure-rights';

const NONE: GridRowSelectionModel = { type: 'include', ids: new Set() };

// The section's students in roll order. Ticked students can be moved together; numbering is one button.
export function SectionStudents({
  yearId,
  label,
  section,
  pupils,
  mode,
  personaSlug,
  onRolls,
  onMove,
}: {
  yearId: string;
  label: string;
  section: StructureSection;
  pupils: readonly YearEnrollment[];
  mode: StructureMode;
  personaSlug: string;
  onRolls: () => void;
  onMove?: (students: YearEnrollment[]) => void;
}): React.ReactElement {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [selection, setSelection] = React.useState<GridRowSelectionModel>(NONE);
  const editable = useStructureRights(mode).lead(section.id);
  const groupOf = new Map(section.groups.flatMap((g) => g.student_ids.map((id) => [id, g.name] as const)));
  const q = search.trim().toLowerCase();
  const rows = pupils
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.admission_number.toLowerCase().includes(q) || (p.roll_number ?? '') === q.padStart(2, '0'))
    .sort((a, b) => Number(a.roll_number ?? 999) - Number(b.roll_number ?? 999) || a.name.localeCompare(b.name));
  const selected = pupils.filter((p) => (selection.type === 'include' ? selection.ids.has(p.id) : !selection.ids.has(p.id)));

  const columns: GridColDef<YearEnrollment>[] = [
    {
      field: 'roll_number',
      headerName: 'Roll',
      width: 76,
      valueGetter: (_, row) => Number(row.roll_number ?? 999),
      renderCell: ({ row }) => row.roll_number ?? <EmergeChip label="None" tone="amber" dot />,
    },
    { field: 'name', headerName: 'Student', flex: 1.2, minWidth: 180, renderCell: ({ row }) => <Typography variant="subtitle1" component="span" noWrap>{row.name}</Typography> },
    { field: 'admission_number', headerName: 'Admission No.', width: 130 },
    ...(section.groups.length > 0 ? [{ field: 'group', headerName: 'Stream / batch', width: 150, valueGetter: (_: unknown, row: YearEnrollment) => groupOf.get(row.student_id) ?? '—' } satisfies GridColDef<YearEnrollment>] : []),
    { field: 'joined', headerName: 'Joined', width: 120, valueGetter: (_, row) => row.joined, renderCell: ({ row }) => formatDay(row.joined) },
    {
      field: 'moves',
      headerName: 'Moves',
      flex: 1,
      minWidth: 180,
      sortable: false,
      valueGetter: (_, row) => row.moves.map((m) => `${m.from} to ${m.to}`).join(', '),
      renderCell: ({ row }) => {
        const last = row.moves[row.moves.length - 1];
        return last ? <EmergeChip label={`From ${last.from} · ${formatDay(last.date)}`} tone="blue" /> : <Box component="span" sx={{ color: 'text.secondary' }}>—</Box>;
      },
    },
  ];

  return (
    <Card>
      <CardHeader
        title={`${label} students`}
        subheader={`${pupils.length}${section.capacity !== null ? ` of ${section.capacity}` : ''} · ${section.rolls.missing > 0 ? `${section.rolls.missing} without a roll number` : 'all numbered'}`}
        action={
          editable && pupils.length > 0 ? (
            <Button variant={section.rolls.missing > 0 ? 'contained' : 'outlined'} size="small" startIcon={<ListOrdered size={14} />} onClick={onRolls}>
              Assign Roll Numbers
            </Button>
          ) : null
        }
      />
      <CardToolbar start={<SearchField label="Search by name, admission or roll number" value={search} onChange={setSearch} width={320} />} summary={`${rows.length} of ${pupils.length}`}>
        {onMove && selected.length > 0 ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {selected.length} selected
            </Typography>
            <Button size="small" variant="contained" startIcon={<ArrowRightLeft size={14} />} onClick={() => onMove?.(selected)}>
              Move to Another Section
            </Button>
          </Stack>
        ) : null}
      </CardToolbar>
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          checkboxSelection={Boolean(onMove)}
          disableRowSelectionOnClick
          rowSelectionModel={selection}
          onRowSelectionModelChange={setSelection}
          onRowClick={({ row }) => router.push(paths.personaSection(personaSlug, `school/years/${yearId}/students/${row.student_id}`))}
          initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
          pageSizeOptions={[25, 50, 100]}
          hideFooter={rows.length <= 50}
          localeText={{ noRowsLabel: 'No students in this section yet' }}
          sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </Box>
    </Card>
  );
}
