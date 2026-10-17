'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';

import { SubjectPage } from '@/components/school/classes/subject-page';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useMySubjects } from '@/hooks/query/use-my-subjects';

// One of the caller's own subjects, found in their list so the class and section never come from the URL.
export function MySubjectPage({ offeringId, personaSlug }: { offeringId: string; personaSlug: string }): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useMySubjects();
  if (isPending) return <WidgetLoading rows={6} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;
  const subject = data.find((s) => s.offering_id === offeringId);
  if (!subject) {
    return (
      <Alert severity="info" variant="outlined">
        This is not one of your subjects this year.
      </Alert>
    );
  }
  return <SubjectPage gradeId={subject.grade_level_id} sectionId={subject.section_id} offeringId={offeringId} personaSlug={personaSlug} />;
}
