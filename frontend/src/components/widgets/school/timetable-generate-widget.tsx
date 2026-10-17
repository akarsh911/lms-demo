'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';

import { TimetableGenerate } from '@/components/school/timetable-generate';
import type { WidgetProps } from '@/types/widget';

export function SchoolTimetableGenerateWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title={title}
        subheader="A solver places every class's week, and says what it could not do"
        slotProps={{ title: { variant: 'h4' } }}
      />
      <CardContent>
        <TimetableGenerate />
      </CardContent>
    </Card>
  );
}
