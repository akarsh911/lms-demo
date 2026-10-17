'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { ArrowLeft, Building2, ChevronRight, DoorOpen, FlaskConical, Plus, Trash2, Users } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { AVAILABILITY, NO_BUILDING, floorLabel, floorOrder, roomGroup, roomTypeLabel } from '@/lib/school/rooms';
import { paths } from '@/paths';

import { AddBuildingDialog, RemoveBuildingDialog } from './building-dialogs';
import type { RoomAvailability, RoomInsight } from '@/types/foundation';
import type { Room } from '@/types/school';

export interface BuildingRoom extends Room {
  insight: RoomInsight | undefined;
}

interface Floor {
  key: string;
  label: string;
  rooms: BuildingRoom[];
}

interface Building {
  name: string;
  rooms: BuildingRoom[];
  floors: Floor[];
}

const availabilityOf = (room: BuildingRoom): RoomAvailability =>
  room.insight?.availability ?? (room.status === 'maintenance' ? 'maintenance' : room.status === 'unavailable' ? 'unavailable' : 'available');
const seats = (rooms: readonly BuildingRoom[]): number => rooms.reduce((total, room) => total + (room.capacity ?? 0), 0);
const blocked = (rooms: readonly BuildingRoom[]): number => rooms.filter((room) => ['maintenance', 'unavailable'].includes(availabilityOf(room))).length;
const plural = (n: number, word: string): string => `${n.toLocaleString('en-IN')} ${word}${n === 1 ? '' : 's'}`;

export function groupBuildings(rooms: readonly BuildingRoom[]): Building[] {
  const byName = new Map<string, BuildingRoom[]>();
  for (const room of rooms) byName.set(room.building || NO_BUILDING, [...(byName.get(room.building || NO_BUILDING) ?? []), room]);
  return [...byName.entries()]
    .map(([name, list]) => {
      const floors = new Map<string, BuildingRoom[]>();
      for (const room of list) floors.set(room.floor ?? '', [...(floors.get(room.floor ?? '') ?? []), room]);
      return {
        name,
        rooms: list,
        floors: [...floors.entries()]
          .sort(([a], [b]) => floorOrder(a || undefined) - floorOrder(b || undefined))
          .map(([key, floorRooms]) => ({ key, label: floorLabel(key || undefined), rooms: [...floorRooms].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'en', { numeric: true })) })),
      };
    })
    .sort((a, b) => Number(a.name === NO_BUILDING) - Number(b.name === NO_BUILDING) || a.name.localeCompare(b.name));
}

