import * as React from 'react';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { notFound } from 'next/navigation';

import { PageActionsSlot } from '@/components/ui/page-actions';
import { RouteBreadcrumbs, type Crumb } from '@/components/ui/route-breadcrumbs';
import { WidgetGrid } from '@/components/widgets/widget-grid';
import { resolveFeature } from '@/lib/entitlement/resolve-key';
import { descriptionFor, titleFor } from '@/lib/nav/title';
import { paths } from '@/paths';
import { ROUTE_INDEX, ROUTE_BY_PATH } from '@/routes/registry';
import { requireFeature } from '@/server/dal';
import { isReachable } from '@/types/entitlement';

/**
 * Every registry route below the persona root, at any depth.
 *
 * One file serves all of them, resolved through the registry, and each renders
 * its own widgets by feature key. That is what makes the design scale as
 * promised: adding a section is a registry entry and a CAS key, adding a
 * NESTED section is the same entry one level down, and adding a panel to
 * either is a widget-registry entry. No routing, nav or shell code moves.
 *
 * `[...section]` already matched multiple segments; what was missing was a
 * registry that could describe them. `learning/mindmap` now resolves because
 * the registry composes full paths from the tree, not because this file gained
 * a special case.
 *
 * A group with no page of its own is absent from `ROUTE_BY_PATH`, so
 * `/p/{persona}/learning` 404s here exactly like a URL that was never in the
 * registry. The 404 is the same one an unheld feature gets, which is what keeps
 * the route table from being enumerable by probing.
 *
 * When a section outgrows a widget grid, adding a dedicated segment folder
 * takes precedence over this catch-all, so nothing has to be migrated up front.
 */
export default async function SectionPage({
  params,
}: {
  params: Promise<{ persona: string; section: string[] }>;
}): Promise<React.ReactElement> {
  const { persona: slug, section } = await params;

  const record = ROUTE_BY_PATH.get(section.join('/'));
  // A URL with no registry entry is not a route. Same 404 as anything else, so
  // the registry cannot be enumerated by probing.
  if (!record) notFound();

  const { node, trail } = record;
  const { persona, snapshot } = await requireFeature(slug, node.feature);
  // Resolved, so an unregistered nested page reads its inherited state, the
  // same answer the gate above and the sidebar used.
  const { state } = resolveFeature(snapshot, node.feature);

  /**
   * Ancestors, resolved against the same snapshot.
   *
   * A crumb is a link only when there is somewhere to go. Two cases where there
   * is not, and both are ordinary rather than exceptional:
   *
   *   - the ancestor has no page at all, because every one of its children is
   *     itself a sidebar route. `emerge.learning` is exactly this.
   *   - the user cannot reach it. The nav hoists an orphaned child to the top
   *     level in this case, so the trail must not offer a door the sidebar has
   *     already decided does not exist.
   */
  const crumbs: Crumb[] = trail.flatMap((key) => {
    const ancestor = ROUTE_INDEX.get(key);
    if (!ancestor) return [];
    const reachable = isReachable(resolveFeature(snapshot, ancestor.node.feature).state);
    return [
      {
        key,
        title: titleFor(ancestor.node, slug),
        href:
          ancestor.hasPage && reachable
            ? paths.personaSection(slug, ancestor.path)
            : null,
      },
    ];
  });

  return (
    <Stack spacing={3} sx={{ height: '100%' }}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
        <div>
          <RouteBreadcrumbs crumbs={crumbs} current={titleFor(node, slug)} />
          {/* The page's one h1. */}
          <Typography variant="h2" component="h1">
            {titleFor(node, slug)}
          </Typography>
          {descriptionFor(node, slug) ? (
            <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5, maxWidth: '72ch' }}>
              {descriptionFor(node, slug)}
            </Typography>
          ) : null}
        </div>
        {/* A widget on this page puts the page's primary action here. */}
        <PageActionsSlot />
      </Stack>

      {state === 'needs_scope' ? (
        <Alert severity="info" variant="outlined" sx={{ maxWidth: 640 }}>
          You have access to {titleFor(node, slug).toLowerCase()} for specific classes. Choose a class to see it.
        </Alert>
      ) : null}

      <WidgetGrid
        snapshot={snapshot}
        owner={node.feature}
        personaSlug={slug}
        // Never name a feature key to a student: it is our vocabulary, not theirs.
        emptyMessage="Nothing has been added to this section yet. It will appear here when your school switches it on."
      />
    </Stack>
  );
}
