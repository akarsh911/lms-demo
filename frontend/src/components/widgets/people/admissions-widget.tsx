'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';

import { AdmissionsBoard } from '@/components/people/admissions/admissions-board';
import type { WidgetProps } from '@/types/widget';

export function AdmissionsWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title={title}
        subheader="Create a pupil or a member of teaching staff, with the sign-in they use to reach Emerge"
        slotProps={{ title: { variant: 'h4' } }}
      />
      <CardContent>
        <AdmissionsBoard />
      </CardContent>
    </Card>
  );
}
