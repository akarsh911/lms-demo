'use client';

import * as React from 'react';

import type { SpecimenId } from '@labs/lib/cell-division/specimens';

/**
 * The six figures, drawn from anatomical parts.
 *
 * Each is built in a local system where one unit is 0.01 mm, so the
 * magnification you see is the microscope's and not the artist's: the same
 * figure is drawn on the slide, in the eyepiece at 100×, at 400×, and on the
 * reference plate, and it is the field of view that changes.
 *
 * `Unioned` paints an outline by stroking the parts underneath and filling them
 * on top, which welds a bud to its parent without an internal seam — which is
 * exactly what a bud looks like down a microscope, and is why a student has to
 * look for the neck rather than for two separate cells.
 */

type Shape =
  | { kind: 'path'; d: string; transform?: string }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rot: number; transform?: string };

const f1 = (v: number): number => Math.round(v * 10) / 10;

function renderShape(s: Shape, key: number): React.ReactElement {
  if (s.kind === 'path') return <path key={key} d={s.d} transform={s.transform} />;
  return (
    <ellipse
      key={key}
      cx={s.cx}
      cy={s.cy}
      rx={s.rx}
      ry={s.ry}
      transform={`${s.transform ?? ''} rotate(${s.rot} ${s.cx} ${s.cy})`.trim()}
    />
  );
}

function Unioned({
  shapes,
  fill,
  stroke,
  width,
}: {
  shapes: readonly Shape[];
  fill: string;
  stroke: string;
  width: number;
}): React.ReactElement {
  return (
    <>
      <g fill={stroke} stroke={stroke} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round">
        {shapes.map(renderShape)}
      </g>
      <g fill={fill}>{shapes.map(renderShape)}</g>
    </>
  );
}

