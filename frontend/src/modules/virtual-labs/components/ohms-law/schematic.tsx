'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { keyframes, useTheme } from '@mui/material/styles';

import type { Wire } from '@labs/lib/circuit';
import { P, canonFor, type TerminalId } from '@labs/lib/ohms-law/apparatus';
import { joined } from '@labs/lib/ohms-law/diagnose';
import type { LabMethod } from '@labs/lib/ohms-law/method';

/**
 * The textbook circuit diagram, drawn so it fills in as the student wires.
 *
 * Segment `i` is the line that `canon[i]` lays: solid once those two terminals
 * are joined on the real bench, marching dashes for the wire to lay now,
 * faint dots for the rest. A student learns to read a diagram as a map by
 * watching this one become the bench in front of them.
 *
 * ONE DIAGRAM PER METHOD, because they are different circuits. The manual's own
 * method draws ONE cell — the one the lead on tap B puts in the loop — and no
 * rheostat; the alternative draws the whole battery with the rheostat in series.
 */
const march = keyframes`to { stroke-dashoffset: -12; }`;

function zig(x: number, w: number): string {
  const s = ((w - 10) / 6).toFixed(2);
  return `M${x} 150 l5 -7 ${`l${s} 14 l${s} -14 `.repeat(3)}l5 7`;
}

const SEG_CELLS = [
  'M78 40 H129',
  'M151 40 H216',
  'M244 40 H300 V150 H250',
  'M190 150 H20 V40 H48',
  'M250 150 V110 H234',
  'M190 150 V110 H206',
];

const SEG_RHEOSTAT = [
  'M78 40 H129',
  'M151 40 H216',
  'M244 40 H300 V150 H250',
  'M190 150 H140',
  'M90 150 H20 V40 H48',
  'M250 150 V110 H234',
  'M190 150 V110 H206',
];

export function Schematic({
  method,
  wires,
  active,
}: {
  method: LabMethod;
  wires: readonly Wire<TerminalId>[];
  /** Index of the segment to lay now; -1 for none, past the end once complete. */
  active: number;
}): React.ReactElement {
  const theme = useTheme();
  const ink = theme.brand.ink;
  const cells = method === 'cells';
  const segs = cells ? SEG_CELLS : SEG_RHEOSTAT;
  const canon = canonFor(method);

  // How many cells the diagram shows: one under the manual's own method, the
  // whole holder under the alternative. The plates end at x = 78 either way.
  const n = cells ? 1 : P.cells;
  const px = 78 - 6 - 12 * (n - 1);

  const t = (x: number, y: number, s: string, size = 11): React.ReactElement => (
    <text key={`${x}:${y}:${s}`} x={x} y={y} fontSize={size} textAnchor="middle" fill={theme.brand.sub} fontFamily="Georgia, serif">
      {s}
    </text>
  );

  return (
    <Box
      sx={{
        backgroundColor: theme.brand.sunken,
        borderRadius: `${theme.band.radius.sm}px`,
        px: 1,
        py: 0.75,
        my: 1,
        '& .seg': { fill: 'none', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' },
        '& .seg.todo': { stroke: theme.brand.tert, strokeDasharray: '2 5', opacity: 0.6 },
        '& .seg.done': { stroke: ink },
        '& .seg.cur': {
          stroke: theme.brand.orange,
          strokeWidth: 3.2,
          strokeDasharray: '7 5',
          animation: `${march} .8s linear infinite`,
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        },
      }}
    >
      <svg
        viewBox="0 0 340 196"
        role="img"
        aria-label={
          cells
            ? 'Circuit diagram: one cell of the holder, plug key, ammeter and resistor in series, voltmeter across the resistor'
            : 'Circuit diagram: battery, plug key, ammeter, resistor and rheostat in series, voltmeter across the resistor'
        }
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        {segs.map((d, i) => {
          const pair = canon[i]!;
          const cls = joined(wires, pair[0], pair[1], method) ? 'done' : i === active ? 'cur' : 'todo';
          return <path key={d} className={`seg ${cls}`} d={d} />;
        })}
        <g stroke={ink} strokeWidth={1.8} fill={theme.brand.sunken}>
          {px > 48 ? <line x1={48} y1={40} x2={px} y2={40} /> : null}
          {Array.from({ length: n }, (_, c) => {
            const x = px + 12 * c;
            return (
              <g key={c}>
                <line x1={x} y1={33} x2={x} y2={47} />
                <line x1={x + 6} y1={26} x2={x + 6} y2={54} />
              </g>
            );
          })}
          <circle cx={132} cy={40} r={3} />
          <circle cx={148} cy={40} r={3} />
          <path d="M133 36 Q140 29 147 36" fill="none" />
          <circle cx={230} cy={40} r={14} />
          <circle cx={220} cy={110} r={14} />
          <path d={zig(190, 60)} fill="none" />
          {cells ? null : (
            <>
              <path d={zig(90, 50)} fill="none" />
              <path d="M97 166 L134 136 M134 136 l-8 1 M134 136 l-2 8" fill="none" />
            </>
          )}
          <circle cx={250} cy={150} r={2.6} fill={ink} />
          <circle cx={190} cy={150} r={2.6} fill={ink} />
        </g>
        <g>
          {t(230, 44.5, 'A', 13)}
          {t(220, 114.5, 'V', 13)}
          {t(140, 22, 'K')}
          {t(220, 176, 'R')}
          {cells ? null : t(115, 184, 'Rh')}
          {t(63, 74, cells ? 'one cell (A–B)' : 'battery', 9.5)}
          {t(82, 20, '+')}
          {t(45, 20, '−')}
          {t(211, 26, '+', 10)}
          {t(249, 26, '−', 10)}
          {t(240, 96, '+', 10)}
          {t(200, 96, '−', 10)}
          <text x={176} y={32} fontSize={10} fontStyle="italic" textAnchor="middle" fill={theme.brand.sub} fontFamily="Georgia, serif">
            I →
          </text>
        </g>
      </svg>
    </Box>
  );
}
