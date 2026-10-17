'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';

import { EmergeChip, type ChipTone } from '@/components/ui/chip';
import type { OmrMarkingResult } from '@/types/answer-checker';

const HARDEST = 3;

function tone(share: number): ChipTone {
  if (share >= 0.75) return 'green';
  return share >= 0.5 ? 'amber' : 'red';
}

export function QuestionDifficulty({ results }: { results: readonly OmrMarkingResult[] }): React.ReactElement {
  const numbers = results[0]?.questions.map((row) => row.n) ?? [];
  const shares = numbers.map((n) => {
    const correct = results.filter((result) => result.questions.find((row) => row.n === n)?.outcome === 'correct').length;
    return { n, share: results.length ? correct / results.length : 0 };
  });
  const hardest = new Set([...shares].sort((left, right) => left.share - right.share).slice(0, HARDEST).map((row) => row.n));

  return (
    <Card>
      <CardHeader title="Question difficulty" subheader={`Share of ${results.length} pupils who chose the keyed answer`} />
      <CardContent>
        <Box sx={{ display: 'grid', columnGap: 4, rowGap: 1.25, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
          {shares.map(({ n, share }) => (
            <Box key={n} sx={{ display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr) 44px 72px', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="subtitle2">Q{n}</Typography>
              <Box sx={(theme) => ({ height: 10, borderRadius: 5, overflow: 'hidden', bgcolor: theme.brand.sunken })} aria-hidden>
                <Box sx={(theme) => ({ width: `${Math.round(share * 100)}%`, height: '100%', bgcolor: theme.onTint[tone(share)], opacity: 0.85 })} />
              </Box>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                {Math.round(share * 100)}%
              </Typography>
              {hardest.has(n) ? <EmergeChip label="Hardest" tone="red" /> : <span />}
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
