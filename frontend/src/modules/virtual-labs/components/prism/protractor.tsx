'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { DEG, V, vcross, vrot, type Vec } from '@labs/lib/prism/optics';
import type { MeasureGeometry } from '@labs/lib/prism/state';

import { apparatus, LABEL_FONT } from '../apparatus-palette';

/**
 * The protractor, and the magnified copy of it docked beside the box the
 * reading is typed into.
 *
 * Reading a protractor on a drawing of a whole sheet of paper is this bench's
 * version of "read a needle against fifty divisions": laid on the board the
 * scale is about 2 px per degree, so the difference between 49° and 51° — the
 * difference between full marks and none — is four pixels. The close-up draws
 * the same instrument at three times the size, with the baseline and the ray it
 * is being read against, and the pointer is dragged (or nudged with the arrow
 * keys) until it lies along the ray.
 *
 * It is not a hint: the angle between the baseline and the ray here IS the
 * angle on the student's own trace, the one the reading will be marked against.
 */

/** The direction `deg` on the scale points in, from the baseline. */
export function protractorDir(ref0: Vec, target: Vec, deg: number): Vec {
  const side = Math.sign(vcross(ref0, target)) || 1;
  return vrot(ref0, (side * deg) / DEG);
}

/**
 * The instrument itself, drawn in whatever coordinates its parent uses: a
 * half-disc from the baseline, a degree mark for every degree, numbers every
 * ten, and the pointer at the provisional reading.
 */
