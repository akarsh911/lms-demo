'use client';

import * as React from 'react';

import { Segmented } from '@/components/ui/segmented';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useLearnerGaps } from '@/hooks/query/use-gap-analyzer';
import type { LearnerRef } from '@/types/gap-analyzer';

import { LearnerView, type LearnerSelection } from './learner-view';
import type { GapLinks } from './use-gap-links';

export function LearnerPanel({
  learners,
  learnerId,
  selection,
  links,
  onChange,
}: {
  learners: readonly LearnerRef[];
  learnerId: string | null;
  selection: LearnerSelection;
  links: GapLinks;
  onChange: (next: Record<string, string | null>) => void;
}): React.ReactElement {
  const chosen = learners.find((row) => row.student_id === learnerId) ?? learners[0] ?? null;
  const query = useLearnerGaps(chosen?.student_id ?? null);

  if (query.isPending) return <WidgetLoading rows={8} />;
  if (query.isError) return <WidgetError error={query.error} onRetry={() => void query.refetch()} />;

  const picker =
    learners.length > 1 && chosen ? (
      <Segmented
        ariaLabel="Child"
        value={chosen.student_id}
        options={learners.map((row) => ({ value: row.student_id, label: row.name }))}
        onChange={(value) => onChange({ learner: value, subject: null, topic: null })}
      />
    ) : null;

  return (
    <LearnerView
      analysis={query.data}
      links={links}
      selection={selection}
      trailing={picker}
      onSelect={(next) => onChange({ ...('subject' in next ? { subject: next.subject ?? null } : {}), topic: next.topic ?? null })}
    />
  );
}
