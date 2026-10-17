'use client';

import * as React from 'react';

import { apparatus, LABEL_FONT } from '../apparatus-palette';
import { flowClass } from '../bench-motion';

/**
 * The pieces both drawings of this bench are made of: one stroke of travelling
 * light, a stencilled label, and a label on a plate for the ones that have to
 * sit over the light.
 *
 * They live here rather than in `bench.tsx` because the ZOOM PANEL draws the
 * same cone at a different scale, and a second copy of "which way do the dashes
 * run" is exactly the copy that ends up disagreeing with the first.
 */

export interface Pt {
  x: number;
  y: number;
}

/**
 * The four colours light is drawn in.
 *
 * Two of them carry meaning and two do not. `top` and `foot` are the bundles
 * from the TOP and the FOOT of the object: they are told apart by colour
 * precisely so that a student can watch them cross at the pole and arrive the
 * other way up, which is the whole explanation of why a real image is inverted.
 * `axial` and `dim` are just light — the edges of the cone and the body of the
 * arriving beam — and nothing is read off which of the two a stroke is drawn in.
 */
export const RAY = {
  top: '#ffb35c',
  foot: '#7fd4ff',
  axial: '#ffdf9b',
  dim: '#ffe6ad',
} as const;

/**
 * One stroke of travelling light.
 *
 * `from` is where the light leaves and `to` is where it arrives, so every ray
 * on this bench is WRITTEN the way the light runs. The line is then DRAWN along
 * increasing x, the direction the metre scale runs, and the flow direction
 * falls out of whether the two agreed.
 *
 * That is where the mirror and the lens part company. After the convex lens the
 * light carries on to the right, the stroke is drawn the way it travels, and
 * the dashes run forwards. After the concave mirror it comes back the way it
 * came — `setup.side` is −1, so `xImg` lands to the LEFT of the pole — the
 * stroke is drawn against the travel, and `flowClass(-1)` crawls the dashes
 * back towards the mirror. The sign is worked out here, once, from the
 * coordinates the optics gave us; no caller has to remember which way its ray
 * points.
 *
 * Nothing is said by the motion alone. Stopped — which is what
 * `prefers-reduced-motion` and the `animation` flag both do to it — this is
 * still the dashed ray the bench has always drawn, and which way the light went
 * is still written in the cone: it narrows towards the image.
 */
export function LightRay({
  from,
  to,
  stroke,
  width = 1,
  opacity = 0.5,
}: {
  from: Pt;
  to: Pt;
  stroke: string;
  width?: number;
  opacity?: number;
}): React.ReactElement {
  const back = to.x < from.x;
  const a = back ? to : from;
  const b = back ? from : to;
  return (
    <line
      className={flowClass(back ? -1 : 1)}
      x1={a.x.toFixed(2)}
      y1={a.y.toFixed(2)}
      x2={b.x.toFixed(2)}
      y2={b.y.toFixed(2)}
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      opacity={opacity}
      pointerEvents="none"
    />
  );
}

/** A word stencilled on the apparatus. */
export function Label({
  x,
  y,
  text,
  size = 11,
  anchor = 'middle',
  fill = apparatus.benchLabel,
}: {
  x: number;
  y: number;
  text: string;
  size?: number;
  anchor?: 'start' | 'middle' | 'end';
  fill?: string;
}): React.ReactElement {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      textAnchor={anchor}
      fill={fill}
      fontFamily={LABEL_FONT}
      fontWeight={600}
      letterSpacing={1.4}
      pointerEvents="none"
    >
      {text}
    </text>
  );
}

/**
 * The same, on a plate, for the labels that have to sit OVER the drawn light —
 * the blur circle's size, the name of the plane the cone closes in. Yellow text
 * on a yellow cone is unreadable, and these are the two things on the bench a
 * student is actually reading.
 *
 * The plate is sized from the text rather than measured, which is what every
 * SVG does that cannot afford a layout pass. 0.62 em a character is the width
 * of this font's digits and caps, and the run is short and upper case.
 */
export function Tag({
  x,
  y,
  text,
  size = 10,
  fill = apparatus.benchLabel,
  anchor = 'middle',
}: {
  x: number;
  y: number;
  text: string;
  size?: number;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
}): React.ReactElement {
  const w = text.length * (size * 0.62 + 1) + 12;
  const h = size * 1.45 + 4;
  const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  return (
    <g pointerEvents="none">
      <rect x={x0.toFixed(1)} y={(y - size * 1.08).toFixed(1)} width={w.toFixed(1)} height={h.toFixed(1)} rx={5} fill="#0e1615" opacity={0.84} />
      <text
        x={x}
        y={y}
        fontSize={size}
        textAnchor={anchor}
        fill={fill}
        fontFamily={LABEL_FONT}
        fontWeight={700}
        letterSpacing={1}
      >
        {text}
      </text>
    </g>
  );
}
