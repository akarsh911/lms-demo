'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';

import { ClassResults } from '@/components/grades/class-results';
import type { WidgetProps } from '@/types/widget';

export function GradesResultsWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title={title}
        subheader="What each pupil's marks add up to in one subject, and what the total is still waiting on"
        slotProps={{ title: { variant: 'h4' } }}
      />
      <CardContent>
        <ClassResults />
      </CardContent>
    </Card>
  );
}
