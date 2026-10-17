'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';

import { useRegenerateBlock } from '@/hooks/mutation/use-lesson-planner';
import type { LessonBlock, LessonBlockKind, LessonPeriod } from '@/types/lesson-planner';

import { BlockCard } from './block-card';
import { BlockEditDialog } from './block-edit-dialog';
import { PeriodCard } from './period-card';
import { appendBlock, moveBlock, removeBlock, replaceBlock } from './plan-edits';
import { SECTION_GAP } from './spacing';
import type { ResourceResolver } from './use-resource-links';

export type PeriodsUpdate = (update: (periods: LessonPeriod[]) => LessonPeriod[]) => void;

export interface PlanBasis {
  offering_id: string;
  curriculum_node_id: string;
  grade: number;
  subject_name: string;
  section_label: string;
  topic_titles: string[];
  period_minutes: number;
}

interface Editing {
  periodId: string;
  block: LessonBlock;
}

export function PlanEditor({
  basis,
  periods,
  onChange,
  resolve,
  editable,
  periodExtras,
}: {
  basis: PlanBasis;
  periods: readonly LessonPeriod[];
  onChange: PeriodsUpdate;
  resolve: ResourceResolver;
  editable: boolean;
  periodExtras?: (period: LessonPeriod) => React.ReactNode;
}): React.ReactElement {
  const regenerate = useRegenerateBlock();
  const [busy, setBusy] = React.useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);

  const mark = (key: string, on: boolean): void =>
    setBusy((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const request = (period: LessonPeriod, kind: LessonBlockKind, minutes: number, variant: number) =>
    regenerate.mutateAsync({
      offering_id: basis.offering_id,
      curriculum_node_id: basis.curriculum_node_id,
      kind,
      focus: period.focus,
      period_sequence: period.sequence,
      period_count: periods.length,
      minutes,
      variant,
    });

  const run = (key: string, work: () => Promise<void>): void => {
    setFailure(null);
    mark(key, true);
    work()
      .catch((cause: unknown) => setFailure(cause instanceof Error ? cause.message : 'The block could not be regenerated.'))
      .finally(() => mark(key, false));
  };

  const regenerateBlock = (period: LessonPeriod, block: LessonBlock): void =>
    run(block.id, async () => {
      const next = await request(period, block.kind, block.minutes, block.variant);
      onChange((current) => replaceBlock(current, period.id, block.id, { ...next, id: block.id }));
    });

  const addBlock = (period: LessonPeriod, kind: LessonBlockKind): void =>
    run(`add-${period.id}`, async () => {
      const next = await request(period, kind, 0, -1);
      onChange((current) => appendBlock(current, period.id, next));
    });

  return (
    <Stack spacing={SECTION_GAP}>
      {failure ? (
        <Alert severity="error" variant="outlined" role="alert" onClose={() => setFailure(null)}>
          {failure}
        </Alert>
      ) : null}

      {periods.map((period) => (
        <PeriodCard
          key={period.id}
          period={period}
          periodMinutes={basis.period_minutes}
          adding={busy.has(`add-${period.id}`)}
          onAdd={editable ? (kind) => addBlock(period, kind) : null}
          extras={periodExtras?.(period)}
        >
          {period.blocks.map((block, index) => (
            <BlockCard
              key={block.id}
              block={block}
              position={index}
              count={period.blocks.length}
              regenerating={busy.has(block.id)}
              resolve={(resource) => resolve(resource, { grade: basis.grade, subject: basis.subject_name, chapterId: basis.curriculum_node_id, topic: basis.topic_titles[0] ?? null, sectionLabel: basis.section_label })}
              actions={
                editable
                  ? {
                      onMove: (step) => onChange((current) => moveBlock(current, period.id, block.id, step)),
                      onDelete: () => onChange((current) => removeBlock(current, period.id, block.id)),
                      onEdit: () => setEditing({ periodId: period.id, block }),
                      onRegenerate: () => regenerateBlock(period, block),
                      onMinutes: (minutes) => onChange((current) => replaceBlock(current, period.id, block.id, { ...block, minutes })),
                    }
                  : null
              }
            />
          ))}
        </PeriodCard>
      ))}

      {editing ? (
        <BlockEditDialog
          block={editing.block}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            onChange((current) => replaceBlock(current, editing.periodId, editing.block.id, next));
            setEditing(null);
          }}
        />
      ) : null}
    </Stack>
  );
}
