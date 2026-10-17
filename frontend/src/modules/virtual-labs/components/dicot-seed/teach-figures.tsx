'use client';

import * as React from 'react';

import { SPECIES } from '@labs/lib/dicot-seed/seed-model';
import { brand } from '@/styles/theme/tokens';

import { LABEL_FONT } from '../apparatus-palette';

/**
 * THE THREE DRAWINGS THE DICOT-SEED TEACHING PANEL SETS UNDER ITS PROSE.
 *
 * THE RULE THEY ARE UNDER, WHICH IS THE PANEL'S OWN (see `teach.tsx`). A figure
 * is subject to exactly the constraint the words are: it is never handed the
 * specimen, and it may not draw a thing the student is marked for recording.
 * None of these three takes a seed, a species, a soak time or a pin. Two of them
 * take nothing at all; the third takes nothing either, and is simply not
 * rendered until `revealed`.
 *
 * WHAT THIS BENCH MARKS (`@labs/lib/dicot-seed/marking.ts`): finding the hilum
 * and the micropyle on the intact coat with the lens (`external`, 10), six
 * labels dropped on the parts themselves (`label`, 30), the seven rows saying
 * what each part IS and what it DOES (`table`, 14), the three conclusions
 * (`concl`, 6), and how far the seed had swollen when it was dissected
 * (`prep`, 10).
 *
 * So the two ANATOMY figures — the coat and the split seed — name and place
 * exactly the parts those thirty and fourteen marks are for, and they are drawn
 * only once `revealed` is true, which is the escape the rule allows for a figure
 * that can only teach by showing a marked outcome. They sit beside the
 * paragraph that already names the radicle and the plumule, and they say the
 * same thing in a picture.
 *
 * The imbibition curve is safe at any time and is always drawn: it carries NO
 * NUMBERS on either scale, precisely because `prep` marks how long this
 * student's own seed actually soaked. A curve with hours on it would be a
 * timetable; a curve with only a shape on it is an explanation.
 *
 * The drawings are the bench's own colours — a seed is a physical object and a
 * student recognises it by them — taken from `seed-model` where the model has
 * them, and otherwise the same literals `seed-figure.tsx` uses for the same
 * parts. Gram is drawn because something has to be; the anatomy is the same at
 * all three sizes, which is the point the panel makes in words.
 */

// ---------------------------------------------------------------------------
// The drawing kit
// ---------------------------------------------------------------------------

const INK = brand.ink;
const NOTE = brand.sub;
const FAINT = brand.tert;
const RULE = brand.line2;

const SEED = SPECIES.gram;
/** The papery inner coat, and the parts of the embryo — as in `seed-figure`. */
const TEGMEN = '#e8d6b2';
const AXIS = '#d6bb85';
const RADICLE = '#e4c688';
const AXIS_EDGE = '#9d8752';
const STALK = '#7d9a4f';
const LEAF = '#adc873';
const LEAF_EDGE = '#6c8a40';

const n2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * A seed outline: an ovoid with a flatter ventral edge at +y.
 *
 * Deliberately written out here rather than imported from `SHAPE`. This is a
 * textbook diagram of the anatomy, not a picture of anybody's specimen, and it
 * should not start tracking the model if a species outline is ever retuned.
 */
function seedPath(cx: number, cy: number, a: number, b: number): string {
  return (
    `M${n2(cx - a)} ${n2(cy + 0.1 * b)}` +
    ` C${n2(cx - a)} ${n2(cy - 0.72 * b)} ${n2(cx - 0.45 * a)} ${n2(cy - b)} ${n2(cx + 0.1 * a)} ${n2(cy - 0.97 * b)}` +
    ` C${n2(cx + 0.68 * a)} ${n2(cy - 0.94 * b)} ${n2(cx + a)} ${n2(cy - 0.45 * b)} ${n2(cx + a)} ${n2(cy + 0.18 * b)}` +
    ` C${n2(cx + a)} ${n2(cy + 0.78 * b)} ${n2(cx + 0.5 * a)} ${n2(cy + 0.99 * b)} ${n2(cx - 0.05 * a)} ${n2(cy + 0.97 * b)}` +
    ` C${n2(cx - 0.55 * a)} ${n2(cy + 0.95 * b)} ${n2(cx - a)} ${n2(cy + 0.74 * b)} ${n2(cx - a)} ${n2(cy + 0.1 * b)} Z`
  );
}

