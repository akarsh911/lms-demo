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
import useMediaQuery from '@mui/material/useMediaQuery';
import type { Theme } from '@mui/material/styles';
import { DataGrid, type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';
import { useRouter } from 'next/navigation';
import { Archive, DoorOpen, Pencil, Plus, Wrench } from 'lucide-react';

import { useUrlState } from '@/components/school/url-state';
import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { PageActions } from '@/components/ui/page-actions';
import { RowMenu } from '@/components/ui/row-menu';
import { Segmented } from '@/components/ui/segmented';
import { SearchField } from '@/components/ui/search-field';
import { useToast } from '@/components/ui/toast';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useSaveRooms } from '@/hooks/mutation/use-foundation';
import { useRoomInsights } from '@/hooks/query/use-foundation';
import { useBranches, useRooms } from '@/hooks/query/use-school';
import { AVAILABILITY, CAPACITY_BANDS, roomGroup, roomPlace, roomTypeLabel } from '@/lib/school/rooms';
import { paths } from '@/paths';
import type { RoomAvailability, RoomInsight } from '@/types/foundation';
import type { Room } from '@/types/school';

import { RoomBuildingDialog } from './room-building-dialog';
import { RoomDialog } from './room-dialog';
import { RoomUnavailableDialog } from './room-unavailable-dialog';
import { RoomsBuildings } from './rooms-buildings';
import { RoomsBulkBar } from './rooms-bulk-bar';

interface RoomRow extends Room {
  insight: RoomInsight | undefined;
}

const FILTERS = ['type', 'building', 'capacity', 'availability'] as const;
type FilterKey = (typeof FILTERS)[number];

const VIEWS = [
  { value: 'buildings', label: 'By building' },
  { value: 'list', label: 'All rooms' },
] as const;

const NO_SELECTION: GridRowSelectionModel = { type: 'include', ids: new Set() };

const availabilityOf = (row: RoomRow): RoomAvailability =>
  row.insight?.availability ?? (row.status === 'maintenance' ? 'maintenance' : row.status === 'unavailable' ? 'unavailable' : 'available');

function Count({ value, label }: { value: number; label: string }): React.ReactElement {
  return (
    <Box sx={{ px: 3, py: 2.5 }}>
      <Typography variant="figure" component="p" sx={{ fontSize: 34 }}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {label}
      </Typography>
    </Box>
  );
}

