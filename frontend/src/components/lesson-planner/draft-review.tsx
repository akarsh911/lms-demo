'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { ArrowLeft, RefreshCw, Save } from 'lucide-react';

import { useCreateLessonPlan } from '@/hooks/mutation/use-lesson-planner';
import type { DraftPlan, LessonPlan, LessonPeriod } from '@/types/lesson-planner';

import { composerStore, patchComposer } from './composer-store';
import { PlanEditor } from './plan-editor';
import { PlanHeader } from './plan-header';
import { SECTION_GAP } from './spacing';
import type { ResourceResolver } from './use-resource-links';

function updateDraft(update: (periods: LessonPeriod[]) => LessonPeriod[]): void {
  const { phase } = composerStore.getState();
  if (phase.kind !== 'draft') return;
  patchComposer({ phase: { ...phase, draft: { ...phase.draft, periods: update(phase.draft.periods) } } });
}

export function DraftReview({
  draft,
  title,
  startDate,
  resolve,
  onBack,
  onRegenerateAll,
  onSaved,
}: {
  draft: DraftPlan;
  title: string;
  startDate: string;
  resolve: ResourceResolver;
  onBack: () => void;
  onRegenerateAll: () => void;
  onSaved: (plan: LessonPlan) => void;
}): React.ReactElement {
  const create = useCreateLessonPlan();
  const canSave = title.trim() !== '' && startDate !== '' && draft.periods.length > 0;

  return (
    <Stack spacing={SECTION_GAP}>
      <PlanHeader
        plan={draft}
        title={title}
        onTitle={(next) => patchComposer({ title: next })}
        actions={
          <>
            <Button variant="text" startIcon={<ArrowLeft size={16} />} onClick={onBack} disabled={create.isPending}>
              Setup
            </Button>
            <Button variant="text" startIcon={<RefreshCw size={16} />} onClick={onRegenerateAll} disabled={create.isPending}>
              Regenerate all
            </Button>
            <Tooltip title="First lesson on or after this date, skipping closed days">
              <TextField
                type="date"
                size="small"
                label="Start"
                value={startDate}
                onChange={(event) => patchComposer({ startDate: event.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 170 }}
              />
            </Tooltip>
            <Button
              variant="contained"
              startIcon={<Save size={16} />}
              loading={create.isPending}
              disabled={!canSave}
              onClick={() => create.mutate({ draft, title: title.trim(), start_date: startDate }, { onSuccess: onSaved })}
            >
              Save plan
            </Button>
          </>
        }
      >
        {create.isError ? (
          <Alert severity="error" variant="outlined" role="alert">
            {create.error.message}
          </Alert>
        ) : null}
      </PlanHeader>

      <PlanEditor basis={draft} periods={draft.periods} onChange={updateDraft} resolve={resolve} editable />
    </Stack>
  );
}
