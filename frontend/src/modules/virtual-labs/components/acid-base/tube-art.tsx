'use client';

import * as React from 'react';
import Box from '@mui/material/Box';

import {
  bubbleRate,
  CARB_G,
  DROPS,
  liquidColour,
  tubeVol,
  ZN_G,
  type Tube,
} from '@labs/lib/acid-base/chemistry';

import {
  benchMotionSx,
  bubbleTrain,
  motionSx,
  riseOffset,
  riseStyle,
  RISE_CLASS,
  TRACK_CLASS,
  useBenchMotion,
} from '../bench-motion';

/**
 * One test tube, drawn at any size: glass, the liquid clipped to the glass,
 * undissolved solid on the bottom, bubbles while it is fizzing, a meniscus.
 *
 * The same component draws the eight tubes in the rack and the magnified one
 * docked beside the observation the student is writing, so the colour and the
 * fizz they judge by eye are literally the same drawing, larger.
 */
export interface TubeGeometry {
  cx: number;
  top: number;
  bottom: number;
  /** Outside width of the glass. */
  w: number;
  /** Pixels per millilitre, which is what makes 5 mL look like 5 mL. */
  mlPx: number;
}

/**
 * Bubbles are only drawn while gas is actually being produced, and how many
 * depends on the rate. A student grades brisk against slow by eye, so this is
 * the one piece of motion that carries information — which is why it is drawn
 * as a TRAIN whose spacing is the tube's own `bubbleRate`, and not as a count
 * of dots at a phase. A brisk tube is a crowded, quick column and a slow one a
 * sparse, lazy one, and the difference between them survives being stopped.
 *
 * The cap of sixteen is the tube's, not the rate's: past it a narrow tube of
 * water reads as one continuous stream, which is what brisk effervescence
 * looks like anyway.
 */
function bubbles(t: Tube, cx: number, w: number, surf: number, bottom: number): React.ReactElement[] {
  const span = Math.max(8, bottom - 6 - surf - 2);
  const train = bubbleTrain(bubbleRate(t), span, 16);
  const out: React.ReactElement[] = [];
  for (let k = 0; k < train.count; k++) {
    const hx = ((k * 733) % 101) / 101;
    out.push(
      <circle
        key={k}
        className={RISE_CLASS}
        cx={cx - w * 0.33 + hx * w * 0.66}
        cy={bottom - 6 - riseOffset(train, k)}
        r={w * 0.045 + (((k * 29) % 7) / 7) * w * 0.04}
        fill="#fff"
        opacity={0.5}
        style={riseStyle(train)}
      />,
    );
  }
  if (t.rateNow > 0) {
    out.push(
      // The disturbance the stream makes where it breaks the surface. It
      // follows the rate rather than jumping with it, so a tube dying away is
      // watched dying away.
      <ellipse
        key="surface"
        className={TRACK_CLASS}
        cx={cx}
        cy={surf + 1}
        rx={w * 0.34}
        ry={Math.min(5, 1 + t.rateNow * 12)}
        fill="#fff"
        opacity={0.3}
      />,
    );
  }
  return out;
}

function grains(t: Tube, cx: number, w: number, bottom: number): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  const nz = Math.round(Math.min(7, (t.solid.Zn / ZN_G) * 7));
  const nc = Math.round(Math.min(7, (t.solid.Na2CO3 / CARB_G) * 7));
  for (let k = 0; k < nz; k++) {
    out.push(
      <circle
        key={`z${k}`}
        cx={cx - w * 0.28 + (((k * 311) % 97) / 97) * w * 0.56}
        cy={bottom - 6 - (((k * 53) % 11) / 11) * w * 0.38}
        r={w * 0.085}
        fill="#9aa3a8"
        stroke="#5f686c"
        strokeWidth={0.6}
      />,
    );
  }
  for (let k = 0; k < nc; k++) {
    out.push(
      <circle
        key={`c${k}`}
        cx={cx - w * 0.26 + (((k * 197) % 89) / 89) * w * 0.52}
        cy={bottom - 5 - (((k * 71) % 7) / 7) * w * 0.26}
        r={w * 0.07}
        fill="#f2f1ec"
        opacity={0.9}
      />,
    );
  }
  return out;
}

export function TubeArt({
  tube,
  geometry: { cx, top, bottom, w, mlPx },
  clipId,
}: {
  tube: Tube;
  geometry: TubeGeometry;
  /** Unique within the document: the liquid is clipped to the glass. */
  clipId: string;
}): React.ReactElement {
  const moving = useBenchMotion();
  const r = w / 2;
  const glass = `M${cx - r} ${top} V${bottom - r} A${r} ${r} 0 0 0 ${cx + r} ${bottom - r} V${top}`;
  const v = tubeVol(tube);
  const surf = bottom - 3 - v * mlPx;
  const solid = tube.solid.Zn > 0 || tube.solid.Na2CO3 > 0;

  return (
    // The motion rules ride with the tube rather than with the bench: this one
    // component is both a tube in the rack and the magnified copy in the
    // console, and each is mounted under a different SVG.
    <Box component="g" sx={{ ...benchMotionSx, ...motionSx(moving) }}>
      <clipPath id={clipId}>
        <path d={glass} />
      </clipPath>
      <path d={glass} fill="rgba(255,255,255,.05)" />
      {v > 0 ? (
        <g clipPath={`url(#${clipId})`}>
          <rect x={cx - r} y={surf} width={w} height={bottom - surf} fill={liquidColour(tube)} />
          <rect x={cx - r} y={surf - 1} width={w} height={3} fill="#fff" opacity={0.3} />
        </g>
      ) : null}
      {solid ? <g clipPath={`url(#${clipId})`}>{grains(tube, cx, w, bottom)}</g> : null}
      {v > 0 ? <g clipPath={`url(#${clipId})`}>{bubbles(tube, cx, w, surf, bottom)}</g> : null}
      <path d={glass} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth={1.4} />
      <line
        x1={cx - r + w * 0.2}
        y1={top + 6}
        x2={cx - r + w * 0.2}
        y2={bottom - r}
        stroke="#fff"
        strokeWidth={w * 0.07}
        opacity={0.22}
      />
      <ellipse cx={cx} cy={top} rx={r + 1} ry={w * 0.09} fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={1.4} />
    </Box>
  );
}

/** How deeply the litmus is dyed, for the swatch in the observation table. */
export const dyeStrength = (tube: Tube): number =>
  Math.min(1, (tube.drops.blue + tube.drops.red) / DROPS);
