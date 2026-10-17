import * as React from 'react';
import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';

import { hintFor } from '@/lib/entitlement/decide';
import { resolveFeature } from '@/lib/entitlement/resolve-key';
import type { FeatureKey } from '@/constants/features';
import { isReachable, type EntitlementSnapshot } from '@/types/entitlement';
import type { WidgetDescriptor } from '@/types/widget';

import { widgetsForSection } from './registry';
import { WidgetBoundary } from './widget-shell';
import { WidgetSlot } from './widget-slot';
import { DisabledWidget } from './disabled-widget';

/**
 * Renders every widget a user is entitled to within one section.
 *
 * This is the composable-dashboard machinery, and it is page-agnostic: Home
 * uses it, Attendance uses it, a nested page like Mind maps uses it, and so
 * will everything added later. There is no role check anywhere and nowhere
 * obvious to add one: which widgets exist is decided entirely by feature keys.
 *
 * A widget the user does not hold is never constructed, so it contributes no
 * markup at all. A widget that is held but unavailable renders as a disabled
 * card, because silently dropping it looks identical to never having had it.
 *
 * Layout is the grid's decision, read from each widget's declared
 * `presentation` (see `types/widget.ts`): cards share rows by `span`, a wide or
 * immersive widget takes a row of its own, and an immersive one is also given
 * the viewport's height by `WidgetSlot`.
 */
export function WidgetGrid({
  snapshot,
  owner,
  personaSlug,
  emptyMessage,
}: {
  snapshot: EntitlementSnapshot;
  /**
   * The feature key of the page these panels are drawn on. Named `owner`
   * rather than `section` because it is no longer always a top-level section:
   * `emerge.learning.mindmap` owns a page and owns panels.
   */
  owner: string;
  personaSlug: string;
  emptyMessage?: string;
}): React.ReactElement {
  const widgets = widgetsForSection(owner)
    .map((widget) => ({ widget, resolved: resolveFeature(snapshot, widget.feature) }))
    .filter(({ resolved }) => resolved.state !== 'hidden');

  if (widgets.length === 0) {
    return (
      <Alert severity="info" variant="outlined" sx={{ maxWidth: 620 }}>
        {emptyMessage ??
          'Nothing has been switched on for this view yet. Your account is active — ' +
            'your school administrator controls which panels appear here.'}
      </Alert>
    );
  }

  return (
    // `flex-start`: a card is as tall as what it holds. Stretching every card
    // to match the tallest in its row left ~300px of white under the short
    // ones, which reads as content that failed to load.
    <Grid container spacing={2} sx={{ alignItems: 'flex-start' }}>
      {widgets.map(({ widget, resolved }) => {
        const { Component } = widget;
        const presentation = widget.presentation ?? 'card';
        return (
          <Grid key={widget.key} size={{ xs: 12, md: columnsFor(widget) }}>
            <WidgetSlot presentation={presentation}>
              <WidgetBoundary title={widget.title}>
                {resolved.state === 'disabled' ? (
                  <DisabledWidget
                    title={widget.title}
                    hint={resolved.entry ? hintFor(resolved.entry.reason) : undefined}
                  />
                ) : (
                  <Component
                    title={widget.title}
                    personaSlug={personaSlug}
                    reachableLinks={reachableLinksOf(snapshot, widget)}
                  />
                )}
              </WidgetBoundary>
            </WidgetSlot>
          </Grid>
        );
      })}
    </Grid>
  );
}

/**
 * Columns out of 12 from `md` up. A card takes its declared span; a wide or
 * immersive widget takes the row, so it never shares one with a card and the
 * cards after it start on a fresh row.
 */
function reachableLinksOf(
  snapshot: EntitlementSnapshot,
  widget: WidgetDescriptor,
): FeatureKey[] {
  return (widget.linksTo ?? []).filter((feature) =>
    isReachable(resolveFeature(snapshot, feature).state),
  );
}

function columnsFor(widget: WidgetDescriptor): number {
  return widget.presentation === undefined || widget.presentation === 'card' ? widget.span : 12;
}
