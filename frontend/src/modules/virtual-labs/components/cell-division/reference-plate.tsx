'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { FEATURE_TEXT, SPECIMENS, type SpecimenId } from '@labs/lib/cell-division/specimens';

import { apparatus } from '../apparatus-palette';

import { SpecimenFigure } from './specimen-art';

/**
 * The reference plate: the six stages, drawn, to choose between.
 *
 * This is the practical's scale. Reading a stage in the eyepiece is the same
 * problem as reading a needle against a printed scale — the answer is only as
 * good as how close the two are — so the plate is docked in the console beside
 * the box the identification is written into rather than left as a figure in
 * the book. Held apart, a student guesses; held together, they compare.
 *
 * Every figure here is the SAME drawing the eyepiece renders, at the same
 * scale relative to its own field. What differs is that the plate is labelled.
 */

/** One reference figure in its own little field of view. */
export function ReferenceFigure({ id, size = 64 }: { id: SpecimenId; size?: number }): React.ReactElement {
  const uid = `ref${id}`;
  return (
    <svg
      viewBox="-36 -36 72 72"
      width={size}
      height={size}
      role="img"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <defs>
        <clipPath id={`${uid}-clip`}>
          <circle cx={0} cy={0} r={34} />
        </clipPath>
      </defs>
      <circle cx={0} cy={0} r={34} fill="#f5ecd9" />
      <g clipPath={`url(#${uid}-clip)`}>
        <SpecimenFigure id={id} />
      </g>
      <circle cx={0} cy={0} r={34} fill="none" stroke="#2b3335" strokeWidth={3} />
    </svg>
  );
}

export type PlateMode = 'identify' | 'record' | 'reference';

export function ReferencePlate({
  mode,
  picked,
  onPick,
  caption,
  maxWidth,
  columns = 2,
}: {
  /** `identify` writes the organism and the process; `record` writes what was seen. */
  mode: PlateMode;
  /** The figure that matches what has been written for the slide in hand. */
  picked: SpecimenId | null;
  onPick?: (id: SpecimenId) => void;
  caption?: React.ReactNode;
  maxWidth?: number;
  columns?: number;
}): React.ReactElement {
  const theme = useTheme();
  const live = Boolean(onPick);

  return (
    <Box data-tour="cd-plate" sx={{ maxWidth, mx: 'auto', width: '100%' }}>
      <Typography
        sx={{
          fontSize: theme.band.type.min,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: theme.brand.tert,
          fontWeight: 700,
        }}
      >
        Reference plate — the six stages
      </Typography>

      <Box
        role={live ? 'group' : undefined}
        aria-label={live ? 'Reference plate — pick the figure that matches what you can see' : undefined}
        sx={{ mt: 0.75, display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 0.75 }}
      >
        {SPECIMENS.map((s) => {
          const on = picked === s.id;
          return (
            <Box
              key={s.id}
              component={live ? 'button' : 'div'}
              type={live ? 'button' : undefined}
              onClick={live ? () => onPick?.(s.id) : undefined}
              aria-pressed={live ? on : undefined}
              aria-label={live ? `${s.organism}, ${s.process}` : undefined}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                p: 0.5,
                m: 0,
                textAlign: 'left',
                font: 'inherit',
                cursor: live ? 'pointer' : 'default',
                borderRadius: `${theme.band.radius.sm}px`,
                border: `1px solid ${on ? theme.brand.ink : theme.brand.line}`,
                backgroundColor: on ? theme.brand.subtle : 'transparent',
                boxShadow: on ? `0 0 0 1px ${theme.brand.ink}` : 'none',
                transition: `border-color ${theme.band.motion.fast}ms`,
                '&:hover': live ? { borderColor: theme.brand.orange } : undefined,
                '&:focus-visible': { outline: `2px solid ${theme.brand.orange}`, outlineOffset: 2 },
              }}
            >
              <Box sx={{ flex: 'none' }}>
                <ReferenceFigure id={s.id} size={44} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Box
                  component="span"
                  sx={{
                    display: 'block',
                    fontSize: theme.band.type.min + 0.5,
                    fontWeight: 800,
                    color: theme.brand.ink,
                    fontStyle: s.organism === 'Yeast' ? 'normal' : 'italic',
                  }}
                >
                  {s.organism}
                </Box>
                <Box
                  component="span"
                  sx={{ display: 'block', fontSize: theme.band.type.min - 0.5, color: theme.brand.sub, lineHeight: 1.2 }}
                >
                  {mode === 'record' ? FEATURE_TEXT[s.feature] : s.process}
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Typography sx={{ mt: 0.5, fontSize: theme.band.type.min, color: theme.brand.tert, textWrap: 'pretty' }}>
        {caption ??
          (mode === 'identify'
            ? 'Three of the six are reproducing and three are not. Tap the figure your field matches to record it.'
            : mode === 'record'
              ? 'Tap the figure that matches what was actually in the field for this slide.'
              : 'The stains are the same in the eyepiece: nucleus purple, yeast walls blue, Hydra pink.')}
      </Typography>
    </Box>
  );
}

/** The plate at full width, with the feature that identifies each stage spelt out. */
export function ReferenceSheet(): React.ReactElement {
  const theme = useTheme();
  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1 }}>
        {SPECIMENS.map((s) => (
          <Box
            key={s.id}
            sx={{
              display: 'flex',
              gap: 1,
              p: 1,
              borderRadius: `${theme.band.radius.sm}px`,
              border: `1px solid ${theme.brand.line}`,
              backgroundColor: apparatus.bench,
            }}
          >
            <Box sx={{ flex: 'none' }}>
              <ReferenceFigure id={s.id} size={56} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Box component="span" sx={{ display: 'block', fontSize: theme.band.type.min + 1, fontWeight: 800, color: '#eef3f1' }}>
                {s.organism} — {s.process}
              </Box>
              <Box component="span" sx={{ display: 'block', fontSize: theme.band.type.min, color: apparatus.benchInk, lineHeight: 1.3 }}>
                {FEATURE_TEXT[s.feature]}
              </Box>
              <Box component="span" sx={{ display: 'block', mt: 0.5, fontSize: theme.band.type.min - 0.5, color: apparatus.benchInkMuted }}>
                {s.dividing ? 'one parent, no gametes — asexual' : 'nothing is dividing on this slide'}
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
      <Typography sx={{ mt: 1, fontSize: theme.band.type.min + 0.5, color: theme.brand.sub, textWrap: 'pretty' }}>
        Three organisms, each on two slides: one caught reproducing and one not. A slide with no bud on it is not a
        budding slide, however much it looks like the one in the book.
      </Typography>
    </Box>
  );
}
