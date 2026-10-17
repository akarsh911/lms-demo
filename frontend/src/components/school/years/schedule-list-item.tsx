'use client';

import * as React from 'react';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';

import { EmergeChip } from '@/components/ui/chip';
import { useBellPeriods } from '@/hooks/query/use-school';
import { daySpan, slotsOf } from '@/lib/school/bell-slots';
import type { BellSchedule, Period } from '@/types/school';

// One schedule in the picker, with how long its day is. It reads its own times, so the list needs no join.
export function ScheduleListItem({
  bell,
  periods,
  selected,
  onSelect,
}: {
  bell: BellSchedule;
  periods: readonly Period[];
  selected: boolean;
  onSelect: () => void;
}): React.ReactElement {
  const times = useBellPeriods(bell.id);
  const slots = slotsOf(periods, times.data?.rows ?? []);
  const taught = slots.filter((slot) => slot.kind === 'teaching').length;

  return (
    <ListItemButton selected={selected} onClick={onSelect} sx={{ borderRadius: 2, alignItems: 'center', gap: 1 }}>
      <ListItemText
        primary={bell.name ?? bell.code}
        secondary={times.isPending ? 'Reading times' : `${taught} ${taught === 1 ? 'period' : 'periods'} · ${daySpan(slots) ?? 'no slots yet'}`}
        slotProps={{ primary: { variant: 'subtitle1' }, secondary: { variant: 'body2', sx: { color: selected ? 'inherit' : 'text.secondary', opacity: selected ? 0.72 : 1 } } }}
      />
      {bell.is_default ? <EmergeChip label="Default" tone="green" /> : null}
    </ListItemButton>
  );
}
