'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import { DAY_NAMES } from '@/constants/school';
import { CLASH_RULE_LABELS, counterpartOf, explainClash, PROPOSAL_REF } from '@/lib/school/clash';
import type { NameBook } from './name-book';
import type { Clash, ClashParty } from '@/types/school';

/**
 * What collides with what.
 *
 * Every clash names both sides. A report that said only "teacher clash" would
 * send a timetabler hunting through six sections for the lesson they have to
 * move; naming the class, the subject and the room makes the fix obvious.
 *
 * An OVERRIDDEN clash is drawn here like any other, marked as accepted and with
 * the reason beside it. It is not filtered out and it is not greyed into
 * invisibility: a week full of accepted double-bookings has to look full of
 * them, or the next person to read it will think the timetable is clean.
 */
export function ClashList({
  clashes,
  names,
  ref_ = PROPOSAL_REF,
}: {
  clashes: readonly Clash[];
  names: NameBook;
  /** The reference the thing being placed was sent under, if there is one. */
  ref_?: string;
}): React.ReactElement {
  return (
    <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {clashes.map((clash, index) => (
        <Box
          component="li"
          key={`${clash.rule}-${clash.day_of_week}-${clash.period_id}-${index}`}
          sx={{
            border: '1px solid',
            borderColor: clash.overridden ? 'warning.light' : 'divider',
            borderRadius: 1.5,
            p: 1.5,
          }}
        >
          <Stack spacing={0.75}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <EmergeChip
                label={CLASH_RULE_LABELS[clash.rule]}
                tone={clash.overridden ? 'amber' : clash.overridable ? 'orange' : 'red'}
              />
              {clash.overridden ? <EmergeChip label="Accepted" tone="amber" /> : null}
              {!clash.overridable ? (
                <EmergeChip label="Cannot be overridden" tone="red" />
              ) : null}
              <Typography variant="body2" color="text.secondary">
                {clash.day_of_week ? DAY_NAMES[clash.day_of_week] : ''} ·{' '}
                {names.period(clash.period_id)}
              </Typography>
            </Stack>

            <Typography variant="body2">{explainClash(clash)}</Typography>

            <Typography variant="body2" color="text.secondary">
              Already there: {describeParty(counterpartOf(clash, ref_), names)}
            </Typography>

            {clash.override?.reason ? (
              <Typography variant="body2" color="text.secondary">
                Accepted because: “{clash.override.reason}”
              </Typography>
            ) : null}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

function describeParty(party: ClashParty, names: NameBook): string {
  const parts = [names.section(party.section_id), names.offering(party.subject_offering_id)];
  if (party.teacher_id) parts.push(names.teacher(party.teacher_id));
  if (party.room_id) parts.push(names.room(party.room_id));
  return parts.join(' · ');
}
