import * as React from 'react';
import Stack from '@mui/material/Stack';

import { TeacherDetail } from '@/components/people/teacher-detail';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { peopleTrail } from '@/lib/people/crumbs';
import { requireFeature } from '@/server/dal';

export default async function TeacherPage({
  params,
}: {
  params: Promise<{ persona: string; teacherId: string }>;
}): Promise<React.ReactElement> {
  const { persona: slug, teacherId } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.home.people');

  return (
    <Stack spacing={3}>
      <RouteBreadcrumbs crumbs={peopleTrail(slug, snapshot, 'people-teachers')} current="Teacher" />
      <TeacherDetail teacherId={teacherId} personaSlug={slug} />
    </Stack>
  );
}
