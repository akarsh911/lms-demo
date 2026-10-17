import * as React from 'react';
import Stack from '@mui/material/Stack';

import { SectionWorkspace } from '@/components/school/classes/section-workspace';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { paths } from '@/paths';
import { requireFeature } from '@/server/dal';

// A section of the current year, reached from the sidebar.
export default async function CurrentSectionPage({ params }: { params: Promise<{ persona: string; gradeId: string; sectionId: string }> }): Promise<React.ReactElement> {
  const { persona: slug, gradeId, sectionId } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.school.sections');
  const crumbs = [...crumbsFor(snapshot, slug, ['sections']), { key: 'class', title: 'Class', href: paths.personaSection(slug, `sections/${gradeId}?tab=sections`) }];

  return (
    <Stack spacing={1}>
      <RouteBreadcrumbs crumbs={crumbs} current="Section" />
      <SectionWorkspace gradeId={gradeId} sectionId={sectionId} base={{ path: 'sections' }} personaSlug={slug} />
    </Stack>
  );
}
