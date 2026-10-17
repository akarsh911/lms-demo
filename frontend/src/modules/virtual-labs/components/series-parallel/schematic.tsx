'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { keyframes, useTheme } from '@mui/material/styles';

import type { Wire } from '@labs/lib/circuit';
import { CONFIGS, P, canonOf, type ConfigId, type TerminalId } from '@labs/lib/series-parallel/apparatus';
import { joined } from '@labs/lib/series-parallel/diagnose';
import type { LabMethod } from '@labs/lib/series-parallel/method';

/**
 * The textbook circuit diagram, drawn so it fills in as the student wires.
 *
 * Segment `i` is the line that `canon[i]` lays: solid once those two terminals
 * are joined on the real bench, marching dashes for the wire to lay now, faint
 * dots for the rest, and red dashes for one the student is being asked to take
 * OFF (the R₁–R₂ link, when series becomes parallel).
 *
 * Three layouts, one per shape of circuit: a single resistor, two in series,
 * two side by side. Watching the same cells, key and ammeter stay put while
 * only the resistors are rearranged is most of the lesson.
 *
 * EACH SHAPE HAS TWO VERSIONS, one per method. The manual's own method draws
 * ONE cell — the one the lead on tap B puts in the loop — and no rheostat; the
 * alternative draws the whole battery with the rheostat in series. They differ
 * only in the return leg, which is exactly the difference on the bench.
 */
const march = keyframes`to { stroke-dashoffset: -12; }`;

/** One zig-zag resistor symbol `w` wide, starting at `x` on line `y`. */
function zig(x: number, w: number, y = 150): string {
  const s = ((w - 10) / 6).toFixed(2);
  return `M${x} ${y} l5 -7 ${`l${s} 14 l${s} -14 `.repeat(3)}l5 7`;
}

/** The rheostat: a resistor with an arrow struck through it. */
function rheostat(y: number): readonly string[] {
  return [zig(90, 50, y), `M97 ${y + 16} L134 ${y - 14} M134 ${y - 14} l-8 1 M134 ${y - 14} l-2 8`];
}

interface Layout {
  /** One path per canon wire, in the same order. */
  segs: readonly string[];
  /** Resistor and rheostat symbols. */
  symbols: readonly string[];
  /** Junction dots. */
  dots: readonly (readonly [number, number])[];
  /** The voltmeter circle. */
  vm: readonly [number, number];
  /** Resistor captions. */
  labels: readonly (readonly [number, number, string])[];
  /** Omitted under the cells method: there is no rheostat to label. */
  rheostatLabel?: readonly [number, number];
}

const SINGLE: Layout = {
  segs: [
    'M78 40 H129',
    'M151 40 H216',
    'M244 40 H300 V150 H250',
    'M190 150 H140',
    'M90 150 H20 V40 H48',
    'M250 150 V110 H234',
    'M190 150 V110 H206',
  ],
  symbols: [zig(190, 60), ...rheostat(150)],
  dots: [
    [250, 150],
    [190, 150],
  ],
  vm: [220, 110],
  labels: [[220, 176, 'R']],
  rheostatLabel: [115, 184],
};

const SERIES: Layout = {
  segs: [
    'M78 40 H129',
    'M151 40 H216',
    'M244 40 H300 V150 H282',
    'M242 150 H212',
    'M172 150 H140',
    'M90 150 H20 V40 H48',
    'M282 150 V108 H239',
    'M172 150 V108 H211',
  ],
  symbols: [zig(242, 40), zig(172, 40), ...rheostat(150)],
  dots: [
    [282, 150],
    [172, 150],
  ],
  vm: [225, 108],
  labels: [
    [262, 176, 'R₁'],
    [192, 176, 'R₂'],
  ],
  rheostatLabel: [115, 184],
};

const PARALLEL: Layout = {
  segs: [
    'M78 40 H129',
    'M151 40 H216',
    'M244 40 H300 V132 H247',
    'M282 132 V168 H247',
    'M207 132 H182 V168',
    'M207 168 H140',
    'M90 168 H20 V40 H48',
    'M282 132 V100 H239',
    'M182 132 V100 H211',
  ],
  symbols: [zig(207, 40, 132), zig(207, 40, 168), ...rheostat(168)],
  dots: [
    [282, 132],
    [182, 132],
    [182, 168],
  ],
  vm: [225, 100],
  labels: [
    [264, 126, 'R₁'],
    [264, 186, 'R₂'],
  ],
  rheostatLabel: [115, 192],
};

const SINGLE_CELLS: Layout = {
  segs: [
    'M78 40 H129',
    'M151 40 H216',
    'M244 40 H300 V150 H250',
    'M190 150 H20 V40 H48',
    'M250 150 V110 H234',
    'M190 150 V110 H206',
  ],
  symbols: [zig(190, 60)],
  dots: [
    [250, 150],
    [190, 150],
  ],
  vm: [220, 110],
  labels: [[220, 176, 'R']],
};

const SERIES_CELLS: Layout = {
  segs: [
    'M78 40 H129',
    'M151 40 H216',
    'M244 40 H300 V150 H282',
    'M242 150 H212',
    'M172 150 H20 V40 H48',
    'M282 150 V108 H239',
    'M172 150 V108 H211',
  ],
  symbols: [zig(242, 40), zig(172, 40)],
  dots: [
    [282, 150],
    [172, 150],
  ],
  vm: [225, 108],
  labels: [
    [262, 176, 'R₁'],
    [192, 176, 'R₂'],
  ],
};

