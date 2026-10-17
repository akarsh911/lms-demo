'use client';

import * as React from 'react';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useApplyLeave } from '@/hooks/mutation/use-leave';
import { LEAVE_KINDS, type LeaveBalance, type LeaveKind } from '@/types/leave';

export const KIND_LABEL: Readonly<Record<LeaveKind, string>> = { casual: 'Casual', sick: 'Sick', earned: 'Earned', duty: 'On duty' };

// Asking for days away: the kind, the dates, a half day where it is one day, and the reason the office will read.
export function ApplyLeaveDialog({ today, balance, onClose }: { today: string; balance: readonly LeaveBalance[]; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const apply = useApplyLeave();
  const [kind, setKind] = React.useState<LeaveKind>('casual');
  const [from, setFrom] = React.useState(today);
  const [to, setTo] = React.useState(today);
  const [half, setHalf] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const left = balance.find((b) => b.kind === kind);
  const single = from === to;

  return (
    <FormDialog
      open
      title="Apply for leave"
      description="The office decides it in Actions; you will see the answer here and on your timetable."
      submitLabel="Send Request"
      pending={apply.isPending}
      error={apply.error}
      canSubmit={Boolean(from && to && to >= from && reason.trim().length >= 4)}
      onClose={onClose}
      onSubmit={() =>
        apply.mutate(
          { kind, from, to, half_day: half && single, reason },
          {
            onSuccess: (l) => {
              notify(`Leave requested for ${l.days} ${l.days === 1 ? 'day' : 'days'}`);
              onClose();
            },
          },
        )
      }
    >
      <Stack spacing={1}>
        <ToggleButtonGroup exclusive size="small" value={kind} onChange={(_, v: LeaveKind | null) => v && setKind(v)} aria-label="Kind of leave">
          {LEAVE_KINDS.map((k) => (
            <ToggleButton key={k} value={k}>
              {KIND_LABEL[k]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Typography variant="body2" color="text.secondary">
          {left ? `${left.allowed - left.used} of ${left.allowed} ${KIND_LABEL[kind].toLowerCase()} days left this year` : 'On duty is the school’s business and does not count against your leave.'}
        </Typography>
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="First day"
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            if (e.target.value > to) setTo(e.target.value);
          }}
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
        />
        <TextField label="Last day" type="date" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: from } }} fullWidth />
      </Stack>
      {single ? <FormControlLabel control={<Switch checked={half} onChange={(e) => setHalf(e.target.checked)} />} label="Half day only" /> : null}
      <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} multiline minRows={2} required helperText="What the office reads when it decides" />
    </FormDialog>
  );
}
