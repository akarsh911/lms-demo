'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';

import { TimetableBuilder } from '@/components/school/timetable-builder';
import type { WidgetProps } from '@/types/widget';

/**
 * The timetable builder.
 *
 * Immersive: a week for one class, with a clash report, a requirements panel
 * and a list of accepted double-bookings under it, is a workspace rather than
 * a readout, and one in a 400px card is unusable.
 */
export function SchoolTimetableWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardHeader
        title={title}
        subheader="One timetable carries every class's week"
        slotProps={{ title: { variant: 'h4' } }}
      />
      <CardContent sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <TimetableBuilder />
      </CardContent>
    </Card>
  );
}
