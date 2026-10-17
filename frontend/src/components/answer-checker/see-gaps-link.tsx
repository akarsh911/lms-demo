'use client';

import * as React from 'react';
import NextLink from 'next/link';
import Button from '@mui/material/Button';
import { ArrowRight } from 'lucide-react';

import { GAP_ROUTE_KEY, sectionGapsQuery } from '@/components/gap-analyzer/deep-link';
import type { FeatureKey } from '@/constants/features';
import { paths } from '@/paths';
import { ROUTE_INDEX } from '@/routes/registry';
import type { Paper } from '@/types/papersetter';

import type { CheckingTarget } from './use-checking-target';

export function gapsHref(paper: Paper, target: CheckingTarget, personaSlug: string, reachableLinks: readonly FeatureKey[]): string | null {
  const route = ROUTE_INDEX.get(GAP_ROUTE_KEY);
  const grade = Number.parseInt(paper.class_id ?? '', 10);
  const section = target.offering?.edges?.section?.name;
  if (!route || !reachableLinks.includes(route.node.feature) || !Number.isFinite(grade) || !section) return null;
  return `${paths.personaSection(personaSlug, route.path)}?${sectionGapsQuery({ grade, section, subjectCode: target.offering?.edges?.subject?.code })}`;
}

export function SeeGapsLink({
  paper,
  target,
  personaSlug,
  reachableLinks,
}: {
  paper: Paper;
  target: CheckingTarget;
  personaSlug: string;
  reachableLinks: readonly FeatureKey[];
}): React.ReactElement | null {
  const href = gapsHref(paper, target, personaSlug, reachableLinks);
  if (!href) return null;
  return (
    <Button size="small" variant="contained" component={NextLink} href={href} endIcon={<ArrowRight size={14} />}>
      {`See gaps for ${paper.class_id ?? ''}${target.offering?.edges?.section?.name ?? ''}`}
    </Button>
  );
}
