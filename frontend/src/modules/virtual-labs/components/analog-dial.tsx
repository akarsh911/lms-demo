import * as React from 'react';

import { clamp } from '@labs/lib/numbers';

import { apparatus, DIAL_FONT, LABEL_FONT } from './apparatus-palette';

/**
 * An analog meter dial, drawn in its own 200 × 130 coordinate box.
 *
 * Every analog reading in every practical works the same way: find what one
 * small division is worth, then count on from the nearest labelled number. So
 * one dial serves an ammeter, a voltmeter, a galvanometer or a practice meter,
 * configured by full-scale value and division count. A host places it with a
 * `transform` inside its own SVG, or in a standalone `<svg viewBox="0 0 200 130">`.
 *
 * The needle is separate (`DialNeedle`) because it moves ten or sixty times a
 * second while the face never changes: the face is memoised and costs nothing
 * after its first render.
 */

/** Needle sweep: −48° at zero to +48° at full scale, hard stops at ±53°. */
export const DIAL_SWEEP = 48;
export const DIAL_STOP = 53;

/** Needle angle for a reading as a fraction of full scale, clamped to the stops. */
export function dialAngle(fraction: number): number {
  return clamp(-DIAL_SWEEP + 2 * DIAL_SWEEP * fraction, -DIAL_STOP, DIAL_STOP);
}

const CX = 100;
const CY = 118;

function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
}

function scaleLabel(fullScale: number, i: number, divs: number): string {
  const x = (fullScale * i) / divs;
  return fullScale < 2 ? x.toFixed(1).replace(/^0\.0$/, '0') : String(Math.round(x * 100) / 100);
}

export const DialFace = React.memo(function DialFace({
  fullScale,
  divs,
  maj,
  mid: midEvery,
  letter,
}: {
  fullScale: number;
  /** Small divisions from zero to full scale. Must be a multiple of 10. */
  divs: number;
  /**
   * Divisions between NUMBERED marks, and between the medium ones — as the
   * instrument itself is engraved.
   *
   * Derived by default, which is right when the count is a round 50 but wrong
   * when it is not: a 0–3 A ammeter with 60 divisions numbered every fifth of
   * the scale prints 0, 0.6, 1.2 … and no real ammeter is engraved that way.
   * The CBSE manual's one is numbered every 0.5 A, which is every 10
   * divisions — so the meter says what it is engraved with, not what divides
   * evenly.
   */
  maj?: number;
  mid?: number;
  /** The unit letter printed on the face: A, V, mA. */
  letter: string;
}): React.ReactElement {
  const majEvery = maj ?? divs / 5;
  const midStep = midEvery ?? divs / 10;
  const ticks: React.ReactElement[] = [];
  for (let i = 0; i <= divs; i += 1) {
    const a = -DIAL_SWEEP + (2 * DIAL_SWEEP * i) / divs;
    const major = i % majEvery === 0;
    const mid = i % midStep === 0;
    const [x0, y0] = polar(major ? 77 : mid ? 81 : 84, a);
    const [x1, y1] = polar(91, a);
    ticks.push(
      <line
        key={`t${i}`}
        x1={x0.toFixed(2)}
        y1={y0.toFixed(2)}
        x2={x1.toFixed(2)}
        y2={y1.toFixed(2)}
        stroke={apparatus.dialInk}
        strokeWidth={major ? 1.1 : 0.55}
      />,
    );
    if (major) {
      const [tx, ty] = polar(66, a);
      ticks.push(
        <text
          key={`l${i}`}
          x={tx.toFixed(1)}
          y={(ty + 3).toFixed(1)}
          fontSize={8}
          textAnchor="middle"
          fill={apparatus.dialInk}
          fontFamily={DIAL_FONT}
        >
          {scaleLabel(fullScale, i, divs)}
        </text>,
      );
    }
  }

  const [ax0, ay0] = polar(73, -DIAL_SWEEP);
  const [ax1, ay1] = polar(73, DIAL_SWEEP);

  return (
    <g>
      <rect x={12} y={14} width={176} height={112} rx={6} fill={apparatus.dialFace} stroke={apparatus.dialRim} />
      <path
        d={`M${ax0} ${ay0} A73 73 0 0 1 ${ax1} ${ay1}`}
        fill="none"
        stroke={apparatus.dialArc}
        strokeWidth={3.2}
        opacity={0.85}
      />
      {ticks}
      <text x={100} y={98} fontSize={17} textAnchor="middle" fill={apparatus.dialInk} fontFamily={DIAL_FONT}>
        {letter}
      </text>
      <text
        x={170}
        y={108}
        fontSize={5.5}
        textAnchor="end"
        fill={apparatus.dialInkMuted}
        fontFamily={LABEL_FONT}
        letterSpacing=".4"
      >
        d.c. · class 2.5
      </text>
    </g>
  );
});

/**
 * The needle and its pivot. Pass `angle` for a still needle (a practice dial);
 * pass `needleRef` and let an animator write the rotation (see
 * `use-spring-needles.ts`).
 */
export function DialNeedle({
  angle = -DIAL_SWEEP,
  needleRef,
}: {
  angle?: number;
  needleRef?: React.Ref<SVGGElement>;
}): React.ReactElement {
  return (
    <>
      <g ref={needleRef} transform={`rotate(${angle} ${CX} ${CY})`}>
        <line x1={100} y1={128} x2={100} y2={29} stroke={apparatus.needle} strokeWidth={1.3} strokeLinecap="round" />
        <rect x={98.2} y={118} width={3.6} height={10} fill={apparatus.dialInk} />
      </g>
      <rect x={12} y={112} width={176} height={14} fill="#16181a" />
      <circle cx={CX} cy={CY} r={4.5} fill={apparatus.pivot} stroke="#555" strokeWidth={0.6} />
    </>
  );
}
