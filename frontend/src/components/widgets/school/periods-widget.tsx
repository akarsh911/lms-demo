'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';

import { SchemesBoard } from '@/components/school/schemes-board';
import type { WidgetProps } from '@/types/widget';

/**
 * Periods and bells.
 *
 * Every pattern of the day on the campus, on the `emerge.school.periods` page.
 * A pattern opens to the two things that make it up — its periods, which carry
 * no times, and the bell schedules that give them times — and to the grades
 * that run it.
 */
export function SchoolPeriodsWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title={title}
        subheader="Periods carry no times; a bell schedule gives them times"
        slotProps={{ title: { variant: 'h4' } }}
      />
      <CardContent>
        <SchemesBoard />
      </CardContent>
    </Card>
  );
}
