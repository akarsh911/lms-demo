'use client';

import * as React from 'react';
import Box from '@mui/material/Box';

import { LearnerPanel } from '@/components/gap-analyzer/learner-panel';
import { useGapLinks } from '@/components/gap-analyzer/use-gap-links';
import { useUrlState } from '@/components/school/url-state';
import { SectionHeader } from '@/components/ui/layout';
import { WidgetError } from '@/components/widgets/widget-states';
import { useGapScope } from '@/hooks/query/use-gap-analyzer';
import type { WidgetProps } from '@/types/widget';

const PREFIX = 'gap_';

export function GradesGapsWidget({ title, personaSlug, reachableLinks = [] }: WidgetProps): React.ReactElement | null {
  const { get, put } = useUrlState();
  const scope = useGapScope();
  const links = useGapLinks(personaSlug, reachableLinks);
  const wards = scope.data?.wards ?? [];
  const own = (key: string): string | null => get(`${PREFIX}${key}`);
  const putOwn = (next: Record<string, string | null>): void => put(Object.fromEntries(Object.entries(next).map(([key, value]) => [`${PREFIX}${key}`, value])));

  if (!scope.isError && wards.length === 0) return null;

  return (
    <Box component="section" aria-label={title}>
      <SectionHeader title={title} subtitle="Where your child is weak, topic by topic" />
      {scope.isError ? (
        <WidgetError error={scope.error} onRetry={() => void scope.refetch()} />
      ) : (
        <LearnerPanel learners={wards} learnerId={own('learner')} selection={{ subject: own('subject'), topic: own('topic') }} links={links} onChange={putOwn} />
      )}
    </Box>
  );
}