// A building at a glance: its floors drawn as a stack, top floor on top, each bar as wide as its share of the rooms.
function Elevation({ building }: { building: Building }): React.ReactElement {
  const widest = Math.max(1, ...building.floors.map((floor) => floor.rooms.length));
  return (
    <Stack spacing={0.5} sx={{ flexDirection: 'column-reverse' }} aria-hidden>
      {building.floors.map((floor) => (
        <Stack key={floor.key} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ width: 22, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {floor.key === '' ? '–' : /^ground$/i.test(floor.key) ? 'G' : floor.key.slice(0, 2)}
          </Typography>
          <Box sx={(theme) => ({ flex: 1, height: 10, borderRadius: '3px', bgcolor: theme.brand.subtle })}>
            <Box sx={(theme) => ({ width: `${(floor.rooms.length / widest) * 100}%`, height: '100%', borderRadius: '3px', bgcolor: blocked(floor.rooms) > 0 ? theme.hues.amber : theme.palette.primary.light })} />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ width: 22, fontVariantNumeric: 'tabular-nums' }}>
            {floor.rooms.length}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function BuildingCard({ building, onOpen }: { building: Building; onOpen: () => void }): React.ReactElement {
  const labs = building.rooms.filter((room) => roomGroup(room.room_type) === 'lab').length;
  const classrooms = building.rooms.filter((room) => roomGroup(room.room_type) === 'classroom').length;
  const out = blocked(building.rooms);
  return (
    <Card sx={{ height: '100%' }}>
      <CardActionArea onClick={onOpen} sx={{ height: '100%', p: 2.5, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box sx={(theme) => ({ display: 'grid', placeItems: 'center', width: 40, height: 40, flex: 'none', borderRadius: `${theme.band.radius.md}px`, bgcolor: theme.tints.rose, color: theme.onTint.rose })}>
            <Building2 size={20} aria-hidden />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h4" component="h3" noWrap>
              {building.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {plural(building.floors.length, 'floor')} · {plural(building.rooms.length, 'room')} · {seats(building.rooms).toLocaleString('en-IN')} seats
            </Typography>
          </Box>
          <ChevronRight size={18} aria-hidden />
        </Stack>
        <Elevation building={building} />
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 'auto' }}>
          {classrooms > 0 ? <EmergeChip label={`${classrooms} classrooms`} tone="grey" /> : null}
          {labs > 0 ? <EmergeChip label={`${labs} labs`} tone="violet" /> : null}
          {building.rooms.length - classrooms - labs > 0 ? <EmergeChip label={`${building.rooms.length - classrooms - labs} shared`} tone="teal" /> : null}
          {out > 0 ? <EmergeChip label={`${out} out of use`} tone="amber" dot /> : null}
        </Stack>
      </CardActionArea>
    </Card>
  );
}

function RoomTile({ room, href }: { room: BuildingRoom; href: string }): React.ReactElement {
  const state = AVAILABILITY[availabilityOf(room)];
  const Icon = roomGroup(room.room_type) === 'lab' ? FlaskConical : roomGroup(room.room_type) === 'classroom' ? DoorOpen : Users;
  return (
    <Card sx={{ height: '100%' }}>
      <CardActionArea component={NextLink} href={href} sx={{ height: '100%', px: 2, py: 1.5, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0.75 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box sx={{ color: 'text.secondary', display: 'flex' }}>
            <Icon size={16} aria-hidden />
          </Box>
          <Typography variant="subtitle1" component="p" noWrap sx={{ flex: 1, minWidth: 0 }}>
            {room.name}
          </Typography>
          <Box title={state.label} sx={(theme) => ({ width: 8, height: 8, borderRadius: '50%', flex: 'none', bgcolor: theme.onTint[state.tone] })} />
        </Stack>
        <Typography variant="body2" color="text.secondary" noWrap>
          {roomTypeLabel(room.room_type)} · {room.capacity ?? '—'} seats
        </Typography>
        <Typography variant="caption" noWrap sx={{ color: room.insight?.primary_use ? 'text.primary' : 'text.disabled' }}>
          {room.insight?.primary_use ?? 'Not assigned'}
          {state.label !== 'Available' ? ` · ${state.label}` : ''}
        </Typography>
      </CardActionArea>
    </Card>
  );
}

// Rooms as a school is walked: pick a building, then read it floor by floor.
export function RoomsBuildings({ rooms, building, onBuilding, personaSlug, branchId }: { rooms: readonly BuildingRoom[]; building: string; onBuilding: (next: string | null) => void; personaSlug: string; branchId: string | null }): React.ReactElement {
  const buildings = React.useMemo(() => groupBuildings(rooms), [rooms]);
  const open = buildings.find((b) => b.name === building);
  const [dialog, setDialog] = React.useState<'add' | 'remove' | null>(null);
  const names = buildings.map((b) => b.name).filter((n) => n !== NO_BUILDING);
  const dialogs = (
    <>
      {dialog === 'add' && branchId ? <AddBuildingDialog branchId={branchId} taken={names} onClose={() => setDialog(null)} onDone={(name) => (setDialog(null), onBuilding(name))} /> : null}
      {dialog === 'remove' && open ? <RemoveBuildingDialog name={open.name} rooms={open.rooms} others={names.filter((n) => n !== open.name)} onClose={() => setDialog(null)} onDone={() => (setDialog(null), onBuilding(null))} /> : null}
    </>
  );

  if (!open) {
    return (
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
        {buildings.map((b) => (
          <BuildingCard key={b.name} building={b} onOpen={() => onBuilding(b.name)} />
        ))}
        {branchId ? (
          <Card variant="outlined" sx={(theme) => ({ borderStyle: 'dashed', borderColor: theme.brand.line2, bgcolor: 'transparent', boxShadow: 'none' })}>
            <CardActionArea onClick={() => setDialog('add')} sx={{ height: '100%', minHeight: 180, display: 'grid', placeItems: 'center' }}>
              <Stack spacing={1} sx={{ alignItems: 'center', color: 'text.secondary' }}>
                <Plus size={28} aria-hidden />
                <Typography variant="subtitle1" color="text.primary">
                  Add a building
                </Typography>
                <Typography variant="body2">With its floors and rooms</Typography>
              </Stack>
            </CardActionArea>
          </Card>
        ) : null}
        {dialogs}
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Button size="small" startIcon={<ArrowLeft size={14} />} onClick={() => onBuilding(null)} sx={{ ml: -1, mb: 0.5 }}>
            All buildings
          </Button>
          <Typography variant="h3" component="h2">
            {open.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {plural(open.floors.length, 'floor')} · {plural(open.rooms.length, 'room')} · {seats(open.rooms).toLocaleString('en-IN')} seats
            {blocked(open.rooms) > 0 ? ` · ${blocked(open.rooms)} out of use` : ''}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75, alignItems: 'center' }}>
          {open.name !== NO_BUILDING ? (
            <Button size="small" variant="outlined" color="error" startIcon={<Trash2 size={14} />} onClick={() => setDialog('remove')}>
              Remove Building
            </Button>
          ) : null}
          {buildings
            .filter((b) => b.name !== open.name)
            .map((b) => (
              <Button key={b.name} size="small" variant="outlined" color="inherit" onClick={() => onBuilding(b.name)}>
                {b.name}
              </Button>
            ))}
        </Stack>
      </Stack>

      {dialogs}
      {open.floors.map((floor) => (
        <Box key={floor.key}>
          <Stack direction="row" sx={(theme) => ({ alignItems: 'baseline', gap: 1.5, pb: 1, mb: 1.5, borderBottom: `1px solid ${theme.brand.line}` })}>
            <Typography variant="h4" component="h3">
              {floor.label}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {plural(floor.rooms.length, 'room')} · {seats(floor.rooms).toLocaleString('en-IN')} seats
            </Typography>
            {blocked(floor.rooms) > 0 ? <EmergeChip label={`${blocked(floor.rooms)} out of use`} tone="amber" dot /> : null}
          </Stack>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {floor.rooms.map((room) => (
              <RoomTile key={room.id} room={room} href={paths.personaSection(personaSlug, `school/rooms/${room.id}`)} />
            ))}
          </Box>
        </Box>
      ))}
    </Stack>
  );
}
