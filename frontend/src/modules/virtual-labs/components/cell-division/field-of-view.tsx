'use client';

import * as React from 'react';

import { OBJECTIVES } from '@labs/lib/cell-division/optics';
import { mountRide, specimenOf, viewThrough, type CellDivisionState } from '@labs/lib/cell-division/state';

import { RIDE_CLASS, TRACK_CLASS, rideStyle } from '../bench-motion';

import { FRAME, SpecimenFigure } from './specimen-art';

/**
 * What is actually in the eyepiece, rendered from the state of the instrument.
 *
 * Nothing here is a picture of a result. Where the figure sits comes from where
 * the stage has carried the slide, how blurred it is comes from how far the
 * tube is from that slide's plane of best focus, how much of it you can see
 * comes from the field of view of the objective that is swung in, and how dark
 * it is comes from the lamp. Turn any one of them and the drawing changes,
 * which is what makes focusing a real thing to learn rather than a button.
 *
 * AND IT RIDES, by `mountRide` millimetres, whenever there is an unbroken slide
 * on the stage and the lamp is on — the conditions under which there is a lit
 * field at all. The specimen, the dust in the mountant and the numbered
 * pointers are all carried by the SAME rule on two groups that are always
 * rendered, so they start together and stay rigid with respect to one another:
 * a pointer goes on pointing at the feature it was placed on. Nothing the
 * marking reads moves — `viewThrough` measures from `pos` and the slide's own
 * `sx/sy`, and neither is touched — so a wandering field cannot make naming the
 * organism or the process any easier or any harder.
 */

const LAMP_BG = ['#0a0908', '#5b4e35', '#cfc0a0', '#f5ecd9'] as const;

const f1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * Dust and debris in the mountant, fixed to the slide. It drifts across the
 * field as the stage moves, which is how a student knows the stage moved even
 * before the specimen arrives.
 */
function debrisFor(key: string): [number, number, number][] {
  let x = 1;
  for (let i = 0; i < key.length; i += 1) x = (x * 31 + key.charCodeAt(i)) % 2147483647;
  x = x || 1;
  const rnd = (): number => (x = (x * 48271) % 2147483647) / 2147483647;
  return Array.from({ length: 22 }, () => [(rnd() - 0.5) * 5.2, (rnd() - 0.5) * 5.2, 0.004 + rnd() * 0.012]);
}

