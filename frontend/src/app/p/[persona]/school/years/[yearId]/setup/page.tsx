import * as React from 'react';
import Stack from '@mui/material/Stack';

import { YearSetup } from '@/components/school/years/year-setup';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { requireFeature } from '@/server/dal';

export default async function AcademicYearSetupPage({
  params,
}: {
  params: Promise<{ persona: string; yearId: string }>;
}): Promise<React.ReactElement> {
  const { persona: slug, yearId } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.school.years');

  return (
    <Stack spacing={1}>
      <RouteBreadcrumbs crumbs={crumbsFor(snapshot, slug, ['school', 'school-years'])} current="Setup" />
      <YearSetup yearId={yearId} personaSlug={slug} />
    </Stack>
  );
}
