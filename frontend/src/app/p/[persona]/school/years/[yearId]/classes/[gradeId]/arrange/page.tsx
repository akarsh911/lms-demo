import * as React from 'react';
import Stack from '@mui/material/Stack';

import { ArrangeBoard } from '@/components/school/classes/arrange-board';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { paths } from '@/paths';
import { requireFeature } from '@/server/dal';

// Placing one class's students of a named year, including a year still being set up.
export default async function YearArrangePage({ params }: { params: Promise<{ persona: string; yearId: string; gradeId: string }> }): Promise<React.ReactElement> {
  const { persona: slug, yearId, gradeId } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.school.years');
  const crumbs = [
    ...crumbsFor(snapshot, slug, ['school', 'school-years']),
    { key: 'year', title: 'Academic year', href: paths.personaSection(slug, `school/years/${yearId}?tab=classes`) },
    { key: 'class', title: 'Class', href: paths.personaSection(slug, `school/years/${yearId}/classes/${gradeId}`) },
  ];

  return (
    <Stack spacing={1}>
      <RouteBreadcrumbs crumbs={crumbs} current="Arrange" />
      <ArrangeBoard yearId={yearId} gradeId={gradeId} base={{ path: `school/years/${yearId}/classes` }} personaSlug={slug} />
    </Stack>
  );
}
