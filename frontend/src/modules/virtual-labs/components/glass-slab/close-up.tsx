'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { mm, sightOff, type SlabSpec, type Vec } from '@labs/lib/glass-slab/optics';
import type { Trial } from '@labs/lib/glass-slab/state';

import { apparatus, LABEL_FONT } from '../apparatus-palette';

/**
 * The two things that are too small to read on the drawing, magnified and
 * docked beside the box they are read into.
 *
 * This bench's version of "read a needle against fifty divisions" is reading a
 * protractor: at the size the sheet is drawn, one degree of its scale is under
 * a pixel, so a student could only ever click roughly and the marking would be
 * measuring the drawing's resolution rather than their care. Magnified, one
 * degree is 7px, the sight line turns a degree at a time, and the reading is
 * genuinely theirs — which is what the ±2° tolerance was written for.
 *
 * The sighting view is the same idea for the other half of the practical: what
 * your eye judges when you line the last two pins up with the images of the
 * first two, at 1 mm = 9 px.
 */

/** Pixels per degree in the magnified scale. */
const PX_PER_DEG = 7;
/** Degrees of scale either side of the sight line. */
const SPAN = 13;

export function ProtractorReader({
  reading,
  /** Where the ray actually crosses the scale, if there is a ray to align to. */
  rayReading,
  label,
  maxWidth = 320,
}: {
  reading: number | null;
  rayReading: number | null;
  /** What this reading is about to be written down as. */
  label: string;
  maxWidth?: number;
}): React.ReactElement {
  const theme = useTheme();
  const aim = reading ?? 90;
  const xOf = (deg: number): number => 100 + (deg - aim) * PX_PER_DEG;

  const ticks: React.ReactElement[] = [];
  for (let th = Math.ceil(aim - SPAN); th <= aim + SPAN; th += 1) {
    if (th < 0 || th > 180) continue;
    const long = th % 10 === 0;
    const med = th % 5 === 0;
    const x = xOf(th);
    ticks.push(
      <line
        key={`t${th}`}
        x1={x}
        y1={64}
        x2={x}
        y2={long ? 34 : med ? 44 : 52}
        stroke="#31454f"
        strokeWidth={long ? 1.4 : 0.9}
        opacity={long ? 1 : 0.8}
      />,
    );
    if (med) {
      ticks.push(
        <text
          key={`n${th}`}
          x={x}
          y={26}
          fontSize={long ? 11 : 9}
          textAnchor="middle"
          fill={long ? '#22333c' : '#6d8290'}
          fontFamily={LABEL_FONT}
          fontWeight={long ? 700 : 500}
        >
          {th}
        </text>,
      );
    }
  }

  const rayX = rayReading === null ? null : xOf(rayReading);
  const rayOnScreen = rayX !== null && rayX > 6 && rayX < 194;

  return (
    <Box data-tour="gs-protractor">
      <Box
        sx={{
          borderRadius: `${theme.band.radius.md}px`,
          backgroundColor: apparatus.bench,
          p: 1,
          maxWidth,
          mx: 'auto',
        }}
      >
        <svg
          viewBox="0 0 200 118"
          role="img"
          aria-label={`Protractor close-up. The sight line reads ${aim} degrees.`}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        >
          {/* The scale, as a strip of the protractor's edge seen close up */}
          <path d="M0 64 Q100 52 200 64 L200 96 L0 96 Z" fill="#ffffff" fillOpacity={0.5} />
          <path d="M0 64 Q100 52 200 64" fill="none" stroke="#4a5f6c" strokeWidth={1.4} />
          {ticks}

          {/* Where the ray crosses, if there is one drawn on the paper yet */}
          {rayOnScreen ? (
            <>
              <line x1={rayX} y1={18} x2={rayX} y2={96} stroke="#cc3311" strokeWidth={2} opacity={0.9} />
              <text
                x={rayX}
                y={110}
                fontSize={9}
                textAnchor="middle"
                fill="#e8a99b"
                fontFamily={LABEL_FONT}
                fontWeight={700}
              >
                the ray
              </text>
            </>
          ) : null}
          {rayX !== null && !rayOnScreen ? (
            <text
              x={rayX <= 6 ? 30 : 170}
              y={110}
              fontSize={9}
              textAnchor="middle"
              fill="#e8a99b"
              fontFamily={LABEL_FONT}
              fontWeight={700}
            >
              {rayX <= 6 ? '← the ray is this way' : 'the ray is this way →'}
            </text>
          ) : null}

          {/* The sight line: what the arrow keys move */}
          <line x1={100} y1={14} x2={100} y2={100} stroke="#0a84ff" strokeWidth={1.8} />
          <rect x={70} y={0} width={60} height={17} rx={5} fill="#0a3d6b" />
          <text
            x={100}
            y={12}
            fontSize={10}
            textAnchor="middle"
            fill="#dff0ff"
            fontFamily={LABEL_FONT}
            fontWeight={700}
          >
            {`${aim}°`}
          </text>
        </svg>
      </Box>

      <Typography
        sx={{ mt: 0.75, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert, textAlign: 'center' }}
      >
        {label}
      </Typography>
    </Box>
  );
}

