import * as React from 'react';
import Stack from '@mui/material/Stack';

import { HomeHero } from '@/components/home/home-hero';
import { OverviewHeader } from '@/components/home/overview/overview-header';
import { WidgetGrid } from '@/components/widgets/widget-grid';
import { PERSONA_PRESETS } from '@/constants/personas';
import type { FeatureKey } from '@/constants/features';
import { resolveFeature } from '@/lib/entitlement/resolve-key';
import { requireFeature } from '@/server/dal';
import { isReachable } from '@/types/entitlement';

const HOME_VARIANTS = ['emerge.home.overview', 'emerge.home.teaching', 'emerge.home.learner'] as const satisfies readonly FeatureKey[];

/**
 * The dashboard — the `emerge.home` section.
 *
 * Note it is not special: it is a section gated on a feature key like any
 * other, rendering its widgets through the same `WidgetGrid`. Home being "just
 * a section" is what stops it accumulating one-off logic.
 */
export default async function PersonaHome({
  params,
}: {
  params: Promise<{ persona: string }>;
}): Promise<React.ReactElement> {
  const { persona: slug } = await params;
  const { snapshot, persona } = await requireFeature(slug, 'emerge.home');

  // Home is chosen by key: the first variant held, in the order this persona lists them; anyone holding none keeps the default.
  const held = HOME_VARIANTS.filter((key) => isReachable(resolveFeature(snapshot, key).state));
  const preset = PERSONA_PRESETS[slug] ?? [];
  const owner = held.find((key) => preset.includes(key)) ?? held[0] ?? 'emerge.home';

  return (
    <Stack spacing={3}>
      {owner === 'emerge.home.overview' ? <OverviewHeader personaSlug={slug} /> : <HomeHero roleName={persona.roleName} />}
      <WidgetGrid snapshot={snapshot} owner={owner} personaSlug={slug} />
    </Stack>
  );
}
