'use client';

import * as React from 'react';
import FormHelperText from '@mui/material/FormHelperText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { PERIOD_KIND_LABELS } from '@/constants/school';
import { useSaveBellSlot } from '@/hooks/mutation/use-foundation';
import { clockOf, minutesOf } from '@/lib/dates';
import { nextSequence, periodCode, reusablePeriod, slotClash, type BellSlot } from '@/lib/school/bell-slots';
import { PERIOD_KINDS, type Period, type PeriodKind } from '@/types/school';

export function BellSlotDialog({
  schemeId,
  bellId,
  scheduleName,
  slot,
  slots,
  periods,
  onClose,
}: {
  schemeId: string;
  bellId: string;
  scheduleName: string;
  slot?: BellSlot;
  slots: readonly BellSlot[];
  periods: readonly Period[];
  onClose: () => void;
}): React.ReactElement {
  const last = slots[slots.length - 1];
  const [label, setLabel] = React.useState(slot?.label ?? '');
  const [kind, setKind] = React.useState<PeriodKind>(slot?.kind ?? 'teaching');
  // A new slot starts where the day currently ends, which is where one is nearly always added.
  const [start, setStart] = React.useState(slot ? clockOf(slot.start) : last ? clockOf(last.end) : '08:00');
  const [end, setEnd] = React.useState(slot ? clockOf(slot.end) : last ? clockOf(Math.min(last.end + 40, 23 * 60 + 59)) : '08:40');
  const mutation = useSaveBellSlot(schemeId, bellId);
  const notify = useToast();

  const from = minutesOf(start);
  const to = minutesOf(end);
  const clash = from !== null && to !== null && to > from ? slotClash(slots, from, to, slot?.bellPeriodId) : undefined;
  const problem =
    from === null || to === null
      ? 'Enter both times.'
      : to <= from
        ? 'A slot has to end after it starts.'
        : clash
          ? `This overlaps ${clash.label} (${clockOf(clash.start)} to ${clockOf(clash.end)}).`
          : null;

  const submit = (): void => {
    if (from === null || to === null) return;
    const adopted = slot ? undefined : reusablePeriod(periods, slots, label);
    mutation.mutate(
      {
        periodId: slot?.periodId ?? adopted?.id,
        bellPeriodId: slot?.bellPeriodId,
        label: label.trim(),
        kind,
        start: from,
        end: to,
        code: periodCode(periods, label),
        sequence: nextSequence(periods),
      },
      {
        onSuccess: () => {
          notify('Bell schedule updated');
          onClose();
        },
      },
    );
  };

  return (
    <FormDialog
      open
      title={slot ? 'Edit slot' : 'Add slot'}
      description={`${scheduleName} schedule. Slots are kept in time order.`}
      submitLabel={slot ? 'Save changes' : 'Add Slot'}
      pending={mutation.isPending}
      error={mutation.error}
      canSubmit={label.trim() !== '' && problem === null}
      onClose={onClose}
      onSubmit={submit}
    >
      <TextField label="Label" required autoFocus placeholder="Period 1" value={label} onChange={(event) => setLabel(event.target.value)} disabled={mutation.isPending} fullWidth />
      <TextField select label="Type" value={kind} onChange={(event) => setKind(event.target.value as PeriodKind)} disabled={mutation.isPending} fullWidth>
        {PERIOD_KINDS.map((option) => (
          <MenuItem key={option} value={option}>
            {option === 'teaching' ? 'Teaching Period' : PERIOD_KIND_LABELS[option]}
          </MenuItem>
        ))}
      </TextField>
      <Stack direction="row" spacing={2}>
        <TextField label="Start" type="time" required value={start} onChange={(event) => setStart(event.target.value)} disabled={mutation.isPending} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="End" type="time" required value={end} onChange={(event) => setEnd(event.target.value)} error={problem !== null} disabled={mutation.isPending} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
      </Stack>
      {problem ? <FormHelperText error role="alert">{problem}</FormHelperText> : null}
    </FormDialog>
  );
}
