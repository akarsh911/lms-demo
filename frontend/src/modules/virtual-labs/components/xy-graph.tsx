'use client';

import * as React from 'react';
import { useTheme } from '@mui/material/styles';

import type { Line, Point } from '@labs/lib/fit';

/**
 * A plotted graph of a student's own readings, on axes that match the meters'
 * ranges, with an optional best-fit line and its slope triangle.
 *
 * Every "plot y against x and find the slope" practical (Ohm's law, a spring's
 * extension, a focal length) needs exactly this, so it is drawn from data:
 * ranges, labels, points, and a fit once the student has one. Theme colours
 * only; unlike the bench, a graph is interface, not apparatus.
 */
export function XYGraph({
  points,
  xMax,
  yMax,
  xLabel,
  yLabel,
  xSymbol,
  ySymbol,
  ticks = 5,
  fit,
  slopeLabel,
  emptyText = 'Your readings will appear here',
  ariaLabel,
}: {
  points: readonly Point[];
  xMax: number;
  yMax: number;
  /** Axis captions: `Current I (A)`. */
  xLabel: string;
  yLabel: string;
  /** Quantity symbols for the slope triangle: `I`, `V`. */
  xSymbol: string;
  ySymbol: string;
  ticks?: number;
  /** Draws the line, the ΔX/ΔY triangle between the extreme points, and the slope. */
  fit?: Line | null;
  /** e.g. `(m) => \`slope = ${m.toFixed(2)} Ω\`` */
  slopeLabel?: (m: number) => string;
  emptyText?: string;
  ariaLabel: string;
}): React.ReactElement {
  const theme = useTheme();
  const X = (x: number): number => 46 + (x / xMax) * 296;
  const Y = (y: number): number => 216 - (y / yMax) * 196;
  const grid = theme.brand.line;
  const axis = theme.brand.tert;
  const accent = theme.hues.blue;
  const fmt = (v: number): string => (xMax < 2 ? v.toFixed(1) : String(Math.round(v * 100) / 100));

  const lines: React.ReactElement[] = [];
  for (let k = 0; k <= ticks; k += 1) {
    const xv = (xMax * k) / ticks;
    const yv = (yMax * k) / ticks;
    lines.push(
      <g key={k}>
        <line x1={X(xv)} y1={20} x2={X(xv)} y2={216} stroke={grid} />
        <line x1={46} y1={Y(yv)} x2={342} y2={Y(yv)} stroke={grid} />
        <text x={X(xv)} y={231} fontSize={10} textAnchor="middle" fill={axis}>
          {fmt(xv)}
        </text>
        <text x={38} y={Y(yv) + 3.5} fontSize={10} textAnchor="end" fill={axis}>
          {Math.round(yv * 100) / 100}
        </text>
      </g>,
    );
  }

  let fitMarks: React.ReactElement | null = null;
  if (fit && points.length >= 2 && fit.m > 0) {
    const { m, c } = fit;
    const x1 = Math.min(xMax, (yMax - c) / m);
    const a = Math.min(...points.map((p) => p.x));
    const b = Math.max(...points.map((p) => p.x));
    fitMarks = (
      <g>
        <line x1={X(0)} y1={Y(c)} x2={X(x1)} y2={Y(c + m * x1)} stroke={accent} strokeWidth={1.8} />
        <path d={`M${X(a)} ${Y(c + m * a)} H${X(b)} V${Y(c + m * b)}`} fill="none" stroke={accent} strokeDasharray="4 3" />
        <text x={(X(a) + X(b)) / 2} y={Y(c + m * a) + 14} fontSize={10} textAnchor="middle" fill={accent}>
          Δ{xSymbol}
        </text>
        <text x={X(b) + 5} y={(Y(c + m * a) + Y(c + m * b)) / 2} fontSize={10} fill={accent}>
          Δ{ySymbol}
        </text>
        {slopeLabel ? (
          <text x={60} y={36} fontSize={11.5} fontWeight={700} fill={accent}>
            {slopeLabel(m)}
          </text>
        ) : null}
      </g>
    );
  }

  return (
    <svg
      viewBox="0 0 360 250"
      role="img"
      aria-label={ariaLabel}
      style={{ display: 'block', width: '100%', height: 'auto', fontFamily: 'inherit' }}
    >
      {lines}
      <line x1={46} y1={216} x2={342} y2={216} stroke={axis} />
      <line x1={46} y1={20} x2={46} y2={216} stroke={axis} />
      <text x={342} y={246} fontSize={10.5} textAnchor="end" fill={theme.brand.sub}>
        {xLabel} →
      </text>
      <text x={12} y={14} fontSize={10.5} fill={theme.brand.sub}>
        {yLabel} ↑
      </text>
      {fitMarks}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={X(Math.min(p.x, xMax))}
          cy={Y(Math.min(p.y, yMax))}
          r={4.5}
          fill={theme.brand.surface}
          stroke={theme.brand.ink}
          strokeWidth={1.8}
        />
      ))}
      {points.length === 0 ? (
        <text x={194} y={120} fontSize={11.5} textAnchor="middle" fill={axis}>
          {emptyText}
        </text>
      ) : null}
    </svg>
  );
}
