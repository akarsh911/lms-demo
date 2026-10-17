'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useCheckerBooklets, useQuestionReferences } from '@/hooks/query/use-answer-checker';
import type { SetQuestion } from '@/lib/answer-checker/paper';
import { trimNumber } from '@/lib/exams/exam';
import type { BookletRef } from '@/types/answer-checker';
import type { Paper } from '@/types/papersetter';

import { ActionIcon } from './action-icon';
import { BookletReview } from './booklet-review';

const REVIEWABLE = new Set(['marked', 'signed_off']);

function optionLabel(ref: BookletRef): string {
  const total = ref.total_marks === null ? '—' : trimNumber(ref.total_marks);
  const flags = ref.state === 'signed_off' ? ' ✓' : ref.review_count > 0 ? ` · ${ref.review_count}⚑` : '';
  return `${ref.student.roll_number ?? '—'} ${ref.student.name ?? 'Unnamed'} · ${total}${flags}`;
}

export function ReviewStep({
  examId,
  paper,
  questions,
  selected,
  onSelect,
  onNext,
}: {
  examId: string;
  paper: Paper;
  questions: readonly SetQuestion[];
  selected: string | null;
  onSelect: (bookletId: string) => void;
  onNext: () => void;
}): React.ReactElement {
  const booklets = useCheckerBooklets(examId);
  const references = useQuestionReferences(paper, questions);

  if (booklets.isPending) return <WidgetLoading rows={6} />;
  if (booklets.isError) return <WidgetError error={booklets.error} onRetry={() => void booklets.refetch()} />;

  const marked = (booklets.data ?? []).filter((ref) => REVIEWABLE.has(ref.state));
  if (marked.length === 0) return <WidgetEmpty message="Nothing marked yet." />;
  const index = Math.max(0, marked.findIndex((ref) => ref.id === selected));
  const current = marked[index];
  const signed = marked.filter((ref) => ref.state === 'signed_off').length;
  const flagged = marked.filter((ref) => ref.review_count > 0 && ref.state !== 'signed_off').length;
  const step = (by: number): void => {
    const next = marked[(index + by + marked.length) % marked.length];
    if (next) onSelect(next.id);
  };

  return (
    <Stack spacing={2}>
      <CardToolbar
        start={
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flex: { xs: 1, sm: 'none' } }}>
            <ActionIcon compact label="Previous pupil" onClick={() => step(-1)}>
              <ChevronLeft size={16} />
            </ActionIcon>
            <TextField
              select
              size="small"
              value={current?.id ?? ''}
              onChange={(event) => onSelect(event.target.value)}
              slotProps={{ htmlInput: { 'aria-label': 'Pupil' } }}
              sx={{ minWidth: { xs: 0, sm: 300 }, flex: 1, bgcolor: 'background.paper' }}
            >
              {marked.map((ref) => (
                <MenuItem key={ref.id} value={ref.id}>
                  {optionLabel(ref)}
                </MenuItem>
              ))}
            </TextField>
            <ActionIcon compact label="Next pupil" onClick={() => step(1)}>
              <ChevronRight size={16} />
            </ActionIcon>
          </Stack>
        }
        summary={`${signed} of ${marked.length} signed off${flagged > 0 ? ` · ${flagged} flagged` : ''}`}
      >
        <Button size="small" variant="outlined" endIcon={<ArrowRight size={14} />} onClick={onNext}>
          Send marks
        </Button>
      </CardToolbar>
      {current ? <BookletReview key={current.id} examId={examId} bookletId={current.id} questions={questions} references={references} paper={paper} /> : null}
    </Stack>
  );
}
