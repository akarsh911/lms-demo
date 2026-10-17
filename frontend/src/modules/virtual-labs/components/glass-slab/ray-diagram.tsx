'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

import { rayDir, type Vec } from '@labs/lib/glass-slab/optics';

import { apparatus, LABEL_FONT } from '../apparatus-palette';

/**
 * One trace, drawn clean.
 *
 * The same three angles as the sheet, away from the pins and the pencil work:
 * the ray bending towards the normal going in, away from it coming out, and
 * the two parallel directions either side. Every number comes from the
 * student's OWN trace, so a badly sighted set of pins draws a badly bent ray
 * here too.
 */
export function RayDiagram({
  ang,
  /** Which side of the normal the ray came from: +1 from the left. */
  side,
  caption,
}: {
  ang: { i: number; r: number; e: number } | null;
  side: number;
  caption?: React.ReactNode;
}): React.ReactElement {
  const theme = useTheme();

  return (
    <Box>
      <Box
        sx={{
          borderRadius: `${theme.band.radius.md}px`,
          backgroundColor: apparatus.bench,
          p: 1,
        }}
      >
        <svg
          viewBox="0 0 240 170"
          role="img"
          aria-label={
            ang
              ? `Your trace: angle of incidence ${ang.i.toFixed(0)} degrees, refraction ${ang.r.toFixed(
                  0,
                )}, emergence ${ang.e.toFixed(0)}`
              : 'No trace yet'
          }
          style={{ display: 'block', width: '100%', height: 'auto' }}
        >
          <rect width={240} height={170} fill="#141a19" />
          {ang ? <Path ang={ang} side={side >= 0 ? 1 : -1} /> : <Waiting />}
        </svg>
      </Box>
      {caption ? (
        <Box sx={{ mt: 0.75, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert }}>{caption}</Box>
      ) : null}
    </Box>
  );
}

function Waiting(): React.ReactElement {
  return (
    <text x={120} y={88} fontSize={9.5} textAnchor="middle" fill="#76837f" fontFamily={LABEL_FONT}>
      Join the points to see your trace
    </text>
  );
}

function Path({ ang, side }: { ang: { i: number; r: number; e: number }; side: number }): React.ReactElement {
  const C: Vec = { x: 100 - side * 18, y: 58 };
  const t = 46;
  const din = rayDir(ang.i, side);
  const dm = rayDir(ang.r, side);
  const dout = rayDir(ang.e, side);
  const C2: Vec = { x: C.x + (dm.x * t) / (dm.y || 1), y: C.y + t };
  const ext = (p: Vec, d: Vec, L: number): Vec => ({ x: p.x + d.x * L, y: p.y + d.y * L });
  const p0 = ext(C, din, -52);
  const p3 = ext(C2, dout, 56);
  const produced = ext(C, din, 62);

  return (
    <>
      <rect x={14} y={C.y} width={212} height={t} fill="rgba(169,219,228,.16)" stroke="rgba(150,215,225,.45)" />
      <line x1={C.x} y1={C.y - 42} x2={C.x} y2={C.y + 26} stroke="#4d7fae" strokeWidth={1} strokeDasharray="4 4" />
      <line x1={C2.x} y1={C2.y - 16} x2={C2.x} y2={C2.y + 44} stroke="#4d7fae" strokeWidth={1} strokeDasharray="4 4" />
      <line
        x1={C.x}
        y1={C.y}
        x2={produced.x}
        y2={produced.y}
        stroke="#cc3311"
        strokeWidth={1}
        strokeDasharray="3 4"
        opacity={0.55}
      />
      <line x1={p0.x} y1={p0.y} x2={C.x} y2={C.y} stroke="#cc3311" strokeWidth={1.8} />
      <line x1={C.x} y1={C.y} x2={C2.x} y2={C2.y} stroke="#cc3311" strokeWidth={1.8} />
      <line x1={C2.x} y1={C2.y} x2={p3.x} y2={p3.y} stroke="#cc3311" strokeWidth={1.8} />
      <Label at={{ x: C.x - side * 30, y: C.y - 26 }}>{`i = ${ang.i.toFixed(0)}°`}</Label>
      <Label at={{ x: C.x + side * 26, y: C.y + 22 }}>{`r = ${ang.r.toFixed(0)}°`}</Label>
      <Label at={{ x: C2.x + side * 34, y: C2.y + 30 }}>{`e = ${ang.e.toFixed(0)}°`}</Label>
    </>
  );
}

function Label({ at, children }: { at: Vec; children: React.ReactNode }): React.ReactElement {
  return (
    <text
      x={at.x}
      y={at.y}
      fontSize={9}
      textAnchor="middle"
      fill="#e8a99b"
      fontFamily={LABEL_FONT}
      fontWeight={600}
    >
      {children}
    </text>
  );
}
