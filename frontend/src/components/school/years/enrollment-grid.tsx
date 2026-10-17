'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { FileCheck2, UserRound, UserRoundCheck } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { RowMenu, type RowAction } from '@/components/ui/row-menu';
import { formatDay } from '@/lib/dates';
import { STATUS_LABEL, STATUS_TONE, isUnassigned } from '@/lib/school/enrollments';
import type { YearEnrollment } from '@/types/foundation';

const QUIET = { color: 'text.secondary' } as const;

// The year's students as a table. Used flat, or inside one class or one section, where the columns that would repeat are dropped.
export function EnrollmentGrid({
  rows,
  hide = [],
  pageSize = 25,
  onOpen,
  onPlace,
  onDocuments,
}: {
  rows: readonly YearEnrollment[];
  hide?: readonly ('class_name' | 'section_name')[];
  pageSize?: number;
  onOpen: (row: YearEnrollment) => void;
  // Both absent in a closed year, where nobody is moved and nothing is issued.
  onPlace?: (row: YearEnrollment) => void;
  onDocuments?: (row: YearEnrollment) => void;
}): React.ReactElement {
  const columns: GridColDef<YearEnrollment>[] = [
    {
      field: 'name',
      headerName: 'Student',
      flex: 1.3,
      minWidth: 180,
      renderCell: ({ row }) => (
        <Stack sx={{ justifyContent: 'center', height: '100%' }}>
          <Typography variant="subtitle1" component="span" noWrap>
            {row.name}
          </Typography>
        </Stack>
      ),
    },
    { field: 'admission_number', headerName: 'Admission No.', width: 118 },
    { field: 'class_name', headerName: 'Class', width: 100 },
    {
      field: 'section_name',
      headerName: 'Section',
      width: 110,
      valueGetter: (_, row) => row.section_name ?? 'Unassigned',
      renderCell: ({ row }) => (row.section_name ? row.section_name : <Box component="span" sx={QUIET}>Unassigned</Box>),
    },
    {
      field: 'roll_number',
      headerName: 'Roll',
      width: 72,
      valueGetter: (_, row) => row.roll_number ?? '',
      renderCell: ({ row }) => row.roll_number ?? <Box component="span" sx={QUIET}>None</Box>,
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 140,
      valueGetter: (_, row) => STATUS_LABEL[row.status],
      renderCell: ({ row }) => <EmergeChip label={STATUS_LABEL[row.status]} tone={STATUS_TONE[row.status]} />,
    },
    {
      field: 'joined',
      headerName: 'Joined / Left',
      width: 128,
      valueGetter: (_, row) => row.left ?? row.joined,
      renderCell: ({ row }) => (row.left ? `Left ${formatDay(row.left)}` : formatDay(row.joined)),
    },
    {
      field: 'pending',
      headerName: 'Pending',
      flex: 1,
      minWidth: 140,
      sortable: false,
      valueGetter: (_, row) => row.pending.join(', '),
      renderCell: ({ row }) =>
        row.pending.length === 0 ? (
          <Box component="span" sx={QUIET}>None</Box>
        ) : (
          <Typography variant="body2" component="span" sx={{ color: 'warning.dark', fontWeight: 600 }} noWrap>
            {row.pending.join(' · ')}
          </Typography>
        ),
    },
    {
      field: 'actions',
      headerName: '',
      width: 64,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      align: 'right',
      renderCell: ({ row }) => {
        const actions: RowAction[] = [{ label: 'Open student record', icon: <UserRound size={16} />, onSelect: () => onOpen(row) }];
        if (onPlace && isUnassigned(row)) actions.push({ label: 'Place in a section', icon: <UserRoundCheck size={16} />, onSelect: () => onPlace(row) });
        if (onDocuments && row.status === 'withdrawn') actions.push({ label: 'Leaving documents', icon: <FileCheck2 size={16} />, onSelect: () => onDocuments(row) });
        return <RowMenu label={`More actions for ${row.name}`} actions={actions} />;
      },
    },
  ];

  return (
    // A column flex parent is how the grid is told to be as tall as its rows.
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      <DataGrid
        rows={rows}
        columns={columns.filter((column) => !hide.some((field) => field === column.field))}
        disableRowSelectionOnClick
        onRowClick={({ row }) => onOpen(row)}
        sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        initialState={{ pagination: { paginationModel: { pageSize } } }}
        pageSizeOptions={[25, 50, 100]}
        hideFooter={rows.length <= pageSize}
      />
    </Box>
  );
}
