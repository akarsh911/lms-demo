import * as React from 'react';
import Stack from '@mui/material/Stack';

import { SectionWorkspace } from '@/components/school/classes/section-workspace';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { paths } from '@/paths';
import { requireFeature } from '@/server/dal';

// A section of a named year.
export default async function YearSectionPage({ params }: { params: Promise<{ persona: string; yearId: string; gradeId: string; sectionId: string }> }): Promise<React.ReactElement> {
  const { persona: slug, yearId, gradeId, sectionId } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.school.years');
  const crumbs = [
    ...crumbsFor(snapshot, slug, ['school', 'school-years']),
    { key: 'year', title: 'Academic year', href: paths.personaSection(slug, `school/years/${yearId}?tab=classes`) },
    { key: 'class', title: 'Class', href: paths.personaSection(slug, `school/years/${yearId}/classes/${gradeId}?tab=sections`) },
  ];

  return (
    <Stack spacing={1}>
      <RouteBreadcrumbs crumbs={crumbs} current="Section" />
      <SectionWorkspace yearId={yearId} gradeId={gradeId} sectionId={sectionId} base={{ path: `school/years/${yearId}/classes` }} personaSlug={slug} />
    </Stack>
  );
}
