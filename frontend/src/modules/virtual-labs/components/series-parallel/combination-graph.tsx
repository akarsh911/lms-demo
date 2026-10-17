'use client';

import * as React from 'react';
import { useTheme } from '@mui/material/styles';

import type { Point } from '@labs/lib/fit';

/**
 * Four V–I lines on one pair of axes, one per circuit.
 *
 * `XYGraph` plots a single set of readings and its best fit, which is exactly
 * right for Ohm's law and cannot say the thing this practical exists to say:
 * that the series line is the STEEPEST and the parallel line the SHALLOWEST,
 * on the same axes, with the same battery. Four overlaid lines make R₁ + R₂ >
 * either resistor and R₁R₂/(R₁ + R₂) < either visible before a single number is
 * calculated, so the comparison is drawn rather than asserted.
 *
 * Each line passes through the origin with slope = that circuit's mean V/I,
 * because V ∝ I is already established by practical 4 and is assumed here.
 */
export interface GraphSeries {
  id: string;
  /** The symbol written at the end of the line: R₁, Rs, Rp. */
  short: string;
  colour: string;
  points: readonly Point[];
  /** Mean V/I once the circuit is finished; null while it is not. */
  meanR: number | null;
}

export function CombinationGraph({
  series,
  xMax,
  yMax,
  ariaLabel,
  emptyText = 'Each circuit you measure adds a line here',
}: {
  series: readonly GraphSeries[];
  xMax: number;
  yMax: number;
  ariaLabel: string;
  emptyText?: string;
}): React.ReactElement {
  const theme = useTheme();
  const X = (x: number): number => 46 + (Math.min(x, xMax) / xMax) * 296;
  const Y = (y: number): number => 216 - (Math.min(y, yMax) / yMax) * 196;
  const grid = theme.brand.line;
  const axis = theme.brand.tert;
  const ticks = 5;

  const gridLines: React.ReactElement[] = [];
  for (let k = 0; k <= ticks; k += 1) {
    const xv = (xMax * k) / ticks;
    const yv = (yMax * k) / ticks;
    gridLines.push(
      <g key={k}>
        <line x1={X(xv)} y1={20} x2={X(xv)} y2={216} stroke={grid} />
        <line x1={46} y1={Y(yv)} x2={342} y2={Y(yv)} stroke={grid} />
        <text x={X(xv)} y={231} fontSize={10} textAnchor="middle" fill={axis}>
          {xv.toFixed(1)}
        </text>
        <text x={38} y={Y(yv) + 3.5} fontSize={10} textAnchor="end" fill={axis}>
          {Math.round(yv * 100) / 100}
        </text>
      </g>,
    );
  }

  const anyPoints = series.some((s) => s.points.length > 0);

  return (
    <svg
      viewBox="0 0 360 250"
      role="img"
      aria-label={ariaLabel}
      style={{ display: 'block', width: '100%', height: 'auto', fontFamily: 'inherit' }}
    >
      {gridLines}
      <line x1={46} y1={216} x2={342} y2={216} stroke={axis} />
      <line x1={46} y1={20} x2={46} y2={216} stroke={axis} />
      <text x={342} y={246} fontSize={10.5} textAnchor="end" fill={theme.brand.sub}>
        Current I (A) →
      </text>
      <text x={12} y={14} fontSize={10.5} fill={theme.brand.sub}>
        V (V) ↑
      </text>

      {series.map((s) => {
        if (s.meanR === null || !Number.isFinite(s.meanR) || s.meanR <= 0) return null;
        // Stop the line where it leaves the axes, so a shallow and a steep line
        // are both drawn to the edge of the paper rather than clipped oddly.
        const x1 = Math.min(xMax, yMax / s.meanR);
        return (
          <g key={`line-${s.id}`}>
            <line x1={X(0)} y1={Y(0)} x2={X(x1)} y2={Y(s.meanR * x1)} stroke={s.colour} strokeWidth={1.8} opacity={0.85} />
            <text
              x={Math.min(X(x1) + 5, 332)}
              y={Math.max(Y(s.meanR * x1) + (x1 < xMax ? 12 : -4), 30)}
              fontSize={10.5}
              fontWeight={700}
              fill={s.colour}
            >
              {s.short}
            </text>
          </g>
        );
      })}

      {series.flatMap((s) =>
        s.points.map((p, i) => (
          <circle
            key={`${s.id}-${i}`}
            cx={X(p.x)}
            cy={Y(p.y)}
            r={4}
            fill={theme.brand.surface}
            stroke={s.colour}
            strokeWidth={2}
          />
        )),
      )}

      {anyPoints ? null : (
        <text x={194} y={120} fontSize={11.5} textAnchor="middle" fill={axis}>
          {emptyText}
        </text>
      )}
    </svg>
  );
}
