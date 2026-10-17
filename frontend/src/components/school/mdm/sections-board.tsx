'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { WidgetDegraded } from '@/components/widgets/widget-states';
import { useCreateSection, useDeleteSection, useUpdateSection } from '@/hooks/mutation/use-mdm';
import { useMdmGradeLevels, useMdmSections } from '@/hooks/query/use-mdm';
import { useRooms, useTeacherDirectory } from '@/hooks/query/use-school';
import { isDenial } from '@/lib/api-failure';
import { byId, roomLabel, teacherNames } from '@/lib/school/names';
import { MdmBoard, StatusChip } from './mdm-board';
import type { TeacherDirectoryState } from '../name-book';
import { MdmDialog, MdmFormActions, MdmFormError, StatusSelect } from './mdm-dialog';
import { SchoolScopeBar, useSchoolScope } from '../school-scope';
import { useUrlState } from '../url-state';
import type { GradeLevel, RowStatus, SectionWrite } from '@/types/mdm';
import type { Room, SectionRow } from '@/types/school';

export function SectionsBoard(): React.ReactElement {
  const scope = useSchoolScope();
  const { get, put } = useUrlState();
  const sections = useMdmSections(scope.branchId, scope.sessionId);
  const grades = useMdmGradeLevels();
  const rooms = useRooms(scope.branchId);
  const directory = useTeacherDirectory(Boolean(scope.branchId));

  const [editing, setEditing] = React.useState<SectionRow | 'new' | null>(null);

  const directoryState: TeacherDirectoryState = !directory.isError
    ? 'readable'
    : isDenial(directory.error)
      ? 'denied'
      : 'unavailable';

  const rows = sections.data?.rows ?? [];
  const roomsById = React.useMemo(() => byId(rooms.data?.rows ?? []), [rooms.data]);
  const teachers = React.useMemo(
    () => teacherNames(directory.data?.rows ?? []),
    [directory.data],
  );

  return (
    <>
      <MdmBoard
        summary={
          scope.session
            ? `${rows.length} ${rows.length === 1 ? 'class' : 'classes'} in ${scope.session.name ?? 'this year'}`
            : `${rows.length} ${rows.length === 1 ? 'class' : 'classes'}`
        }
        addLabel="Add a class"
        onAdd={() => setEditing('new')}
        addDisabled={!scope.branchId || !scope.sessionId}
        isPending={sections.isPending && Boolean(scope.branchId)}
        error={sections.error}
        onRetry={() => void sections.refetch()}
        isEmpty={rows.length === 0}
        emptyMessage="No classes in this branch for this year. Add one and it becomes available to the timetable."
        controls={<SchoolScopeBar scope={scope} showScheme={false} />}
        notice={
          directory.isError ? (
            <WidgetDegraded
              error={directory.error}
              denied="This account cannot read the teacher directory, so a class teacher who is already set cannot be named or reassigned here. It can still be removed, and everything else still edits."
              unavailable="The teacher directory could not be loaded, so a class teacher who is already set cannot be named or reassigned here. It can still be removed, and everything else still edits."
            />
          ) : null
        }
      >
        <TableHead>
          <TableRow>
            <TableCell>Class</TableCell>
            <TableCell>Grade</TableCell>
            <TableCell align="right">Capacity</TableCell>
            <TableCell>Home room</TableCell>
            <TableCell>Class teacher</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Roll</TableCell>
            <TableCell align="right">Edit</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((section) => (
            <TableRow key={section.id} hover>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {section.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {section.code}
                </Typography>
              </TableCell>
              <TableCell>{section.edges?.grade_level?.name ?? '—'}</TableCell>
              <TableCell align="right">{section.capacity ?? '—'}</TableCell>
              <TableCell>
                {section.room_id
                  ? roomLabel(roomsById.get(section.room_id))
                  : 'No home room'}
              </TableCell>
              <TableCell>
                {section.class_teacher_id
                  ? (teachers.get(section.class_teacher_id) ?? 'Named elsewhere')
                  : 'Not set'}
              </TableCell>
              <TableCell>
                <StatusChip status={section.status} />
              </TableCell>
              <TableCell align="right">
                <Button
                  size="small"
                  disabled={get('section') === section.id}
                  onClick={() => put({ section: section.id })}
                >
                  {get('section') === section.id ? 'Below' : 'Open'}
                </Button>
              </TableCell>
              <TableCell align="right">
                <Button size="small" onClick={() => setEditing(section)}>
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </MdmBoard>

      <MdmDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        formKey={editing === 'new' ? 'new' : (editing?.id ?? 'none')}
        maxWidth="sm"
      >
        <SectionForm
          section={editing === 'new' ? undefined : (editing ?? undefined)}
          branchId={scope.branchId}
          sessionId={scope.sessionId}
          grades={grades.data?.rows ?? []}
          rooms={rooms.data?.rows ?? []}
          teachers={teachers}
          teacherDirectory={directoryState}
          onClose={() => setEditing(null)}
        />
      </MdmDialog>
    </>
  );
}

function emptyDirectoryText(directory: TeacherDirectoryState): string {
  switch (directory) {
    case 'readable':
      return 'No teachers are listed for this branch.';
    case 'denied':
      return 'No teacher directory is readable from this account.';
    case 'unavailable':
      return 'The teacher directory could not be loaded.';
  }
}

function SectionForm({
  section,
  branchId,
  sessionId,
  grades,
  rooms,
  teachers,
  teacherDirectory,
  onClose,
}: {
  section: SectionRow | undefined;
  branchId: string | null;
  sessionId: string | null;
  grades: readonly GradeLevel[];
  rooms: readonly Room[];
  teachers: ReadonlyMap<string, string>;
  teacherDirectory: TeacherDirectoryState;
  onClose: () => void;
}): React.ReactElement {
  const create = useCreateSection();
  const update = useUpdateSection();
  const remove = useDeleteSection();

  const [gradeId, setGradeId] = React.useState(section?.grade_level_id ?? '');
  const [name, setName] = React.useState(section?.name ?? '');
  const [code, setCode] = React.useState(section?.code ?? '');
  const [capacity, setCapacity] = React.useState(
    section?.capacity === undefined ? '' : String(section.capacity),
  );
  const [roomId, setRoomId] = React.useState(section?.room_id ?? '');
  const [teacherId, setTeacherId] = React.useState(section?.class_teacher_id ?? '');
  const [status, setStatus] = React.useState<string>(section?.status ?? 'active');

  const parsedCapacity = capacityOrBad(capacity);
  const capacityUsable = parsedCapacity !== 'bad';
  const usable =
    name.trim() !== '' && code.trim() !== '' && gradeId !== '' && capacityUsable;
  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;

  const save = (): void => {
    if (!usable) return;
    const chosen: ChosenSection = {
      name: name.trim(),
      code: code.trim(),
      capacity: parsedCapacity,
      room_id: roomId === '' ? null : roomId,
      class_teacher_id: teacherId === '' ? null : teacherId,
      status: status as RowStatus,
    };
    if (section) {
      update.mutate(
        { id: section.id, patch: changedFields(section, chosen) },
        { onSuccess: onClose },
      );
      return;
    }
    if (!branchId || !sessionId) return;
    create.mutate(
      {
        ...withoutNulls(chosen),
        academic_session_id: sessionId,
        branch_id: branchId,
        grade_level_id: gradeId,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <DialogTitle>{section ? 'Edit class' : 'Add a class'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            select
            label="Grade level"
            size="small"
            value={gradeId}
            onChange={(event) => setGradeId(event.target.value)}
            required
            disabled={Boolean(section)}
            helperText={
              section
                ? 'A class cannot be moved to another grade level.'
                : 'Which grade this class belongs to.'
            }
          >
            {grades.map((grade) => (
              <MenuItem key={grade.id} value={grade.id}>
                {grade.name ?? grade.code ?? grade.id}
              </MenuItem>
            ))}
          </TextField>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Name"
              size="small"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              fullWidth
              helperText="Such as A."
            />
            <TextField
              label="Code"
              size="small"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
              fullWidth
              helperText="Unique within the year, such as 10-A."
            />
          </Stack>

          <TextField
            label="Capacity"
            size="small"
            type="number"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            error={!capacityUsable}
            helperText={
              capacityUsable
                ? 'Optional. Emptying this removes a capacity that is already set.'
                : 'A capacity has to be a whole number above zero.'
            }
          />

          <TextField
            select
            label="Home room"
            size="small"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            helperText="The timetable offers this room first for a lesson in this class. Choosing No home room removes one that is already set."
          >
            <MenuItem value="">No home room</MenuItem>
            {roomId !== '' && !rooms.some((room) => room.id === roomId) ? (
              <MenuItem value={roomId}>Set, but not in this list</MenuItem>
            ) : null}
            {rooms.map((room) => (
              <MenuItem key={room.id} value={room.id}>
                {roomLabel(room)}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Class teacher"
            size="small"
            value={teacherId}
            onChange={(event) => setTeacherId(event.target.value)}
            helperText={
              teachers.size === 0
                ? emptyDirectoryText(teacherDirectory)
                : 'Choosing Not set removes the class teacher.'
            }
          >
            <MenuItem value="">Not set</MenuItem>
            {teacherId !== '' && !teachers.has(teacherId) ? (
              <MenuItem value={teacherId}>Named elsewhere</MenuItem>
            ) : null}
            {[...teachers.entries()].map(([id, label]) => (
              <MenuItem key={id} value={id}>
                {label}
              </MenuItem>
            ))}
          </TextField>

          <StatusSelect value={status} onChange={setStatus} />

          {section ? (
            <Alert severity="info" variant="outlined">
              A class with pupils enrolled or lessons placed cannot be deleted. Make it
              inactive instead.
            </Alert>
          ) : null}

          <MdmFormError error={failure} />
        </Stack>
      </DialogContent>
      <MdmFormActions
        onDelete={
          section ? () => remove.mutate(section.id, { onSuccess: onClose }) : undefined
        }
        onCancel={onClose}
        onSave={save}
        busy={busy}
        canSave={usable && (Boolean(section) || (Boolean(branchId) && Boolean(sessionId)))}
      />
    </>
  );
}

type ChosenSection = {
  name: string;
  code: string;
  capacity: number | null;
  room_id: string | null;
  class_teacher_id: string | null;
  status: RowStatus;
};

function capacityOrBad(raw: string): number | null | 'bad' {
  if (raw.trim() === '') return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : 'bad';
}

function changedFields(section: SectionRow, chosen: ChosenSection): SectionWrite {
  const patch: SectionWrite = {};
  if (chosen.name !== (section.name ?? '')) patch.name = chosen.name;
  if (chosen.code !== (section.code ?? '')) patch.code = chosen.code;
  if (chosen.status !== (section.status ?? 'active')) patch.status = chosen.status;
  if (chosen.capacity !== (section.capacity ?? null)) patch.capacity = chosen.capacity;
  if (chosen.room_id !== (section.room_id ?? null)) patch.room_id = chosen.room_id;
  if (chosen.class_teacher_id !== (section.class_teacher_id ?? null)) {
    patch.class_teacher_id = chosen.class_teacher_id;
  }
  return patch;
}

function withoutNulls(chosen: ChosenSection): SectionWrite {
  return Object.fromEntries(
    Object.entries(chosen).filter(([, value]) => value !== null),
  ) as SectionWrite;
}
