'use client';

import * as React from 'react';
import Stack from '@mui/material/Stack';

import { Segmented } from '@/components/ui/segmented';
import type { SetQuestion } from '@/lib/answer-checker/paper';
import type { CheckerExamDetail } from '@/types/answer-checker';
import type { Paper } from '@/types/papersetter';

import { CollectStep } from './collect-step';
import { FinishStep } from './finish-step';
import { NamesStep } from './names-step';
import { ReviewStep } from './review-step';
import { SchemeCallout } from './scheme-step';
import type { CheckingTarget } from './use-checking-target';

export type ScanStepKey = 'sheets' | 'names' | 'review';
export type ReviewView = 'review' | 'send';

const VIEWS: readonly { value: ReviewView; label: string }[] = [
  { value: 'review', label: 'Review' },
  { value: 'send', label: 'Send marks' },
];

export function BookletsSteps({
  step,
  view,
  exam,
  paper,
  questions,
  target,
  personaSlug,
  selected,
  onSelect,
  onView,
  sessionId,
  onSession,
  onJob,
  onReviewScheme,
  onward,
  go,
}: {
  step: ScanStepKey;
  view: ReviewView;
  exam: CheckerExamDetail;
  paper: Paper;
  questions: readonly SetQuestion[];
  target: CheckingTarget;
  personaSlug: string;
  selected: string | null;
  onSelect: (bookletId: string) => void;
  onView: (view: ReviewView) => void;
  sessionId: string | null;
  onSession: (sessionId: string) => void;
  onJob: (jobId: string, next: ScanStepKey) => void;
  onReviewScheme: () => void;
  onward?: React.ReactNode;
  go: (next: ScanStepKey) => void;
}): React.ReactElement {
  switch (step) {
    case 'sheets':
      return (
        <Stack spacing={2}>
          <SchemeCallout exam={exam} onReview={onReviewScheme} />
          <CollectStep exam={exam} paper={paper} classSize={target.students.length} sessionId={sessionId} onSession={onSession} onUploaded={(job) => onJob(job, 'names')} onNext={() => go('names')} />
        </Stack>
      );
    case 'names':
      return <NamesStep exam={exam} students={target.students} onMarked={(job) => onJob(job, 'review')} onReviewScheme={onReviewScheme} />;
    case 'review':
      return (
        <Stack spacing={2}>
          <Segmented ariaLabel="Review or send" value={view} onChange={onView} options={VIEWS} />
          {view === 'send' ? (
            <FinishStep
              examId={exam.id}
              target={target}
              personaSlug={personaSlug}
              onward={onward}
              onReview={(bookletId) => {
                onSelect(bookletId);
                onView('review');
              }}
            />
          ) : (
            <ReviewStep examId={exam.id} paper={paper} questions={questions} selected={selected} onSelect={onSelect} onNext={() => onView('send')} />
          )}
        </Stack>
      );
    default: {
      const never: never = step;
      return never;
    }
  }
}