/** A quadrilateral from A to B, `w1` wide at one end and `w2` at the other. */
function taper(ax: number, ay: number, bx: number, by: number, w1: number, w2: number): string {
  const dx = bx - ax;
  const dy = by - ay;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  return (
    `M${n2(ax + nx * w1)} ${n2(ay + ny * w1)} L${n2(bx + nx * w2)} ${n2(by + ny * w2)}` +
    ` L${n2(bx - nx * w2)} ${n2(by - ny * w2)} L${n2(ax - nx * w1)} ${n2(ay - ny * w1)} Z`
  );
}

/** A label, set away from the drawing and joined to it by a line. */
function Note({
  x,
  y,
  lines,
  anchor = 'start',
  size = 8,
  fill = NOTE,
  strongFirst = false,
}: {
  x: number;
  y: number;
  lines: readonly string[];
  anchor?: 'start' | 'middle' | 'end';
  size?: number;
  fill?: string;
  strongFirst?: boolean;
}): React.ReactElement {
  return (
    <text x={x} y={y} fontSize={size} fill={fill} textAnchor={anchor} fontFamily={LABEL_FONT}>
      {lines.map((line, i) => (
        <tspan
          key={`${i}-${line}`}
          x={x}
          dy={i === 0 ? 0 : size * 1.3}
          fontWeight={strongFirst && i === 0 ? 700 : 400}
          fill={strongFirst && i === 0 ? INK : fill}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

function Leader({ d }: { d: string }): React.ReactElement {
  return <path d={d} fill="none" stroke={FAINT} strokeWidth={0.9} strokeLinecap="round" />;
}

// ---------------------------------------------------------------------------
// 1. The coat
// ---------------------------------------------------------------------------

const COAT_DESC =
  'The seed coat. Above, a whole seed seen from the side, with an oval scar — the hilum — on its ventral ' +
  'edge and, a little way along the same edge, a pinprick pore ringed with a dashed circle — the micropyle. ' +
  'Below, a magnified slice through the coat showing three layers stacked: a thick outer testa, a thin ' +
  'papery tegmen inside it, and the surface of a cotyledon beneath them both.';

/**
 * WHAT THE COAT IS MADE OF, AND THE TWO MARKS ON IT.
 *
 * Two things at once, because neither reads without the other: from the outside
 * the coat carries a scar and a pore, and in section it is two layers, not one.
 * The section is what makes the pore worth drawing — a pinprick straight through
 * a coat whose whole construction is meant to keep water out is the reason a
 * seed takes hours to soak rather than seconds.
 *
 * STATE-FREE, AND HELD BACK ANYWAY. It takes no props: no seed, no species, no
 * soak time, no pin. It cannot show where anything lies on this student's own
 * specimen, and drawn a week apart it is the same drawing.
 *
 * But naming and placing the hilum and the micropyle IS the ten-mark search
 * with the lens, and "tiny pore beside the hilum / lets water and air in" is two
 * cells of the marked table. There is no version of this figure that teaches the
 * coat without handing those over, so `teach.tsx` renders it only after the
 * marks are settled — the escape the rule allows, taken openly rather than
 * quietly.
 */
export function SeedCoatFigure(): React.ReactElement {
  const cx = 78;
  const cy = 58;
  const a = 58;
  const b = 44;

  /** One arched band of the section, drawn top curve then bottom curve. */
  const band = (yT: number, yB: number): string =>
    `M26 ${yT + 6} Q78 ${yT - 6} 130 ${yT + 6} L130 ${yB + 6} Q78 ${yB - 6} 26 ${yB + 6} Z`;

  return (
    <svg viewBox="0 0 300 210" role="img" aria-label={COAT_DESC}>
      <title>{COAT_DESC}</title>

      {/* ---- the seed from outside ---- */}
      <path d={seedPath(cx, cy, a, b)} fill={SEED.coat} stroke={SEED.coatDark} strokeWidth={1.6} />
      <ellipse cx={cx - 0.18 * a} cy={cy - 0.42 * b} rx={0.34 * a} ry={0.19 * b} fill="#fff" opacity={0.17} />
      <ellipse
        cx={cx - 0.05 * a}
        cy={cy + 0.95 * b}
        rx={0.2 * a}
        ry={0.13 * b}
        fill="#f8f2e4"
        stroke={SEED.coatDark}
        strokeWidth={1.8}
      />
      <ellipse
        cx={cx - 0.05 * a}
        cy={cy + 0.95 * b}
        rx={0.1 * a}
        ry={0.06 * b}
        fill="none"
        stroke={SEED.coatDark}
        opacity={0.45}
      />
      <circle cx={cx - 0.45 * a} cy={cy + 0.8 * b} r={2.1} fill={SEED.coatDark} />
      <circle
        cx={cx - 0.45 * a}
        cy={cy + 0.8 * b}
        r={6}
        fill="none"
        stroke={SEED.coatDark}
        strokeDasharray="2 3"
        opacity={0.6}
      />

      <Leader d="M154 58 C128 64 102 86 87 96" />
      <Note
        x={158}
        y={52}
        lines={['hilum', 'the scar where the seed', 'was joined inside the pod']}
        strongFirst
      />

      <Leader d="M154 104 C120 124 82 116 57 99" />
      <Note
        x={158}
        y={96}
        lines={['micropyle', 'a pore right through the coat:', 'water in now — and the radicle', 'out when it germinates']}
        strongFirst
      />

      {/* ---- and the coat itself, sliced ---- */}
      <circle cx={30} cy={70} r={9} fill="none" stroke={FAINT} strokeWidth={0.9} strokeDasharray="2.5 2.5" />
      <Leader d="M30 80 C27 102 25 124 27 143" />
      <Note x={44} y={134} lines={['a slice through the coat, magnified']} size={7} fill={FAINT} />

      <path d={band(138, 162)} fill={SEED.coat} stroke={SEED.coatDark} strokeWidth={1.5} />
      <path d={band(162, 174)} fill={TEGMEN} stroke={SEED.coatDark} strokeWidth={1.2} />
      <path d={band(174, 196)} fill={SEED.coty} stroke={SEED.cotyEdge} strokeWidth={1.4} />
      <path d="M28 147 Q78 135 128 147" fill="none" stroke="#fff" strokeWidth={1.4} opacity={0.4} />
      <Note x={78} y={190} lines={['cotyledon beneath']} anchor="middle" size={7} fill={AXIS_EDGE} />

      <Leader d="M154 146 L114 150" />
      <Note x={158} y={142} lines={['testa', 'the tough outer coat —', 'dead, thick-walled, waxed']} strongFirst />

      <Leader d="M154 182 L114 171" />
      <Note x={158} y={178} lines={['tegmen', 'the thin papery layer', 'just inside it']} strongFirst />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 2. Inside the seed
// ---------------------------------------------------------------------------

const ENDO_DESC =
  'A soaked seed with its coat off, parted along its natural plane into two thick halves — the cotyledons. ' +
  'The left half is empty but for a dashed outline of where the embryo lay; the right half carries the ' +
  'embryo axis, ringed. Beneath, that axis is drawn magnified: a pointed thicker end at one side, the ' +
  'radicle, which becomes the root, and a small feathery tuft of leaves at the other, the plumule, which ' +
  'becomes the shoot, joined by the short stalk of the axis itself.';

/**
 * WHAT A SPLIT SEED IS: A LARDER, AND A VERY SMALL PLANT.
 *
 * The proportion is the lesson. Almost all of what a student is holding is food
 * store — two thick halves that are neither leaf nor root — and the actual plant
 * is the few-millimetre stalk lying between them, which is why it is drawn again
 * magnified underneath rather than left as a squiggle on a cotyledon.
 *
 * STATE-FREE, AND HELD BACK ANYWAY. It takes no props and cannot see the
 * specimen: not the species, not the swelling, not which half the axis stayed
 * on, not where any pin was dropped.
 *
 * But it labels the cotyledon, the plumule and the radicle, and says which end
 * becomes which — the thirty-mark labelling, two rows of the table, and the
 * third conclusion sentence. So `teach.tsx` renders it only once `revealed` is
 * true, beside the paragraph that says the same thing in words.
 */
export function SplitSeedFigure(): React.ReactElement {
  const a = 48;
  const b = 40;
  const cyH = 74;
  const left = 84;
  const right = 196;

  // The embryo axis, in the same fractions of the half-axes the model uses, so
  // the diagram and the seed on the bench agree about where the parts lie.
  const p = (cx: number, fx: number, fy: number): [number, number] => [cx + fx * a, cyH + fy * b];
  const [rax, ray] = p(right, -0.56, 0.52);
  const [rbx, rby] = p(right, -0.24, 0.58);
  const [abx, aby] = p(right, 0.06, 0.4);
  const [plx, ply] = p(right, 0.22, 0.26);
  const [lrax, lray] = p(left, -0.56, 0.52);
  const [lrbx, lrby] = p(left, -0.24, 0.58);
  const [labx, laby] = p(left, 0.06, 0.4);

  const leaves: readonly (readonly [number, number, number])[] = [
    [-6, -5, -42],
    [2, -9, -6],
    [9, -1, 30],
  ];

  return (
    <svg viewBox="0 0 300 244" role="img" aria-label={ENDO_DESC}>
      <title>{ENDO_DESC}</title>

      <Note
        x={150}
        y={12}
        lines={['the coat off: two thick cotyledons, and the embryo between them']}
        anchor="middle"
        size={7.5}
        fill={FAINT}
      />
      <Leader d="M112 20 L97 39" />
      <Leader d="M188 20 L196 37" />

      {/* ---- the half the embryo did not stay on ---- */}
      <path d={seedPath(left, cyH, a, b)} fill={SEED.coty} stroke={SEED.cotyEdge} strokeWidth={1.6} />
      <ellipse cx={left - 0.1 * a} cy={cyH - 0.3 * b} rx={0.42 * a} ry={0.3 * b} fill="#fff" opacity={0.35} />
      <path
        d={`M${n2(lrax)} ${n2(lray)} L${n2(lrbx)} ${n2(lrby)} L${n2(labx)} ${n2(laby)}`}
        fill="none"
        stroke={SEED.cotyEdge}
        strokeWidth={1.6}
        strokeDasharray="4 3"
      />
      <Note x={left} y={126} lines={['cotyledon — the food store']} anchor="middle" size={7.5} fill={AXIS_EDGE} />

      {/* ---- and the half it did ---- */}
      <path d={seedPath(right, cyH, a, b)} fill={SEED.coty} stroke={SEED.cotyEdge} strokeWidth={1.6} />
      <ellipse cx={right - 0.1 * a} cy={cyH - 0.3 * b} rx={0.42 * a} ry={0.3 * b} fill="#fff" opacity={0.35} />
      <path d={taper(rax, ray, rbx, rby, 0.6, 4.4)} fill={RADICLE} stroke={AXIS_EDGE} strokeWidth={1.4} />
      <path d={taper(rbx, rby, abx, aby, 3.4, 2.6)} fill={AXIS} stroke={AXIS_EDGE} strokeWidth={1.4} />
      <line x1={n2(abx)} y1={n2(aby)} x2={n2(plx)} y2={n2(ply)} stroke={STALK} strokeWidth={2.2} />
      {leaves.map(([dx, dy, rot]) => (
        <ellipse
          key={`${dx}-${dy}`}
          cx={n2(plx + dx)}
          cy={n2(ply + dy)}
          rx={4.6}
          ry={2.4}
          transform={`rotate(${rot} ${n2(plx + dx)} ${n2(ply + dy)})`}
          fill={LEAF}
          stroke={LEAF_EDGE}
          strokeWidth={1.1}
        />
      ))}
      <ellipse
        cx={188}
        cy={90}
        rx={26}
        ry={14}
        fill="none"
        stroke={FAINT}
        strokeWidth={0.9}
        strokeDasharray="2.5 2.5"
      />
      <Leader d="M212 98 C238 112 250 130 256 146" />

      {/* ---- the embryo axis, enlarged ---- */}
      <rect x={20} y={148} width={260} height={68} rx={10} fill={brand.surface} stroke={RULE} strokeWidth={1} />
      <path d={taper(52, 202, 128, 192, 1.5, 9)} fill={RADICLE} stroke={AXIS_EDGE} strokeWidth={1.5} />
      <path d={taper(128, 192, 186, 182, 7, 5.5)} fill={AXIS} stroke={AXIS_EDGE} strokeWidth={1.5} />
      <line x1={186} y1={182} x2={210} y2={174} stroke={STALK} strokeWidth={2.8} strokeLinecap="round" />
      {leaves.map(([dx, dy, rot]) => (
        <ellipse
          key={`big-${dx}-${dy}`}
          cx={214 + dx * 1.7}
          cy={171 + dy * 1.7}
          rx={8.4}
          ry={4.3}
          transform={`rotate(${rot} ${214 + dx * 1.7} ${171 + dy * 1.7})`}
          fill={LEAF}
          stroke={LEAF_EDGE}
          strokeWidth={1.3}
        />
      ))}

      <Note x={30} y={166} lines={['radicle', 'becomes the root']} size={7.5} strongFirst />
      <Note x={272} y={192} lines={['plumule', 'becomes the shoot']} anchor="end" size={7.5} strongFirst />

      <Leader d="M150 226 L158 190" />
      <Note
        x={150}
        y={236}
        lines={['the embryo axis — the whole plant so far, a growing point at each end']}
        anchor="middle"
        size={7.5}
        fill={FAINT}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 3. Imbibition
// ---------------------------------------------------------------------------

const PLOT = { x0: 40, x1: 286, base: 136, axis: 140, top: 42 } as const;

/** 1 − e^(−kt): quick while the dry sites are free, slower as they fill. */
const CURVE = ((): string => {
  const steps = 48;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const v = 1 - Math.exp(-3.4 * t);
    const x = PLOT.x0 + t * (PLOT.x1 - PLOT.x0);
    const y = PLOT.base - v * (PLOT.base - PLOT.top);
    d += `${i ? ' L' : 'M'}${n2(x)} ${n2(y)}`;
  }
  return d;
})();

const SWELL_DESC =
  'A graph of the mass of a seed against its time in water. The curve starts above zero — the seed is ' +
  'already something when it is dry — rises steeply at first, then bends over and flattens against a ' +
  'dashed line marked as much water as it can hold. Neither scale carries any numbers.';

/**
 * IMBIBITION, AS A SHAPE.
 *
 * The one thing about soaking that a sentence cannot fix in the head: the uptake
 * is not steady. It is quick while every dry wall and starch grain still has
 * room, and it slows as those sites fill, until more time in water buys nothing
 * at all. That is the whole argument for "overnight" and against "the whole
 * weekend", and it is a curve, not a fact.
 *
 * STATE-FREE, AND SAFE UNGATED. It takes no props and can see no seed. It is
 * also DELIBERATELY WITHOUT NUMBERS on either scale: `prep` marks how far this
 * student's own seed had actually swollen when they dissected it, so an axis
 * with hours along it would be handing over a ten-mark judgement. The shape is
 * the teaching; the reading is the student's.
 */
export function ImbibitionFigure(): React.ReactElement {
  return (
    <svg viewBox="0 0 300 186" role="img" aria-label={SWELL_DESC}>
      <title>{SWELL_DESC}</title>

      {/* ---- the scales, which carry no numbers ---- */}
      <line
        x1={PLOT.x0}
        y1={26}
        x2={PLOT.x0}
        y2={PLOT.axis}
        stroke={NOTE}
        strokeWidth={1}
        strokeLinecap="round"
      />
      <path d={`M${PLOT.x0} 22 l-3.4 6 h6.8 z`} fill={NOTE} />
      <line
        x1={PLOT.x0}
        y1={PLOT.axis}
        x2={292}
        y2={PLOT.axis}
        stroke={NOTE}
        strokeWidth={1}
        strokeLinecap="round"
      />
      <path d={`M296 ${PLOT.axis} l-6 -3.4 v6.8 z`} fill={NOTE} />
      <text
        x={12}
        y={84}
        fontSize={7.5}
        fill={NOTE}
        textAnchor="middle"
        fontFamily={LABEL_FONT}
        transform="rotate(-90 12 84)"
      >
        mass of the seed →
      </text>
      <text x={163} y={158} fontSize={7.5} fill={NOTE} textAnchor="middle" fontFamily={LABEL_FONT}>
        time in water →
      </text>

      {/* ---- where it is heading, and never passes ---- */}
      <line
        x1={PLOT.x0}
        y1={PLOT.top}
        x2={288}
        y2={PLOT.top}
        stroke={RULE}
        strokeWidth={1.2}
        strokeDasharray="4 3"
      />
      <Note x={288} y={36} lines={['as much water as it can hold']} anchor="end" size={7.5} fill={FAINT} />

      {/* ---- a dry seed is not nothing ---- */}
      <line x1={34} y1={PLOT.base} x2={PLOT.x0} y2={PLOT.base} stroke={FAINT} strokeWidth={0.9} strokeDasharray="2 2" />
      <Note x={32} y={139} lines={['dry']} anchor="end" size={7} fill={FAINT} />

      <path d={CURVE} fill="none" stroke={brand.orange} strokeWidth={2.2} strokeLinecap="round" />

      <Leader d="M90 110 L64 112" />
      <Note x={94} y={110} lines={['steep at first — every dry wall', 'and starch grain is taking water']} size={7.5} />

      {/* No leader on this one: it sits under the flat of the curve, and a line
          reaching up to it would have to be drawn straight through the words. */}
      <Note
        x={288}
        y={64}
        lines={['then it slows: every site that', 'attracts water has taken some']}
        anchor="end"
        size={7.5}
      />

      <Note
        x={150}
        y={176}
        lines={['no numbers on the scales — how long your own seed needs is yours to find']}
        anchor="middle"
        size={7.5}
        fill={FAINT}
      />
    </svg>
  );
}
