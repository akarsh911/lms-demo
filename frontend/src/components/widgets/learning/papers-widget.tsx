'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';

import { BlueprintsBoard } from '@/components/papers/blueprints-board';
import { PaperGradeNote } from '@/components/papers/paper-grade';
import { PapersBoard } from '@/components/papers/papers-board';
import { SetterPapers } from '@/components/papers/setter-papers';
import { Divider } from '@/components/ui/layout';
import type { WidgetProps } from '@/types/widget';

function PaperPanel({
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

export function PapersWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <PaperPanel
      title={title}
      subheader="Every question paper the school holds, what is on it, and what produced it"
    >
      <Box sx={{ mb: 2 }}>
        <PaperGradeNote />
      </Box>
      <PapersBoard />
      <Box sx={{ my: 3 }}>
        <Divider />
      </Box>
      <SetterPapers />
    </PaperPanel>
  );
}

export function BlueprintsWidget({ title }: WidgetProps): React.ReactElement {
  return (
    <PaperPanel
      title={title}
      subheader="The patterns a paper is built against: sections, marks and what each part must satisfy"
    >
      <BlueprintsBoard />
    </PaperPanel>
  );
}
