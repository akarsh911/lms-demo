import * as React from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { GraspComposer } from '@/components/grasp/grasp-composer';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { requireFeature } from '@/server/dal';

export default async function NewGraspPage({ params }: { params: Promise<{ persona: string }> }): Promise<React.ReactElement> {
  const { persona: slug } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.grasp');
  return (
    <Stack spacing={2}>
      <div>
        <RouteBreadcrumbs crumbs={crumbsFor(snapshot, slug, ['grasp'])} current="New check" />
        <Typography variant="h2" component="h1">
          New GRASP check
        </Typography>
      </div>
      <GraspComposer personaSlug={slug} />
    </Stack>
  );
}
