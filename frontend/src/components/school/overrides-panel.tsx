'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import { DAY_NAMES } from '@/constants/school';
import { usePerson } from '@/hooks/query/use-school';
import { isDenial } from '@/lib/api-failure';
import { nameOf } from '@/lib/core/roster';
import type { ApiError } from '@/services/api';
import type { NameBook } from './name-book';
import type { TimetableSlot } from '@/types/school';

/**
 * Every double-booking this timetable is knowingly carrying.
 *
 * An override does not make a clash go away: the report still counts it, and
 * the slot keeps the reason, the person and the moment. So a week full of
 * overrides LOOKS full of them, here, in one list, rather than as a scatter of
 * badges somebody has to hunt for. The alternative — hiding an accepted clash —
 * turns a deliberate compromise into an invisible one, and the person who
 * inherits the timetable has no way to know it was ever decided.
 *
 * This reads the slot rows rather than the clash report, because the rows are
 * what carry `clash_override_reason`, `clash_overridden_by` and
 * `clash_overridden_at`. The report says a clash is overridden; only the row
 * says by whom and why.
 */
export function OverridesPanel({
  slots,
  names,
}: {
  slots: readonly TimetableSlot[];
  names: NameBook;
}): React.ReactElement {
  const overridden = slots.filter((slot) => slot.clash_override);

  if (overridden.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Nothing in this timetable has been saved over a clash.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {overridden.map((slot) => (
        <OverrideRow key={slot.id} slot={slot} names={names} />
      ))}
    </Stack>
  );
}

function OverrideRow({
  slot,
  names,
}: {
  slot: TimetableSlot;
  names: NameBook;
}): React.ReactElement {
  const author = usePerson(slot.clash_overridden_by);
  const person = author.data ? nameOf(author.data) : null;

  const accepted = slot.clash_override_json ?? [];

  return (
    <Box
      component="li"
      sx={{
        border: '1px solid',
        borderColor: 'warning.light',
        borderRadius: 1.5,
        p: 1.5,
      }}
    >
      <Stack spacing={0.5}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <EmergeChip label="Override" tone="amber" />
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {names.section(slot.section_id)} ·{' '}
            {slot.subject_offering_id
              ? names.offering(slot.subject_offering_id)
              : (slot.label ?? 'Lesson')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {slot.day_of_week ? DAY_NAMES[slot.day_of_week] : ''} ·{' '}
            {names.period(slot.period_id)}
          </Typography>
        </Stack>

        <Typography variant="body2">
          “{slot.clash_override_reason ?? 'No reason recorded'}”
        </Typography>

        <Typography variant="body2" color="text.secondary">
          Accepted by {person ?? whoLabel(slot, author.isPending, author.error)}
          {slot.clash_overridden_at ? ` on ${when(slot.clash_overridden_at)}` : ''}
        </Typography>

        {accepted.length > 0 ? (
          <Typography variant="caption" color="text.secondary">
            {accepted.length} {accepted.length === 1 ? 'clash' : 'clashes'} accepted:{' '}
            {accepted.map((entry) => entry.rule ?? 'clash').join(', ')}
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}

/**
 * Who accepted it, when the person cannot be named.
 *
 * `/persons/{id}` is readable school-wide for an administrator, but a caller
 * with a narrower field policy gets a projected row with no name on it, and one
 * with no reach at all gets a 404. Both are said out loud rather than drawn as
 * a blank, because "accepted by " followed by nothing reads as a bug.
 */
function whoLabel(slot: TimetableSlot, pending: boolean, error: ApiError | null): string {
  if (!slot.clash_overridden_by) return 'somebody the record does not name';
  if (pending) return '…';
  if (error) {
    return isDenial(error) || error.status === 404
      ? 'somebody this account cannot look up'
      : 'somebody whose name could not be looked up';
  }
  return 'somebody whose name is withheld';
}

function when(value: string): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return value;
  return at.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
