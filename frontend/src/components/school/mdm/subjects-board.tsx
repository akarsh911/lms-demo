'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import { Segmented } from '@/components/ui/segmented';
import {
  useCreateSubject,
  useDeleteSubject,
  useUpdateSubject,
} from '@/hooks/mutation/use-mdm';
import { useMdmSubjects } from '@/hooks/query/use-mdm';
import { MdmBoard, StatusChip } from './mdm-board';
import { MdmDialog, MdmFormActions, MdmFormError, StatusSelect } from './mdm-dialog';
import { SUBJECT_TYPES } from './options';
import { useUrlState } from '../url-state';
import type { RowStatus, Subject } from '@/types/mdm';

type SubjectLens = 'all' | 'core' | 'elective';

const LENSES: readonly { value: SubjectLens; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'core', label: 'Core' },
  { value: 'elective', label: 'Elective' },
];

export function SubjectsBoard(): React.ReactElement {
  const subjects = useMdmSubjects();
  const { get, put } = useUrlState();
  const [editing, setEditing] = React.useState<Subject | 'new' | null>(null);

  const chosen = get('subjects');
  const lens: SubjectLens =
    chosen === 'core' || chosen === 'elective' ? chosen : 'all';

  const all = React.useMemo(() => subjects.data?.rows ?? [], [subjects.data]);
  const rows = React.useMemo(
    () =>
      all.filter((subject) => {
        if (lens === 'core') return subject.is_elective !== true;
        if (lens === 'elective') return subject.is_elective === true;
        return true;
      }),
    [all, lens],
  );

  return (
    <>
      <MdmBoard
        summary={`${rows.length} of ${all.length} ${all.length === 1 ? 'subject' : 'subjects'}`}
        addLabel="Add a subject"
        onAdd={() => setEditing('new')}
        isPending={subjects.isPending}
        error={subjects.error}
        onRetry={() => void subjects.refetch()}
        isEmpty={rows.length === 0}
        emptyMessage={
          all.length === 0
            ? 'No subjects yet. A class is given one by creating an offering, so the subject comes first.'
            : 'No subjects match this filter.'
        }
        controls={
          <Segmented
            options={LENSES}
            value={lens}
            onChange={(next) => put({ subjects: next === 'all' ? null : next })}
            ariaLabel="Which subjects to list"
          />
        }
      >
        <TableHead>
          <TableRow>
            <TableCell>Subject</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>Chosen</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Edit</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((subject) => (
            <TableRow key={subject.id} hover>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {subject.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {[subject.code, subject.short_name].filter(Boolean).join(' · ')}
                </Typography>
              </TableCell>
              <TableCell>{subject.subject_type ?? 'academic'}</TableCell>
              <TableCell>
                <EmergeChip
                  label={subject.is_elective ? 'Elective' : 'Everyone'}
                  tone={subject.is_elective ? 'violet' : 'grey'}
                />
              </TableCell>
              <TableCell>
                <StatusChip status={subject.status} />
              </TableCell>
              <TableCell align="right">
                <Button size="small" onClick={() => setEditing(subject)}>
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
      >
        <SubjectForm
          subject={editing === 'new' ? undefined : (editing ?? undefined)}
          onClose={() => setEditing(null)}
        />
      </MdmDialog>
    </>
  );
}

function SubjectForm({
  subject,
  onClose,
}: {
  subject: Subject | undefined;
  onClose: () => void;
}): React.ReactElement {
  const create = useCreateSubject();
  const update = useUpdateSubject();
  const remove = useDeleteSubject();

  const [name, setName] = React.useState(subject?.name ?? '');
  const [code, setCode] = React.useState(subject?.code ?? '');
  const [shortName, setShortName] = React.useState(subject?.short_name ?? '');
  const [description, setDescription] = React.useState(subject?.description ?? '');
  const [type, setType] = React.useState(subject?.subject_type ?? 'academic');
  const [isElective, setIsElective] = React.useState(subject?.is_elective ?? false);
  const [status, setStatus] = React.useState<string>(subject?.status ?? 'active');

  const usable = name.trim() !== '' && code.trim() !== '';
  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;

  const save = (): void => {
    const shared = {
      name: name.trim(),
      short_name: shortName.trim() === '' ? undefined : shortName.trim(),
      description: description.trim() === '' ? undefined : description.trim(),
      subject_type: type.trim() === '' ? 'academic' : type.trim(),
      is_elective: isElective,
      status: status as RowStatus,
    };
    if (subject) update.mutate({ id: subject.id, patch: shared }, { onSuccess: onClose });
    else create.mutate({ ...shared, code: code.trim() }, { onSuccess: onClose });
  };

  return (
    <>
      <DialogTitle>{subject ? 'Edit subject' : 'Add a subject'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Code"
              size="small"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
              fullWidth
              disabled={Boolean(subject)}
              helperText={subject ? 'A subject code cannot be changed.' : 'Unique.'}
            />
            <TextField
              label="Short name"
              size="small"
              value={shortName}
              onChange={(event) => setShortName(event.target.value)}
              fullWidth
              helperText="Shown on a crowded timetable."
            />
          </Stack>
          <TextField
            select
            label="Type"
            size="small"
            value={SUBJECT_TYPES.includes(type) ? type : 'other'}
            onChange={(event) => setType(event.target.value)}
          >
            {SUBJECT_TYPES.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
            <MenuItem value="other">other</MenuItem>
          </TextField>
          <TextField
            label="Description"
            size="small"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={2}
          />
          <FormControlLabel
            control={
              <Switch
                checked={isElective}
                onChange={(event) => setIsElective(event.target.checked)}
              />
            }
            label="Pupils choose this one"
          />
          <StatusSelect value={status} onChange={setStatus} />
          <MdmFormError error={failure} />
        </Stack>
      </DialogContent>
      <MdmFormActions
        onDelete={
          subject ? () => remove.mutate(subject.id, { onSuccess: onClose }) : undefined
        }
        onCancel={onClose}
        onSave={save}
        busy={busy}
        canSave={usable}
      />
    </>
  );
}
