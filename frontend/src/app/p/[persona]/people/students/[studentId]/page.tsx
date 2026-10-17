import * as React from 'react';
import Stack from '@mui/material/Stack';

import { StudentDetail } from '@/components/people/student-detail';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { peopleTrail } from '@/lib/people/crumbs';
import { requireFeature } from '@/server/dal';

export default async function StudentPage({
  params,
}: {
  params: Promise<{ persona: string; studentId: string }>;
}): Promise<React.ReactElement> {
  const { persona: slug, studentId } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.home.people');

  return (
    <Stack spacing={3}>
      <RouteBreadcrumbs crumbs={peopleTrail(slug, snapshot, 'people-students')} current="Student" />
      <StudentDetail studentId={studentId} personaSlug={slug} />
    </Stack>
  );
}
