'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { AlertTriangle } from 'lucide-react';

import { DAY_NAMES, DAY_SHORT } from '@/constants/school';
import { cellKey, type CellKey } from '@/lib/school/grid';
import { minuteSpan } from '@/lib/school/time';
import type { NameBook } from './name-book';
import type { BellSchedulePeriod, Period, TimetableSlot } from '@/types/school';

/**
 * One section's week.
 *
 * A VIEW over the timetable, not a timetable of its own: the rows come from the
 * period scheme, the times from the bell schedule beside it, and the slots are
 * the whole school's slots filtered to this section. That distinction is what
 * makes a teacher booked in two sections answerable at all — the clash report
 * reads the same unfiltered set.
 *
 * Periods run DOWN and days run ACROSS, which is the way a printed school
 * timetable is read. Break and assembly rows are drawn muted but are not
 * hidden: a break a lesson could be placed in is a decision, not an absence.
 */
export function TimetableGrid({
  days,
  periods,
  bells,
  slotsByCell,
  sectionId,
  names,
  onPick,
}: {
  days: readonly number[];
  periods: readonly Period[];
  bells: Map<string, BellSchedulePeriod>;
  slotsByCell: Map<CellKey, TimetableSlot[]>;
  sectionId: string;
  names: NameBook;
  onPick: (day: number, period: Period, slot: TimetableSlot | undefined) => void;
}): React.ReactElement {
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box
        component="table"
        sx={{
          borderCollapse: 'separate',
          borderSpacing: 4,
          width: '100%',
          minWidth: 120 * days.length + 160,
        }}
      >
        <Box component="thead">
          <Box component="tr">
            <Box component="th" sx={{ width: 150, textAlign: 'left' }}>
              <Typography variant="caption" color="text.secondary">
                Period
              </Typography>
            </Box>
            {days.map((day) => (
              <Box component="th" key={day} scope="col" sx={{ textAlign: 'left' }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
                    {DAY_NAMES[day]}
                  </Box>
                  <Box component="span" sx={{ display: { xs: 'inline', md: 'none' } }}>
                    {DAY_SHORT[day]}
                  </Box>
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        <Box component="tbody">
          {periods.map((period) => {
            const bell = bells.get(period.id);
            const span = minuteSpan(bell?.start_minute, bell?.end_minute);
            const teaching = (period.kind ?? 'teaching') === 'teaching';

            return (
              <Box component="tr" key={period.id}>
                <Box component="th" scope="row" sx={{ textAlign: 'left', verticalAlign: 'top' }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {period.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {span ?? 'No time in this bell'}
                  </Typography>
                </Box>

                {days.map((day) => {
                  const here = slotsByCell.get(cellKey(sectionId, day, period.id)) ?? [];
                  return (
                    <Box component="td" key={day} sx={{ verticalAlign: 'top' }}>
                      <Stack spacing={0.5}>
                        {here.map((slot) => (
                          <SlotCell
                            key={slot.id}
                            slot={slot}
                            names={names}
                            onClick={() => onPick(day, period, slot)}
                          />
                        ))}
                        <EmptyCell
                          muted={!teaching}
                          label={here.length > 0 ? 'Add another' : 'Free'}
                          onClick={() => onPick(day, period, undefined)}
                          describedBy={`${DAY_NAMES[day]}, ${period.name}`}
                        />
                      </Stack>
                    </Box>
                  );
                })}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

function SlotCell({
  slot,
  names,
  onClick,
}: {
  slot: TimetableSlot;
  names: NameBook;
  onClick: () => void;
}): React.ReactElement {
  const title = slot.subject_offering_id
    ? names.offering(slot.subject_offering_id)
    : (slot.label ?? 'Lesson');

  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: slot.clash_override ? 'warning.main' : 'divider',
        backgroundColor: slot.clash_override ? 'warning.light' : 'background.paper',
        p: 1,
      }}
    >
      <Stack spacing={0.25}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          {slot.clash_override ? (
            <AlertTriangle size={13} aria-label="Saved over a clash" />
          ) : null}
          <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {title}
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
          {slot.teacher_id ? names.teacher(slot.teacher_id) : 'No teacher'}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
          {slot.room_id ? names.room(slot.room_id) : 'No room'}
        </Typography>
      </Stack>
    </ButtonBase>
  );
}

function EmptyCell({
  muted,
  label,
  onClick,
  describedBy,
}: {
  muted: boolean;
  label: string;
  onClick: () => void;
  describedBy: string;
}): React.ReactElement {
  return (
    <ButtonBase
      onClick={onClick}
      aria-label={`${label} — ${describedBy}`}
      sx={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        borderRadius: 1.5,
        border: '1px dashed',
        borderColor: 'divider',
        color: 'text.disabled',
        opacity: muted ? 0.5 : 1,
        px: 1,
        py: 0.75,
      }}
    >
      <Typography variant="caption">{label}</Typography>
    </ButtonBase>
  );
}
