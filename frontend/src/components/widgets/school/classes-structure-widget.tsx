'use client';

import * as React from 'react';
import Stack from '@mui/material/Stack';

import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { ClassesStructure } from '@/components/school/classes/classes-structure';
import { TeachingClasses } from '@/components/school/classes/teaching-classes';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useMdmSessions } from '@/hooks/query/use-mdm';
import { useReach } from '@/hooks/query/use-reach';
import type { WidgetProps } from '@/types/widget';

// The sidebar's Classes & Sections: always the current year; the office sees the whole structure, a teacher their own sections.
export function ClassesStructureWidget({ personaSlug }: WidgetProps): React.ReactElement {
  const sessions = useMdmSessions();
  const reach = useReach();
  if (sessions.isPending || !reach) return <WidgetLoading rows={6} />;
  if (sessions.isError) return <WidgetError error={sessions.error} onRetry={() => void sessions.refetch()} />;
  const year = sessions.data.rows.find((row) => row.is_current);
  if (!year) return <EmptyState title="No academic year is active" body="Activate a year under School → Academic Years; its classes and sections appear here." />;
  return (
    <Stack spacing={1.5}>
      <EmergeChip label={`Current year · ${year.name}`} tone="green" dot />
      {reach.kind === 'teaching' ? <TeachingClasses base={{ path: 'sections' }} personaSlug={personaSlug} /> : <ClassesStructure yearId={year.id} base={{ path: 'sections' }} personaSlug={personaSlug} />}
    </Stack>
  );
}
