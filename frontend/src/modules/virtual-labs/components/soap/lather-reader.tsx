'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { LEAST_COUNT, type Lather } from '@labs/lib/soap/chemistry';
import { clamp } from '@labs/lib/numbers';

import { apparatus } from '../apparatus-palette';
import { benchMotionSx, motionSx, useBenchMotion } from '../bench-motion';

import { ScaleRule, TubeGlass } from './tube-art';

/**
 * The selected tube, magnified, with the millimetre scale against it — docked
 * beside the box the height is typed into.
 *
 * In the rack a froth column is drawn 15px per centimetre, so one millimetre
 * division is 1.5px: enough to see that there IS froth, nowhere near enough to
 * say how much. This is the same drawing at 25px per centimetre, where a
 * division is legible and the reading can be made while looking at the box it
 * goes into. It is this bench's version of reading a needle against fifty
 * divisions, and it is the skill being marked: full marks inside one division,
 * half inside two.
 *
 * The scale stands with its ZERO AT THE WATER LINE, because that is how it is
 * held against a real tube — the froth column's height then reads straight off
 * it, with no subtraction.
 */

export const CLOSE_UP = { width: 150, height: 330, cx: 104, top: 12, bottom: 318, w: 46, pxcm: 25 } as const;
/** How tall a column the scale is drawn for. A tube cannot froth past this. */
const SCALE_CM = 5;

export function LatherReader({
  lather,
  caption,
  /** Shown against the scale as a dashed line: what the student has written. */
  reading,
  /** Omitted outside the recording step: the close-up is then a look, not an input. */
  onRead,
  measured,
  maxWidth,
}: {
  lather: Lather;
  caption: React.ReactNode;
  reading: number | null;
  onRead?: (cm: number) => void;
  /** The scale is against this tube and nothing has changed since. */
  measured: boolean;
  maxWidth?: number;
}): React.ReactElement {
  const theme = useTheme();
  const moving = useBenchMotion();
  const svgRef = React.useRef<SVGSVGElement | null>(null);

  const yZero = CLOSE_UP.bottom - 3 - lather.waterCm * CLOSE_UP.pxcm;
  const pinned = reading === null ? null : clamp(reading, 0, SCALE_CM);

  /** Where on the scale the pointer landed, in centimetres above the water line. */
  const cmAt = (clientY: number): number | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    if (!box.height) return null;
    const k = box.height / CLOSE_UP.height;
    const cm = (yZero - (clientY - box.top) / k) / CLOSE_UP.pxcm;
    return Math.round(clamp(cm, 0, SCALE_CM) * 10) / 10;
  };

  const nudge = (by: number): void => {
    if (!onRead) return;
    const next = clamp((pinned ?? 0) + by, 0, SCALE_CM);
    onRead(Math.round(next * 10) / 10);
  };

  const interactive = Boolean(onRead) && measured;
  // A tube is more than twice as tall as it is wide, so its width is what
  // decides how much of the console it eats. On a short console the workspace
  // hands down a narrower aside, and the tube shrinks with it rather than
  // pushing the notebook tabs off the screen.
  const glassWidth = Math.round(Math.max(74, Math.min(108, (maxWidth ?? 320) * 0.34)));

  return (
    <Box data-tour="soap-closeup" sx={{ maxWidth, mx: 'auto', width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 1.25 }}>
        <Box
          sx={{
            flex: 'none',
            width: glassWidth,
            borderRadius: `${theme.band.radius.sm}px`,
            backgroundColor: apparatus.bench,
            p: 0.75,
            // The froth climbs here exactly as it does in the rack.
            ...benchMotionSx,
            ...motionSx(moving),
          }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CLOSE_UP.width} ${CLOSE_UP.height}`}
            role={interactive ? 'slider' : 'img'}
            tabIndex={interactive ? 0 : undefined}
            aria-label={
              interactive
                ? 'Froth height read off the scale, centimetres'
                : 'Close-up of the selected tube with the centimetre scale beside it'
            }
            aria-orientation={interactive ? 'vertical' : undefined}
            aria-valuemin={interactive ? 0 : undefined}
            aria-valuemax={interactive ? SCALE_CM : undefined}
            aria-valuenow={interactive ? (pinned ?? 0) : undefined}
            aria-valuetext={
              interactive ? (pinned === null ? 'nothing read yet' : `${pinned.toFixed(1)} centimetres`) : undefined
            }
            style={{ display: 'block', width: '100%', height: 'auto', cursor: interactive ? 'crosshair' : 'default' }}
            onClick={
              interactive
                ? (e) => {
                    const cm = cmAt(e.clientY);
                    if (cm !== null && onRead) onRead(cm);
                  }
                : undefined
            }
            onKeyDown={
              interactive
                ? (e) => {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
                      e.preventDefault();
                      nudge(LEAST_COUNT);
                    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
                      e.preventDefault();
                      nudge(-LEAST_COUNT);
                    } else if (e.key === 'Home') {
                      e.preventDefault();
                      if (onRead) onRead(0);
                    }
                  }
                : undefined
            }
          >
            {measured && lather.volume > 0 ? (
              <ScaleRule x={28} width={46} yZero={yZero} pxcm={CLOSE_UP.pxcm} cm={SCALE_CM} fine />
            ) : null}
            <TubeGlass lather={lather} geometry={CLOSE_UP} detail corked={false} bubbleSeed={9} />
            {measured && pinned !== null ? (
              <g aria-hidden="true">
                <line
                  x1={22}
                  y1={yZero - pinned * CLOSE_UP.pxcm}
                  x2={CLOSE_UP.width - 6}
                  y2={yZero - pinned * CLOSE_UP.pxcm}
                  stroke={apparatus.hintRing}
                  strokeWidth={1.6}
                  strokeDasharray="5 3"
                />
                <path
                  d={`M${CLOSE_UP.width - 6} ${yZero - pinned * CLOSE_UP.pxcm} l-7 -4 v8 Z`}
                  fill={apparatus.hintRing}
                />
              </g>
            ) : null}
          </svg>
        </Box>

        <Box sx={{ minWidth: 0, alignSelf: 'center' }}>
          <Typography sx={{ fontSize: theme.band.type.min + 0.5, color: theme.brand.sub, textWrap: 'pretty' }}>
            {caption}
          </Typography>
          {measured ? (
            <Typography sx={{ mt: 0.75, fontSize: theme.band.type.min, color: theme.brand.tert, textWrap: 'pretty' }}>
              Zero sits on the water line, so the froth reads straight off. Each small division is {LEAST_COUNT} cm.
              {interactive ? ' Tap the scale where the froth ends, or use ↑ ↓.' : null}
            </Typography>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}