// Rooms and spaces: four counts, then the school by building and floor, or every room in one table to search and act on in bulk.
export function RoomsBoard({ personaSlug }: { personaSlug: string }): React.ReactElement {
  const router = useRouter();
  const branches = useBranches();
  const branchId = branches.data?.rows[0]?.id ?? null;
  const rooms = useRooms(branchId);
  // Who uses each room and whether it is free. The table still draws without it.
  const insights = useRoomInsights();
  const { get, put } = useUrlState();
  const narrow = useMediaQuery((theme: Theme) => theme.breakpoints.down('md'));
  const bulk = useSaveRooms();
  const notify = useToast();

  const [search, setSearch] = React.useState('');
  const [selection, setSelection] = React.useState<GridRowSelectionModel>(NO_SELECTION);
  const [editing, setEditing] = React.useState<RoomRow | 'new' | null>(null);
  const [blocking, setBlocking] = React.useState<readonly Room[] | null>(null);
  const [moving, setMoving] = React.useState<readonly Room[] | null>(null);
  const [archiving, setArchiving] = React.useState<readonly Room[] | null>(null);

  const all = React.useMemo<RoomRow[]>(
    () =>
      (rooms.data?.rows ?? [])
        .filter((room) => room.status !== 'archived')
        .map((room) => ({ ...room, insight: insights.data?.find((i) => i.room_id === room.id) })),
    [rooms.data, insights.data],
  );

  const view = get('view') === 'list' ? 'list' : 'buildings';
  const filters: Record<FilterKey, string> = {
    type: get('type') ?? '',
    building: get('building') ?? '',
    capacity: get('capacity') ?? '',
    availability: get('availability') ?? '',
  };
  const needle = search.trim().toLowerCase();
  const band = CAPACITY_BANDS.find((b) => b.key === filters.capacity);

  const shown = all.filter(
    (row) =>
      (needle === '' || `${row.name ?? ''} ${row.code ?? ''} ${row.insight?.primary_use ?? ''}`.toLowerCase().includes(needle)) &&
      (filters.type === '' || row.room_type === filters.type) &&
      (filters.building === '' || row.building === filters.building) &&
      (!band || (row.capacity !== undefined && band.test(row.capacity))) &&
      (filters.availability === '' || availabilityOf(row) === filters.availability),
  );

  const types = [...new Set(all.map((row) => row.room_type).filter((t): t is string => Boolean(t)))];
  const buildings = [...new Set(all.map((row) => row.building).filter((b): b is string => Boolean(b)))].sort();
  const active = FILTERS.filter((key) => filters[key] !== '');
  const filtering = active.length > 0 || needle !== '';
  const clearAll = (): void => {
    setSearch('');
    put({ type: null, building: null, capacity: null, availability: null });
  };

  const chipLabel = (key: FilterKey): string =>
    key === 'type'
      ? roomTypeLabel(filters.type)
      : key === 'capacity'
        ? (band?.label ?? filters.capacity)
        : key === 'availability'
          ? (AVAILABILITY[filters.availability as RoomAvailability]?.label ?? filters.availability)
          : filters.building;

  const selected = all.filter((row) => (selection.type === 'include' ? selection.ids.has(row.id) : !selection.ids.has(row.id)));
  const clearSelection = (): void => setSelection(NO_SELECTION);

  const columns: GridColDef<RoomRow>[] = [
    {
      field: 'name',
      headerName: 'Room',
      flex: 1.2,
      minWidth: 160,
      renderCell: ({ row }) => (
        <Stack sx={{ justifyContent: 'center', height: '100%', minWidth: 0 }}>
          <Typography variant="subtitle1" component="span" noWrap>
            {row.name}
          </Typography>
        </Stack>
      ),
    },
    { field: 'room_type', headerName: 'Type', width: 130, valueGetter: (_, row) => roomTypeLabel(row.room_type) },
    { field: 'capacity', headerName: 'Capacity', type: 'number', width: 110 },
    { field: 'place', headerName: 'Building / Floor', flex: 1, minWidth: 170, valueGetter: (_, row) => roomPlace(row) },
    { field: 'primary_use', headerName: 'Primary use', flex: 1, minWidth: 140, valueGetter: (_, row) => row.insight?.primary_use ?? 'Not assigned' },
    {
      field: 'availability',
      headerName: 'Availability',
      width: 150,
      valueGetter: (_, row) => AVAILABILITY[availabilityOf(row)].label,
      renderCell: ({ row }) => {
        const state = AVAILABILITY[availabilityOf(row)];
        return <EmergeChip label={state.label} tone={state.tone} dot />;
      },
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
        const blocked = row.status === 'maintenance' || row.status === 'unavailable';
        return (
          <RowMenu
            label={`More actions for ${row.name}`}
            actions={[
              { label: 'Edit room', icon: <Pencil size={16} />, onSelect: () => setEditing(row) },
              blocked
                ? {
                    label: 'Mark available',
                    icon: <DoorOpen size={16} />,
                    onSelect: () =>
                      bulk.mutate({ ids: [row.id], patch: { status: 'active', unavailable: null } }, { onSuccess: () => notify(`${row.name} is available again`) }),
                  }
                : { label: 'Mark unavailable', icon: <Wrench size={16} />, onSelect: () => setBlocking([row]) },
              { label: 'Archive', icon: <Archive size={16} />, destructive: true, onSelect: () => setArchiving([row]) },
            ]}
          />
        );
      },
    },
  ];

  const add = (
    <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setEditing('new')} disabled={!branchId}>
      Add Room
    </Button>
  );

  const pending = branches.isPending || (Boolean(branchId) && rooms.isPending);
  const failed = branches.error ?? rooms.error;

  const select = (key: FilterKey, label: string, options: readonly { value: string; label: string }[]): React.ReactElement => (
    <TextField
      select
      size="small"
      label={label}
      value={filters[key]}
      onChange={(event) => put({ [key]: event.target.value || null })}
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

  return (
    <Stack spacing={2}>
      <PageActions>{add}</PageActions>

      {pending ? <WidgetLoading rows={6} /> : null}
      {failed ? <WidgetError error={failed} onRetry={() => void rooms.refetch()} /> : null}

      {!pending && !failed && all.length === 0 ? (
        <Card>
          <EmptyState
            art={<DoorOpen size={40} aria-hidden />}
            title="No rooms added"
            body="Add classrooms, labs and shared spaces so they can be assigned later to classes and timetables."
            action={add}
          />
        </Card>
      ) : null}

      {all.length > 0 ? (
        <>
          <Card>
            <Box
              sx={(theme) => ({
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
                '& > * + *': { borderLeft: { md: `1px solid ${theme.brand.line}` } },
              })}
            >
              <Count value={all.length} label="Total rooms" />
              <Count value={all.filter((row) => roomGroup(row.room_type) === 'classroom').length} label="Classrooms" />
              <Count value={all.filter((row) => roomGroup(row.room_type) === 'lab').length} label="Labs" />
              <Count value={all.filter((row) => roomGroup(row.room_type) === 'shared').length} label="Shared spaces" />
            </Box>
          </Card>

          <Segmented ariaLabel="How to show the rooms" value={view} onChange={(next) => put({ view: next === 'list' ? 'list' : null })} options={VIEWS} />

          {view === 'buildings' ? <RoomsBuildings rooms={all} building={filters.building} onBuilding={(next) => put({ building: next })} personaSlug={personaSlug} branchId={branchId} /> : null}

          {view === 'list' ? (
            <Card>
            <CardContent>
              <Stack spacing={2}>
                <CardToolbar
                  start={<SearchField label="Search rooms" value={search} onChange={setSearch} width={260} />}
                  summary={filtering ? `${shown.length} of ${all.length} rooms` : `${all.length} rooms`}
                >
                  {select('type', 'Type', types.map((type) => ({ value: type, label: roomTypeLabel(type) })))}
                  {select('building', 'Building', buildings.map((name) => ({ value: name, label: name })))}
                  {select('capacity', 'Capacity', CAPACITY_BANDS.map((b) => ({ value: b.key, label: b.label })))}
                  {select(
                    'availability',
                    'Availability',
                    (Object.keys(AVAILABILITY) as RoomAvailability[]).map((key) => ({ value: key, label: AVAILABILITY[key].label })),
                  )}
                </CardToolbar>

                {active.length > 0 ? (
                  <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                    {active.map((key) => (
                      <Chip key={key} label={chipLabel(key)} onDelete={() => put({ [key]: null })} />
                    ))}
                    <Button size="small" onClick={clearAll}>
                      Clear all
                    </Button>
                  </Stack>
                ) : null}

                {bulk.isError ? <WidgetError error={bulk.error} /> : null}

                {shown.length === 0 ? (
                  <EmptyState
                    title="No rooms match your filters."
                    action={
                      <Button variant="outlined" onClick={clearAll}>
                        Clear filters
                      </Button>
                    }
                  />
                ) : (
                  // A column flex parent is how the grid is told to be as tall as its rows.
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <DataGrid
                      rows={shown}
                      columns={columns}
                      checkboxSelection
                      disableRowSelectionOnClick
                      rowSelectionModel={selection}
                      onRowSelectionModelChange={setSelection}
                      onRowClick={({ row }) => router.push(paths.personaSection(personaSlug, `school/rooms/${row.id}`))}
                      // The least needed columns go first on a narrow screen; room, type, capacity and status stay.
                      columnVisibilityModel={{ primary_use: !narrow, place: !narrow }}
                      initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                      pageSizeOptions={[25, 50, 100]}
                      sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
                    />
                  </Box>
                )}
              </Stack>
            </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      {selected.length > 0 ? (
        <RoomsBulkBar
          count={selected.length}
          onBuilding={() => setMoving(selected)}
          onUnavailable={() => setBlocking(selected)}
          onArchive={() => setArchiving(selected)}
          onClear={clearSelection}
        />
      ) : null}

      {editing && branchId ? (
        <RoomDialog
          branchId={branchId}
          room={editing === 'new' ? undefined : editing}
          insight={editing === 'new' ? undefined : editing.insight}
          rooms={all}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {blocking ? <RoomUnavailableDialog rooms={blocking} onClose={() => setBlocking(null)} onDone={clearSelection} /> : null}
      {moving ? <RoomBuildingDialog rooms={moving} buildings={buildings} onClose={() => setMoving(null)} onDone={clearSelection} /> : null}
      {archiving ? (
        <ConfirmDialog
          title={archiving.length === 1 ? `Archive ${archiving[0]?.name}?` : `Archive ${archiving.length} rooms?`}
          body="Archived rooms leave this list and can no longer be chosen for a class or a lesson. Their history is kept."
          confirmLabel="Archive"
          pending={bulk.isPending}
          error={bulk.error}
          onClose={() => setArchiving(null)}
          onConfirm={() =>
            bulk.mutate(
              { ids: archiving.map((room) => room.id), patch: { status: 'archived' } },
              {
                onSuccess: () => {
                  notify(archiving.length === 1 ? 'Room archived' : `${archiving.length} rooms archived`);
                  clearSelection();
                  setArchiving(null);
                },
              },
            )
          }
        />
      ) : null}
    </Stack>
  );
}
