'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Check, X } from 'lucide-react';

import { RichText } from './rich-text';

/**
 * A set of multiple-choice questions where the FIRST answer counts.
 *
 * For a viva, a check-your-understanding, a quick quiz. Once a question is
 * answered its options lock, the right one is marked, a wrong pick is marked,
 * and the explanation appears. What happens to the answer (marks, a log) is the
 * owner's business; this only draws it.
 *
 * Each question is a `radiogroup` whose options are `radio`s, so it reads as a
 * choice rather than a row of unrelated buttons. `explain` adds anything under
 * an answered question's explanation: a textbook citation, a diagram.
 */
export interface ChoiceQuestion {
  q: string;
  options: readonly string[];
  /** Index of the correct option. */
  answer: number;
  /** In engine markup (`**bold**`). Shown once answered. */
  why?: string;
}

export function ChoiceQuiz({
  questions,
  picks,
  onPick,
  explain,
  idPrefix,
}: {
  questions: readonly ChoiceQuestion[];
  /** The option picked for each question, or null while unanswered. */
  picks: readonly (number | null)[];
  onPick: (question: number, option: number) => void;
  explain?: (question: number) => React.ReactNode;
  idPrefix: string;
}): React.ReactElement {
  const theme = useTheme();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {questions.map((question, i) => {
        const pick = picks[i] ?? null;
        const answered = pick !== null;
        const labelId = `${idPrefix}-q${i}`;
        return (
          <Box
            key={question.q}
            sx={{
              pt: i ? 1.5 : 0.5,
              mt: i ? 1.5 : 0,
              borderTop: i ? `1px solid ${theme.brand.line}` : 0,
            }}
          >
            <Typography id={labelId} sx={{ fontWeight: 700, fontSize: theme.band.type.base - 0.5, mb: 1 }}>
              {/* Through RichText like `why` below, not as a bare string: a
                  stem carrying markup would otherwise be shown to the student
                  with the markup in it. */}
              {i + 1}. <RichText text={question.q} />
            </Typography>
            <Box role="radiogroup" aria-labelledby={labelId} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {question.options.map((option, j) => {
                const right = answered && j === question.answer;
                const wrong = answered && j === pick && j !== question.answer;
                return (
                  <ButtonBase
                    key={option}
                    role="radio"
                    aria-checked={pick === j}
                    disabled={answered}
                    onClick={() => onPick(i, j)}
                    sx={{
                      justifyContent: 'space-between',
                      gap: 1,
                      textAlign: 'left',
                      px: 1.5,
                      py: 1,
                      borderRadius: `${theme.band.radius.sm}px`,
                      border: '1px solid',
                      borderColor: right ? theme.hues.green : wrong ? theme.hues.red : theme.brand.line2,
                      backgroundColor: right ? theme.tints.green : wrong ? theme.tints.red : theme.brand.subtle,
                      color: theme.brand.text,
                      fontSize: theme.band.type.base - 1,
                      transition: `border-color ${theme.band.motion.fast}ms`,
                      '&:hover': answered ? undefined : { borderColor: theme.brand.orange },
                      '&.Mui-disabled': { color: theme.brand.text },
                      '&.Mui-focusVisible': { outline: `2px solid ${theme.brand.orange}`, outlineOffset: 2 },
                    }}
                  >
                    <span>{option}</span>
                    {right ? <Check size={16} color={theme.onTint.green} aria-label="correct" /> : null}
                    {wrong ? <X size={16} color={theme.onTint.red} aria-label="your answer, incorrect" /> : null}
                  </ButtonBase>
                );
              })}
            </Box>
            {answered && question.why ? (
              <Typography sx={{ fontSize: theme.band.type.min + 1, color: theme.brand.sub, mt: 1 }}>
                <RichText text={question.why} />
              </Typography>
            ) : null}
            {answered && explain ? explain(i) : null}
          </Box>
        );
      })}
    </Box>
  );
}
