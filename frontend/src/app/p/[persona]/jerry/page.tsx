import * as React from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { JerryBuddy } from '@/components/jerry/jerry-buddy';
import { RouteBreadcrumbs } from '@/components/ui/route-breadcrumbs';
import { crumbsFor } from '@/lib/nav/crumbs';
import { requireFeature } from '@/server/dal';

export default async function JerryPage({ params }: { params: Promise<{ persona: string }> }): Promise<React.ReactElement> {
  const { persona: slug } = await params;
  const { snapshot } = await requireFeature(slug, 'emerge.jerry');
  return (
    <Stack spacing={2}>
      <div>
        <RouteBreadcrumbs crumbs={crumbsFor(snapshot, slug, [])} current="Jerry AI" />
        <Typography variant="h2" component="h1">
          Jerry AI
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: '68ch' }}>
          Your study buddy. Ask what&apos;s due, get a topic explained, take a quick quiz or get a hint, by typing or just talking, in English or Hindi.
        </Typography>
      </div>
      <JerryBuddy personaSlug={slug} />
    </Stack>
  );
}
