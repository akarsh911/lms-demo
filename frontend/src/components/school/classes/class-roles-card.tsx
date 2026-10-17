'use client';

import * as React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Pencil } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { FormDialog } from '@/components/ui/form-dialog';
import { Avatar } from '@/components/ui/row';
import { useToast } from '@/components/ui/toast';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useClassRoles, useSetClassRole } from '@/hooks/query/use-class-roles';
import type { ClassDuty, ClassPupil } from '@/types/class-roles';

type Editing = { kind: 'monitor' | 'vice_monitor' } | { kind: 'duty'; duty: ClassDuty } | null;
const OFFICE: Readonly<Record<'monitor' | 'vice_monitor', string>> = { monitor: 'Monitor', vice_monitor: 'Vice-monitor' };

function EditDialog({ sectionId, label, editing, pupils, current, onClose }: { sectionId: string; label: string; editing: NonNullable<Editing>; pupils: readonly ClassPupil[]; current: readonly ClassPupil[]; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const save = useSetClassRole(sectionId);
  const many = editing.kind === 'duty';
  const [chosen, setChosen] = React.useState<ClassPupil[]>([...current]);
  const title = editing.kind === 'duty' ? `${editing.duty} in ${label}` : `${OFFICE[editing.kind]} of ${label}`;

  return (
    <FormDialog
      open
      title={title}
      description={many ? 'Up to four pupils share a duty.' : 'The pupil who speaks for the class and helps keep it in order.'}
      submitLabel="Save"
      pending={save.isPending}
      error={save.error}
      canSubmit={!many || chosen.length <= 4}
      onClose={onClose}
      onSubmit={() =>
        save.mutate(editing.kind === 'duty' ? { duty: editing.duty, studentIds: chosen.map((p) => p.student_id) } : { role: editing.kind, studentId: chosen[0]?.student_id ?? null }, {
          onSuccess: () => {
            notify(`${title} updated`);
            onClose();
          },
        })
      }
    >
      <Autocomplete
        multiple={many}
        options={[...pupils]}
        value={many ? chosen : (chosen[0] ?? null)}
        onChange={(_, value) => setChosen(value === null ? [] : Array.isArray(value) ? value : [value])}
        getOptionLabel={(p) => `${p.roll ? `${p.roll} · ` : ''}${p.name}`}
        isOptionEqualToValue={(a, b) => a.student_id === b.student_id}
        renderInput={(params) => <TextField {...params} label={many ? 'Pupils' : 'Pupil'} placeholder="Name or roll number" />}
      />
    </FormDialog>
  );
}

// A section's monitor, vice-monitor and duties: its class teacher changes them, everyone who teaches it can read them.
export function ClassRolesCard({ sectionId, editable }: { sectionId: string; editable: boolean }): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useClassRoles(sectionId);
  const [editing, setEditing] = React.useState<Editing>(null);
  if (isPending) return <Card sx={{ p: 2.5 }}><WidgetLoading rows={4} /></Card>;
  if (isError) return <Card sx={{ p: 2.5 }}><WidgetError error={error} onRetry={() => void refetch()} /></Card>;

  const office = (kind: 'monitor' | 'vice_monitor', who: ClassPupil | null): React.ReactElement => (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
      {who ? <Avatar name={who.name} size={36} /> : null}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {OFFICE[kind]}
        </Typography>
        <Typography variant="subtitle2" noWrap color={who ? 'text.primary' : 'warning.dark'}>
          {who ? who.name : 'Not chosen'}
        </Typography>
      </Box>
      {editable ? (
        <Button size="small" variant="outlined" startIcon={<Pencil size={13} />} onClick={() => setEditing({ kind })}>
          {who ? 'Change' : 'Choose'}
        </Button>
      ) : null}
    </Stack>
  );

  return (
    <Card>
      <CardHeader title="Class roles" subheader={editable ? 'Your class: its monitors and who looks after what' : `Set by the class teacher${data.class_teacher ? `, ${data.class_teacher}` : ''}`} />
      <Stack spacing={2} sx={{ px: 3, pb: 2.5 }}>
        <Stack spacing={1.5}>
          {office('monitor', data.monitor)}
          {office('vice_monitor', data.vice_monitor)}
        </Stack>
        <Stack spacing={1}>
          {data.duties.map((d) => (
            <Stack key={d.duty} direction="row" spacing={1.5} sx={(theme) => ({ alignItems: 'center', py: 0.75, borderTop: `1px solid ${theme.brand.line}` })}>
              <Typography variant="body2" sx={{ width: 150, flexShrink: 0, fontWeight: 500 }}>
                {d.duty}
              </Typography>
              <Stack direction="row" sx={{ flex: 1, minWidth: 0, flexWrap: 'wrap', gap: 0.5 }}>
                {d.pupils.length === 0 ? <Typography variant="body2" color="text.secondary">Nobody yet</Typography> : d.pupils.map((p) => <EmergeChip key={p.student_id} label={p.name} tone="grey" />)}
              </Stack>
              {editable ? (
                <Button size="small" onClick={() => setEditing({ kind: 'duty', duty: d.duty })}>
                  Edit
                </Button>
              ) : null}
            </Stack>
          ))}
        </Stack>
      </Stack>
      {editing ? (
        <EditDialog
          sectionId={sectionId}
          label={data.label}
          editing={editing}
          pupils={data.pupils}
          current={editing.kind === 'duty' ? (data.duties.find((d) => d.duty === editing.duty)?.pupils ?? []) : [editing.kind === 'monitor' ? data.monitor : data.vice_monitor].filter((p): p is ClassPupil => p !== null)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}
