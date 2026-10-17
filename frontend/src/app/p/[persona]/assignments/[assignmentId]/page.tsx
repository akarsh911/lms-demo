import * as React from 'react';
import Stack from '@mui/material/Stack';

import { HomeworkDetailView } from '@/components/homework/homework-detail';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { requireFeature } from '@/server/dal';

// One assignment: submissions, marking, the brief and the results.
export default async function AssignmentPage({ params }: { params: Promise<{ persona: string; assignmentId: string }> }): Promise<React.ReactElement> {
  const { persona: slug, assignmentId } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.assignments');

  return (
    <Stack spacing={1}>
      <RouteBreadcrumbs crumbs={crumbsFor(snapshot, slug, ['assignments'])} current="Assignment" />
      <HomeworkDetailView id={assignmentId} personaSlug={slug} />
    </Stack>
  );
}
