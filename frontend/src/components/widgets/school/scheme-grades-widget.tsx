'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';

import { GradeCoverageBoard } from '@/components/school/grade-coverage-board';
import type { WidgetProps } from '@/types/widget';

export function SchoolSchemeGradesWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title={title}
        subheader="A grade runs one pattern of the day; a second group of grades needs a second pattern"
        slotProps={{ title: { variant: 'h4' } }}
      />
      <CardContent>
        <GradeCoverageBoard />
      </CardContent>
    </Card>
  );
}
