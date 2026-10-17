'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Collapse from '@mui/material/Collapse';
import InputBase from '@mui/material/InputBase';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ChevronDown, ChevronRight, Flag, FlagOff, Undo2 } from 'lucide-react';

import { useEditQuestion } from '@/hooks/mutation/use-answer-checker';
import { failureText, trimNumber } from '@/lib/exams/exam';
import { parseMark } from '@/lib/exams/marks';
import type { QuestionResult } from '@/types/answer-checker';
import type { EnrichedPassage } from '@/types/retrieval';

import { ActionIcon } from './action-icon';
import { ReferencePassages } from './reference-passage';

const REVIEW_REASONS: Readonly<Record<string, string>> = {
  low_confidence: 'Unsure reading',
  illegible: 'Illegible',
  visual_question: 'Diagram or matching',
  unmapped_answer: 'Unplaced writing',
  not_attempted_but_ink_found: 'Ink on an unattempted question',
  alternate_method: 'Different method',
  outlier_vs_peers: 'Out of step with the class',
  off_syllabus: 'Off syllabus',
  arithmetic_mismatch: 'Arithmetic mismatch',
  heavy_cutting: 'Heavy cutting',
};

export function QuestionReview({
  examId,
  bookletId,
  result,
  text,
  references,
}: {
  examId: string;
  bookletId: string;
  result: QuestionResult;
  text: string | null;
  references: { data?: EnrichedPassage[]; isPending: boolean; isError: boolean } | undefined;
}): React.ReactElement {
  const edit = useEditQuestion(examId, bookletId);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(trimNumber(result.marks));
  const [shown, setShown] = React.useState(result.marks);
  if (shown !== result.marks) {
    setShown(result.marks);
    setDraft(trimNumber(result.marks));
  }

  const parsed = parseMark(draft);
  const invalid = parsed === null || parsed > result.max_marks;
  const overridden = result.teacher_marks_override !== null;
  const tone = result.marks >= result.max_marks ? 'success.main' : result.marks === 0 ? 'error.main' : 'warning.main';
  const reasons = result.review_reasons.map((reason) => REVIEW_REASONS[reason] ?? reason).join(', ');

  const save = (): void => {
    if (invalid || parsed === null || parsed === result.marks) return;
    edit.mutate({ number: result.question_number, edit: { marks: parsed } });
  };

  return (
    <Box component="section" aria-label={`Question ${result.question_number}`} sx={{ py: 0.75 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <ButtonBase onClick={() => setOpen(!open)} aria-expanded={open} sx={{ borderRadius: 1, px: 0.5, py: 0.25, gap: 0.5, flex: 1, justifyContent: 'flex-start', minWidth: 0 }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Typography variant="subtitle2" component="h4">
            Q{result.question_number}
          </Typography>
          {result.needs_review ? (
            <Tooltip title={reasons}>
              <Box component="span" sx={{ color: 'warning.main', display: 'inline-flex' }} aria-label={reasons}>
                <Flag size={13} />
              </Box>
            </Tooltip>
          ) : null}
          {!result.is_attempted ? (
            <Typography variant="caption" color="text.secondary">
              blank
            </Typography>
          ) : null}
        </ButtonBase>
        <Tooltip title={overridden ? `Yours · checker gave ${trimNumber(result.ai_marks)}` : 'Press Enter to save'}>
          <InputBase
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save();
            }}
            error={invalid}
            slotProps={{ input: { inputMode: 'decimal', 'aria-label': `Mark for question ${result.question_number}` } }}
            sx={{
              width: 48,
              px: 0.75,
              borderRadius: 1,
              border: 1,
              borderColor: invalid ? 'error.main' : overridden ? 'secondary.main' : 'divider',
              fontWeight: 600,
              color: tone,
              '& input': { textAlign: 'right', py: 0.25 },
            }}
          />
        </Tooltip>
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 28 }}>
          /{trimNumber(result.max_marks)}
        </Typography>
      </Stack>

      <Collapse in={open} unmountOnExit>
        <Stack spacing={1.5} sx={{ pl: 3, pt: 1 }}>
          {text ? (
            <Typography variant="caption" color="text.secondary">
              {text}
            </Typography>
          ) : null}
          <Stack component="ul" spacing={0.5} sx={{ m: 0, p: 0, listStyle: 'none' }}>
            {result.point_awards.map((award) => (
              <Typography component="li" variant="body2" key={award.key_point_id}>
                <Box component="span" sx={{ color: award.found ? 'success.main' : 'error.main', fontWeight: 700, mr: 0.75 }} aria-label={award.found ? 'Found' : 'Missing'}>
                  {award.found ? '✓' : '✗'}
                </Box>
                {award.key_point_text}
                <Box component="span" sx={{ color: 'text.secondary' }}>
                  {' '}
                  {trimNumber(award.awarded)}/{trimNumber(award.max_marks)}
                </Box>
                {award.evidence ? (
                  <Box component="span" sx={{ display: 'block', color: 'text.secondary', fontStyle: 'italic', pl: 2.25 }}>
                    “{award.evidence}”
                  </Box>
                ) : null}
              </Typography>
            ))}
            {result.deductions.map((deduction, index) => (
              <Typography component="li" variant="body2" key={`${deduction.kind}-${index}`} sx={{ color: deduction.suppressed ? 'text.disabled' : 'text.primary' }}>
                <Box component="span" sx={{ color: 'error.main', fontWeight: 700, mr: 0.75 }}>
                  −{trimNumber(deduction.marks)}
                </Box>
                {deduction.reason}
              </Typography>
            ))}
          </Stack>
          {result.comment || result.teacher_comment ? (
            <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
              {result.teacher_comment ?? result.comment}
            </Typography>
          ) : null}
          <ReferencePassages passages={references?.data} pending={Boolean(references?.isPending)} failed={Boolean(references?.isError)} />
          {overridden || result.needs_review ? (
            <Stack direction="row" spacing={0.5}>
              {overridden ? (
                <ActionIcon label="Use the checker's mark" disabled={edit.isPending} onClick={() => edit.mutate({ number: result.question_number, edit: { clear_override: true } })}>
                  <Undo2 size={15} />
                </ActionIcon>
              ) : null}
              {result.needs_review ? (
                <ActionIcon label="Clear the flag" disabled={edit.isPending} onClick={() => edit.mutate({ number: result.question_number, edit: { clear_review: true } })}>
                  <FlagOff size={15} />
                </ActionIcon>
              ) : null}
            </Stack>
          ) : null}
        </Stack>
      </Collapse>
      {edit.isError ? (
        <Alert severity="error" variant="outlined" sx={{ mt: 1, py: 0 }}>
          {failureText(edit.error)}
        </Alert>
      ) : null}
    </Box>
  );
}
