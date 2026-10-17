'use client';

import * as React from 'react';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useSetTest } from '@/hooks/mutation/use-exams';
import { useMdmSessions } from '@/hooks/query/use-mdm';
import { useMySubjects } from '@/hooks/query/use-my-subjects';
import { useBranches } from '@/hooks/query/use-school';

const KINDS = [
  { value: 'unit', label: 'Unit test', code: 'UT', marks: 25 },
  { value: 'sessional', label: 'Sessional', code: 'SES', marks: 40 },
  { value: 'class', label: 'Class test', code: 'CT', marks: 20 },
] as const;
type Kind = (typeof KINDS)[number]['value'];

// A teacher sets a test for the sections she teaches: it opens in her marks entry and on her pupils' results.
export function SetTestDialog({ today, onClose }: { today: string; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const set = useSetTest();
  const subjects = useMySubjects();
  const sessions = useMdmSessions();
  const branches = useBranches();
  const [kind, setKind] = React.useState<Kind>('unit');
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(new Set());
  const [date, setDate] = React.useState(today);
  const [max, setMax] = React.useState('25');
  const [named, setNamed] = React.useState('');
  const spec = KINDS.find((k) => k.value === kind) ?? KINDS[0];
  const chosen = (subjects.data ?? []).filter((s) => picked.has(s.offering_id));
  const subjectName = [...new Set(chosen.map((s) => s.subject))].join(' and ');
  const name = named || `${spec.label}${subjectName ? ` · ${subjectName}` : ''}`;
  const maxMarks = Number(max) || 0;
  const yearId = sessions.data?.rows.find((r) => r.is_current)?.id;
  const branchId = branches.data?.rows[0]?.id;

  const toggle = (id: string): void =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <FormDialog
      open
      title="Set a test"
      description="For the sections you teach. It appears in your marks entry and in your pupils' results as upcoming."
      submitLabel={chosen.length > 1 ? `Set for ${chosen.length} Sections` : 'Set Test'}
      pending={set.isPending}
      error={set.error}
      canSubmit={chosen.length > 0 && maxMarks > 0 && Boolean(date && yearId && branchId)}
      onClose={onClose}
      onSubmit={() =>
        set.mutate(
          {
            exam: {
              academic_session_id: yearId ?? '',
              branch_id: branchId ?? '',
              name,
              code: `${spec.code}-${date}-${chosen.map((s) => s.label).join('')}`,
              exam_type: 'unit_test',
              assessment_kind: 'evaluative',
              // Scheduled until its results are entered and published.
              status: 'draft',
              start_at: `${date}T03:30:00Z`,
              end_at: `${date}T11:30:00Z`,
            },
            papers: chosen.map((s) => ({ subject_offering_id: s.offering_id, maximum_marks: maxMarks, pass_marks: Math.round(maxMarks * 0.33) })),
          },
          {
            onSuccess: () => {
              notify(`${name} set for ${chosen.map((s) => s.label).join(', ')}`);
              onClose();
            },
          },
        )
      }
    >
      <ToggleButtonGroup
        exclusive
        size="small"
        value={kind}
        onChange={(_, v: Kind | null) => {
          if (!v) return;
          setKind(v);
          setMax(String(KINDS.find((k) => k.value === v)?.marks ?? 25));
        }}
        aria-label="Kind of test"
      >
        {KINDS.map((k) => (
          <ToggleButton key={k.value} value={k.value}>
            {k.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Stack spacing={0.5}>
        <Typography variant="subtitle2">Sections</Typography>
        <FormGroup sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          {(subjects.data ?? []).map((s) => (
            <FormControlLabel key={s.offering_id} control={<Checkbox checked={picked.has(s.offering_id)} onChange={() => toggle(s.offering_id)} />} label={`${s.subject} · ${s.label}`} />
          ))}
        </FormGroup>
      </Stack>
      <TextField label="Name" value={name} onChange={(e) => setNamed(e.target.value)} helperText="As pupils will see it" />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today } }} fullWidth />
        <TextField label="Maximum marks" type="number" value={max} onChange={(e) => setMax(e.target.value)} slotProps={{ htmlInput: { min: 1 } }} helperText={`Pass at ${Math.round(maxMarks * 0.33)}`} fullWidth />
      </Stack>
    </FormDialog>
  );
}
