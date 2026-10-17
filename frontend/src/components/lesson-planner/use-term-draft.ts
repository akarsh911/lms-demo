'use client';

import * as React from 'react';

import type { TermPlanSettings } from '@/types/lesson-planner';

export interface TermDraft {
  settings: TermPlanSettings;
  dirty: boolean;
  update: (change: (current: TermPlanSettings) => TermPlanSettings) => void;
  reset: () => void;
}

export function useTermDraft(saved: TermPlanSettings): TermDraft {
  const [edits, setEdits] = React.useState<TermPlanSettings | null>(null);
  const settings = edits ?? saved;

  const update = React.useCallback(
    (change: (current: TermPlanSettings) => TermPlanSettings) => setEdits((current) => change(current ?? saved)),
    [saved],
  );

  const reset = React.useCallback(() => setEdits(null), []);

  return { settings, dirty: edits !== null, update, reset };
}
