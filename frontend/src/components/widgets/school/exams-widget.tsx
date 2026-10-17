'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';

import { ExamPapers } from '@/components/school/exam-papers';
import { ExamsBoard } from '@/components/school/exams-board';
import type { WidgetProps } from '@/types/widget';

export function SchoolExamsWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title={title}
        subheader="Every assessment this year, and which of them reach a report card"
        slotProps={{ title: { variant: 'h4' } }}
      />
      <CardContent>
        <ExamsBoard />
      </CardContent>
    </Card>
  );
}

export function SchoolExamPapersWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title={title}
        subheader="What each subject is marked out of, and when each class sits it"
        slotProps={{ title: { variant: 'h4' } }}
      />
      <CardContent>
        <ExamPapers />
      </CardContent>
    </Card>
  );
}
