'use client';

import * as React from 'react';

import {
  METAL,
  depositColour,
  depositGrains,
  depositOpacity,
  liquidColour,
  volumeOf,
  type Tube,
} from '@labs/lib/reactivity-series/chemistry';

import { TRACK_CLASS } from '../bench-motion';

/**
 * One test tube, at any size: the glass, the liquid clipped to it, the strip,
 * whatever has settled on the strip, and a meniscus.
 *
 * Every colour here is read off the tube's contents — the blend of what is
 * dissolved in it and the metal that has actually been displaced onto the
 * strip. Nothing is looked up from a table of "what this tube should look
 * like", which is what makes the rack honest evidence for the marking.
 *
 * The same component draws a 46px tube in the rack and a 56px one in the
 * close-up, so the magnified tube cannot disagree with its own thumbnail.
 *
 * IT ALSO MOVES, and for the same reason it is honest: `react()` integrates a
 * first-order displacement ten times a second, so the blue really is draining
 * out of the solution and the metal really is arriving on the strip, on the
 * exponential the rate constant `K` gives. All the drawing adds is `track`, so
 * those ten steps a second are carried across rather than seen as ten jumps.
 * Stop the motion and every colour, every opacity and every crystal is exactly
 * where the model has it — the change is in what the chemistry has done, and
 * that is in the numbers, not in the easing.
 */

/** How many crystals the strip is drawn with room for at full deposition. */
const GRAIN_SLOTS = 12;
export interface TubeGeometry {
  cx: number;
  top: number;
  bottom: number;
  w: number;
  stripTop: number;
  stripBottom: number;
  /** Pixels per millilitre of solution. */
  mlPx: number;
}

export function TubeGlass({ tube, geometry }: { tube: Tube; geometry: TubeGeometry }): React.ReactElement {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const { cx, top, bottom, w, stripTop, stripBottom, mlPx } = geometry;
  const r = w / 2;
  const glass = `M${cx - r} ${top} V${bottom - r} A${r} ${r} 0 0 0 ${cx + r} ${bottom - r} V${top}`;
  const v = volumeOf(tube);
  const surface = bottom - 3 - v * mlPx;

  const strip = tube.strip;
  const stripW = w * 0.3;
  const wet = Math.max(surface, stripTop);
  const opacity = depositOpacity(tube);
  const deposit = depositColour(tube);
  const grains = depositGrains(tube, GRAIN_SLOTS);

  return (
    <>
      <defs>
        <clipPath id={`cl-${uid}`}>
          <path d={glass} />
        </clipPath>
      </defs>
      <path d={glass} fill="rgba(255,255,255,.05)" />

      {v > 0 ? (
        <g clipPath={`url(#cl-${uid})`}>
          <rect
            className={TRACK_CLASS}
            x={cx - r}
            y={surface}
            width={w}
            height={bottom - surface}
            fill={liquidColour(tube)}
          />
          <rect x={cx - r} y={surface - 1} width={w} height={3} fill="#fff" opacity={0.28} />
        </g>
      ) : null}

      {strip ? (
        <>
          <rect
            x={cx - stripW / 2}
            y={stripTop}
            width={stripW}
            height={stripBottom - stripTop}
            rx={1.5}
            fill={strip.clean ? METAL[strip.metal].strip : METAL[strip.metal].dull}
          />
          {strip.clean ? (
            <rect
              x={cx - stripW / 2 + stripW * 0.18}
              y={stripTop + 3}
              width={stripW * 0.16}
              height={stripBottom - stripTop - 6}
              fill="#fff"
              opacity={0.35}
            />
          ) : null}
          {/*
            Drawn whether or not anything has come down yet, at an opacity the
            model sets. A band that were mounted only once it was visible would
            have nothing to arrive FROM and would snap into place; this way the
            film darkens, and each crystal fades up as the metal for it is
            displaced.
          */}
          <rect
            className={TRACK_CLASS}
            x={cx - stripW / 2 - 0.6}
            y={wet}
            width={stripW + 1.2}
            height={Math.max(0, stripBottom - wet)}
            rx={1.5}
            fill={deposit}
            opacity={opacity}
          />
          {Array.from({ length: GRAIN_SLOTS }, (_, k) => (
            <circle
              key={k}
              className={TRACK_CLASS}
              cx={cx - stripW / 2 + (((k * 37) % 10) / 10) * stripW}
              cy={wet + 4 + (((k * 53) % 97) / 97) * Math.max(0, stripBottom - wet - 8)}
              r={stripW * 0.12}
              fill={deposit}
              opacity={k < grains ? opacity : 0}
            />
          ))}
        </>
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
