import * as React from 'react';
import Stack from '@mui/material/Stack';

import { MySubjectPage } from '@/components/subjects/my-subject-page';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { requireFeature } from '@/server/dal';

// One of the caller's subjects: its posts, assignments, content and curriculum.
export default async function MySubjectRoute({ params }: { params: Promise<{ persona: string; offeringId: string }> }): Promise<React.ReactElement> {
  const { persona: slug, offeringId } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.subjects');

  return (
    <Stack spacing={1}>
      <RouteBreadcrumbs crumbs={crumbsFor(snapshot, slug, ['subjects'])} current="Subject" />
      <MySubjectPage offeringId={offeringId} personaSlug={slug} />
    </Stack>
  );
}
