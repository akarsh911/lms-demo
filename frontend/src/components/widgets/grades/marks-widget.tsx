'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';

import { MarksEntry } from '@/components/grades/marks-entry';
import type { WidgetProps } from '@/types/widget';

export function GradesMarksWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title={title}
        subheader="One paper, one class, and what each pupil scored on it"
        slotProps={{ title: { variant: 'h4' } }}
      />
      <CardContent>
        <MarksEntry />
      </CardContent>
    </Card>
  );
}
