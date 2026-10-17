'use client';

import * as React from 'react';
import Box from '@mui/material/Box';

import { analyse, bubbleRate, layersOf, type Liquids, MLGAS, volume } from '@labs/lib/acetic-acid/chemistry';
import type { TubeState } from '@labs/lib/acetic-acid/state';
import { clamp } from '@labs/lib/numbers';

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

import { GLASS, HUE_HEX, phPaperColour } from './apparatus';

/**
 * One test tube, drawn from what is in it.
 *
 * The same component draws a tube standing in the rack and the magnified one
 * docked beside the observation table, at different sizes — so what the student
 * judges by eye in the close-up is exactly what is on the bench, and cannot
 * drift from it.
 *
 * NOTHING HERE HOLDS A TIMER OR A PHASE. The effervescence is a train of
 * bubbles whose spacing is the tube's own gas rate, and the cloudiness left by
 * a shake is the tube's own `emul`, which the bench clock separates out on the
 * chemistry's half-life. So an idle tube costs nothing, and a tube that is
 * asked to hold still still shows how fast it is fizzing and how cloudy it is.
 */
export interface TubeGlassProps {
  tube: TubeState;
  liquids: Liquids;
  /** Centre line, and where the glass starts and ends, in the caller's coordinates. */
  cx: number;
  top: number;
  bottom: number;
  width: number;
  /** Pixels per mL of liquid. */
  mlPx: number;
  /** Unique within the document: the clip path this tube's contents use. */
  uid: string;
  /** Strips propped against the tube. Off for a thumbnail too small to show them. */
  strips?: boolean;
}

/** The colour of the one aqueous layer: every aqueous liquid mixed, or milky. */
function aqueousFill(tube: TubeState, liquids: Liquids, aqMl: number): string {
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (const [id, ml] of Object.entries(tube.liq)) {
    const spec = liquids[id as keyof Liquids];
    if (!ml || !spec.aqueous) continue;
    const weight = spec.a * ml;
    r += spec.rgb[0] * weight;
    g += spec.rgb[1] * weight;
    b += spec.rgb[2] * weight;
    w += weight;
  }
  const milky = analyse(tube, liquids).milky;
  if (milky > 0.02) return `rgba(246,248,250,${(0.12 + 0.8 * milky).toFixed(3)})`;
  const alpha = clamp(w / Math.max(aqMl, 1e-9), 0.07, 0.9);
  const k = Math.max(w, 1e-9);
  return `rgba(${Math.round(r / k)},${Math.round(g / k)},${Math.round(b / k)},${alpha.toFixed(3)})`;
}

