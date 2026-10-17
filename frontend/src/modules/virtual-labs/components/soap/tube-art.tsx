'use client';

import * as React from 'react';

import {
  LATHER_RISE_SECONDS,
  LEAST_COUNT,
  SCUM_SETTLE_SECONDS,
  frothBubbles,
  type Lather,
} from '@labs/lib/soap/chemistry';

import { LABEL_FONT } from '../apparatus-palette';
import { TRACK_CLASS, trackStyle } from '../bench-motion';

/**
 * One test tube and the centimetre scale beside it, at any size.
 *
 * Everything drawn here is read off the tube's `Lather` — the water column from
 * its volume, the curdy scum from the soap the ions took out of solution, the
 * froth from the soap that was left. Nothing is looked up from a table of "what
 * a hard-water tube should look like", which is what makes the rack honest
 * evidence for the marking.
 *
 * The same component draws a 40px tube in the rack and a 46-unit one magnified
 * beside the height field, so the tube a student measures cannot disagree with
 * its own thumbnail.
 *
 * THE FROTH CLIMBS rather than appearing. Its height is `m.lather` exactly, the
 * model's own number to the nearest half-millimetre; what the drawing adds is
 * that the tube takes `LATHER_RISE_SECONDS` to get there, which is a property of
 * soap and lives in the chemistry with the rest of them. So every part of the
 * column — the white body, its cap line, the bubbles in it — is mounted from
 * the moment there is water in the tube and driven by the model instead of
 * appearing when it crosses a threshold: a rect that were mounted at full height
 * would have nothing to rise FROM.
 */

/**
 * Colours of PHYSICAL things, as in `apparatus-palette.ts`: soapy froth, curdy
 * scum, a boxwood scale, a cork. They depict real objects and must not follow
 * the theme — a student recognises a scale by exactly this cream and these
 * brown divisions.
 */
const GLASS = {
  water: '#b5d8ee',
  meniscus: '#cfe6f5',
  froth: '#ffffff',
  scum: '#eef2ef',
  scumSkin: '#e4eae6',
  cork: '#c99a5e',
  corkEdge: '#8d6a3c',
} as const;

const SCALE = {
  wood: '#f2e4c4',
  edge: '#bda87b',
  rule: '#6b5a34',
  ink: '#4d4026',
  caption: '#cbb98e',
} as const;

export interface TubeGeometry {
  cx: number;
  top: number;
  bottom: number;
  /** Bore of the tube. */
  w: number;
  /** Pixels per centimetre of column. */
  pxcm: number;
}

