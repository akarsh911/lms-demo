'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';

import { AcademicSessionsBoard } from './academic-sessions-board';
import { BranchesBoard } from './branches-board';
import { GradeLevelsBoard } from './grade-levels-board';
import { HousesBoard } from './houses-board';
import { OfferingsBoard } from './offerings-board';
import { SectionsBoard } from './sections-board';
import { SubjectGroupsBoard } from './subject-groups-board';
import { SubjectsBoard } from './subjects-board';
import type { WidgetProps } from '@/types/widget';

function MdmPanel({
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

export function SchoolBranchesWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <MdmPanel title={title} subheader="Each campus, with its own rooms, calendar and classes">
      <BranchesBoard />
    </MdmPanel>
  );
}

export function SchoolSessionsWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <MdmPanel title={title} subheader="The years the school runs, and which one is current">
      <AcademicSessionsBoard />
    </MdmPanel>
  );
}

export function SchoolGradeLevelsWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <MdmPanel title={title} subheader="The ladder a pupil is promoted up, in order">
      <GradeLevelsBoard />
    </MdmPanel>
  );
}

export function SchoolHousesWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <MdmPanel title={title} subheader="The houses a pupil can be put in">
      <HousesBoard />
    </MdmPanel>
  );
}

export function SchoolSectionsWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <MdmPanel
      title={title}
      subheader="Every class in this branch: its capacity, its home room and its class teacher"
    >
      <SectionsBoard />
    </MdmPanel>
  );
}

export function SchoolSubjectsWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <MdmPanel title={title} subheader="The school's catalogue, before any class is given one">
      <SubjectsBoard />
    </MdmPanel>
  );
}

export function SchoolSubjectGroupsWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <MdmPanel title={title} subheader="A school-wide grouping an offering can be filed under">
      <SubjectGroupsBoard />
    </MdmPanel>
  );
}

export function SchoolOfferingsWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <MdmPanel
      title={title}
      subheader="What each class is taught, and how much of the week it is owed"
    >
      <OfferingsBoard />
    </MdmPanel>
  );
}
