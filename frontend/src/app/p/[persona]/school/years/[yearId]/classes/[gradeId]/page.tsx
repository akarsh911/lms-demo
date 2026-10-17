import * as React from 'react';
import Stack from '@mui/material/Stack';

import { ClassWorkspace } from '@/components/school/classes/class-workspace';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { paths } from '@/paths';
import { requireFeature } from '@/server/dal';

// A class of a named year: being set up, running, or closed and read only.
export default async function YearClassPage({ params }: { params: Promise<{ persona: string; yearId: string; gradeId: string }> }): Promise<React.ReactElement> {
  const { persona: slug, yearId, gradeId } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.school.years');
  const crumbs = [...crumbsFor(snapshot, slug, ['school', 'school-years']), { key: 'year', title: 'Academic year', href: paths.personaSection(slug, `school/years/${yearId}?tab=classes`) }];

  return (
    <Stack spacing={1}>
      <RouteBreadcrumbs crumbs={crumbs} current="Class" />
      <ClassWorkspace yearId={yearId} gradeId={gradeId} base={{ path: `school/years/${yearId}/classes` }} personaSlug={slug} />
    </Stack>
  );
}
