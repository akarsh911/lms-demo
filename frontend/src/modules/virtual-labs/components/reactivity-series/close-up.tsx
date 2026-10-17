'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { EmergeChip } from '@/components/ui';
import { METAL, SALT, volumeOf, type Tube } from '@labs/lib/reactivity-series/chemistry';
import type { RxState } from '@labs/lib/reactivity-series/state';

import { apparatus } from '../apparatus-palette';
import { benchMotionSx, motionSx, useBenchMotion } from '../bench-motion';

import { CLOSE_UP } from './geometry';
import { TubeGlass } from './tube-glass';

/**
 * The selected tube, magnified, beside the box the observation is typed into.
 *
 * In the rack a tube is 46px wide, which is enough to see that something has
 * happened and not enough to say what. This is where a student actually looks:
 * the same drawing at four times the size, with what is in the tube and how
 * long it has been in there written underneath.
 *
 * Deliberately silent about what the tube SHOWS. Naming the colour change here
 * would answer the very question the student is about to be marked on; the
 * whole practical is reading a tube for yourself.
 */
export function TubeCloseUp({
  state,
  onEmpty,
  maxWidth = 320,
  row = false,
}: {
  state: RxState;
  onEmpty: () => void;
  maxWidth?: number;
  /** Lay the glass and the caption side by side, for a bar under the bench. */
  row?: boolean;
}): React.ReactElement | null {
  const theme = useTheme();
  const moving = useBenchMotion();
  const tube: Tube | undefined = state.tubes[state.sel];
  if (!tube) return null;

  const volume = volumeOf(tube);
  const inFor = tube.start ? Math.round(state.min - tube.start.min) : null;
  const contaminated = tube.added.some((s) => s !== tube.salt);
  const glassWidth = row ? 72 : Math.min(96, maxWidth * 0.32);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        maxWidth: row ? 'none' : maxWidth,
        mx: row ? 0 : 'auto',
      }}
    >
      <Box
        sx={{
          flex: 'none',
          width: glassWidth,
          backgroundColor: apparatus.bench,
          borderRadius: `${theme.band.radius.sm}px`,
          p: 0.75,
          // The magnified tube clouds and plates exactly as its thumbnail does.
          ...benchMotionSx,
          ...motionSx(moving),
        }}
      >
        <svg
          viewBox={`0 0 ${CLOSE_UP.width} ${CLOSE_UP.height}`}
          role="img"
          aria-label={`Close-up of the ${tube.metal} tube in the ${SALT[tube.salt].label} group`}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        >
          <TubeGlass tube={tube} geometry={CLOSE_UP} />
        </svg>
      </Box>

      <Box sx={{ minWidth: 0, fontSize: theme.band.type.base - 1, color: theme.brand.sub }}>
        <Typography
          component="p"
          sx={{ m: 0, fontWeight: 700, color: theme.brand.ink, fontSize: theme.band.type.base }}
        >
          {SALT[tube.salt].label} group · {tube.metal} tube
        </Typography>
        <Typography component="p" sx={{ m: 0, mt: 0.25, fontSize: 'inherit' }}>
          {volume ? `${Math.round(volume * 2) / 2} mL of solution` : 'No solution yet'}
        </Typography>
        <Typography component="p" sx={{ m: 0, fontSize: 'inherit' }}>
          {tube.strip
            ? `${METAL[tube.strip.metal].name} strip, ${tube.strip.clean ? 'cleaned' : 'not cleaned'}${
                inFor !== null ? ` · in for ${inFor} min` : ''
              }`
            : `No strip yet — this tube takes ${METAL[tube.metal].name}`}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75, alignItems: 'center' }}>
          {contaminated ? <EmergeChip tone="red" label="Wrong solution added" /> : null}
          {tube.fresh ? <EmergeChip tone="amber" dot label="Changed since you last looked" /> : null}
          {(volume || tube.strip) && !state.graded ? (
            <Button size="small" color="inherit" onClick={onEmpty}>
              Empty and rinse
            </Button>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}
