'use client';

import * as React from 'react';
import Card from '@mui/material/Card';

import { AnswerSheetsBoard } from '@/components/answer-checker/answer-sheets-board';
import { CheckerWorkspace } from '@/components/answer-checker/checker-workspace';
import { useCheckingReach } from '@/components/answer-checker/use-checking-reach';
import { useLiveUrlState } from '@/components/answer-checker/use-live-url-state';
import { SCOPE_RESETS } from '@/components/answer-checker/use-paper-scope';
import { EmptyState } from '@/components/ui/empty-state';
import { WidgetLoading } from '@/components/widgets/widget-states';
import type { WidgetProps } from '@/types/widget';

export function AnswerSheetsWidget({ personaSlug, reachableLinks = [] }: WidgetProps): React.ReactElement {
  const { get, put } = useLiveUrlState();
  const reach = useCheckingReach();
  const paperId = get('paper');

  if (reach.status === 'pending') return <WidgetLoading rows={4} />;
  if (reach.status === 'learner') {
    return (
      <Card>
        <EmptyState title="Answer sheets are for teachers" body="Checked papers and marks reach you through Grades once your teacher records them." />
      </Card>
    );
  }
  if (paperId) return <CheckerWorkspace key={paperId} paperId={paperId} personaSlug={personaSlug} reachableLinks={reachableLinks} reach={reach} />;
  return <AnswerSheetsBoard reach={reach} onOpen={(paper, exam, bubbles) => put({ paper, exam, mode: bubbles ? 'omr' : null, step: bubbles ? 'bubbles' : null, ...SCOPE_RESETS })} />;
}
