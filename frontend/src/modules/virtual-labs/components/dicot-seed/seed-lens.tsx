'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { keyframes, useTheme } from '@mui/material/styles';

import { PART_NAME, type LabelId } from '@labs/lib/dicot-seed/marking';
import {
  HALF_GAP,
  geom,
  isOpen,
  partAnchor,
  type PartId,
  type Point,
  type Seed,
  type SeedView,
} from '@labs/lib/dicot-seed/seed-model';

import { apparatus, LABEL_FONT } from '../apparatus-palette';

import { SeedFigure } from './seed-figure';

/**
 * The dissecting lens, docked beside the input it is read into.
 *
 * On the bench the seed is drawn 120px across, which puts the whole embryo axis
 * — radicle, axis, plumule, the three things this practical is about — inside
 * 30px. At that size "the pointed one" and "the feathery one" are the same
 * three pixels, and a student labels by guessing which end is which.
 *
 * Docking a magnified view here fixes that, and it is also where the marked
 * gesture happens: a pin is judged against `partAt`, which knows where every
 * part actually is on THIS seed at its own size and swelling. So the drawing a
 * student aims at and the model that marks them are the same thing.
 *
 * The same panel does three jobs across the practical: it is the hand lens at
 * the outside step (tap the scar, tap the pore), the pinboard at the labelling
 * step, and the pointer at the table step, ringing the part whose row is being
 * filled in.
 */

export const LENS_W = 320;
export const LENS_H = 178;

const FIG_W = 296;
const FIG_H = 132;
/** Where the figure's centre sits in lens coordinates. */
const CY = 74;

const ring = keyframes`50% { opacity: .3; stroke-width: 5px; }`;

export interface LensPin {
  id: LabelId;
  /** In the figure's own local units. */
  at: Point;
  /** null while unmarked. */
  ok: boolean | null;
  /** What was really under the pin, once marked. */
  got: PartId | null;
}

/** Figure units -> lens units, for whatever the figure currently is. */
export function lensTransform(seed: Seed, view: SeedView): { k: number; cx: number; cy: number } {
  const { a, b } = geom(seed);
  const open = isOpen(seed, view);
  const span = open ? (HALF_GAP + 2) * a : 2 * a;
  const k = Math.min(2.2, FIG_W / span, FIG_H / (2 * b));
  return { k, cx: LENS_W / 2 + (open ? (HALF_GAP / 2) * a * k : 0), cy: CY };
}

