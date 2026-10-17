'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';

import { CalendarBoard } from '@/components/school/calendar-board';
import type { WidgetProps } from '@/types/widget';

/**
 * The school year.
 *
 * A panel on the `emerge.school.calendar` page, which is where a principal
 * decides which dates the school is open. Wide rather than a card: it is a
 * month of dates with controls on each, and half a row of that is a list
 * nobody can read.
 */
export function SchoolCalendarWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title={title}
        subheader="A date is in session only when a record says so"
        slotProps={{ title: { variant: 'h4' } }}
      />
      <CardContent>
        <CalendarBoard />
      </CardContent>
    </Card>
  );
}
