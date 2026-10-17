import * as React from 'react';
import Stack from '@mui/material/Stack';

import { ArrangeBoard } from '@/components/school/classes/arrange-board';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { paths } from '@/paths';
import { requireFeature } from '@/server/dal';

// Placing the current year's students of one class into its sections.
export default async function CurrentArrangePage({ params }: { params: Promise<{ persona: string; gradeId: string }> }): Promise<React.ReactElement> {
  const { persona: slug, gradeId } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.school.sections');
  const crumbs = [...crumbsFor(snapshot, slug, ['sections']), { key: 'class', title: 'Class', href: paths.personaSection(slug, `sections/${gradeId}`) }];

  return (
    <Stack spacing={1}>
      <RouteBreadcrumbs crumbs={crumbs} current="Arrange" />
      <ArrangeBoard gradeId={gradeId} base={{ path: 'sections' }} personaSlug={slug} />
    </Stack>
  );
}
