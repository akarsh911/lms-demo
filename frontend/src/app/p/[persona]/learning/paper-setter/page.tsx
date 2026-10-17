import * as React from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { ComposeWizard } from '@/components/paper-setter/compose-wizard';
import { RouteBreadcrumbs, type Crumb } from '@/components/ui/route-breadcrumbs';
import { resolveFeature } from '@/lib/entitlement/resolve-key';
import { paths } from '@/paths';
import { ROUTE_INDEX } from '@/routes/registry';
import { requireFeature } from '@/server/dal';
import { isReachable } from '@/types/entitlement';

const PAPER_SETTER_FEATURE = 'emerge.learning.paper_setter';

export default async function PaperSetterPage({
  params,
}: {
  params: Promise<{ persona: string }>;
}): Promise<React.ReactElement> {
  const { persona: slug } = await params;
  const { snapshot } = await requireFeature(slug, PAPER_SETTER_FEATURE);

  const crumbs: Crumb[] = ['learning'].flatMap((key) => {
    const ancestor = ROUTE_INDEX.get(key);
    if (!ancestor) return [];
    const reachable = isReachable(resolveFeature(snapshot, ancestor.node.feature).state);
    return [
      {
        key,
        title: ancestor.node.title,
        href:
          ancestor.hasPage && reachable
            ? paths.personaSection(slug, ancestor.path)
            : null,
      },
    ];
  });

  return (
    <Stack spacing={3}>
      <div>
        <RouteBreadcrumbs crumbs={crumbs} current="Paper setter" />
        <Typography variant="h2" component="h1">
          Paper setter
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '70ch' }}>
          Compose a question paper from the curriculum, one decision at a time. Nothing is
          spent until the last step, and the preview before it costs nothing to ask.
        </Typography>
      </div>
      <ComposeWizard />
    </Stack>
  );
}
