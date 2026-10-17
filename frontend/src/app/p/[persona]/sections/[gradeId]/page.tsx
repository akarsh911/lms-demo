import * as React from 'react';
import Stack from '@mui/material/Stack';

import { ClassWorkspace } from '@/components/school/classes/class-workspace';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { requireFeature } from '@/server/dal';

// A class of the current year, reached from the sidebar.
export default async function CurrentClassPage({ params }: { params: Promise<{ persona: string; gradeId: string }> }): Promise<React.ReactElement> {
  const { persona: slug, gradeId } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.school.sections');

  return (
    <Stack spacing={1}>
      <RouteBreadcrumbs crumbs={crumbsFor(snapshot, slug, ['sections'])} current="Class" />
      <ClassWorkspace gradeId={gradeId} base={{ path: 'sections' }} personaSlug={slug} />
    </Stack>
  );
}