export function SeedLens({
  seed,
  view,
  showMicropyle,
  pins,
  highlight,
  caption,
  maxWidth,
  onTap,
  tourTag,
}: {
  seed: Seed;
  view: SeedView;
  showMicropyle: boolean;
  pins: readonly LensPin[];
  /** A part to ring, while its row of the observation table is being filled in. */
  highlight: PartId | null;
  caption: React.ReactNode;
  maxWidth?: number;
  /** A point in the FIGURE's own units — the same units the marking works in. */
  onTap: (p: Point) => void;
  tourTag?: string;
}): React.ReactElement {
  const theme = useTheme();
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  /** The keyboard crosshair, in lens units. */
  const [cur, setCur] = React.useState<{ X: number; Y: number } | null>(null);

  const { k, cx, cy } = lensTransform(seed, view);
  const toLens = (p: Point): { X: number; Y: number } => ({ X: cx + p.x * k, Y: cy + p.y * k });
  const toFigure = (X: number, Y: number): Point => ({ x: (X - cx) / k, y: (Y - cy) / k });

  /** Where in the lens a pointer event landed. The drawing never letterboxes. */
  const lensPoint = (e: React.MouseEvent<SVGSVGElement>): { X: number; Y: number } | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const s = rect.width / LENS_W;
    return { X: (e.clientX - rect.left) / s, Y: (e.clientY - rect.top) / s };
  };

  const onClick = (e: React.MouseEvent<SVGSVGElement>): void => {
    const P = lensPoint(e);
    if (!P) return;
    setCur(P);
    onTap(toFigure(P.X, P.Y));
  };

  // Arrow keys move a crosshair, Enter places it: the whole marked gesture has
  // to be reachable without a pointer.
  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>): void => {
    const nudge: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const d = nudge[e.key];
    if (d) {
      e.preventDefault();
      const stepPx = e.shiftKey ? 2 : 7;
      const from = cur ?? { X: cx, Y: cy };
      setCur({ X: from.X + d[0] * stepPx, Y: from.Y + d[1] * stepPx });
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const P = cur ?? { X: cx, Y: cy };
      onTap(toFigure(P.X, P.Y));
    }
  };

  const anchor = highlight ? partAnchor(seed, highlight, view) : null;
  const marker = anchor ? toLens(anchor) : null;
  const placed = layOutPins(pins, { cx, cy, k, open: isOpen(seed, view), seed });

  return (
    <Box data-tour={tourTag} sx={{ maxWidth, mx: 'auto', width: '100%' }}>
      <Box
        sx={{
          borderRadius: `${theme.band.radius.md}px`,
          backgroundColor: apparatus.bench,
          p: 0.75,
          '& svg': { display: 'block', width: '100%', height: 'auto', touchAction: 'manipulation' },
          '& svg:focus-visible': { outline: `2px solid ${apparatus.hintRing}`, outlineOffset: 2 },
          '@media (prefers-reduced-motion: reduce)': { '& *': { animation: 'none !important' } },
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${LENS_W} ${LENS_H}`}
          role="button"
          tabIndex={0}
          aria-label="Magnified view of the seed. Tap a part, or move the crosshair with the arrow keys and press Enter."
          onClick={onClick}
          onKeyDown={onKeyDown}
        >
          <rect x={4} y={4} width={LENS_W - 8} height={LENS_H - 8} rx={9} fill="#efece2" />
          <g transform={`translate(${round(cx)},${round(cy)}) scale(${round(k)})`}>
            <SeedFigure seed={seed} view={view} uid={`lens-${view}`} showMicropyle={showMicropyle} />
          </g>

          {marker ? (
            <>
              <Box
                component="circle"
                cx={round(marker.X)}
                cy={round(marker.Y)}
                r={12}
                fill="none"
                stroke={theme.brand.orange}
                strokeWidth={2.5}
                sx={{ animation: `${ring} 1.4s ease-in-out infinite` }}
              />
              <circle cx={round(marker.X)} cy={round(marker.Y)} r={2.5} fill={theme.brand.orange} />
            </>
          ) : null}

          {placed.map((p) => (
            <Pin key={p.id} pin={p} />
          ))}

          {cur ? (
            <g aria-hidden="true">
              <circle cx={round(cur.X)} cy={round(cur.Y)} r={7} fill="none" stroke="#1573c4" strokeWidth={1.4} />
              <line x1={round(cur.X - 11)} y1={round(cur.Y)} x2={round(cur.X + 11)} y2={round(cur.Y)} stroke="#1573c4" strokeWidth={1.4} />
              <line x1={round(cur.X)} y1={round(cur.Y - 11)} x2={round(cur.X)} y2={round(cur.Y + 11)} stroke="#1573c4" strokeWidth={1.4} />
            </g>
          ) : null}
        </svg>
      </Box>
      <Typography sx={{ mt: 0.5, fontSize: theme.band.type.min + 0.5, color: theme.brand.sub, textWrap: 'pretty' }}>
        {caption}
      </Typography>
    </Box>
  );
}

const round = (v: number): number => Math.round(v * 100) / 100;

interface PlacedPin extends LensPin {
  /** The point itself, in lens units. */
  X: number;
  Y: number;
  /** Where the flag sits. */
  fx: number;
  fy: number;
  w: number;
}

/**
 * The flags, pushed clear of the drawing and of each other.
 *
 * A pin is drawn where it was dropped, but its FLAG is pushed outward along the
 * line from the middle of the half it sits on, so six of them round one small
 * seed stay legible. On the split figure that centre is the half the pin is in,
 * not the middle of the pair, or every flag on the left cotyledon would point
 * across the gap.
 */
function layOutPins(
  pins: readonly LensPin[],
  { cx, cy, k, open, seed }: { cx: number; cy: number; k: number; open: boolean; seed: Seed },
): PlacedPin[] {
  const { a } = geom(seed);
  const out: PlacedPin[] = [];

  for (const pin of pins) {
    const X = cx + pin.at.x * k;
    const Y = cy + pin.at.y * k;
    const originX = open && pin.at.x < -a ? cx - HALF_GAP * a * k : cx;
    let vx = X - originX;
    let vy = Y - cy;
    const m = Math.hypot(vx, vy) || 1;
    vx /= m;
    vy /= m;
    const w = pin.id.length * 5.4 + 12;

    let fx = X + vx * 34;
    let fy = Y + vy * 34;
    let tries = 0;
    while (
      tries < 12 &&
      out.some((q) => Math.abs(q.fx - fx) < (q.w + w) / 2 + 3 && Math.abs(q.fy - fy) < 17)
    ) {
      fy += vy >= 0 ? 16 : -16;
      tries += 1;
    }
    fx = Math.max(w / 2 + 6, Math.min(LENS_W - w / 2 - 6, fx));
    fy = Math.max(14, Math.min(LENS_H - 10, fy));
    out.push({ ...pin, X, Y, fx, fy, w });
  }
  return out;
}

function Pin({ pin }: { pin: PlacedPin }): React.ReactElement {
  const tone =
    pin.ok === null
      ? { bg: '#ffffff', st: '#8a8f8d', tx: '#1d1d1b' }
      : pin.ok
        ? { bg: '#dff3e4', st: '#2f8f52', tx: '#1c5c34' }
        : { bg: '#fbe1e2', st: '#c04b50', tx: '#8c2b2f' };

  return (
    <g>
      <line x1={round(pin.X)} y1={round(pin.Y)} x2={round(pin.fx)} y2={round(pin.fy)} stroke="#6b6658" strokeWidth={1} />
      <circle cx={round(pin.X)} cy={round(pin.Y)} r={3} fill={tone.st} stroke="#fff" strokeWidth={1.2} />
      <rect
        x={round(pin.fx - pin.w / 2)}
        y={round(pin.fy - 8)}
        width={round(pin.w)}
        height={16}
        rx={6}
        fill={tone.bg}
        stroke={tone.st}
      />
      <text
        x={round(pin.fx)}
        y={round(pin.fy + 4)}
        fontSize={10}
        textAnchor="middle"
        fill={tone.tx}
        fontFamily={LABEL_FONT}
        fontWeight={600}
      >
        {pin.id}
      </text>
      {pin.ok === false ? (
        <text
          x={round(pin.fx)}
          y={round(pin.fy + 16)}
          fontSize={8}
          textAnchor="middle"
          fill="#8c2b2f"
          fontFamily={LABEL_FONT}
        >
          that is the {pin.got ? PART_NAME[pin.got] : 'tile'}
        </text>
      ) : null}
    </g>
  );
}
