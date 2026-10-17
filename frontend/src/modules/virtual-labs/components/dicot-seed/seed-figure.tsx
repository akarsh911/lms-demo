'use client';

import * as React from 'react';

import {
  AX,
  HALF_GAP,
  SHAPE,
  SPECIES,
  coatOn,
  dryGeom,
  geom,
  isOpen,
  swellFrac,
  type Point,
  type Seed,
  type SeedView,
} from '@labs/lib/dicot-seed/seed-model';

import { LABEL_FONT } from '../apparatus-palette';

/**
 * One seed, drawn in its own local units.
 *
 * Every seed on the bench comes out of here — dry in its dish, swelling in the
 * beaker, sprouting on the cotton, split open under the lens — so the drawing
 * cannot disagree with the model that marks the labelling. Size, the swollen
 * outline, where the hilum sits and where the embryo axis lies are all read
 * from `seed-model`, never scripted per picture.
 *
 * The caller places it: this renders a `<g>` whose origin is the centre of the
 * seed, at a scale of 1.
 */

const n2 = (v: number): number => Math.round(v * 100) / 100;

const fp = (f: readonly [number, number], a: number, b: number): Point => ({ x: f[0] * a, y: f[1] * b });

/** A quadrilateral from A to B, `w1` wide at one end and `w2` at the other. */
function taper(A: Point, B: Point, w1: number, w2: number): string {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  return (
    `M${n2(A.x + nx * w1)} ${n2(A.y + ny * w1)} L${n2(B.x + nx * w2)} ${n2(B.y + ny * w2)}` +
    ` L${n2(B.x - nx * w2)} ${n2(B.y - ny * w2)} L${n2(A.x - nx * w1)} ${n2(A.y - ny * w1)} Z`
  );
}

const STROKE = { strokeWidth: 1.6, vectorEffect: 'non-scaling-stroke' } as const;

function Caption({ b, text, tone }: { b: number; text: string; tone?: 'bad' }): React.ReactElement {
  return (
    <text
      x={0}
      y={n2((tone ? 1.45 : 1.3) * b)}
      fontSize={n2((tone ? 0.21 : 0.19) * b)}
      textAnchor="middle"
      fill={tone ? '#9c3a33' : '#6b6658'}
      fontFamily={LABEL_FONT}
      fontWeight={tone ? 600 : 400}
    >
      {text}
    </text>
  );
}

export interface SeedFigureProps {
  seed: Seed;
  view: SeedView;
  /** Unique within the document: clip paths are referenced by id. */
  uid: string;
  /** Drop the captions — a seed in a dish is 30px across. */
  small?: boolean;
  /** The micropyle is a pinprick: it is only drawn once it has been found. */
  showMicropyle?: boolean;
  /**
   * Draw it at the size it was DRY, leaving the swelling to the caller's own
   * transform. Every path here is linear in `a` and `b`, so this figure inside
   * `scale(swellScale(seed))` is the same drawing as this figure at `geom` —
   * and a transform is something the browser can ease between ticks, which a
   * path string is not. Only the beaker asks for it, because the beaker is the
   * only place a seed is drawn while it is actually taking up water.
   */
  atDrySize?: boolean;
}

