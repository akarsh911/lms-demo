'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { Segmented } from '@/components/ui';

import { DialFace, DialNeedle } from './analog-dial';
import { apparatus } from './apparatus-palette';
import type { NeedleRef } from './use-spring-needles';

/**
 * A magnified meter, docked beside the inputs it is read into.
 *
 * On the bench a dial is drawn 100–170px wide, which puts one of its fifty
 * scale divisions under 2.5px: unreadable, so the close-up was a modal, and
 * every reading cost six round trips — open ammeter, close, open voltmeter,
 * close, scroll, type. The modal also covered the very field it was needed for.
 *
 * Docking it solves that. At the console's width one division is ~5.5px, the
 * needle is live, and the number is typed directly underneath while looking at
 * it. Which meter is shown follows the dial the student taps on the bench, so
 * the bench stays the way in.
 *
 * The parallax lesson survives: it is still an analog needle against a printed
 * scale, and the caption still says to read it square on.
 */
export type MeterChoice = 'am' | 'vm';

export function MeterReader({
  meter,
  onMeter,
  meters,
  needleRef,
  maxWidth = 320,
  children,
}: {
  meter: MeterChoice;
  onMeter: (next: MeterChoice) => void;
  /** Full-scale, divisions, engraving and dial letter for each meter. */
  meters: Record<
    MeterChoice,
    { label: string; fullScale: number; divs: number; maj?: number; mid?: number; letter: string }
  >;
  /** The animator's callback ref for the shown meter, so this needle moves with the bench's. */
  /** From `useSpringNeedles`. Returns React 19's detach cleanup, so the
   *  same meter may be drawn here AND on the bench, both moving together. */
  needleRef: NeedleRef;
  /** How large the dial may be drawn; the owner shrinks it on a short console. */
  maxWidth?: number;
  /** The fields this reading is typed into. */
  children?: React.ReactNode;
}): React.ReactElement {
  const theme = useTheme();
  const spec = meters[meter];

  return (
    <Box>
      <Segmented
        ariaLabel="Meter to magnify"
        value={meter}
        onChange={onMeter}
        options={[
          { value: 'am', label: meters.am.label },
          { value: 'vm', label: meters.vm.label },
        ]}
      />

      <Box
        sx={{
          mt: 1,
          borderRadius: `${theme.band.radius.md}px`,
          backgroundColor: apparatus.bench,
          p: 1,
          // Big enough that a division is unambiguous; capped so the notebook
          // below it keeps a useful share of the column.
          maxWidth,
          mx: 'auto',
        }}
      >
        <svg
          viewBox="0 0 200 130"
          role="img"
          aria-label={`${spec.label} close-up, 0 to ${spec.fullScale}`}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        >
          <DialFace
            fullScale={spec.fullScale}
            divs={spec.divs}
            maj={spec.maj}
            mid={spec.mid}
            letter={spec.letter}
          />
          <DialNeedle needleRef={needleRef} />
        </svg>
      </Box>

      <Typography
        sx={{ mt: 0.75, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert, textAlign: 'center' }}
      >
        Read square on: one division is {+(spec.fullScale / spec.divs).toFixed(3)} {spec.letter}
      </Typography>

      {children}
    </Box>
  );
}
