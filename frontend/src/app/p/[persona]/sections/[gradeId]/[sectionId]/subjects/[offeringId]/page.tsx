import * as React from 'react';
import Stack from '@mui/material/Stack';

import { SubjectPage } from '@/components/school/classes/subject-page';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { paths } from '@/paths';
import { requireFeature } from '@/server/dal';

// One subject of one section: its posts, content, assignments and curriculum.
export default async function SectionSubjectPage({ params }: { params: Promise<{ persona: string; gradeId: string; sectionId: string; offeringId: string }> }): Promise<React.ReactElement> {
  const { persona: slug, gradeId, sectionId, offeringId } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.school.sections');
  const crumbs = [
    ...crumbsFor(snapshot, slug, ['sections']),
    { key: 'class', title: 'Class', href: paths.personaSection(slug, `sections/${gradeId}`) },
    { key: 'section', title: 'Section', href: paths.personaSection(slug, `sections/${gradeId}/${sectionId}?tab=subjects`) },
  ];

  return (
    <Stack spacing={1}>
      <RouteBreadcrumbs crumbs={crumbs} current="Subject" />
      <SubjectPage gradeId={gradeId} sectionId={sectionId} offeringId={offeringId} personaSlug={slug} />
    </Stack>
  );
}