export function TubeGlass({
  tube,
  liquids,
  cx,
  top,
  bottom,
  width,
  mlPx,
  uid,
  strips = true,
}: TubeGlassProps): React.ReactElement {
  const moving = useBenchMotion();
  const r = width / 2;
  const glass = `M${cx - r} ${top} V${bottom - r} A${r} ${r} 0 0 0 ${cx + r} ${bottom - r} V${top}`;
  const v = volume(tube);
  const floor = bottom - 3;
  const surface = floor - v * mlPx;
  const layers = layersOf(tube, liquids);
  const stacked = layers.length > 1;

  // Effervescence, and gas bubbling in from a delivery tube: one train of
  // bubbles up the liquid, spaced by the rate the model is making gas at.
  // A narrow tube holds about a dozen before it reads as a stream.
  const span = Math.max(6, floor - surface - 4);
  const train = bubbleTrain(bubbleRate(tube), span, 12);

  // Stack them from the bottom up before drawing: a running total inside the
  // map would be a reassignment during render.
  const stack: { id: string; fill: string; y: number; h: number; boundary: boolean }[] = [];
  for (let i = 0, cursor = floor; i < layers.length; i++) {
    const layer = layers[i]!;
    const h = layer.ml * mlPx;
    cursor -= h;
    stack.push({
      id: layer.id,
      fill:
        layer.id === 'aq'
          ? aqueousFill(tube, liquids, layer.ml)
          : `rgba(${liquids[layer.id].rgb.join(',')},${liquids[layer.id].a})`,
      y: cursor,
      h,
      boundary: cursor > surface + 0.5,
    });
  }

  return (
    // The motion rules ride with the tube rather than with the bench, because
    // this one component is both the tube in the rack and the magnified copy in
    // the console, and each is mounted under a different SVG.
    <Box component="g" sx={{ ...benchMotionSx, ...motionSx(moving) }}>
      <defs>
        <clipPath id={uid}>
          <path d={glass} />
        </clipPath>
      </defs>
      <path d={glass} fill={GLASS.body} />

      {v > 0 ? (
        <g clipPath={`url(#${uid})`}>
          {stack.map((layer) => (
            <React.Fragment key={layer.id}>
              <rect x={cx - r} y={layer.y} width={width} height={layer.h} fill={layer.fill} />
              {layer.boundary ? (
                <rect x={cx - r} y={layer.y - 0.8} width={width} height={1.6} fill="#fff" opacity={0.45} />
              ) : null}
            </React.Fragment>
          ))}

          {/* Solid sodium hydrogen carbonate resting on the bottom. */}
          {tube.solid > 0.02 ? (
            <ellipse
              cx={cx}
              cy={floor - Math.min(width * 0.38, 3 + tube.solid * 3) / 2}
              rx={r * 0.82}
              ry={Math.min(width * 0.38, 3 + tube.solid * 3) / 2}
              fill={GLASS.solid}
              opacity={0.92}
            />
          ) : null}

          {Array.from({ length: train.count }, (_, i) => (
            <circle
              key={i}
              className={RISE_CLASS}
              cx={cx - r + 5 + ((i * 37) % Math.max(1, width - 10))}
              cy={floor - 3 - riseOffset(train, i)}
              r={1.4 + (i % 3) * 0.6}
              fill="#fff"
              opacity={0.55}
              style={riseStyle(train)}
            />
          ))}

          {/* A shake leaves a cloudy emulsion, which separates out again on the
              half-life the chemistry gives it. The opacity IS how cloudy the
              model says the tube is, so a tube drawn a minute later is clear
              because it is clear, not because a keyframe has finished. */}
          {stacked && tube.emul > 0 ? (
            <g className={TRACK_CLASS} opacity={tube.emul.toFixed(3)}>
              <rect x={cx - r} y={surface} width={width} height={floor - surface} fill={GLASS.emulsion} />
              {Array.from({ length: 9 }, (_, i) => (
                <circle
                  key={i}
                  cx={cx - r + 4 + ((i * 29) % Math.max(2, width - 8))}
                  cy={surface + 4 + ((i * 47) % Math.max(6, floor - surface - 8))}
                  r={2.2}
                  fill="#f3e6b8"
                  opacity={0.55}
                />
              ))}
            </g>
          ) : null}

          <rect x={cx - r} y={surface - 1} width={width} height={3} fill="#fff" opacity={0.3} />
        </g>
      ) : null}

      {/* Gas collected above the liquid. */}
      {tube.head > 1 ? (
        <>
          <rect
            x={cx - r + 1}
            y={Math.max(top + 3, surface - Math.min(tube.head * mlPx * 0.5, surface - top - 12))}
            width={width - 2}
            height={surface - Math.max(top + 3, surface - Math.min(tube.head * mlPx * 0.5, surface - top - 12))}
            fill={GLASS.gas}
            opacity={0.16}
          />
          <text
            x={cx}
            y={Math.max(top + 3, surface - Math.min(tube.head * mlPx * 0.5, surface - top - 12)) + 11}
            fontSize={8}
            textAnchor="middle"
            fill={GLASS.gas}
            fontWeight={600}
          >
            CO₂
          </text>
        </>
      ) : null}

      <path d={glass} fill="none" stroke={GLASS.wall} strokeWidth={1.4} />
      <line
        x1={cx - r + width * 0.2}
        y1={top + 6}
        x2={cx - r + width * 0.2}
        y2={bottom - r}
        stroke="#fff"
        strokeWidth={width * 0.07}
        opacity={0.22}
      />
      <ellipse cx={cx} cy={top} rx={r + 1} ry={width * 0.09} fill="none" stroke={GLASS.meniscus} strokeWidth={1.4} />

      {strips ? (
        <>
          {tube.strips.blue ? (
            <Strip
              x={cx - r - Math.max(7, width * 0.24) - 2}
              y={top - 4}
              w={Math.max(7, width * 0.24)}
              h={width * 1.1}
              base={HUE_HEX.blue}
              tip={HUE_HEX[tube.strips.blue.hue]}
            />
          ) : null}
          {tube.strips.red ? (
            <Strip
              x={cx + r + 2}
              y={top - 4}
              w={Math.max(7, width * 0.24)}
              h={width * 1.1}
              base={HUE_HEX.red}
              tip={HUE_HEX[tube.strips.red.hue]}
            />
          ) : null}
          {tube.phPaper !== null ? (
            <Strip
              x={cx + r + 2}
              y={top + width * 1.25}
              w={Math.max(7, width * 0.24)}
              h={width * 1.1}
              base="#efe9d6"
              tip={phPaperColour(tube.phPaper)}
            />
          ) : null}
        </>
      ) : null}
    </Box>
  );
}

/** A used strip propped against the tube: its own colour, dipped end stained. */
function Strip({
  x,
  y,
  w,
  h,
  base,
  tip,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  base: string;
  tip: string;
}): React.ReactElement {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={1.5} fill={base} stroke="rgba(0,0,0,.25)" strokeWidth={0.6} />
      <rect x={x} y={y + h * 0.45} width={w} height={h * 0.55} rx={1.5} fill={tip} />
    </>
  );
}

/** mL of gas, for a caption. */
export function millilitres(mmol: number): number {
  return Math.round(mmol * MLGAS);
}
