'use client';

import * as React from 'react';
import Card from '@mui/material/Card';

import { LatestResults } from '@/components/home/learner/latest-results';
import { WidgetLoading } from '@/components/widgets/widget-states';
import { useReach } from '@/hooks/query/use-reach';
import type { WidgetProps } from '@/types/widget';

export function LatestResultsWidget({ title, personaSlug }: WidgetProps): React.ReactElement | null {
  const reach = useReach();
  if (!reach) return <Card sx={{ p: 2.5, height: '100%' }}><WidgetLoading rows={4} /></Card>;
  return reach.kind === 'self' ? <LatestResults title={title} studentId={reach.studentId} personaSlug={personaSlug} /> : null;
}
