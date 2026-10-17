import * as React from 'react';
import Stack from '@mui/material/Stack';

import { StudentDetail } from '@/components/people/student-detail';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { requireFeature } from '@/server/dal';

// One pupil from the classes a teacher teaches: their record, attendance and the way into their grades.
export default async function MyStudentPage({ params }: { params: Promise<{ persona: string; studentId: string }> }): Promise<React.ReactElement> {
  const { persona: slug, studentId } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.students');

  return (
    <Stack spacing={3}>
      <RouteBreadcrumbs crumbs={crumbsFor(snapshot, slug, ['my-students'])} current="Student" />
      <StudentDetail studentId={studentId} personaSlug={slug} listPath="students" />
    </Stack>
  );
}
