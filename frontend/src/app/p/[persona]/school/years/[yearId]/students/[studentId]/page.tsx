import * as React from 'react';
import Stack from '@mui/material/Stack';

import { StudentDetail } from '@/components/people/student-detail';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { paths } from '@/paths';
import { requireFeature } from '@/server/dal';

// The same record People shows, reached from the year, with the examinations opened on that year.
export default async function YearStudentPage({
  params,
}: {
  params: Promise<{ persona: string; yearId: string; studentId: string }>;
}): Promise<React.ReactElement> {
  const { persona: slug, yearId, studentId } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.school.years');
  const crumbs = [...crumbsFor(snapshot, slug, ['school', 'school-years']), { key: 'year', title: 'Academic year', href: paths.personaSection(slug, `school/years/${yearId}?tab=students`) }];

  return (
    <Stack spacing={1}>
      <RouteBreadcrumbs crumbs={crumbs} current="Student" />
      <StudentDetail studentId={studentId} personaSlug={slug} gradesSession={yearId} />
    </Stack>
  );
}