/** Deterministic pseudo-random in [0,1): same tube, same bubbles, every render. */
function rnd(s: number): number {
  const x = Math.sin(s * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A drift of bubbles filling a box. Used for froth and for suspended scum.
 *
 * `slots` is how many bubbles the box is drawn with room for and `count` how
 * many of them the model says are there; the rest are drawn at nothing. Every
 * bubble stays mounted either way, so one arriving fades up and the whole drift
 * rides the box as it grows instead of the lot of them being rebuilt each time
 * the count changes.
 */
function Foam({
  x,
  y,
  w,
  h,
  slots,
  count,
  seed,
  rMin,
  rMax,
  colour,
  opacityLow,
  opacityHigh,
  settle,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  slots: number;
  count: number;
  seed: number;
  rMin: number;
  rMax: number;
  colour: string;
  opacityLow: number;
  opacityHigh: number;
  /** Seconds this kind of foam takes to gather, from the chemistry. */
  settle: number;
}): React.ReactElement | null {
  if (w < 1.2 || slots <= 0) return null;
  const box = Math.max(0, h);
  const circles = Array.from({ length: slots }, (_, i) => {
    const a = rnd(seed + i * 1.7);
    const b = rnd(seed + i * 3.1 + 11);
    const c = rnd(seed + i * 5.3 + 23);
    const r = Math.max(0.6, Math.min(rMin + (rMax - rMin) * c, w / 2.4, Math.max(box, 1.2) / 2));
    return {
      cx: x + r + a * (w - 2 * r),
      cy: y + r + b * Math.max(0, box - 2 * r),
      r,
      o: i < count ? opacityLow + (opacityHigh - opacityLow) * c : 0,
    };
  });
  const style = trackStyle(settle);
  return (
    <>
      {circles.map((c, i) => (
        <circle
          key={i}
          className={TRACK_CLASS}
          style={style}
          cx={c.cx.toFixed(1)}
          cy={c.cy.toFixed(1)}
          r={c.r.toFixed(1)}
          fill={colour}
          opacity={c.o.toFixed(2)}
        />
      ))}
    </>
  );
}

/** Bubbles the froth column is drawn with room for, in the rack and magnified. */
const FROTH_SLOTS = { rack: 34, detail: 70 } as const;
/** …and the suspended curdy scum, which never fills the tube the way froth does. */
const SCUM_SLOTS = 34;

export function TubeGlass({
  lather,
  geometry,
  /** More bubbles in the close-up, where they are big enough to see. */
  detail = false,
  /** The cork is in: the tube has been shaken. */
  corked = false,
  /** Keeps two tubes from growing identical froth. */
  bubbleSeed = 1,
}: {
  lather: Lather;
  geometry: TubeGeometry;
  detail?: boolean;
  corked?: boolean;
  bubbleSeed?: number;
}): React.ReactElement {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const { cx, top, bottom, w, pxcm } = geometry;
  const r = w / 2;
  const base = bottom - 3;
  const glass = `M${cx - r} ${top} V${bottom - r} A${r} ${r} 0 0 0 ${cx + r} ${bottom - r} V${top}`;

  const m = lather;
  const waterTop = base - m.waterCm * pxcm;
  const frothTop = waterTop - m.lather * pxcm;
  const scumPx = Math.min(m.scumCm, m.waterCm) * pxcm;
  // Hard water going cloudy: the more soap the ions have taken out, the milkier.
  const cloud = Math.min(0.3, m.scum * 0.045);
  const slots = detail ? FROTH_SLOTS.detail : FROTH_SLOTS.rack;
  const frothStyle = trackStyle(LATHER_RISE_SECONDS);

  return (
    <>
      <defs>
        <clipPath id={`soap-cl-${uid}`}>
          <path d={glass} />
        </clipPath>
      </defs>
      <path d={glass} fill="rgba(255,255,255,.05)" />

      {m.volume > 0 ? (
        <g clipPath={`url(#soap-cl-${uid})`}>
          <rect
            className={TRACK_CLASS}
            x={cx - r}
            y={waterTop}
            width={w}
            height={base - waterTop}
            fill={GLASS.water}
            opacity={(0.4 + cloud).toFixed(3)}
          />

          {/* Curdy scum, gathering on the model's own `scum`. */}
          <Foam
            x={cx - r}
            y={waterTop}
            w={w}
            h={base - waterTop}
            slots={SCUM_SLOTS}
            count={m.scum > 0.2 ? Math.min(SCUM_SLOTS, Math.round(m.scum * 4)) : 0}
            seed={bubbleSeed * 7 + 5}
            rMin={w * 0.035}
            rMax={w * 0.085}
            colour={GLASS.scum}
            opacityLow={0.5}
            opacityHigh={0.95}
            settle={SCUM_SETTLE_SECONDS}
          />
          <rect
            className={TRACK_CLASS}
            style={trackStyle(SCUM_SETTLE_SECONDS)}
            x={cx - r}
            y={waterTop}
            width={w}
            height={Math.max(0, scumPx).toFixed(1)}
            fill={GLASS.scumSkin}
            opacity={m.scum > 0.2 && scumPx > 0.8 ? 0.9 : 0}
          />

          {/* The froth column: `m.lather` tall exactly, reached over half a second. */}
          <rect
            className={TRACK_CLASS}
            style={frothStyle}
            x={cx - r}
            y={frothTop}
            width={w}
            height={Math.max(0, waterTop - frothTop).toFixed(1)}
            fill="rgba(255,255,255,.5)"
          />
          <Foam
            x={cx - r}
            y={frothTop}
            w={w}
            h={waterTop - frothTop}
            slots={slots}
            count={frothBubbles(m, slots)}
            seed={bubbleSeed * 13 + 2}
            rMin={w * 0.055}
            rMax={w * 0.15}
            colour={GLASS.froth}
            opacityLow={0.35}
            opacityHigh={0.95}
            settle={LATHER_RISE_SECONDS}
          />
          <rect
            className={TRACK_CLASS}
            style={frothStyle}
            x={cx - r}
            y={frothTop.toFixed(1)}
            width={w}
            height={1.6}
            fill={GLASS.froth}
            opacity={m.lather > 0.02 ? 0.95 : 0}
          />

          <rect
            className={TRACK_CLASS}
            x={cx - r}
            y={(waterTop - 1).toFixed(1)}
            width={w}
            height={2.4}
            fill={GLASS.meniscus}
            opacity={0.85}
          />
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
      {corked ? (
        <rect
          x={cx - r * 0.62}
          y={top - 9}
          width={(r * 1.24).toFixed(1)}
          height={11}
          rx={2.5}
          fill={GLASS.cork}
          stroke={GLASS.corkEdge}
        />
      ) : null}
    </>
  );
}

/**
 * A vertical centimetre scale, zero at `yZero` and reading upwards.
 *
 * Held against the tube with its zero ON THE WATER LINE, so the froth column's
 * height reads straight off it — which is exactly how it is done with a real
 * scale and a real tube, and why a student has to get the tube settled before
 * measuring.
 */
export function ScaleRule({
  x,
  width,
  yZero,
  pxcm,
  cm,
  /** Millimetre divisions. Only legible in the magnified view. */
  fine = false,
}: {
  x: number;
  width: number;
  yZero: number;
  pxcm: number;
  cm: number;
  fine?: boolean;
}): React.ReactElement {
  const top = yZero - cm * pxcm;
  const step = fine ? LEAST_COUNT : 0.5;
  const steps = Math.round(cm / step);
  const ticks = Array.from({ length: steps + 1 }, (_, i) => {
    const v = Math.round(i * step * 10) / 10;
    const y = yZero - v * pxcm;
    const major = Math.abs(v - Math.round(v)) < 1e-9;
    const half = Math.abs(v * 2 - Math.round(v * 2)) < 1e-9;
    return { v, y, major, len: major ? width * 0.62 : half ? width * 0.42 : width * 0.24 };
  });

  return (
    <g aria-hidden="true">
      <rect
        x={x}
        y={top - 8}
        width={width}
        height={cm * pxcm + 16}
        rx={2}
        fill={SCALE.wood}
        stroke={SCALE.edge}
        strokeWidth={1}
      />
      {ticks.map((t) => (
        <React.Fragment key={t.v}>
          <line
            x1={(x + width - t.len).toFixed(1)}
            y1={t.y.toFixed(1)}
            x2={x + width}
            y2={t.y.toFixed(1)}
            stroke={SCALE.rule}
            strokeWidth={t.major ? 1.3 : 0.7}
          />
          {t.major ? (
            <text
              x={x + 2.5}
              y={(t.y + (fine ? 3.4 : 3)).toFixed(1)}
              fontSize={fine ? 9.5 : 8}
              fill={SCALE.ink}
              fontFamily={LABEL_FONT}
              fontWeight={600}
            >
              {t.v}
            </text>
          ) : null}
        </React.Fragment>
      ))}
      <text
        x={x + width / 2}
        y={top - 12}
        fontSize={fine ? 9 : 8}
        textAnchor="middle"
        fill={SCALE.caption}
        fontFamily={LABEL_FONT}
        fontWeight={600}
      >
        cm
      </text>
    </g>
  );
}

export { SCALE as SCALE_COLOURS, GLASS as GLASS_COLOURS };