const PARALLEL_CELLS: Layout = {
  segs: [
    'M78 40 H129',
    'M151 40 H216',
    'M244 40 H300 V132 H247',
    'M282 132 V168 H247',
    'M207 132 H182 V168',
    'M207 168 H20 V40 H48',
    'M282 132 V100 H239',
    'M182 132 V100 H211',
  ],
  symbols: [zig(207, 40, 132), zig(207, 40, 168)],
  dots: [
    [282, 132],
    [182, 132],
    [182, 168],
  ],
  vm: [225, 100],
  labels: [
    [264, 126, 'R₁'],
    [264, 186, 'R₂'],
  ],
};

const LAYOUTS: Readonly<Record<LabMethod, Readonly<Record<ConfigId, Layout>>>> = {
  rheostat: {
    r1: SINGLE,
    r2: { ...SINGLE, labels: [[220, 176, 'R₂']] },
    series: SERIES,
    parallel: PARALLEL,
  },
  cells: {
    r1: SINGLE_CELLS,
    r2: { ...SINGLE_CELLS, labels: [[220, 176, 'R₂']] },
    series: SERIES_CELLS,
    parallel: PARALLEL_CELLS,
  },
};

const ARIA: Readonly<Record<LabMethod, Readonly<Record<ConfigId, string>>>> = {
  rheostat: {
    r1: 'Circuit diagram: battery, plug key, ammeter, R₁ and rheostat in series, voltmeter across R₁',
    r2: 'Circuit diagram: battery, plug key, ammeter, R₂ and rheostat in series, voltmeter across R₂',
    series: 'Circuit diagram: R₁ and R₂ in series with the ammeter and rheostat, voltmeter across both',
    parallel:
      'Circuit diagram: R₁ and R₂ side by side between the same two points, ammeter in the main line, rheostat in series, voltmeter across the pair',
  },
  cells: {
    r1: 'Circuit diagram: one cell of the holder, plug key, ammeter and R₁ in series, voltmeter across R₁',
    r2: 'Circuit diagram: one cell of the holder, plug key, ammeter and R₂ in series, voltmeter across R₂',
    series: 'Circuit diagram: one cell of the holder driving R₁ and R₂ in series, voltmeter across both',
    parallel:
      'Circuit diagram: one cell of the holder driving R₁ and R₂ side by side between the same two points, ammeter in the main line, voltmeter across the pair',
  },
};

export function Schematic({
  config,
  method,
  wires,
  active = -1,
  remove = -1,
}: {
  config: ConfigId;
  method: LabMethod;
  wires: readonly Wire<TerminalId>[];
  /** Index of the segment to lay now; -1 for none, past the end once complete. */
  active?: number;
  /** Index of a segment the student should now REMOVE. */
  remove?: number;
}): React.ReactElement {
  const theme = useTheme();
  const ink = theme.brand.ink;
  const cells = method === 'cells';
  const layout = LAYOUTS[method][config];
  const canon = canonOf(CONFIGS[config], method);
  // One cell under the manual's own method, the whole holder under the
  // alternative. The plates end at x = 78 either way.
  const n = cells ? 1 : P.cells;
  const px = 78 - 6 - 12 * (n - 1);

  const caption = (x: number, y: number, s: string, size = 11): React.ReactElement => (
    <text key={`${x}-${y}-${s}`} x={x} y={y} fontSize={size} textAnchor="middle" fill={theme.brand.sub} fontFamily="Georgia, serif">
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
        '& .seg.cur, & .seg.rm': {
          strokeWidth: 3.2,
          strokeDasharray: '7 5',
          animation: `${march} .8s linear infinite`,
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        },
        '& .seg.cur': { stroke: theme.brand.orange },
        '& .seg.rm': { stroke: theme.hues.red },
      }}
    >
      <svg
        viewBox="0 0 340 196"
        role="img"
        aria-label={ARIA[method][config]}
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        {layout.segs.map((d, i) => {
          const pair = canon[i]!;
          const laid = joined(wires, pair[0], pair[1], method);
          const cls = i === remove ? (laid ? 'rm' : 'todo') : laid ? 'done' : i === active ? 'cur' : 'todo';
          return <path key={d} className={`seg ${cls}`} d={d} />;
        })}

        <g stroke={ink} strokeWidth={1.8} fill={theme.brand.sunken}>
          {/* The cells actually driving the circuit */}
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
          {/* Plug key */}
          <circle cx={132} cy={40} r={3} />
          <circle cx={148} cy={40} r={3} />
          <path d="M133 36 Q140 29 147 36" fill="none" />
          {/* Ammeter and voltmeter */}
          <circle cx={230} cy={40} r={14} />
          <circle cx={layout.vm[0]} cy={layout.vm[1]} r={14} />
          {layout.symbols.map((d) => (
            <path key={d} d={d} fill="none" />
          ))}
          {layout.dots.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={2.6} fill={ink} />
          ))}
        </g>

        <g>
          {caption(230, 44.5, 'A', 13)}
          {caption(layout.vm[0], layout.vm[1] + 4.5, 'V', 13)}
          {caption(layout.vm[0] + 18, layout.vm[1] - 12, '+', 10)}
          {caption(layout.vm[0] - 18, layout.vm[1] - 12, '−', 10)}
          {caption(140, 22, 'K')}
          {caption(63, 74, cells ? 'one cell (A–B)' : 'battery', 9.5)}
          {caption(82, 20, '+')}
          {caption(45, 20, '−')}
          {caption(211, 26, '+', 10)}
          {caption(249, 26, '−', 10)}
          {layout.labels.map(([x, y, s]) => caption(x, y, s))}
          {layout.rheostatLabel ? caption(layout.rheostatLabel[0], layout.rheostatLabel[1], 'Rh') : null}
          <text x={176} y={32} fontSize={10} fontStyle="italic" textAnchor="middle" fill={theme.brand.sub} fontFamily="Georgia, serif">
            I →
          </text>
        </g>
      </svg>
    </Box>
  );
}
