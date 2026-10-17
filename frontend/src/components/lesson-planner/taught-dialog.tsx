'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { NotebookPen, Undo2 } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useClearTaught, useMarkTaught } from '@/hooks/mutation/use-lesson-planner';
import { formatLongDate } from '@/lib/dates';
import type { LessonPeriod, LessonPlan } from '@/types/lesson-planner';

import { BLOCK_KIND_META } from './block-kinds';

const REFLECTION_LIMIT = 600;

export function TaughtDialog({
  plan,
  period,
  onClose,
  onDone,
  onOpenPlan,
}: {
  plan: LessonPlan;
  period: LessonPeriod;
  onClose: () => void;
  onDone?: (plan: LessonPlan) => void;
  onOpenPlan?: () => void;
}): React.ReactElement {
  const notify = useToast();
  const mark = useMarkTaught();
  const clear = useClearTaught();
  const [reflection, setReflection] = React.useState(period.taught?.reflection ?? '');
  const pending = mark.isPending || clear.isPending;
  const tooLong = reflection.length > REFLECTION_LIMIT;

  const finish = (next: LessonPlan, message: string): void => {
    notify(message);
    onDone?.(next);
    onClose();
  };

  return (
    <FormDialog
      open
      title={period.taught ? 'Reflection' : 'Mark taught'}
      description={`${plan.title}, period ${period.sequence}/${plan.periods.length}${period.slot ? `, ${formatLongDate(period.slot.date)}` : ''}`}
      submitLabel={period.taught ? 'Save' : 'Mark taught'}
      pending={pending}
      error={mark.error ?? clear.error}
      canSubmit={!tooLong}
      onClose={onClose}
      onSubmit={() =>
        mark.mutate(
          { planId: plan.id, periodId: period.id, reflection },
          { onSuccess: (next) => finish(next, period.taught ? 'Reflection saved' : `Period ${period.sequence} taught`) },
        )
      }
    >
      <Stack spacing={1}>
        <Typography variant="subtitle2" component="h3">
          {period.focus}
        </Typography>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          {period.blocks.map((block) => (
            <EmergeChip key={block.id} tone={BLOCK_KIND_META[block.kind].tone} label={`${block.title} · ${block.minutes} min`} />
          ))}
        </Stack>
      </Stack>
      <TextField
        label="Reflection (optional)"
        value={reflection}
        onChange={(event) => setReflection(event.target.value)}
        multiline
        minRows={4}
        autoFocus
        error={tooLong}
        helperText={tooLong ? `Under ${REFLECTION_LIMIT} characters` : undefined}
      />
      {period.taught || onOpenPlan ? (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {onOpenPlan ? (
            <Button size="small" startIcon={<NotebookPen size={16} />} disabled={pending} onClick={onOpenPlan}>
              Open plan
            </Button>
          ) : null}
          {period.taught ? (
            <Button
              size="small"
              color="inherit"
              startIcon={<Undo2 size={16} />}
              disabled={pending}
              onClick={() =>
                clear.mutate({ planId: plan.id, periodId: period.id }, { onSuccess: (next) => finish(next, `Period ${period.sequence} not taught`) })
              }
            >
              Undo
            </Button>
          ) : null}
        </Stack>
      ) : null}
    </FormDialog>
  );
}
