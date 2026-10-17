'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';

import { RosterBoard } from './roster-board';
import { TeachingBoard } from './teaching-board';
import type { WidgetProps } from '@/types/widget';

function RosteringPanel({
  title,
  subheader,
  children,
}: {
  title: React.ReactNode;
  subheader: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title={title}
        subheader={subheader}
        slotProps={{ title: { variant: 'h4' } }}
      />
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function SchoolRosterWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <RosteringPanel
      title={title}
      subheader="Who is in this class: enrol a pupil, set a roll number, move one to another class or withdraw one"
    >
      <RosterBoard />
    </RosteringPanel>
  );
}

export function SchoolTeachingWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <RosteringPanel
      title={title}
      subheader="Who teaches this class, and which of its subjects each of them is answerable for"
    >
      <TeachingBoard />
    </RosteringPanel>
  );
}
