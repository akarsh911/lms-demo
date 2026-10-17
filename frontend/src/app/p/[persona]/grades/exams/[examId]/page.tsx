import * as React from 'react';
import Stack from '@mui/material/Stack';

import { ExamDetail } from '@/components/grades/exam-detail';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { requireFeature } from '@/server/dal';

export default async function ExamPage({ params }: { params: Promise<{ persona: string; examId: string }> }): Promise<React.ReactElement> {
  const { persona: slug, examId } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.grades');

  return (
    <Stack spacing={1}>
      <RouteBreadcrumbs crumbs={crumbsFor(snapshot, slug, ['grades'])} current="Examination" />
      <ExamDetail examId={examId} personaSlug={slug} />
    </Stack>
  );
}
