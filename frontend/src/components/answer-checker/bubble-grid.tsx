'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Typography from '@mui/material/Typography';

import { optionLetter } from '@/lib/answer-checker/paper';
import type { OmrOutcome, OmrResponse } from '@/types/answer-checker';

const OPTIONS = 4;
const BLANK = 'blank';

const OUTCOME_COLOURS: Partial<Record<OmrOutcome, string>> = {
  correct: 'success.main',
  incorrect: 'error.main',
  blank: 'text.secondary',
  multiple: 'warning.main',
};

export function BubbleGrid({
  numbers,
  responses,
  outcomes,
  label,
  onChange,
}: {
  numbers: readonly number[];
  responses: readonly OmrResponse[];
  outcomes: ReadonlyMap<number, OmrOutcome>;
  label: string;
  onChange: (responses: OmrResponse[]) => void;
}): React.ReactElement {
  const chosen = new Map(responses.map((response) => [response.n, response.chosen]));

  const set = (n: number, value: string): void => {
    const next = numbers.map((number) => ({
      n: number,
      chosen: number === n ? (value === BLANK ? [] : [Number(value)]) : (chosen.get(number) ?? []),
    }));
    onChange(next);
  };

  return (
    <Box role="group" aria-label={label} sx={{ display: 'grid', gap: 0.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
      {numbers.map((n) => {
        const marks = chosen.get(n) ?? [];
        const outcome = outcomes.get(n);
        const value = marks.length === 1 ? String(marks[0]) : marks.length === 0 ? BLANK : '';
        return (
          <Box key={n} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ width: 36, fontWeight: 600, color: outcome ? OUTCOME_COLOURS[outcome] : 'text.primary' }}>
              {n}
            </Typography>
            <RadioGroup row value={value} onChange={(event) => set(n, event.target.value)} aria-label={`Question ${n}`}>
              {Array.from({ length: OPTIONS }, (_, index) => (
                <FormControlLabel
                  key={index}
                  value={String(index)}
                  control={<Radio size="small" sx={{ p: 0.5 }} />}
                  label={optionLetter(index)}
                  sx={{ mr: 0.75, '& .MuiFormControlLabel-label': { fontSize: 13 } }}
                />
              ))}
            </RadioGroup>
            {marks.length > 1 ? (
              <Typography variant="caption" color="warning.main">
                {marks.map(optionLetter).join('+')}
              </Typography>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
