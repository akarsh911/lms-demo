'use client';

import * as React from 'react';

import { limeAlpha, type Appearance } from '@labs/lib/respiration/biology';

import { apparatus } from '../apparatus-palette';
import { TRACK_CLASS } from '../bench-motion';

/**
 * The tube of lime water, drawn once and used everywhere.
 *
 * How milky the lime water is IS this practical's reading — its version of a
 * needle against fifty divisions — so the tube on the bench, the magnified one
 * docked beside the observation input and the swatch in the table are all this
 * component with one opacity ramp behind them. A student who judges "just
 * turning milky" in the close-up is judging exactly what the marking compares
 * against.
 */

/** Bench glass on a dark bench: nearly invisible when clear, opaque when full. */
export function limeFill(m: number): string {
  return `rgba(248,251,252,${limeAlpha(m).toFixed(3)})`;
}

/** The same colour composited over the bench, for an HTML swatch. */
export function limeSwatch(m: number): string {
  const a = limeAlpha(m);
  const bg = [43, 53, 51];
  const fg = [248, 251, 252];
  return `rgb(${bg.map((v, i) => Math.round(v + ((fg[i] ?? 0) - v) * a)).join(',')})`;
}

/** Reference tubes the student holds their own against, as on a colour card. */
export const LIME_REFERENCE: readonly { app: Appearance; m: number; label: string }[] = [
  { app: 'clear', m: 0.01, label: 'Stays clear' },
  { app: 'faint', m: 0.2, label: 'Just turning milky' },
  { app: 'milky', m: 0.8, label: 'Turns milky' },
];

/** Deterministic scatter for the settled precipitate, so it never twitches. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export interface LimeGlassProps {
  /** Fraction of the calcium hydroxide precipitated, 0–1. */
  m: number;
  /** mL in the tube, for where the surface sits. */
  ml: number;
  cx: number;
  top: number;
  bottom: number;
  w: number;
  /** px of tube per mL, and the y of an empty tube's floor. */
  mlPx: number;
  floor: number;
  /** Unique within the document: two tubes cannot share a clip path. */
  uid: string;
}

/** One test tube of lime water, with whatever has come down in it. */
export function LimeGlass({ m, ml, cx, top, bottom, w, mlPx, floor, uid }: LimeGlassProps): React.ReactElement {
  const r = w / 2;
  const glass = `M${cx - r} ${top} V${bottom - r} A${r} ${r} 0 0 0 ${cx + r} ${bottom - r} V${top}`;
  const surface = floor - ml * mlPx;
  const settled = m > 0.35;

  return (
    <>
      <defs>
        <clipPath id={`lime-${uid}`}>
          <path d={glass} />
        </clipPath>
      </defs>
      <path d={glass} fill="rgba(255,255,255,.05)" />
      {ml > 0 ? (
        <g clipPath={`url(#lime-${uid})`}>
          {/*
            Milkiness is integrated by the engine at 10 Hz, and the calcium
            carbonate comes down on the chemistry's own time constant. All
            `track` adds is that each of those ten steps a second is carried
            across to the next, so the tube is seen CLOUDING rather than seen
            to be a slightly different white ten times a second.
          */}
          <rect className={TRACK_CLASS} x={cx - r} y={surface} width={w} height={bottom - surface} fill={limeFill(m)} />
          <rect x={cx - r} y={surface - 1} width={w} height={3} fill="#fff" opacity={0.3} />
          {settled ? (
            <>
              <rect
                className={TRACK_CLASS}
                x={cx - r}
                y={bottom - 6 - (m - 0.35) * 16}
                width={w}
                height={6 + (m - 0.35) * 16}
                fill="#e6eeec"
                opacity={0.85}
              />
              {Array.from({ length: 10 }, (_, k) => (
                <circle
                  key={k}
                  className={TRACK_CLASS}
                  cx={cx - r + 4 + hash(k * 11 + uid.length) * (w - 8)}
                  cy={bottom - 10 - hash(k * 5) * Math.max(4, bottom - surface - 14)}
                  r={1 + hash(k * 17) * 1.3}
                  fill="#b9c9c6"
                  opacity={Math.min(0.75, (m - 0.35) * 1.4)}
                />
              ))}
            </>
          ) : null}
        </g>
      ) : null}
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
    </>
  );
}

/**
 * A reference tube for the comparison strip: the same glass and the same ramp,
 * at a milkiness the student is being asked to recognise.
 */
export function ReferenceTube({ m, uid }: { m: number; uid: string }): React.ReactElement {
  return (
    // Capped rather than sized by its column: this is a colour to hold the tube
    // against, and at a third of the console's width it grew taller than the
    // magnified tube it is there to judge.
    <svg
      viewBox="0 0 36 78"
      role="img"
      aria-hidden="true"
      style={{ display: 'block', width: '100%', maxWidth: 46, height: 'auto', margin: '0 auto' }}
    >
      <rect width={36} height={78} rx={6} fill={apparatus.bench} />
      <LimeGlass m={m} ml={10} cx={18} top={10} bottom={70} w={20} mlPx={4.4} floor={68} uid={uid} />
    </svg>
  );
}
