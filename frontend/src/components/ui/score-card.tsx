'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Star } from 'lucide-react';

/**
 * The result of a marked activity: the score, up to three stars, and every
 * marked part WITH the rule it was marked by.
 *
 * Showing the basis next to each mark is the point, not decoration: a student
 * who lost marks can see exactly which rule cost them, and a teacher can check
 * a grade without the code that produced it. `details` holds anything
 * disclosable underneath (the mistake log, the raw attempt record).
 */
export interface ScorePart {
  label: string;
  earned: number;
  max: number;
  /** The marking rule, in plain words. */
  basis?: string;
}

export function ScoreCard({
  title = 'Complete',
  score,
  max,
  stars,
  summary,
  parts,
  details,
  actions,
}: {
  title?: string;
  score: number;
  max: number;
  /** 0–3. Omit for no stars. */
  stars?: 0 | 1 | 2 | 3;
  summary?: React.ReactNode;
  parts: readonly ScorePart[];
  details?: React.ReactNode;
  actions?: React.ReactNode;
}): React.ReactElement {
  const theme = useTheme();
  const format = (n: number): string => (Math.round(n * 10) / 10).toString();

  return (
    <Box>
      <Typography component="h3" sx={{ fontFamily: theme.typography.h1.fontFamily, fontWeight: 800, fontSize: theme.band.type.h3, color: theme.brand.ink }}>
        {title}
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, mt: 0.5, flexWrap: 'wrap' }}>
        <Typography
          sx={{
            fontSize: theme.band.type.h1 * 1.6,
            fontFamily: theme.typography.h1.fontFamily,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '-0.03em',
            color: theme.brand.ink,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {score}
        </Typography>
        <Typography sx={{ color: theme.brand.tert, fontWeight: 700 }}>/ {max}</Typography>
        {stars !== undefined ? (
          <Box role="img" aria-label={`${stars} of 3 stars`} sx={{ display: 'flex', gap: 0.25, ml: 0.5 }}>
            {[0, 1, 2].map((i) => (
              <Star
                key={i}
                size={22}
                strokeWidth={1.5}
                fill={i < stars ? theme.hues.amber : 'none'}
                color={i < stars ? theme.hues.amber : theme.brand.line2}
              />
            ))}
          </Box>
        ) : null}
      </Box>

      {summary ? (
        <Typography sx={{ color: theme.brand.sub, fontSize: theme.band.type.base - 1, mt: 1 }}>{summary}</Typography>
      ) : null}

      <Box
        component="dl"
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          columnGap: 1.5,
          rowGap: 0.75,
          mt: 1.5,
          mb: 0,
          fontSize: theme.band.type.base - 1,
        }}
      >
        {parts.map((part) => (
          <React.Fragment key={part.label}>
            <Box component="dt" sx={{ m: 0 }}>
              {part.label}
              {part.basis ? (
                <Box component="span" sx={{ display: 'block', color: theme.brand.tert, fontSize: theme.band.type.min }}>
                  {part.basis}
                </Box>
              ) : null}
            </Box>
            <Box component="dd" sx={{ m: 0, fontWeight: 800, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {format(part.earned)} / {part.max}
            </Box>
          </React.Fragment>
        ))}
      </Box>

      {details}
      {actions ? <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>{actions}</Box> : null}
    </Box>
  );
}
