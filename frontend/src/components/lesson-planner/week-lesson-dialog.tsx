'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';

import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useLessonPlan } from '@/hooks/query/use-lesson-planner';

import { TaughtDialog } from './taught-dialog';

export function WeekLessonDialog({
  planId,
  sequence,
  onClose,
  onOpenPlan,
}: {
  planId: string;
  sequence: number;
  onClose: () => void;
  onOpenPlan: (planId: string) => void;
}): React.ReactElement {
  const plan = useLessonPlan(planId);
  const period = plan.data?.periods.find((candidate) => candidate.sequence === sequence);

  if (plan.data && period) {
    return <TaughtDialog plan={plan.data} period={period} onClose={onClose} onOpenPlan={() => onOpenPlan(planId)} />;
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Lesson</DialogTitle>
      <DialogContent>
        {plan.isPending ? <WidgetLoading rows={3} /> : null}
        {plan.isError ? <WidgetError error={plan.error} onRetry={() => void plan.refetch()} /> : null}
        {plan.data && !period ? <Alert severity="warning" variant="outlined">This period is no longer part of the plan.</Alert> : null}
      </DialogContent>
    </Dialog>
  );
}
