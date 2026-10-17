'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';

import { ResultSchemesBoard } from '@/components/school/results/result-schemes-board';
import type { WidgetProps } from '@/types/widget';

export function SchoolResultSchemesWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title={title}
        subheader="What a subject's marks are made of, and whether the parts add up"
        slotProps={{ title: { variant: 'h4' } }}
      />
      <CardContent>
        <ResultSchemesBoard />
      </CardContent>
    </Card>
  );
}
