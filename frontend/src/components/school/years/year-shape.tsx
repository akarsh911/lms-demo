'use client';

import * as React from 'react';
import Stack from '@mui/material/Stack';

import { Segmented } from '@/components/ui/segmented';
import { CALENDAR_PARTS, type CalendarPart } from '@/types/foundation';
import type { AcademicSession } from '@/types/mdm';

import { BellSchedulesTab } from './bell-schedules-tab';
import { HolidaysTab } from './holidays-tab';
import { WorkingDaysTab } from './working-days-tab';

const PART_LABEL: Readonly<Record<CalendarPart, string>> = {
  'working-days': 'Working Days',
  holidays: 'Holidays',
  'bell-schedules': 'Bell Schedules',
};

const OPTIONS = CALENDAR_PARTS.map((part) => ({ value: part, label: PART_LABEL[part] }));

// The shape of a year's week and day, set up once: the working days, the holidays and the bell schedule.
export function YearShape({
  year,
  part,
  onPart,
  onUnsavedChange,
}: {
  year: AcademicSession;
  part: CalendarPart;
  onPart: (next: CalendarPart) => void;
  onUnsavedChange: (unsaved: boolean) => void;
}): React.ReactElement {
  return (
    <Stack spacing={2}>
      <Segmented ariaLabel="Parts of the calendar" value={part} onChange={onPart} options={OPTIONS} />
      {part === 'working-days' ? <WorkingDaysTab year={year} onUnsavedChange={onUnsavedChange} /> : null}
      {part === 'holidays' ? <HolidaysTab year={year} /> : null}
      {part === 'bell-schedules' ? <BellSchedulesTab year={year} /> : null}
    </Stack>
  );
}
