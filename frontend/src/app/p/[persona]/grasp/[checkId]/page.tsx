import * as React from 'react';
import Stack from '@mui/material/Stack';

import { GraspDashboard } from '@/components/grasp/grasp-dashboard';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { requireFeature } from '@/server/dal';

export default async function GraspCheckPage({ params }: { params: Promise<{ persona: string; checkId: string }> }): Promise<React.ReactElement> {
  const { persona: slug, checkId } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.grasp');
  return (
    <Stack spacing={1}>
      <RouteBreadcrumbs crumbs={crumbsFor(snapshot, slug, ['grasp'])} current="Check" />
      <GraspDashboard id={checkId} />
    </Stack>
  );
}