export function FieldOfView({
  state,
  cx,
  cy,
  R,
  uid,
  showPins = false,
  activePin = -1,
}: {
  state: CellDivisionState;
  cx: number;
  cy: number;
  R: number;
  /** Unique within the document: clip paths and filters are addressed by id. */
  uid: string;
  /** The numbered pointers, drawn only on a view good enough to resolve them. */
  showPins?: boolean;
  /** The pointer being named right now, ringed brighter than the others. */
  activePin?: number;
}): React.ReactElement {
  const v = viewThrough(state);
  const pxmm = R / OBJECTIVES[state.objective].R;
  const perUnit = pxmm / 100;
  const blur = f1((1 - v.sharp) * 0.11 * pxmm);

  const slide = v.slide;
  const spec = slide && !v.broken ? specimenOf(slide) : null;
  const X = slide ? f1(cx + (slide.sx - state.pos.x) * pxmm) : cx;
  const Y = slide ? f1(cy + (slide.sy - state.pos.y) * pxmm) : cy;

  const mm = mountRide(state);
  const ride = rideStyle({ x: mm.x * pxmm, y: mm.y * pxmm });

  return (
    <g>
      <defs>
        <clipPath id={`${uid}-clip`}>
          <circle cx={cx} cy={cy} r={R} />
        </clipPath>
        <filter id={`${uid}-def`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={blur} />
        </filter>
        <radialGradient id={`${uid}-vig`} cx="50%" cy="50%" r="50%">
          <stop offset=".72" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".42" />
        </radialGradient>
      </defs>

      <g clipPath={`url(#${uid}-clip)`}>
        {/* The field brightens with the dial rather than stepping between four
            flat grounds: same four colours, carried between them. */}
        <rect className={TRACK_CLASS} x={cx - R} y={cy - R} width={R * 2} height={R * 2} fill={LAMP_BG[state.lamp] ?? LAMP_BG[0]} />

        {/* Always rendered, empty or not: this group and the pointers' group
            below carry the same ride, and two animations only stay in step if
            they were started in the same frame. */}
        <g className={RIDE_CLASS} style={ride}>
          {state.lamp > 0 && spec && slide ? (
            <g className={TRACK_CLASS} filter={`url(#${uid}-def)`} opacity={f1(0.35 + v.light * 0.65)}>
              {debrisFor(`${slide.specimen}-${slide.n}`).map(([dx, dy, r], i) => (
                <circle
                  key={i}
                  cx={f1(cx + (dx - state.pos.x) * pxmm)}
                  cy={f1(cy + (dy - state.pos.y) * pxmm)}
                  r={f1(Math.max(0.6, r * pxmm))}
                  fill="#6b5f4e"
                  opacity={0.33}
                />
              ))}
              <g transform={`translate(${X},${Y}) scale(${f1(perUnit * 100) / 100})`}>
                <SpecimenFigure id={slide.specimen} />
              </g>
            </g>
          ) : null}
        </g>

        {v.broken ? (
          <g opacity={0.85}>
            <path
              d={
                `M${cx - R},${cy - R * 0.5} L${cx - R * 0.2},${cy - R * 0.05} L${cx + R * 0.3},${cy + R * 0.7} ` +
                `M${cx - R * 0.2},${cy - R * 0.05} L${cx + R},${cy - R * 0.6} ` +
                `M${cx - R * 0.2},${cy - R * 0.05} L${cx - R * 0.5},${cy + R}`
              }
              stroke="#3a3330"
              strokeWidth={R * 0.022}
              fill="none"
            />
          </g>
        ) : null}

        {/* Full brightness at low power washes the specimen out; the low setting
            leaves it too dark to read. Both are visible, not just scored. */}
        {state.objective === 10 && state.lamp === 3 ? (
          <rect x={cx - R} y={cy - R} width={R * 2} height={R * 2} fill="#fff" opacity={0.3} />
        ) : null}
        {state.lamp === 1 ? (
          <rect x={cx - R} y={cy - R} width={R * 2} height={R * 2} fill="#000" opacity={0.34} />
        ) : null}

        <rect x={cx - R} y={cy - R} width={R * 2} height={R * 2} fill={`url(#${uid}-vig)`} />
      </g>

      <circle cx={cx} cy={cy} r={R + R * 0.04} fill="none" stroke="#2b3335" strokeWidth={R * 0.082} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#0d1113" strokeWidth={1.5} />

      {/* The pointers are stuck to the specimen, so they ride with it. Same
          class, same style, same always-rendered group as the field above. */}
      <g className={RIDE_CLASS} style={ride}>
        {showPins && spec && slide
          ? spec.pins.map((p, i) => {
            const frame = FRAME[slide.specimen];
            const ax = X + (frame.x + p.x * frame.k) * perUnit;
            const ay = Y + (frame.y + p.y * frame.k) * perUnit;
            const bx = X + (frame.x + p.lx * frame.k) * perUnit;
            const by = Y + (frame.y + p.ly * frame.k) * perUnit;
            const live = i === activePin;
            const disc = R * 0.062;
            return (
              <g key={i} opacity={live || activePin < 0 ? 1 : 0.55}>
                <line x1={f1(ax)} y1={f1(ay)} x2={f1(bx)} y2={f1(by)} stroke="#0d1113" strokeWidth={2.6} opacity={0.55} />
                <line x1={f1(ax)} y1={f1(ay)} x2={f1(bx)} y2={f1(by)} stroke="#8fd0ff" strokeWidth={1.3} />
                <circle cx={f1(ax)} cy={f1(ay)} r={disc * 0.34} fill="none" stroke="#8fd0ff" strokeWidth={1.6} />
                <circle
                  cx={f1(bx)}
                  cy={f1(by)}
                  r={disc}
                  fill="#0d1113"
                  stroke={live ? '#ffffff' : '#8fd0ff'}
                  strokeWidth={live ? 2.4 : 1.3}
                />
                <text
                  x={f1(bx)}
                  y={f1(by + disc * 0.38)}
                  fontSize={disc * 1.1}
                  textAnchor="middle"
                  fill="#dff0ff"
                  fontFamily="'Segoe UI', system-ui, sans-serif"
                  fontWeight={700}
                >
                  {i + 1}
                </text>
              </g>
            );
          })
          : null}
      </g>
    </g>
  );
}