export function SeedFigure({
  seed,
  view,
  uid,
  small = false,
  showMicropyle = false,
  atDrySize = false,
}: SeedFigureProps): React.ReactElement {
  const SP = SPECIES[seed.sp];
  const sh = SHAPE[SP.shape];
  const { a, b } = atDrySize ? dryGeom(seed) : geom(seed);
  const path = sh.path(a, b);
  const withCoat = coatOn(seed, view);
  const open = isOpen(seed, view);
  const ruined = view === 'live' ? seed.ruined : null;

  const HL = fp(sh.hil, a, b);
  const MC = fp(sh.mic, a, b);

  // ---- a specimen that was cut straight across ----------------------------
  if (ruined && seed.split === 'transverse') {
    return (
      <g>
        <clipPath id={`cutL-${uid}`}>
          <rect x={n2(-1.3 * a)} y={n2(-1.4 * b)} width={n2(0.95 * a)} height={n2(2.8 * b)} />
        </clipPath>
        <clipPath id={`cutR-${uid}`}>
          <rect x={n2(-0.35 * a)} y={n2(-1.4 * b)} width={n2(1.7 * a)} height={n2(2.8 * b)} />
        </clipPath>
        <g transform={`translate(${n2(-0.22 * a)},${n2(0.07 * b)}) rotate(-6)`}>
          <path d={path} clipPath={`url(#cutL-${uid})`} fill={SP.coty} stroke={SP.cotyEdge} {...STROKE} />
        </g>
        <g transform={`translate(${n2(0.24 * a)},${n2(-0.05 * b)}) rotate(5)`}>
          <path d={path} clipPath={`url(#cutR-${uid})`} fill={SP.coty} stroke={SP.cotyEdge} {...STROKE} />
        </g>
        {small ? null : <Caption b={b} tone="bad" text="cut straight across — the embryo axis went with it" />}
      </g>
    );
  }

  // ---- a specimen that shattered or mushed --------------------------------
  if (ruined) {
    const frag: readonly (readonly [number, number, number])[] = [
      [-0.55, 0.1, 14],
      [-0.1, -0.35, -22],
      [0.35, 0.25, 9],
      [0.05, 0.55, -8],
      [-0.3, -0.52, 30],
      [0.62, -0.18, -15],
    ];
    return (
      <g>
        {frag.map(([fx, fy, rot], i) => {
          const w = (0.2 + (i % 3) * 0.06) * a;
          const hh = (0.18 + (i % 2) * 0.07) * b;
          return (
            <g key={i} transform={`translate(${n2(fx * a)},${n2(fy * b)}) rotate(${rot})`}>
              <path
                d={
                  `M${n2(-w)} ${n2(-hh * 0.3)} L${n2(-w * 0.3)} ${n2(-hh)} L${n2(w * 0.8)} ${n2(-hh * 0.5)}` +
                  ` L${n2(w)} ${n2(hh * 0.5)} L0 ${n2(hh)} L${n2(-w * 0.7)} ${n2(hh * 0.6)} Z`
                }
                fill={seed.coat ? SP.coat : SP.coty}
                stroke={seed.coat ? SP.coatDark : SP.cotyEdge}
                {...STROKE}
              />
            </g>
          );
        })}
        {small ? null : <Caption b={b} tone="bad" text="broken up — there is no embryo left to see" />}
      </g>
    );
  }

  // ---- the intact seed, coat on ------------------------------------------
  if (withCoat) {
    return (
      <g>
        <path d={path} fill={SP.coat} stroke={SP.coatDark} {...STROKE} />
        <ellipse
          cx={n2(-0.18 * a)}
          cy={n2(-0.42 * b)}
          rx={n2(0.34 * a)}
          ry={n2(0.19 * b)}
          fill="#fff"
          opacity={0.17}
        />
        <ellipse
          cx={n2(HL.x)}
          cy={n2(HL.y)}
          rx={n2(0.2 * a)}
          ry={n2(0.13 * b)}
          fill="#f8f2e4"
          stroke={SP.coatDark}
          strokeWidth={2.4}
          vectorEffect="non-scaling-stroke"
        />
        <ellipse
          cx={n2(HL.x)}
          cy={n2(HL.y)}
          rx={n2(0.1 * a)}
          ry={n2(0.06 * b)}
          fill="none"
          stroke={SP.coatDark}
          opacity={0.45}
          vectorEffect="non-scaling-stroke"
        />
        {showMicropyle ? (
          <>
            <circle cx={n2(MC.x)} cy={n2(MC.y)} r={n2(0.036 * a)} fill={SP.coatDark} />
            <circle
              cx={n2(MC.x)}
              cy={n2(MC.y)}
              r={n2(0.085 * a)}
              fill="none"
              stroke={SP.coatDark}
              strokeDasharray="2 3"
              opacity={0.55}
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}
        {seed.pressed && swellFrac(seed.h) > 0.5 ? (
          <path
            d={
              `M${n2(MC.x)} ${n2(MC.y + 0.06 * b)} c ${n2(0.1 * a)} ${n2(0.17 * b)} ${n2(0.1 * a)} ${n2(0.28 * b)} 0 ${n2(0.32 * b)}` +
              ` c ${n2(-0.1 * a)} ${n2(-0.04 * b)} ${n2(-0.1 * a)} ${n2(-0.15 * b)} 0 ${n2(-0.32 * b)} Z`
            }
            fill="#7fc4e8"
            stroke="#3f8cb5"
            opacity={0.92}
            {...STROKE}
          />
        ) : null}
      </g>
    );
  }

  // ---- coat off ----------------------------------------------------------
  const R0 = fp(AX.radA, a, b);
  const R1 = fp(AX.radB, a, b);
  const A0 = fp(AX.axA, a, b);
  const A1 = fp(AX.axB, a, b);
  const PL = fp(AX.plum, a, b);

  const inner = (
    <>
      <path d={path} fill={SP.coty} stroke={SP.cotyEdge} {...STROKE} />
      <ellipse cx={n2(-0.1 * a)} cy={n2(-0.3 * b)} rx={n2(0.42 * a)} ry={n2(0.3 * b)} fill="#fff" opacity={0.35} />
    </>
  );

  if (!open) {
    return (
      <g>
        {inner}
        <path
          d={`M${n2(-0.8 * a)} ${n2(0.5 * b)} Q${n2(-0.1 * a)} ${n2(0.8 * b)} ${n2(0.75 * a)} ${n2(0.34 * b)}`}
          fill="none"
          stroke={SP.cotyEdge}
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
        />
        <path d={taper(R0, R1, 0.012 * b, 0.12 * b)} fill="#e9cf9b" stroke="#b9a273" {...STROKE} />
        {small ? null : <Caption b={b} text="coat off — the two cotyledons are still joined" />}
      </g>
    );
  }

  const leaves: readonly (readonly [number, number, number])[] = [
    [-0.07, -0.09, -40],
    [0.01, -0.13, -8],
    [0.08, -0.04, 28],
  ];

  return (
    <g>
      {/* The free cotyledon, laid back like the other half of an open book. */}
      <g transform={`translate(${n2(-HALF_GAP * a)},0)`}>
        {inner}
        <path
          d={taper(R0, R1, 0.012 * b, 0.15 * b)}
          fill="none"
          stroke={SP.cotyEdge}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={taper(A0, A1, 0.08 * b, 0.06 * b)}
          fill="none"
          stroke={SP.cotyEdge}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
        {small ? null : <Caption b={b} text="cotyledon" />}
      </g>
      {/* The half the embryo axis stays attached to. */}
      <g>
        {inner}
        <path d={taper(A0, A1, 0.08 * b, 0.06 * b)} fill="#d6bb85" stroke="#9d8752" {...STROKE} />
        <path d={taper(R0, R1, 0.012 * b, 0.15 * b)} fill="#e4c688" stroke="#9d8752" {...STROKE} />
        <line
          x1={n2(A1.x)}
          y1={n2(A1.y)}
          x2={n2(PL.x)}
          y2={n2(PL.y)}
          stroke="#7d9a4f"
          strokeWidth={2.6}
          vectorEffect="non-scaling-stroke"
        />
        {leaves.map(([dx, dy, rot], i) => {
          const lx = n2(PL.x + dx * a);
          const ly = n2(PL.y + dy * b);
          return (
            <ellipse
              key={i}
              cx={lx}
              cy={ly}
              rx={n2(0.095 * a)}
              ry={n2(0.05 * b)}
              transform={`rotate(${rot} ${lx} ${ly})`}
              fill="#adc873"
              stroke="#6c8a40"
              {...STROKE}
            />
          );
        })}
        {small ? null : <Caption b={b} text="cotyledon bearing the embryo axis" />}
      </g>
    </g>
  );
}