const VIEW_W = 240;
const VIEW_H = 170;
/** Millimetres, magnified, in the sighting window. */
const MM_PX = 9;

/**
 * Looking through the slab from the far side.
 *
 * P₁ and P₂ are seen through the glass along the emergent ray, so they sit on
 * the line of sight; a pin put anywhere else is off it by exactly the distance
 * drawn here. Nothing is corrected for the student: this only magnifies what
 * their eye would be doing.
 */
export function SightingView({
  trial,
  slab,
  /** The crosshair, drawn as a ghost pin while it is being hunted into line. */
  aiming,
  maxWidth = 320,
}: {
  trial: Trial;
  slab: SlabSpec;
  aiming: Vec | null;
  maxWidth?: number;
}): React.ReactElement {
  const theme = useTheme();
  const offMm = (p: Vec): number | null => {
    const off = sightOff(trial, slab, p);
    return off === null ? null : off / mm(1);
  };
  const heads: { y: number; label: string; off: number; colour: string; ghost?: boolean }[] = [];
  const ready = trial.pins.length >= 2;

  if (ready) {
    heads.push({ y: 22, label: 'P₁ image', off: 0, colour: '#d93f45' });
    heads.push({ y: 46, label: 'P₂ image', off: 0, colour: '#d93f45' });
    [2, 3].forEach((k) => {
      const p = trial.pins[k];
      const off = p ? offMm(p) : null;
      if (off !== null) heads.push({ y: k === 2 ? 106 : 134, label: `P${'₁₂₃₄'[k] ?? ''}`, off, colour: '#1f6feb' });
    });
    if (aiming && trial.pins.length < 4) {
      const off = offMm(aiming);
      if (off !== null) {
        heads.push({
          y: trial.pins.length === 2 ? 106 : 134,
          label: 'pin',
          off,
          colour: '#c97a00',
          ghost: true,
        });
      }
    }
  }

  return (
    <Box data-tour="gs-sighting">
      <Box
        sx={{
          borderRadius: `${theme.band.radius.md}px`,
          backgroundColor: apparatus.bench,
          p: 0.75,
          maxWidth,
          mx: 'auto',
        }}
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label="What you see looking through the glass slab from the far side"
          style={{ display: 'block', width: '100%', height: 'auto' }}
        >
          <rect width={VIEW_W} height={VIEW_H} fill="#141a19" />
          <rect x={14} y={62} width={212} height={28} fill="rgba(169,219,228,.18)" />
          <line x1={120} y1={10} x2={120} y2={160} stroke="#2f6b4a" strokeWidth={1} strokeDasharray="4 4" />
          <text x={120} y={79} fontSize={8.5} textAnchor="middle" fill="#8fb9c2" fontFamily={LABEL_FONT}>
            glass slab
          </text>
          {heads.map((h, k) => {
            const x = Math.max(16, Math.min(224, 120 + h.off * MM_PX));
            return (
              <g key={k}>
                <circle
                  cx={x}
                  cy={h.y}
                  r={h.ghost ? 4 : 5}
                  fill={h.colour}
                  opacity={h.ghost ? 0.6 : 1}
                  stroke="#0e1312"
                  strokeWidth={1}
                />
                <text x={x + 9} y={h.y + 3.5} fontSize={8.5} fill="#9fb0ac" fontFamily={LABEL_FONT}>
                  {h.label}
                </text>
              </g>
            );
          })}
          {!heads.length ? (
            <text x={120} y={118} fontSize={9.5} textAnchor="middle" fill="#76837f" fontFamily={LABEL_FONT}>
              Stick P₁ and P₂ in first
            </text>
          ) : null}
          <text x={120} y={166} fontSize={8} textAnchor="middle" fill="#63706c" fontFamily={LABEL_FONT}>
            looking through the slab from the far side · 1 mm = {MM_PX} px
          </text>
        </svg>
      </Box>
    </Box>
  );
}
