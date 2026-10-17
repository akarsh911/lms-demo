'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { Archive, CheckCircle2, CircleAlert, DoorOpen, Pencil, Wrench } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { RowMenu } from '@/components/ui/row-menu';
import { useToast } from '@/components/ui/toast';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useSaveRooms } from '@/hooks/mutation/use-foundation';
import { useRoomInsight } from '@/hooks/query/use-foundation';
import { useBranches, useRooms } from '@/hooks/query/use-school';
import { formatDay } from '@/lib/dates';
import { AVAILABILITY, roomPlace, roomTypeLabel } from '@/lib/school/rooms';
import { paths } from '@/paths';
import type { RoomUsageEntry } from '@/types/foundation';

import { RoomDialog } from './room-dialog';
import { RoomUnavailableDialog } from './room-unavailable-dialog';

function Usage({ title, hint, entries, empty }: { title: string; hint: string; entries: readonly RoomUsageEntry[]; empty: string }): React.ReactElement {
  return (
    <Card>
      <CardHeader title={title} subheader={hint} />
      {entries.length === 0 ? (
        <CardContent>
          <WidgetEmpty message={empty} />
        </CardContent>
      ) : (
        <List disablePadding sx={{ px: 3, py: 1 }}>
          {entries.map((entry, index) => (
            <ListItem key={entry.id} disableGutters divider={index < entries.length - 1} sx={{ gap: 2 }}>
              <Typography variant="body2" component="span" color="text.secondary" sx={{ width: 112, flex: 'none', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {entry.starts} to {entry.ends}
              </Typography>
              <ListItemText primary={entry.title} slotProps={{ primary: { variant: 'body1' } }} sx={{ my: 0 }} />
            </ListItem>
          ))}
        </List>
      )}
    </Card>
  );
}

export function RoomDetail({ roomId, personaSlug }: { roomId: string; personaSlug: string }): React.ReactElement {
  const router = useRouter();
  const branches = useBranches();
  const branchId = branches.data?.rows[0]?.id ?? null;
  const rooms = useRooms(branchId);
  const insight = useRoomInsight(roomId);
  const change = useSaveRooms();
  const notify = useToast();

  const [editing, setEditing] = React.useState(false);
  const [blocking, setBlocking] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);

  if (branches.isPending || (Boolean(branchId) && rooms.isPending)) return <WidgetLoading rows={6} />;
  const failed = branches.error ?? rooms.error;
  if (failed) return <WidgetError error={failed} onRetry={() => void rooms.refetch()} />;

  const all = rooms.data?.rows ?? [];
  const room = all.find((row) => row.id === roomId);
  if (!room) {
    return (
      <Alert severity="info" variant="outlined">
        That room is not here any more. It may have been removed.
      </Alert>
    );
  }

  const blocked = room.status === 'maintenance' || room.status === 'unavailable';
  const archived = room.status === 'archived';
  const state = AVAILABILITY[insight.data?.availability ?? (blocked ? (room.status as 'maintenance' | 'unavailable') : 'available')];
  const makeAvailable = (): void =>
    change.mutate({ ids: [room.id], patch: { status: 'active', unavailable: null } }, { onSuccess: () => notify(`${room.name} is available again`) });
  const issues = insight.data?.issues.filter((issue) => issue.code !== 'unavailable') ?? [];
  const lessons = insight.data?.today.length ?? 0;

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
        <div>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography variant="h2" component="h1">
              {room.name}
            </Typography>
            <EmergeChip label={roomTypeLabel(room.room_type)} />
            {archived ? <EmergeChip label="Archived" /> : <EmergeChip label={state.label} tone={state.tone} dot />}
          </Stack>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
            {roomPlace(room)}
          </Typography>
        </div>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Button variant="outlined" startIcon={<Pencil size={14} />} onClick={() => setEditing(true)}>
            Edit Room
          </Button>
          <RowMenu
            label="More actions for this room"
            actions={[
              blocked
                ? { label: 'Mark available', icon: <DoorOpen size={16} />, onSelect: makeAvailable }
                : { label: 'Mark unavailable', icon: <Wrench size={16} />, disabled: archived, onSelect: () => setBlocking(true) },
              { label: 'Archive', icon: <Archive size={16} />, destructive: true, disabled: archived, hint: 'Already archived', onSelect: () => setArchiving(true) },
            ]}
          />
        </Stack>
      </Stack>

      {change.isError ? <WidgetError error={change.error} /> : null}

      {blocked && room.unavailable ? (
        <Alert
          severity="warning"
          variant="outlined"
          action={
            <Button size="small" color="inherit" onClick={makeAvailable} loading={change.isPending}>
              Mark available
            </Button>
          }
        >
          <AlertTitle>{room.status === 'maintenance' ? 'Under maintenance' : 'Temporarily unavailable'}</AlertTitle>
          {room.unavailable.reason}. From {formatDay(room.unavailable.from)}
          {room.unavailable.until ? ` until ${formatDay(room.unavailable.until)}` : ', with no end date set'}.
          {lessons > 0 ? ` ${lessons} ${lessons === 1 ? 'lesson' : 'lessons'} timetabled here today ${lessons === 1 ? 'needs' : 'need'} another room.` : ''}
        </Alert>
      ) : null}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 7fr) minmax(0, 5fr)' }, alignItems: 'start' }}>
        <Stack spacing={2}>
          <Card>
            <CardHeader title="Overview" />
            <CardContent>
              <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, columnGap: 3, rowGap: 2.5, m: 0 }}>
                <Field label="Capacity" quiet={room.capacity === undefined}>{room.capacity === undefined ? 'Not set' : `${room.capacity} seats`}</Field>
                <Field label="Type">{roomTypeLabel(room.room_type)}</Field>
                <Field label="Current status">{archived ? 'Archived' : state.label}</Field>
                <Field label="Building" quiet={!room.building}>{room.building ?? 'Not set'}</Field>
                <Field label="Floor" quiet={!room.floor}>{room.floor ?? 'Not set'}</Field>
                <Field label="Primary assignment" quiet={!insight.data?.primary_use}>
                  {insight.isPending ? 'Reading' : (insight.data?.primary_use ?? 'Not assigned to a class')}
                </Field>
              </Box>

              <Typography variant="eyebrow" component="p" color="text.secondary" sx={{ mt: 3, mb: 1 }}>
                Facilities
              </Typography>
              {room.facilities && room.facilities.length > 0 ? (
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                  {room.facilities.map((facility) => (
                    <Chip key={facility} label={facility} variant="outlined" />
                  ))}
                </Stack>
              ) : (
                <Typography variant="body1" color="text.secondary">
                  None recorded
                </Typography>
              )}

              {room.notes ? (
                <>
                  <Typography variant="eyebrow" component="p" color="text.secondary" sx={{ mt: 3, mb: 0.5 }}>
                    Notes
                  </Typography>
                  <Typography variant="body1">{room.notes}</Typography>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Issues" subheader="Things about this room that need a decision" />
            {insight.isPending ? (
              <CardContent>
                <WidgetLoading rows={2} />
              </CardContent>
            ) : issues.length === 0 ? (
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', p: 3, color: 'success.main' }}>
                <CheckCircle2 size={20} aria-hidden />
                <Typography variant="body1" color="text.primary">
                  No issues with this room.
                </Typography>
              </Stack>
            ) : (
              <List disablePadding sx={{ px: 3, py: 1 }}>
                {issues.map((issue, index) => (
                  <ListItem key={issue.code} disableGutters divider={index < issues.length - 1}>
                    <ListItemIcon sx={{ minWidth: 36, color: 'warning.main' }}>
                      <CircleAlert size={20} aria-hidden />
                    </ListItemIcon>
                    <ListItemText primary={issue.message} />
                  </ListItem>
                ))}
              </List>
            )}
          </Card>
        </Stack>

        <Stack spacing={2}>
          {insight.isError ? <WidgetError error={insight.error} onRetry={() => void insight.refetch()} /> : null}
          <Usage title="Today's usage" hint="Lessons timetabled here today" entries={insight.data?.today ?? []} empty="No scheduled usage today." />
          <Usage title="Upcoming usage" hint="The next school day" entries={insight.data?.upcoming ?? []} empty="Nothing is timetabled here on the next school day." />
        </Stack>
      </Box>

      {editing && branchId ? <RoomDialog branchId={branchId} room={room} rooms={all} insight={insight.data} onClose={() => setEditing(false)} /> : null}
      {blocking ? <RoomUnavailableDialog rooms={[room]} onClose={() => setBlocking(false)} /> : null}
      {archiving ? (
        <ConfirmDialog
          title={`Archive ${room.name}?`}
          body="An archived room leaves the list and can no longer be chosen for a class or a lesson. Its history is kept."
          confirmLabel="Archive"
          pending={change.isPending}
          error={change.error}
          onClose={() => setArchiving(false)}
          onConfirm={() =>
            change.mutate(
              { ids: [room.id], patch: { status: 'archived' } },
              {
                onSuccess: () => {
                  notify('Room archived');
                  router.push(paths.personaSection(personaSlug, 'school/rooms'));
                },
              },
            )
          }
        />
      ) : null}
    </Stack>
  );
}
