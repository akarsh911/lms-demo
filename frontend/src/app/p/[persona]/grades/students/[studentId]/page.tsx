import * as React from 'react';
import Stack from '@mui/material/Stack';

import { GradeExplorer } from '@/components/grades/grade-explorer';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { requireFeature } from '@/server/dal';

export default async function StudentGradesRoute({ params }: { params: Promise<{ persona: string; studentId: string }> }): Promise<React.ReactElement> {
  const { persona: slug, studentId } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.grades');

  return (
    <Stack spacing={1}>
      <RouteBreadcrumbs crumbs={crumbsFor(snapshot, slug, ['grades'])} current="Student" />
      <GradeExplorer studentId={studentId} personaSlug={slug} />
    </Stack>
  );
}
