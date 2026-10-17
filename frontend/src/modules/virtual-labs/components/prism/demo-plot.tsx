'use client';

import * as React from 'react';
import { useTheme } from '@mui/material/styles';

import {
  IMAX,
  IMIN,
  demoMinimum,
  demoRay,
  sweptCurve,
  type CurvePoint,
} from '@labs/lib/prism/demo';
import { smallestUsefulIncidence } from '@labs/lib/prism/optics';
import type { PrismState } from '@labs/lib/prism/state';

/**
 * D against i, drawn ONLY as far as the ray box has actually been turned.
 *
 * This is deliberately not `XYGraph`, and deliberately carries none of the
 * student's own points. `XYGraph` plots a set of readings and a straight fit;
 * what a sweep produces is a continuous curve with a single minimum, filling in
 * live as the box swings, which is a different picture doing a different job.
 * Keeping the two apart also keeps the demonstration visibly separate from the
 * graph the practical is marked on: nothing plotted here is a reading, and
 * nothing here is marked.
 */
export function DemoPlot({ state }: { state: PrismState }): React.ReactElement {
  const theme = useTheme();
  const { demo, n } = state;

  const X = (i: number): number => 46 + ((Math.max(IMIN, Math.min(90, i)) - IMIN) / (90 - IMIN)) * 296;
  const Y = (d: number): number => 216 - ((Math.max(30, Math.min(70, d)) - 30) / 40) * 196;

  const grid = theme.brand.line;
  const axis = theme.brand.tert;
  const curveInk = theme.hues.blue;
  const liveInk = theme.hues.red;
  const minInk = theme.hues.green;

  const swept: readonly CurvePoint[] = sweptCurve(n, demo.lo, demo.hi);
  const path = swept.map((p) => `${X(p.i).toFixed(1)},${Y(p.D).toFixed(1)}`).join(' ');
  const m = demoMinimum(n);
  const throughMin = demo.lo !== null && demo.hi !== null && demo.lo <= m.i && demo.hi >= m.i;
  const live = demoRay(demo.i, n);
  const limit = smallestUsefulIncidence(n);

  const ticks: React.ReactElement[] = [];
  for (let i = IMIN; i <= 90; i += 15) {
    ticks.push(
      <g key={`x${i}`}>
        <line x1={X(i)} y1={20} x2={X(i)} y2={216} stroke={grid} />
        <text x={X(i)} y={231} fontSize={10} textAnchor="middle" fill={axis}>
          {i}
        </text>
      </g>,
    );
  }
  for (let d = 30; d <= 70; d += 10) {
    ticks.push(
      <g key={`y${d}`}>
        <line x1={46} y1={Y(d)} x2={342} y2={Y(d)} stroke={grid} />
        <text x={38} y={Y(d) + 3.5} fontSize={10} textAnchor="end" fill={axis}>
          {d}
        </text>
      </g>,
    );
  }

  return (
    <svg
      viewBox="0 0 360 250"
      role="img"
      aria-label={
        demo.lo === null
          ? 'Deviation against angle of incidence — nothing swept yet'
          : `Deviation against angle of incidence, swept from ${demo.lo.toFixed(0)} to ${(demo.hi ?? 0).toFixed(
              0,
            )} degrees${throughMin ? `, with a minimum of ${m.D.toFixed(1)} degrees at ${m.i.toFixed(1)} degrees` : ''}`
      }
      style={{ display: 'block', width: '100%', height: 'auto', fontFamily: 'inherit' }}
    >
      {ticks}
      <line x1={46} y1={216} x2={342} y2={216} stroke={axis} />
      <line x1={46} y1={20} x2={46} y2={216} stroke={axis} />
      <text x={342} y={246} fontSize={10.5} textAnchor="end" fill={theme.brand.sub}>
        Angle of incidence i (°) →
      </text>
      <text x={12} y={14} fontSize={10.5} fill={theme.brand.sub}>
        D (°) ↑
      </text>

      {/* Below this angle the light never gets out of the second face at all. */}
      <rect x={X(IMIN)} y={20} width={Math.max(0, X(limit) - X(IMIN))} height={196} fill={liveInk} opacity={0.06} />
      <text x={X(IMIN) + 4} y={32} fontSize={9} fill={axis}>
        trapped
      </text>

      {swept.length > 1 ? (
        <polyline points={path} fill="none" stroke={curveInk} strokeWidth={2} opacity={0.85} strokeLinecap="round" />
      ) : null}

      {throughMin ? (
        <g>
          <line x1={X(m.i)} y1={Y(m.D)} x2={X(m.i)} y2={216} stroke={minInk} strokeDasharray="3 3" />
          <line x1={46} y1={Y(m.D)} x2={X(m.i)} y2={Y(m.D)} stroke={minInk} strokeDasharray="3 3" />
          <circle cx={X(m.i)} cy={Y(m.D)} r={4} fill={minInk} />
          <text x={X(m.i) + 9} y={Y(m.D) + 16} fontSize={10.5} fontWeight={600} fill={minInk}>
            Dm = {m.D.toFixed(1)}°
          </text>
          <text x={X(m.i) + 9} y={Y(m.D) + 28} fontSize={9.5} fill={minInk}>
            at i = {m.i.toFixed(1)}°, where i = e
          </text>
        </g>
      ) : null}

      {live.clean && live.D !== null ? (
        <g>
          <line x1={X(live.i)} y1={Y(live.D)} x2={X(live.i)} y2={216} stroke={liveInk} opacity={0.5} />
          <circle cx={X(live.i)} cy={Y(live.D)} r={5} fill={liveInk} />
          <circle cx={X(live.i)} cy={Y(live.D)} r={9} fill="none" stroke={liveInk} opacity={0.4} />
          <text
            x={X(live.i)}
            y={Math.max(Y(live.D) - 14, 14)}
            fontSize={10.5}
            textAnchor="middle"
            fontWeight={600}
            fill={liveInk}
          >
            D = {live.D.toFixed(1)}°
          </text>
        </g>
      ) : (
        <text x={X(Math.max(IMIN, live.i))} y={40} fontSize={10} textAnchor="middle" fill={liveInk}>
          nothing emerges below i = {limit.toFixed(1)}°
        </text>
      )}

      {demo.lo === null ? (
        <text x={194} y={120} fontSize={11.5} textAnchor="middle" fill={axis}>
          Turn the ray box, or sweep it, and the curve fills in
        </text>
      ) : (
        <text x={342} y={32} fontSize={10} textAnchor="end" fill={curveInk}>
          swept {demo.lo.toFixed(0)}°–{(demo.hi ?? 0).toFixed(0)}° of {IMIN}°–{IMAX}°
        </text>
      )}
    </svg>
  );
}
