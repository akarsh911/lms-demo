'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Checkbox from '@mui/material/Checkbox';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { Plus, Trash2, Users } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { FormDialog } from '@/components/ui/form-dialog';
import { RowMenu } from '@/components/ui/row-menu';
import { SearchField } from '@/components/ui/search-field';
import { useToast } from '@/components/ui/toast';
import { useCreateGroup, useRemoveGroup, useSetGroupMembers } from '@/hooks/mutation/use-structure';
import type { YearEnrollment } from '@/types/foundation';
import type { AcademicGroup, GroupKind } from '@/types/structure';

const KIND: Readonly<Record<GroupKind, string>> = { stream: 'Stream', batch: 'Batch' };

function AddGroupDialog({ sectionId, label, onClose }: { sectionId: string; label: string; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const create = useCreateGroup();
  const [name, setName] = React.useState('');
  const [kind, setKind] = React.useState<GroupKind>('stream');
  return (
    <FormDialog
      open
      title={`Add a stream or batch to ${label}`}
      description="A stream is what a student studies (Science, Commerce); a batch splits a section for a lab or a language."
      submitLabel="Add"
      pending={create.isPending}
      error={create.error}
      canSubmit={name.trim() !== ''}
      onClose={onClose}
      onSubmit={() =>
        create.mutate(
          { sectionId, name: name.trim(), kind },
          {
            onSuccess: () => {
              notify(`${name.trim()} added to ${label}`);
              onClose();
            },
          },
        )
      }
    >
      <ToggleButtonGroup exclusive size="small" value={kind} onChange={(_, value: GroupKind | null) => value && setKind(value)} aria-label="Kind">
        <ToggleButton value="stream">Stream</ToggleButton>
        <ToggleButton value="batch">Batch</ToggleButton>
      </ToggleButtonGroup>
      <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === 'stream' ? 'Humanities' : 'Lab batch 1'} autoFocus />
    </FormDialog>
  );
}

function MembersDialog({ group, pupils, others, onClose }: { group: AcademicGroup; pupils: readonly YearEnrollment[]; others: readonly AcademicGroup[]; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const save = useSetGroupMembers();
  const [chosen, setChosen] = React.useState(() => new Set(group.student_ids));
  const [search, setSearch] = React.useState('');
  // A pupil is in one stream; batches may overlap.
  const elsewhere = new Map(others.filter((g) => g.kind === group.kind && group.kind === 'stream').flatMap((g) => g.student_ids.map((id) => [id, g.name] as const)));
  const shown = pupils.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));
  const toggle = (id: string): void =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <FormDialog
      open
      title={`Students in ${group.name}`}
      description={`${chosen.size} of ${pupils.length} chosen`}
      submitLabel="Save Members"
      pending={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() =>
        save.mutate(
          { groupId: group.id, studentIds: [...chosen] },
          {
            onSuccess: () => {
              notify(`${group.name} saved`);
              onClose();
            },
          },
        )
      }
    >
      <SearchField label="Search students" value={search} onChange={setSearch} />
      <List dense sx={{ maxHeight: 360, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 2 }}>
        {shown.map((p) => {
          const other = elsewhere.get(p.student_id);
          return (
            <ListItem key={p.id} disablePadding>
              <ListItemButton onClick={() => !other && toggle(p.student_id)} disabled={Boolean(other)}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Checkbox edge="start" checked={chosen.has(p.student_id)} tabIndex={-1} disableRipple slotProps={{ input: { 'aria-label': p.name } }} />
                </ListItemIcon>
                <ListItemText primary={p.name} secondary={other ? `In ${other}` : p.roll_number ? `Roll ${p.roll_number}` : 'No roll number'} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </FormDialog>
  );
}

// Streams and batches inside one section: who studies Science, who is in lab batch 2. Only where a class divides this way.
export function SectionGroups({ sectionId, label, groups, pupils, editable }: { sectionId: string; label: string; groups: readonly AcademicGroup[]; pupils: readonly YearEnrollment[]; editable: boolean }): React.ReactElement {
  const remove = useRemoveGroup();
  const notify = useToast();
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<AcademicGroup | null>(null);
  const streamed = new Set(groups.filter((g) => g.kind === 'stream').flatMap((g) => g.student_ids));
  const unstreamed = groups.some((g) => g.kind === 'stream') ? pupils.filter((p) => !streamed.has(p.student_id)).length : 0;

  return (
    <Card>
      <CardHeader
        title="Streams and batches"
        subheader={unstreamed > 0 ? `${unstreamed} students are in no stream` : `Groups inside ${label}`}
        action={
          editable ? (
            <Button variant="outlined" size="small" startIcon={<Plus size={14} />} onClick={() => setAdding(true)}>
              Add
            </Button>
          ) : null
        }
      />
      {groups.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>
          {label} is taught as one group.
        </Typography>
      ) : (
        <List disablePadding sx={{ p: 1 }}>
          {groups.map((g) => (
            <ListItem
              key={g.id}
              secondaryAction={
                editable ? (
                  <RowMenu
                    label={`Change ${g.name}`}
                    actions={[
                      { label: 'Choose students', icon: <Users size={16} />, onSelect: () => setEditing(g) },
                      { label: 'Remove', icon: <Trash2 size={16} />, destructive: true, onSelect: () => remove.mutate(g.id, { onSuccess: () => notify(`${g.name} removed from ${label}`) }) },
                    ]}
                  />
                ) : null
              }
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Typography variant="subtitle1" component="span">
                      {g.name}
                    </Typography>
                    <EmergeChip label={KIND[g.kind]} tone={g.kind === 'stream' ? 'blue' : 'grey'} />
                  </Stack>
                }
                secondary={`${g.student_ids.length} students`}
              />
            </ListItem>
          ))}
        </List>
      )}
      {adding ? <AddGroupDialog sectionId={sectionId} label={label} onClose={() => setAdding(false)} /> : null}
      {editing ? <MembersDialog group={editing} pupils={pupils} others={groups.filter((g) => g.id !== editing.id)} onClose={() => setEditing(null)} /> : null}
    </Card>
  );
}
