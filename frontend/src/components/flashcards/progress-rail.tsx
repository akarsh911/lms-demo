'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

import type { AnswerVerdict, DeckAttempt } from '@/types/flashcards';

import { VERDICT_TONE } from './palette';

const LABEL: Readonly<Record<AnswerVerdict, string>> = {
  correct: 'right',
  almost: 'almost',
  incorrect: 'wrong',
  needs_review: 'not judged',
};

export function ProgressRail({
  cardIds,
  current,
  attempts,
}: {
  cardIds: readonly string[];
  current: number;
  attempts: readonly DeckAttempt[];
}): React.ReactElement {
  const theme = useTheme();
  const verdicts = new Map(attempts.map((a) => [a.card_id, a.verdict]));
  const done = attempts.length;
  const total = cardIds.length;

  return (
    <Box
      role="img"
      aria-label={`Card ${current + 1} of ${total}, ${done} answered`}
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}
    >
      {cardIds.map((cardId, index) => {
        const verdict = verdicts.get(cardId) ?? null;
        const tone = verdict ? VERDICT_TONE[verdict] : null;
        const passed = index < current;
        const here = index === current;
        return (
          <Box
            key={cardId}
            title={verdict ? `Card ${index + 1}: ${LABEL[verdict]}` : passed ? `Card ${index + 1}: skipped` : undefined}
            sx={{
              width: here ? 22 : 10,
              height: 10,
              borderRadius: 5,
              flex: 'none',
              transition: 'width .25s ease',
              bgcolor: tone ? theme.onTint[tone] : here ? theme.palette.primary.main : theme.brand.sunken,
              border: !tone && passed ? `1px solid ${theme.brand.line2}` : 'none',
              opacity: tone ? 0.85 : 1,
            }}
          />
        );
      })}
    </Box>
  );
}
