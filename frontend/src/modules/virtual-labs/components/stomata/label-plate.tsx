'use client';

import * as React from 'react';

import { cellPath, fieldPalette, stomaShape } from '@labs/lib/stomata/draw';
import { PINS, type LabelId } from '@labs/lib/stomata/marking';
import { contrast, type MicState, type SlideState } from '@labs/lib/stomata/peel';

import { apparatus, LABEL_FONT } from '../apparatus-palette';

/**
 * The magnified view the student puts labels on: one stoma drawn large, with
 * four lettered pins on features that are really there.
 *
 * Which pin is on which part is shuffled per bench, so a label cannot be
 * learned by position. The drawing is stained the way the slide actually is —
 * an unstained peel is as hard to label here as it is down the eyepiece.
 */
const PLATE = { w: 260, h: 200 } as const;

/** Where each pin points, and where its lettered disc sits clear of everything. */
const LAB: Readonly<Record<LabelId, { pin: [number, number]; tag: [number, number] }>> = {
  guard: { pin: [104, 72], tag: [92, 20] },
  pore: { pin: [130, 100], tag: [130, 176] },
  chl: { pin: [148, 72], tag: [190, 22] },
  epi: { pin: [40, 44], tag: [13, 100] },
  wall: { pin: [130, 42], tag: [212, 92] },
};

/** Four ordinary epidermal cells round the stoma: x, y, r, rotation. */
const RING: readonly [number, number, number, number][] = [
  [40, 44, 29, 0.4],
  [220, 46, 27, 1.2],
  [42, 156, 28, 2.1],
  [220, 152, 26, 2.7],
];

export function LabelPlate({
  slide,
  mic,
  labelMap,
}: {
  slide: SlideState;
  mic: MicState;
  labelMap: Record<string, LabelId>;
}): React.ReactElement {
  const C = fieldPalette(slide.peel ? slide.stain : 2, slide.peel ? contrast({ slide, mic }) : 0.92);
  const stoma = stomaShape(116);

  return (
    <svg
      viewBox={`0 0 ${PLATE.w} ${PLATE.h}`}
      role="img"
      aria-label="A stoma magnified, with four lettered pins on parts of it"
      style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 10, background: '#f7f3ec' }}
    >
      {RING.map(([x, y, r, rot], i) => (
        <g key={i}>
          <path d={cellPath(x, y, r, rot, i * 7 + 3)} fill={C.fill} stroke={C.wall} strokeWidth={2.4} strokeOpacity={C.op} />
          {C.nuc ? <ellipse cx={x + 7} cy={y - 5} rx={8} ry={6} fill={C.nuc} opacity={0.45} /> : null}
        </g>
      ))}

      <g transform="translate(130 100)">
        {stoma.guards.map((d, i) => (
          <path key={i} d={d} fill={C.guard} stroke={C.gwall} strokeWidth={stoma.strokeWidth} strokeOpacity={C.op} />
        ))}
        <path d={stoma.pore} fill={C.pore} fillOpacity={0.35 + C.op * 0.6} />
        {stoma.chloroplasts.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={c.r} fill={C.chl} opacity={0.85} />
        ))}
      </g>

      {PINS.map((p) => {
        const f = LAB[labelMap[p] ?? 'pore'] ?? LAB.pore;
        return (
          <g key={p}>
            <line x1={f.pin[0]} y1={f.pin[1]} x2={f.tag[0]} y2={f.tag[1]} stroke={apparatus.hintRing} strokeWidth={1.6} />
            <circle cx={f.pin[0]} cy={f.pin[1]} r={4.5} fill={apparatus.hintRing} stroke="#fff" strokeWidth={1.6} />
            <circle cx={f.tag[0]} cy={f.tag[1]} r={12} fill={apparatus.hintRing} stroke="#fff" strokeWidth={1.6} />
            <text x={f.tag[0]} y={f.tag[1] + 4.5} fontSize={13} textAnchor="middle" fill="#0d1211" fontFamily={LABEL_FONT} fontWeight={700}>
              {p}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