export function ProtractorFace({
  c,
  ref0,
  target,
  radius,
  value,
  labelEvery = 10,
  faint = false,
}: {
  c: Vec;
  ref0: Vec;
  target: Vec;
  radius: number;
  value: number;
  labelEvery?: number;
  /** Drawn a little back, for the copy that is not being read. */
  faint?: boolean;
}): React.ReactElement {
  const R = radius;
  const dirAt = (a: number): Vec => protractorDir(ref0, target, a);
  const rim: string[] = [];
  for (let a = 0; a <= 180; a += 2) {
    const d = dirAt(a);
    rim.push(`${(c.x + d.x * R).toFixed(1)},${(c.y + d.y * R).toFixed(1)}`);
  }
  const e0 = dirAt(0);
  const e1 = dirAt(180);
  const ticks: React.ReactElement[] = [];
  for (let a = 0; a <= 180; a += 1) {
    const d = dirAt(a);
    const big = a % labelEvery === 0;
    const mid = a % 5 === 0;
    const L = big ? R * 0.115 : mid ? R * 0.073 : R * 0.04;
    ticks.push(
      <line
        key={`t${a}`}
        x1={c.x + d.x * R}
        y1={c.y + d.y * R}
        x2={c.x + d.x * (R - L)}
        y2={c.y + d.y * (R - L)}
        stroke="#33404c"
        strokeWidth={big ? 1.3 : 0.7}
      />,
    );
    if (big) {
      ticks.push(
        <text
          key={`n${a}`}
          x={c.x + d.x * (R - R * 0.21)}
          y={c.y + d.y * (R - R * 0.21) + 4}
          fontSize={Math.max(9.5, R * 0.093)}
          textAnchor="middle"
          fill="#1b2730"
          fontFamily={LABEL_FONT}
          fontWeight={700}
        >
          {a}
        </text>,
      );
    }
  }

  const pd = dirAt(value);
  const px = c.x + pd.x * (R + R * 0.13);
  const py = c.y + pd.y * (R + R * 0.13);

  return (
    <g opacity={faint ? 0.75 : 1}>
      <path
        d={`M${(c.x + e0.x * R).toFixed(1)} ${(c.y + e0.y * R).toFixed(1)} L${rim.join(' L')} L${(
          c.x + e1.x * R
        ).toFixed(1)} ${(c.y + e1.y * R).toFixed(1)} Z`}
        fill="rgba(248,251,253,.9)"
        stroke="#3d4a56"
        strokeWidth={1.4}
      />
      {ticks}
      <line
        x1={c.x + e0.x * R}
        y1={c.y + e0.y * R}
        x2={c.x + e1.x * R}
        y2={c.y + e1.y * R}
        stroke="#33404c"
        strokeWidth={1.3}
      />
      <circle cx={c.x} cy={c.y} r={R * 0.032} fill="none" stroke="#33404c" strokeWidth={1.3} />
      <circle cx={c.x} cy={c.y} r={1.4} fill="#33404c" />
      <line x1={c.x} y1={c.y} x2={px} y2={py} stroke="#1668b8" strokeWidth={1.8} />
      <circle cx={px} cy={py} r={R * 0.081} fill="#1668b8" />
      <text
        x={px}
        y={py + 3.5}
        fontSize={Math.max(9, R * 0.081)}
        textAnchor="middle"
        fill="#fff"
        fontFamily={LABEL_FONT}
        fontWeight={700}
      >
        {value}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// The close-up, docked beside the reading
// ---------------------------------------------------------------------------

const W = 360;
const H = 214;
const C: Vec = { x: 180, y: 188 };
const R = 152;
/** The baseline runs to the right; the scale sweeps up from it. */
const REF: Vec = { x: 1, y: 0 };

export function ProtractorReader({
  geom,
  value,
  onChange,
  onCommit,
  maxWidth,
}: {
  geom: MeasureGeometry;
  value: number;
  onChange: (deg: number) => void;
  onCommit: () => void;
  maxWidth: number;
}): React.ReactElement {
  const theme = useTheme();
  const svg = React.useRef<SVGSVGElement | null>(null);
  const dragging = React.useRef(false);

  // Drawn in the close-up's own frame, at the angle the student's trace really
  // makes: what is magnified is the instrument, never the answer.
  const target = vrot(REF, -geom.truth / DEG);
  const rayEnd = { x: C.x + target.x * (R + 20), y: C.y + target.y * (R + 20) };

  const toAngle = (e: { clientX: number; clientY: number }): number | null => {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const v = V(p.x - C.x, p.y - C.y);
    if (Math.hypot(v.x, v.y) < 16) return null;
    const side = Math.sign(vcross(REF, target)) || 1;
    const a = Math.atan2(side * (REF.x * v.y - REF.y * v.x), REF.x * v.x + REF.y * v.y) * DEG;
    return Math.max(0, Math.min(180, Math.round(a)));
  };

  const point = (e: React.PointerEvent<SVGSVGElement>): void => {
    const a = toAngle(e);
    if (a !== null) onChange(a);
  };

  return (
    <Box data-tour="prism-reader" sx={{ maxWidth, mx: 'auto' }}>
      <Box sx={{ borderRadius: `${theme.band.radius.md}px`, backgroundColor: apparatus.bench, p: 0.75 }}>
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          role="slider"
          tabIndex={0}
          aria-label={`Protractor close-up, measuring ${geom.what} on ray ${geom.k + 1}. Drag the pointer to where the ${geom.rayName} crosses the scale, or use the arrow keys.`}
          aria-valuemin={0}
          aria-valuemax={180}
          aria-valuenow={value}
          aria-valuetext={`${value} degrees`}
          style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'none', cursor: 'pointer' }}
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            point(e);
          }}
          onPointerMove={(e) => {
            if (dragging.current) point(e);
          }}
          onPointerUp={(e) => {
            dragging.current = false;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault();
              onChange(value - (e.shiftKey ? 5 : 1));
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault();
              onChange(value + (e.shiftKey ? 5 : 1));
            } else if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onCommit();
            }
          }}
        >
          <rect width={W} height={H} rx={4} fill="#f4f1e8" />

          {/* The baseline the instrument is lined up with, and the ray being read */}
          <line x1={C.x - R - 14} y1={C.y} x2={C.x + R + 14} y2={C.y} stroke="#1668b8" strokeWidth={1.4} strokeDasharray="5 4" />
          <line x1={C.x} y1={C.y} x2={rayEnd.x} y2={rayEnd.y} stroke="#22282f" strokeWidth={2.1} strokeLinecap="round" />

          <ProtractorFace c={C} ref0={REF} target={target} radius={R} value={value} labelEvery={10} />

          <text x={C.x + R + 12} y={C.y + 15} fontSize={10} textAnchor="end" fill="#1668b8" fontFamily={LABEL_FONT} fontWeight={700}>
            {geom.baseline}
          </text>
          <text
            x={rayEnd.x}
            y={rayEnd.y - 8}
            fontSize={10}
            textAnchor={rayEnd.x > C.x ? 'end' : 'start'}
            fill="#22282f"
            fontFamily={LABEL_FONT}
            fontWeight={700}
          >
            {geom.rayName}
          </text>
          <text x={C.x} y={C.y + 18} fontSize={10} textAnchor="middle" fill="#6b6658" fontFamily={LABEL_FONT} fontWeight={600}>
            {geom.which === 'D' ? 'vertex' : geom.which === 'i' ? 'P' : 'M'}
          </text>
        </svg>
      </Box>
      <Typography sx={{ mt: 0.75, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert, textAlign: 'center' }}>
        Centred on {geom.at} · one small division is 1°
      </Typography>
    </Box>
  );
}
