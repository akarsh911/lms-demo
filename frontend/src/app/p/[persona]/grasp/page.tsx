import * as React from 'react';
import Stack from '@mui/material/Stack';

import { GraspHome } from '@/components/grasp/grasp-home';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { requireFeature } from '@/server/dal';

export default async function GraspPage({ params }: { params: Promise<{ persona: string }> }): Promise<React.ReactElement> {
  const { persona: slug } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.grasp');
  return (
    <Stack spacing={1}>
      <RouteBreadcrumbs crumbs={crumbsFor(snapshot, slug, [])} current="GRASP" />
      <GraspHome personaSlug={slug} />
    </Stack>
  );
}
