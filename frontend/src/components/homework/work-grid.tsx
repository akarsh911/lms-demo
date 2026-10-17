'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { CircleSlash, PenLine } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { RowMenu } from '@/components/ui/row-menu';
import { SearchField } from '@/components/ui/search-field';
import { Segmented } from '@/components/ui/segmented';
import { TabLabel } from '@/components/ui/tab-label';
import { useToast } from '@/components/ui/toast';
import { useExcuseWork } from '@/hooks/mutation/use-homework';
import { formatMoment } from '@/lib/dates';
import type { HomeworkDetail, StudentWork, WorkStatus } from '@/types/homework';

import { GradeDialog } from './grade-dialog';
import { WORK } from './homework-meta';

const VIEWS = ['all', 'to_grade', 'missing', 'graded'] as const;
type View = (typeof VIEWS)[number];
const LABEL: Readonly<Record<View, string>> = { all: 'Everyone', to_grade: 'To grade', missing: 'Not handed in', graded: 'Graded' };
const IN: Readonly<Record<View, readonly WorkStatus[] | null>> = { all: null, to_grade: ['submitted', 'late'], missing: ['missing', 'pending'], graded: ['graded', 'returned'] };

// Every student the assignment is for, what they handed in and how it was marked. A row opens the marking dialog.
export function WorkGrid({ homework, editable }: { homework: HomeworkDetail; editable: boolean }): React.ReactElement {
  const notify = useToast();
  const excuse = useExcuseWork(homework.id);
  const [view, setView] = React.useState<View>(homework.submitted > homework.graded ? 'to_grade' : 'all');
  const [search, setSearch] = React.useState('');
  const [grading, setGrading] = React.useState<{ queue: StudentWork[]; start: number } | null>(null);
  const q = search.trim().toLowerCase();
  const count = (v: View): number => homework.work.filter((w) => IN[v]?.includes(w.status) ?? true).length;
  const rows = homework.work.filter((w) => (IN[view]?.includes(w.status) ?? true) && (!q || w.name.toLowerCase().includes(q) || w.roll === q.padStart(2, '0')));

  const columns: GridColDef<StudentWork>[] = [
    { field: 'roll', headerName: 'Roll', width: 70, valueGetter: (_, w) => Number(w.roll ?? 999), renderCell: ({ row }) => row.roll ?? '—' },
    { field: 'name', headerName: 'Student', flex: 1.2, minWidth: 170, renderCell: ({ row }) => <Typography variant="subtitle2" component="span" noWrap>{row.name}</Typography> },
    { field: 'status', headerName: 'Status', width: 150, valueGetter: (_, w) => WORK[w.status].label, renderCell: ({ row }) => <EmergeChip label={WORK[row.status].label} tone={WORK[row.status].tone} /> },
    { field: 'submitted_at', headerName: 'Handed in', width: 160, valueGetter: (_, w) => w.submitted_at ?? '', renderCell: ({ row }) => (row.submitted_at ? formatMoment(row.submitted_at) : '—') },
    {
      field: 'marks',
      headerName: 'Marks',
      width: 100,
      align: 'right',
      headerAlign: 'right',
      valueGetter: (_, w) => w.marks ?? -1,
      renderCell: ({ row }) => (row.marks === null ? '—' : <Typography variant="subtitle2" component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>{`${row.marks} / ${homework.max_marks}`}</Typography>),
    },
    { field: 'feedback', headerName: 'Feedback', flex: 1.4, minWidth: 180, sortable: false, valueGetter: (_, w) => w.feedback ?? '', renderCell: ({ row }) => <Typography variant="body2" color="text.secondary" noWrap>{row.feedback ?? ''}</Typography> },
    ...(editable
      ? [
          {
            field: 'actions',
            headerName: '',
            width: 60,
            sortable: false,
            filterable: false,
            disableColumnMenu: true,
            renderCell: ({ row }) => (
              <RowMenu
                label={`More for ${row.name}`}
                actions={[
                  { label: 'Mark this work', icon: <PenLine size={16} />, onSelect: () => setGrading({ queue: rows, start: rows.indexOf(row) }) },
                  {
                    label: row.status === 'excused' ? 'Stop excusing' : 'Excuse from this assignment',
                    icon: <CircleSlash size={16} />,
                    onSelect: () => excuse.mutate({ studentId: row.student_id, excused: row.status !== 'excused' }, { onSuccess: () => notify(row.status === 'excused' ? `${row.name} has the assignment again` : `${row.name} is excused`) }),
                  },
                ]}
              />
            ),
          } satisfies GridColDef<StudentWork>,
        ]
      : []),
  ];

  return (
    <Card>
      <CardHeader title="Submissions" subheader={`${homework.submitted} of ${homework.assigned} handed in · ${homework.graded} graded`} />
      <CardToolbar
        start={<Segmented<View> ariaLabel="Which students" value={view} onChange={setView} options={VIEWS.map((v) => ({ value: v, label: <TabLabel label={LABEL[v]} count={v === 'all' ? 0 : count(v)} /> }))} />}
        summary={`${rows.length} shown`}
      >
        <SearchField label="Name or roll number" value={search} onChange={setSearch} width={220} />
      </CardToolbar>
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(w) => w.enrollment_id}
          disableRowSelectionOnClick
          onRowClick={({ row }) => editable && setGrading({ queue: rows, start: rows.indexOf(row) })}
          initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
          pageSizeOptions={[25, 50, 100]}
          hideFooter={rows.length <= 50}
          localeText={{ noRowsLabel: view === 'to_grade' ? 'Nothing waiting to be graded' : 'Nobody here' }}
          sx={{ '& .MuiDataGrid-row': { cursor: editable ? 'pointer' : 'default' } }}
        />
      </Box>
      {grading ? <GradeDialog homework={homework} queue={grading.queue} start={grading.start} onClose={() => setGrading(null)} /> : null}
    </Card>
  );
}