/** A closed Catmull-Rom blob through points given as [angle°, radius]. */
function blobPath(cx: number, cy: number, spec: readonly (readonly [number, number])[]): string {
  const n = spec.length;
  const P = spec.map(([a, r]) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)]);
  let d = `M${f1(P[0]![0]!)},${f1(P[0]![1]!)}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = P[(i - 1 + n) % n]!;
    const p1 = P[i]!;
    const p2 = P[(i + 1) % n]!;
    const p3 = P[(i + 2) % n]!;
    const t = 1 / 6;
    d +=
      `C${f1(p1[0]! + (p2[0]! - p0[0]!) * t)},${f1(p1[1]! + (p2[1]! - p0[1]!) * t)} ` +
      `${f1(p2[0]! - (p3[0]! - p1[0]!) * t)},${f1(p2[1]! - (p3[1]! - p1[1]!) * t)} ` +
      `${f1(p2[0]!)},${f1(p2[1]!)}`;
  }
  return `${d}Z`;
}

/** A tapered, slightly curled limb — used for Hydra's tentacles. */
function taper(x0: number, y0: number, ang: number, len: number, w0: number, w1: number, curl: number): string {
  const a = (ang * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const px = -uy;
  const py = ux;
  const N = 7;
  const P: [number, number, number][] = [];
  for (let i = 0; i < N; i += 1) {
    const t = i / (N - 1);
    const bend = curl * t * t;
    P.push([x0 + ux * len * t + px * bend, y0 + uy * len * t + py * bend, (w0 + (w1 - w0) * t) / 2]);
  }
  let L = '';
  const R: string[] = [];
  for (let i = 0; i < N; i += 1) {
    const [x, y, w] = P[i]!;
    const j = Math.min(i + 1, N - 1);
    const k = Math.max(i - 1, 0);
    let tx = P[j]![0] - P[k]![0];
    let ty = P[j]![1] - P[k]![1];
    const m = Math.hypot(tx, ty) || 1;
    tx /= m;
    ty /= m;
    const nx = -ty;
    const ny = tx;
    L += `${i ? 'L' : 'M'}${f1(x + nx * w)},${f1(y + ny * w)}`;
    R.unshift(`${f1(x - nx * w)},${f1(y - ny * w)}`);
  }
  return `${L}L${R.join('L')}Z`;
}

function Dots({
  at,
  r,
  fill,
  opacity,
}: {
  at: readonly (readonly [number, number, number?])[];
  r: number;
  fill: string;
  opacity: number;
}): React.ReactElement {
  return (
    <>
      {at.map(([x, y, s], i) => (
        <circle key={i} cx={x} cy={y} r={(s ?? 1) * r} fill={fill} opacity={opacity} />
      ))}
    </>
  );
}

/** Stain colours. Prepared slides are stained, and these are the stains. */
const C = {
  amo: '#f2d3da',
  amoIn: '#e5b6c2',
  amoLine: '#9f6178',
  nuc: '#5f3379',
  nucIn: '#3f1f56',
  vac: '#fdf8f4',
  ye: '#dbe7f2',
  yeIn: '#c2d6e8',
  yeLine: '#5c7a9a',
  yeNuc: '#2d4c74',
  scar: '#7b5a3c',
  hy: '#eccdd6',
  hyIn: '#dcaebd',
  hyLine: '#8e5a72',
  cav: '#f8e9ee',
} as const;

// --- Amoeba -----------------------------------------------------------------

const LOBE = [
  [0, 9],
  [40, 12],
  [75, 14],
  [115, 17],
  [155, 15],
  [180, 16],
  [205, 15],
  [245, 17],
  [285, 14],
  [320, 12],
] as const;

/**
 * Five blunt lobopodia — a wide crest either side of each tip and a narrow
 * valley between them, rather than the spikes a simple alternating radius gives.
 */
const BLOB = [20, 92, 164, 236, 308].flatMap(
  (c) =>
    [
      [c - 14, 19],
      [c, 21.5],
      [c + 14, 19],
      [c + 36, 12],
    ] as const,
);

function AmoebaFission(): React.ReactElement {
  const half = blobPath(-13, 0, LOBE);
  const body: Shape[] = [
    { kind: 'path', d: half },
    { kind: 'path', d: half, transform: 'scale(-1,1)' },
    { kind: 'path', d: 'M-7,-5 C-3,-4 3,-4 7,-5 L7,5 C3,4 -3,4 -7,5 Z' },
  ];
  const endo = blobPath(-13, 0, LOBE.map(([a, r]) => [a, r * 0.7] as const));

  return (
    <>
      <Unioned shapes={body} fill={C.amo} stroke={C.amoLine} width={2.6} />
      {/* endoplasm — the granular inner mass, set in from the clear ectoplasm */}
      <g opacity={0.75}>
        <path d={endo} fill={C.amoIn} />
        <path d={endo} transform="scale(-1,1)" fill={C.amoIn} />
      </g>
      <Dots
        at={[
          [-15, -6],
          [-9, 5],
          [-18, 4],
          [-11, -9],
          [14, 6],
          [9, -5],
          [18, -4],
          [11, 9],
          [-5, 1],
          [5, -1],
        ]}
        r={1.5}
        fill={C.amoLine}
        opacity={0.38}
      />
      {/* the nucleus has already divided — one daughter nucleus in each half */}
      {[-13, 13].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={0} rx={6.2} ry={5} fill={C.nuc} />
          <ellipse cx={x} cy={0} rx={6.2} ry={5} fill="none" stroke={C.nucIn} strokeWidth={0.8} />
          <Dots
            at={[
              [x - 2.5, -1.5],
              [x + 1.5, 1.8],
              [x + 2.8, -2],
              [x - 1, 2.4],
              [x, -0.2],
            ]}
            r={1.1}
            fill={C.nucIn}
            opacity={0.85}
          />
        </g>
      ))}
      {/* contractile vacuoles */}
      {([[-17, -7], [17, 7]] as const).map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r={3.4} fill={C.vac} stroke={C.amoLine} strokeWidth={0.7} opacity={0.9} />
      ))}
    </>
  );
}

function AmoebaPlain(): React.ReactElement {
  const body: Shape[] = [{ kind: 'path', d: blobPath(0, 0, BLOB) }];
  return (
    <>
      <Unioned shapes={body} fill={C.amo} stroke={C.amoLine} width={2.6} />
      <path d={blobPath(0, 0, BLOB.map(([a, r]) => [a, r * 0.68] as const))} fill={C.amoIn} opacity={0.75} />
      <Dots
        at={[
          [-4, -6],
          [6, -3],
          [2, 6],
          [-7, 3],
          [9, 4],
          [-2, 10],
          [-10, -2],
          [5, -9],
        ]}
        r={1.5}
        fill={C.amoLine}
        opacity={0.38}
      />
      <ellipse cx={3} cy={-3} rx={6.4} ry={5.2} fill={C.nuc} />
      <ellipse cx={3} cy={-3} rx={6.4} ry={5.2} fill="none" stroke={C.nucIn} strokeWidth={0.8} />
      <Dots
        at={[
          [0.5, -4.5],
          [5, -1],
          [6, -5],
          [2, 0],
          [3, -3],
        ]}
        r={1.1}
        fill={C.nucIn}
        opacity={0.85}
      />
      <circle cx={-8} cy={8} r={4.2} fill={C.vac} stroke={C.amoLine} strokeWidth={0.7} opacity={0.92} />
      <circle cx={-8} cy={8} r={2.1} fill="none" stroke={C.amoLine} strokeWidth={0.5} opacity={0.6} />
    </>
  );
}

// --- Yeast ------------------------------------------------------------------

/**
 * [x, y, rx, ry, rotation]. Every bud overlaps its parent, so the union welds
 * the two into one outline with a neck.
 */
const YEAST_CELLS = {
  budding: [
    [-8, -2, 6, 5.2, 10],
    [-1.5, -6, 3.9, 3.5, 20],
    [2.5, -9.3, 2.8, 2.5, 0], // a chain of three
    [12, 2, 5.5, 5, -15],
    [17, -1.5, 3, 2.7, 0], // a parent with one bud
    [-16, 10, 5, 4.6, 25],
    [2, 12, 5.2, 4.8, -10],
    [6.5, 15.5, 2.9, 2.6, 0],
    [14, 15, 4.8, 4.4, 15],
    [-14, -13, 5, 4.5, -20],
    [-5, 18, 4.4, 4, 30],
  ],
  plain: [
    [-9, -5, 5.4, 4.8, 12],
    [4, -11, 5.6, 5, -18],
    [-16, 6, 5, 4.5, 30],
    [2, 13, 5.3, 4.7, -8],
    [16, 1, 5.2, 4.6, 20],
    [-8, 18, 4.9, 4.4, -25],
    [17, 16, 4.6, 4.2, 8],
    [-18, -14, 4.8, 4.3, 0],
    [10, -20, 4.4, 4, -12],
  ],
} as const;

/** Rings left on the wall where earlier buds pinched off. */
const BUD_SCARS = [
  [-20.5, 10, 40],
  [-13.5, 13.5, 250],
  [-18.5, 6, 150],
  [14.5, 18.5, 60],
] as const;

function YeastCells({ budding }: { budding: boolean }): React.ReactElement {
  const cells = budding ? YEAST_CELLS.budding : YEAST_CELLS.plain;
  const shapes: Shape[] = cells.map(([x, y, rx, ry, rot]) => ({ kind: 'ellipse', cx: x, cy: y, rx, ry, rot }));

  return (
    <>
      <Unioned shapes={shapes} fill={C.ye} stroke={C.yeLine} width={2.2} />
      {cells.map(([x, y, rx, ry, rot], i) => (
        <g key={i}>
          <ellipse
            cx={x}
            cy={y}
            rx={rx * 0.62}
            ry={ry * 0.62}
            transform={`rotate(${rot} ${x} ${y})`}
            fill={C.yeIn}
            opacity={0.7}
          />
          {rx > 3.5 ? (
            <circle cx={f1(x + rx * 0.18)} cy={f1(y + ry * 0.1)} r={f1(Math.min(1.8, rx * 0.3))} fill={C.yeNuc} opacity={0.85} />
          ) : null}
        </g>
      ))}
      {budding
        ? BUD_SCARS.map(([x, y, a], i) => {
            const rad = ((a + 90) * Math.PI) / 180;
            return (
              <path
                key={i}
                d={
                  `M${f1(x - 1.6 * Math.cos(rad))},${f1(y - 1.6 * Math.sin(rad))} ` +
                  `A1.9,1.9 0 0 1 ${f1(x + 1.6 * Math.cos(rad))},${f1(y + 1.6 * Math.sin(rad))}`
                }
                fill="none"
                stroke={C.scar}
                strokeWidth={0.9}
                opacity={0.8}
              />
            );
          })
        : null}
    </>
  );
}

// --- Hydra ------------------------------------------------------------------

/**
 * The bud grows out of the budding zone in the lower third of the column, at
 * 108° so its own long axis points away from the parent.
 */
const BUD_TR = 'translate(21.2,18.3) rotate(108) scale(.55)';

function hydraShapes(withBud: boolean, tentacles: 6 | 4, transform?: string): Shape[] {
  const shapes: Shape[] = [
    // the column and the basal disc
    { kind: 'path', d: 'M-7,-16 C-9,-2 -9,14 -7,25 C-7.5,30 7.5,30 7,25 C9,14 9,-2 7,-16 Z', transform },
    // the hypostome cone
    { kind: 'path', d: 'M-6.5,-14 C-5,-24 -2.5,-29.5 0,-29.5 C2.5,-29.5 5,-24 6.5,-14 Z', transform },
  ];
  const angles = tentacles === 6 ? [196, 222, 250, 290, 318, 344] : [200, 238, 302, 340];
  angles.forEach((a, i) => {
    shapes.push({
      kind: 'path',
      d: taper(
        0,
        -27,
        a,
        tentacles === 6 ? 25 + (i % 3) * 4 : 17 + (i % 2) * 3,
        tentacles === 6 ? 3.2 : 4.4,
        tentacles === 6 ? 1.1 : 1.8,
        i % 2 ? 4 : -4,
      ),
      transform,
    });
  });
  if (withBud) shapes.push(...hydraShapes(false, 4, transform ? `${transform} ${BUD_TR}` : BUD_TR));
  return shapes;
}

function HydraInner({ withBud, transform }: { withBud: boolean; transform?: string }): React.ReactElement {
  return (
    <g transform={transform}>
      <path
        d="M-3.6,-14 C-4.6,-1 -4.6,13 -3.6,22 L3.6,22 C4.6,13 4.6,-1 3.6,-14 Z"
        fill={C.cav}
        opacity={0.85}
      />
      {/* the mouth */}
      <ellipse cx={0} cy={-28.5} rx={2.2} ry={1.5} fill={C.hyLine} opacity={0.9} />
      <path d="M-7,22 C-2,24 2,24 7,22" fill="none" stroke={C.hyLine} strokeWidth={0.9} opacity={0.55} />
      <Dots
        at={[
          [-4.5, -6],
          [4.5, -2],
          [-4, 6],
          [4, 10],
          [-4.5, 15],
          [4.5, 17],
          [0, -12],
        ]}
        r={1.1}
        fill={C.hyIn}
        opacity={0.6}
      />
      {withBud ? <HydraInner withBud={false} transform={BUD_TR} /> : null}
    </g>
  );
}

function Hydra({ withBud }: { withBud: boolean }): React.ReactElement {
  return (
    <>
      <Unioned shapes={hydraShapes(withBud, 6)} fill={C.hy} stroke={C.hyLine} width={2.6} />
      <HydraInner withBud={withBud} />
    </>
  );
}

// --- framing ----------------------------------------------------------------

/** Where each figure sits inside its field, as a transform and as numbers. */
export const FRAME: Readonly<Record<SpecimenId, { x: number; y: number; k: number }>> = {
  'amoeba-fission': { x: 0, y: 0, k: 0.78 },
  'amoeba-plain': { x: 0, y: 0, k: 0.92 },
  'yeast-budding': { x: 0, y: 0, k: 1 },
  'yeast-plain': { x: 0, y: 0, k: 1 },
  'hydra-budding': { x: -10, y: 11, k: 0.62 },
  'hydra-plain': { x: 0, y: 11, k: 0.62 },
};

/** The figure alone, drawn at its own scale around the origin of its group. */
export function SpecimenFigure({ id }: { id: SpecimenId }): React.ReactElement {
  const frame = FRAME[id];
  const inner =
    id === 'amoeba-fission' ? (
      <AmoebaFission />
    ) : id === 'amoeba-plain' ? (
      <AmoebaPlain />
    ) : id === 'yeast-budding' ? (
      <YeastCells budding />
    ) : id === 'yeast-plain' ? (
      <YeastCells budding={false} />
    ) : (
      <Hydra withBud={id === 'hydra-budding'} />
    );
  return <g transform={`translate(${frame.x},${frame.y}) scale(${frame.k})`}>{inner}</g>;
}
