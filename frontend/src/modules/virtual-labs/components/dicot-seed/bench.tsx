'use client';

import * as React from 'react';
import Box from '@mui/material/Box';

import {
  HALF_GAP,
  SPECIES,
  geom,
  germState,
  isOpen,
  newSeed,
  swellFrac,
  swellScale,
  swollenPercent,
  type Germinating,
  type Point,
  type Seed,
  type SpeciesId,
} from '@labs/lib/dicot-seed/seed-model';
import type { Held, ToolId } from '@labs/lib/dicot-seed/state';

import { apparatus, LABEL_FONT } from '../apparatus-palette';
import {
  MENISCUS_CLASS,
  TRACK_CLASS,
  benchMotionSx,
  motionSx,
  pulseAnimation,
  useBenchMotion,
} from '../bench-motion';

import { SeedFigure } from './seed-figure';

/**
 * The biology bench: three dishes of dry seeds, a beaker of water, a dish of
 * wet cotton, the lab clock, the dissecting tools and a white tile.
 *
 * One gesture does everything, as at a real bench: pick something up, then tap
 * the thing it acts on. A dish gives you a dry seed, the beaker soaks it, the
 * tile is where it is worked on, and a tool in hand acts on whatever is on the
 * tile. With free hands a tap on the seed is a look through the lens.
 *
 * Every seed drawn here — in a dish, in the beaker, on the cotton, on the tile —
 * comes out of the same `SeedFigure`, so nothing on the bench can disagree with
 * the model the labelling is marked against.
 */

export const BENCH_WIDTH = 1000;
export const BENCH_HEIGHT = 600;

const DISH_Y = 126;
const DISH_R = 46;
const DISH_X = [92, 198, 304] as const;

const BEAKER = { x0: 366, x1: 460, top: 48, bottom: 180, surface: 80 };
const GERM = { cx: 562, cy: 126, r: 52 };
const CLOCK = { cx: 878, cy: 124, r: 58 };
const TILE = { x: 312, y: 224, w: 672, h: 356 };

export const TOOLS: readonly { id: ToolId; name: string; hint: string; y: number }[] = [
  { id: 'forceps', name: 'forceps', hint: 'lift the softened testa off', y: 262 },
  { id: 'needle', name: 'needle', hint: 'part it along the natural plane', y: 366 },
  { id: 'blade', name: 'blade', hint: 'cuts, but straight across the seed', y: 470 },
];

/** Regions a tour can spotlight, in bench coordinates. */
export const REGION = {
  dishes: [36, 62, 322, 150],
  beaker: [350, 36, 126, 200],
  germ: [496, 62, 132, 132],
  clock: [806, 52, 146, 150],
  tools: [26, 250, 274, 312],
  tile: [306, 218, 684, 366],
} as const;


const n2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * THE SCALE THE SOAKING SEED IS DRAWN AT IN THE BEAKER, and why it is a
 * constant per species rather than a fit.
 *
 * Fitting the drawing to the beaker each render — which is what this used to be
 * — divides out the one thing the step is about. A seed that always fills 34
 * units is a seed that never visibly swells, and the whole of the soak step is
 * waiting for it to. So the scale is chosen once, from the size the seed will
 * reach when it is FULLY swollen, and the figure then grows from a little over
 * half that to all of it as the water goes in. The number the caption reads and
 * the size of the drawing are the same `swellScale`.
 */
function beakerScale(sd: Seed): number {
  const sp = SPECIES[sd.sp];
  return Math.min(0.62, 34 / (sp.W * (1 + sp.maxSwell)));
}

/** Where the working seed is drawn on the tile, and at what scale. */
export function tileTransform(sd: Seed): { k: number; cx: number; cy: number } {
  const { a, b } = geom(sd);
  const open = isOpen(sd, 'live');
  const k = Math.min(1.9, 560 / (open ? (HALF_GAP + 2) * a : 2 * a), 250 / (2 * b));
  return { k, cx: 648 + (open ? (HALF_GAP / 2) * a * k : 0), cy: 396 };
}

function BenchLabel({
  x,
  y,
  text,
  small = false,
}: {
  x: number;
  y: number;
  text: string;
  small?: boolean;
}): React.ReactElement {
  return (
    <text
      x={x}
      y={y}
      fontSize={small ? 8.5 : 11}
      textAnchor="middle"
      fill={small ? apparatus.benchInkMuted : apparatus.benchInk}
      fontFamily={LABEL_FONT}
      fontWeight={small ? 400 : 600}
    >
      {text}
    </text>
  );
}

const TOOL_ART: Record<ToolId, React.ReactElement> = {
  forceps: (
    <>
      <path d="M-16 -22 C-7 -6 -3 6 -1 22 C-3 6 -7 -6 -16 -22 Z" fill="#c9d2d6" stroke="#8b979c" />
      <path d="M16 -22 C7 -6 3 6 1 22 C3 6 7 -6 16 -22 Z" fill="#c9d2d6" stroke="#8b979c" />
      <path d="M-16 -22 Q0 -30 16 -22" fill="none" stroke="#8b979c" strokeWidth={2} />
    </>
  ),
  needle: (
    <>
      <rect x={-3} y={-24} width={6} height={26} rx={2} fill="#6b5433" stroke="#4a3a22" />
      <path d="M0 2 L2.2 18 L0 24 L-2.2 18 Z" fill="#dfe6ea" stroke="#8b979c" />
    </>
  ),
  blade: (
    <>
      <rect x={-4} y={-24} width={8} height={28} rx={2} fill="#2f3a40" stroke="#1b2226" />
      <path d="M-4 4 L8 10 L4 22 L-4 22 Z" fill="#dfe6ea" stroke="#8b979c" />
    </>
  ),
};

export interface DicotBenchProps {
  /** The three dishes, left to right. */
  dishes: readonly SpeciesId[];
  specimen: Seed | null;
  germ: Germinating | null;
  clock: number;
  held: Held | null;
  /** The micropyle is only drawn once it has been found. */
  foundMicropyle: boolean;
  /** Parts a tour is pointing at: `dish:gram`, `tool:needle`, `well:beaker`. */
  pulse: readonly string[];
  onSvg: (el: SVGSVGElement | null) => void;
  onTakeSeed: (sp: SpeciesId) => void;
  onTapBeaker: () => void;
  onTapGerm: () => void;
  onTapTile: () => void;
  onHold: (held: Held | null) => void;
  /** A point on the seed, in the FIGURE's own units. */
  onTapFigure: (p: Point) => void;
}

export function DicotBench({
  dishes,
  specimen,
  germ,
  clock,
  held,
  foundMicropyle,
  pulse,
  onSvg,
  onTakeSeed,
  onTapBeaker,
  onTapGerm,
  onTapTile,
  onHold,
  onTapFigure,
}: DicotBenchProps): React.ReactElement {
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const onTile = specimen && specimen.onTile ? specimen : null;
  const fig = onTile ? tileTransform(onTile) : null;

  const holdingTool = (id: ToolId): boolean => held?.kind === 'tool' && held.id === id;
  const holdingSeed = (sp: SpeciesId): boolean => held?.kind === 'seed' && held.sp === sp;

  /** Bench coordinates for a pointer event, allowing for the letterboxing. */
  const benchPoint = (e: React.MouseEvent): { X: number; Y: number } | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const k = Math.min(rect.width / BENCH_WIDTH, rect.height / BENCH_HEIGHT);
    const left = rect.left + (rect.width - BENCH_WIDTH * k) / 2;
    const top = rect.top + (rect.height - BENCH_HEIGHT * k) / 2;
    return { X: (e.clientX - left) / k, Y: (e.clientY - top) / k };
  };

  const activate = (el: Element | null, at: { X: number; Y: number } | null): void => {
    if (!el) return;
    const dish = el.getAttribute('data-dish');
    if (dish) {
      onTakeSeed(dish as SpeciesId);
      return;
    }
    const tool = el.getAttribute('data-tool');
    if (tool) {
      onHold(holdingTool(tool as ToolId) ? null : { kind: 'tool', id: tool as ToolId });
      return;
    }
    const well = el.getAttribute('data-well');
    if (well === 'beaker') {
      onTapBeaker();
      return;
    }
    if (well === 'germ') {
      onTapGerm();
      return;
    }
    if (el.getAttribute('data-fig') !== null) {
      if (!fig || !at) {
        onTapTile();
        return;
      }
      onTapFigure({ x: (at.X - fig.cx) / fig.k, y: (at.Y - fig.cy) / fig.k });
    }
  };

  const onClick = (e: React.MouseEvent<SVGSVGElement>): void => {
    const hot = (e.target as Element).closest('[data-hot]');
    if (!hot) {
      if (held) onHold(null);
      return;
    }
    activate(hot, benchPoint(e));
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>): void => {
    if (e.key === 'Escape') {
      onHold(null);
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const hot = (e.target as Element).closest('[data-hot]');
    if (!hot) return;
    e.preventDefault();
    // Without a pointer there is no point on the seed: the keyboard route to
    // the parts is the magnified lens in the console, which has a crosshair.
    activate(hot, null);
  };

  const gs = germState(germ);
  const moving = useBenchMotion();
  /**
   * The hour hand, in degrees: the clock reads the practical's own elapsed
   * hours. Not taken modulo twelve — 370° and 10° are the same hand, but only
   * the first of them goes ROUND rather than whipping backwards through eleven
   * hours the moment the clock passes noon.
   */
  const hand = clock * 30;

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        '& [data-hot]': { cursor: 'pointer', outline: 'none' },
        '& [data-hot] .focus': { stroke: 'transparent', strokeWidth: 2 },
        '& [data-hot]:hover .focus': { stroke: 'rgba(255,255,255,.45)' },
        '& [data-hot]:focus-visible .focus': { stroke: apparatus.hintRing, strokeWidth: 3 },
        '& [data-hot].picked .lift': { transform: 'translateY(-10px)' },
        '& .lift': { transition: 'transform .25s cubic-bezier(.32,.72,0,1)' },
        '& [data-hot].pulse .focus': { animation: pulseAnimation },
        // `benchMotionSx` first for the rules that move, `motionSx` last so that
        // stopping beats every one of them: the `animation` flag and
        // `prefers-reduced-motion` settle this bench by the same code path.
        ...benchMotionSx,
        ...motionSx(moving),
      }}
    >
      <svg
        ref={(el) => {
          svgRef.current = el;
          onSvg(el);
        }}
        viewBox={`0 0 ${BENCH_WIDTH} ${BENCH_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Biology bench: three dishes of dry seeds, a beaker of water, a dish of wet cotton, a lab clock, forceps, a needle and a blade, and a white tile"
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'manipulation' }}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <defs>
          <radialGradient id="ds-lamp" cx="45%" cy="38%" r="75%">
            <stop offset="0" stopColor="#2b3533" />
            <stop offset=".6" stopColor={apparatus.bench} />
            <stop offset="1" stopColor="#121817" />
          </radialGradient>
          <linearGradient id="ds-tile" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f4f2ec" />
            <stop offset="1" stopColor="#ddd8cc" />
          </linearGradient>
          <linearGradient id="ds-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#bfe4f2" stopOpacity=".75" />
            <stop offset="1" stopColor="#7fb9d4" stopOpacity=".8" />
          </linearGradient>
          <filter id="ds-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <rect width={BENCH_WIDTH} height={BENCH_HEIGHT} fill="url(#ds-lamp)" />
        <rect y={592} width={BENCH_WIDTH} height={8} fill={apparatus.benchEdge} />

        {/* The white tile */}
        <rect x={TILE.x + 3} y={TILE.y + 6} width={TILE.w} height={TILE.h} rx={10} fill="#000" opacity={0.3} filter="url(#ds-soft)" />
        <rect x={TILE.x} y={TILE.y} width={TILE.w} height={TILE.h} rx={10} fill="url(#ds-tile)" />

        <g
          data-hot=""
          data-fig=""
          tabIndex={0}
          role="button"
          aria-label={
            onTile
              ? 'The seed on the white tile'
              : 'The white tile, empty — soak a seed and put it down here'
          }
        >
          <rect
            className="focus"
            x={TILE.x + 4}
            y={TILE.y + 4}
            width={TILE.w - 8}
            height={TILE.h - 8}
            rx={10}
            fill="rgba(0,0,0,0)"
          />
          {onTile && fig ? (
            <g transform={`translate(${n2(fig.cx)},${n2(fig.cy)}) scale(${n2(fig.k)})`}>
              <SeedFigure seed={onTile} view="live" uid="tile" showMicropyle={foundMicropyle} />
            </g>
          ) : (
            <>
              <text x={648} y={392} fontSize={15} textAnchor="middle" fill="#a09a8b" fontFamily={LABEL_FONT}>
                The white tile is empty
              </text>
              <text x={648} y={414} fontSize={12.5} textAnchor="middle" fill="#b4ad9d" fontFamily={LABEL_FONT}>
                Soak a seed in the beaker, then tap the beaker to lift it out and put it here.
              </text>
            </>
          )}
        </g>

        {/* Three dishes of dry seeds */}
        {dishes.map((sp, i) => {
          const x = DISH_X[i] ?? 92;
          const dry = newSeed(sp);
          return (
            <g
              key={sp}
              data-hot=""
              data-dish={sp}
              className={[holdingSeed(sp) ? 'picked' : '', pulse.includes(`dish:${sp}`) ? 'pulse' : ''].join(' ').trim()}
              tabIndex={0}
              role="button"
              aria-label={`Dish of dry ${SPECIES[sp].name} seeds`}
              aria-pressed={holdingSeed(sp)}
            >
              <g className="lift">
                <circle cx={x + 3} cy={DISH_Y + 6} r={DISH_R} fill="#000" opacity={0.3} filter="url(#ds-soft)" />
                <circle cx={x} cy={DISH_Y} r={DISH_R} fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.45)" strokeWidth={1.6} />
                <circle cx={x} cy={DISH_Y} r={DISH_R - 7} fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.2)" />
                {[
                  [-18, -12, -14],
                  [14, -6, 22],
                  [-6, 16, 8],
                  [22, 18, -30],
                ].map(([dx, dy, rot], k) => (
                  <g key={k} transform={`translate(${x + (dx ?? 0)},${DISH_Y + (dy ?? 0)}) rotate(${rot ?? 0}) scale(0.3)`}>
                    <SeedFigure seed={dry} view="live" uid={`dish-${sp}-${k}`} small />
                  </g>
                ))}
                <BenchLabel x={x} y={DISH_Y + DISH_R + 17} text={SPECIES[sp].short} />
                <BenchLabel x={x} y={DISH_Y + DISH_R + 29} text="dry seeds" small />
                <rect
                  className="focus"
                  x={x - DISH_R - 6}
                  y={DISH_Y - DISH_R - 6}
                  width={2 * DISH_R + 12}
                  height={2 * DISH_R + 42}
                  rx={10}
                  fill="none"
                />
              </g>
            </g>
          );
        })}

        {/* The beaker of water */}
        <g
          data-hot=""
          data-well="beaker"
          className={pulse.includes('well:beaker') ? 'pulse' : ''}
          tabIndex={0}
          role="button"
          aria-label={`Beaker of water for soaking${specimen?.inWater ? ', a seed is soaking in it' : ''}`}
        >
          <g className="lift">
            <path
              d={`M${BEAKER.x0 + 3} ${BEAKER.top + 6} V${BEAKER.bottom} H${BEAKER.x1 + 3} V${BEAKER.top + 6}`}
              fill="#000"
              opacity={0.3}
              filter="url(#ds-soft)"
            />
            <path
              d={`M${BEAKER.x0} ${BEAKER.top} V${BEAKER.bottom - 8} Q${BEAKER.x0} ${BEAKER.bottom} ${BEAKER.x0 + 10} ${BEAKER.bottom} H${BEAKER.x1 - 10} Q${BEAKER.x1} ${BEAKER.bottom} ${BEAKER.x1} ${BEAKER.bottom - 8} V${BEAKER.top} Z`}
              fill="rgba(255,255,255,.07)"
            />
            <path
              d={`M${BEAKER.x0} ${BEAKER.surface} V${BEAKER.bottom - 8} Q${BEAKER.x0} ${BEAKER.bottom} ${BEAKER.x0 + 10} ${BEAKER.bottom} H${BEAKER.x1 - 10} Q${BEAKER.x1} ${BEAKER.bottom} ${BEAKER.x1} ${BEAKER.bottom - 8} V${BEAKER.surface} Z`}
              fill="url(#ds-water)"
            />
            {/* The surface breathes, which is the difference between a column
                of water and a blue rectangle. It carries nothing: a meniscus
                that has stopped is still a meniscus, drawn where the water is. */}
            <rect className={MENISCUS_CLASS} x={BEAKER.x0} y={BEAKER.surface - 2} width={BEAKER.x1 - BEAKER.x0} height={4} fill="#dff1f8" opacity={0.7} />
            {specimen?.inWater ? (
              // The seed is drawn at its DRY size and the swelling is the
              // scale, so the browser carries the step between one tick of the
              // soak clock and the next instead of the seed growing in ten
              // jumps a second. `swellScale` is the model's own factor, the one
              // `geom` multiplies by and the one the caption reads as a
              // percentage: the picture cannot disagree with the number.
              <g
                className={TRACK_CLASS}
                transform={`translate(${(BEAKER.x0 + BEAKER.x1) / 2},${BEAKER.bottom - 26}) rotate(-8) scale(${n2(
                  beakerScale(specimen) * swellScale(specimen),
                )})`}
              >
                <SeedFigure seed={specimen} view="live" uid="beaker" small showMicropyle={foundMicropyle} atDrySize />
              </g>
            ) : null}
            <path
              d={`M${BEAKER.x0 - 4} ${BEAKER.top} H${BEAKER.x1 + 4} M${BEAKER.x0} ${BEAKER.top} V${BEAKER.bottom - 8} Q${BEAKER.x0} ${BEAKER.bottom} ${BEAKER.x0 + 10} ${BEAKER.bottom} H${BEAKER.x1 - 10} Q${BEAKER.x1} ${BEAKER.bottom} ${BEAKER.x1} ${BEAKER.bottom - 8} V${BEAKER.top}`}
              fill="none"
              stroke="rgba(255,255,255,.55)"
              strokeWidth={1.6}
            />
            <BenchLabel x={(BEAKER.x0 + BEAKER.x1) / 2} y={BEAKER.bottom + 19} text="water" />
            <BenchLabel
              x={(BEAKER.x0 + BEAKER.x1) / 2}
              y={BEAKER.bottom + 31}
              small
              text={specimen?.inWater ? `soaking ${n2(specimen.h)} h` : 'soak the seed here'}
            />
            <rect
              className="focus"
              x={BEAKER.x0 - 10}
              y={BEAKER.top - 8}
              width={BEAKER.x1 - BEAKER.x0 + 20}
              height={BEAKER.bottom - BEAKER.top + 46}
              rx={10}
              fill="none"
            />
          </g>
        </g>

        {/* The germination dish */}
        <g
          data-hot=""
          data-well="germ"
          className={pulse.includes('well:germ') ? 'pulse' : ''}
          tabIndex={0}
          role="button"
          aria-label={`Dish of wet cotton${germ ? ', a seed is germinating on it' : ''}`}
        >
          <g className="lift">
            <circle cx={GERM.cx + 3} cy={GERM.cy + 6} r={GERM.r} fill="#000" opacity={0.3} filter="url(#ds-soft)" />
            <circle cx={GERM.cx} cy={GERM.cy} r={GERM.r} fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.45)" strokeWidth={1.6} />
            <circle cx={GERM.cx} cy={GERM.cy} r={GERM.r - 8} fill="#f2f0e6" opacity={0.55} />
            {germ ? (
              <>
                {gs.radicle > 0 ? (
                  <path
                    d={`M${GERM.cx - 12} ${GERM.cy + 6} q ${-(10 + 34 * gs.radicle) * 0.4} ${(10 + 34 * gs.radicle) * 0.35} ${-(10 + 34 * gs.radicle) * 0.75} ${(10 + 34 * gs.radicle) * 0.6}`}
                    fill="none"
                    stroke="#f2ead5"
                    strokeWidth={5}
                    strokeLinecap="round"
                  />
                ) : null}
                <g transform={`translate(${GERM.cx},${GERM.cy}) scale(${n2(Math.min(0.5, 52 / (2 * geom(germ).a)))})`}>
                  <SeedFigure seed={germ} view="live" uid="germ" small />
                </g>
                {gs.plumule > 0 ? (
                  <>
                    <path
                      d={`M${GERM.cx + 10} ${GERM.cy - 6} q 6 ${-(8 + 22 * gs.plumule) * 0.6} 2 ${-(8 + 22 * gs.plumule)}`}
                      fill="none"
                      stroke="#7d9a4f"
                      strokeWidth={3}
                      strokeLinecap="round"
                    />
                    <ellipse
                      cx={GERM.cx + 16}
                      cy={GERM.cy - 6 - (8 + 22 * gs.plumule)}
                      rx={9}
                      ry={4.5}
                      transform={`rotate(-25 ${GERM.cx + 16} ${GERM.cy - 6 - (8 + 22 * gs.plumule)})`}
                      fill="#b7cd84"
                      stroke="#7d9a4f"
                    />
                  </>
                ) : null}
              </>
            ) : null}
            <BenchLabel x={GERM.cx} y={GERM.cy + GERM.r + 17} text="wet cotton" />
            <BenchLabel
              x={GERM.cx}
              y={GERM.cy + GERM.r + 29}
              small
              text={germ ? `${n2(germ.g)} h since sown` : 'germinate a seed here'}
            />
            <rect
              className="focus"
              x={GERM.cx - GERM.r - 6}
              y={GERM.cy - GERM.r - 6}
              width={2 * GERM.r + 12}
              height={2 * GERM.r + 42}
              rx={10}
              fill="none"
            />
          </g>
        </g>

        {/* The lab clock */}
        <g aria-hidden="true">
          <circle cx={CLOCK.cx + 3} cy={CLOCK.cy + 6} r={CLOCK.r + 4} fill="#000" opacity={0.3} filter="url(#ds-soft)" />
          <circle cx={CLOCK.cx} cy={CLOCK.cy} r={CLOCK.r} fill="#f3eedf" stroke="#2b2f33" strokeWidth={5} />
          {Array.from({ length: 12 }, (_, k) => {
            const an = (k * 30 * Math.PI) / 180;
            return (
              <line
                key={k}
                x1={n2(CLOCK.cx + 46 * Math.sin(an))}
                y1={n2(CLOCK.cy - 46 * Math.cos(an))}
                x2={n2(CLOCK.cx + 52 * Math.sin(an))}
                y2={n2(CLOCK.cy - 52 * Math.cos(an))}
                stroke="#1d1d1b"
                strokeWidth={k % 3 ? 0.8 : 1.8}
              />
            );
          })}
          <text x={CLOCK.cx} y={CLOCK.cy + 24} fontSize={12} textAnchor="middle" fill="#6b6658" fontFamily={LABEL_FONT} fontWeight={600}>
            {n2(clock)} h
          </text>
          {/* The hand is drawn straight up and the whole hand is TURNED, which
              is what the shared motion module says to do with a line whose ends
              follow a model value: `x1`/`y1`/`x2`/`y2` are attributes and
              cannot be carried, and a transform can. So the eight lab hours a
              real second is worth arrive as a sweep rather than as eight jumps
              a second, and the angle is the practical's own clock. */}
          <g className={TRACK_CLASS} transform={`rotate(${n2(hand)} ${CLOCK.cx} ${CLOCK.cy})`}>
            <line
              x1={CLOCK.cx}
              y1={CLOCK.cy}
              x2={CLOCK.cx}
              y2={CLOCK.cy - 42}
              stroke={apparatus.needle}
              strokeWidth={2.6}
              strokeLinecap="round"
            />
          </g>
          <circle cx={CLOCK.cx} cy={CLOCK.cy} r={4} fill="#2b2f33" />
          <BenchLabel x={CLOCK.cx} y={CLOCK.cy + 76} text="LAB CLOCK" />
        </g>

        {/* The dissecting tools */}
        {TOOLS.map((t) => (
          <g
            key={t.id}
            data-hot=""
            data-tool={t.id}
            className={[holdingTool(t.id) ? 'picked' : '', pulse.includes(`tool:${t.id}`) ? 'pulse' : ''].join(' ').trim()}
            tabIndex={0}
            role="button"
            aria-label={`${t.name} — ${t.hint}`}
            aria-pressed={holdingTool(t.id)}
          >
            <g className="lift">
              <rect x={34} y={t.y - 4} width={256} height={82} rx={12} fill="rgba(255,255,255,.045)" stroke="rgba(255,255,255,.09)" />
              <g transform={`translate(80,${t.y + 37})`}>{TOOL_ART[t.id]}</g>
              <text x={124} y={t.y + 31} fontSize={14} fill="#e8eeec" fontFamily={LABEL_FONT} fontWeight={600}>
                {t.name}
              </text>
              <text x={124} y={t.y + 48} fontSize={11} fill={apparatus.benchInkMuted} fontFamily={LABEL_FONT}>
                {t.hint}
              </text>
              <rect className="focus" x={30} y={t.y - 8} width={264} height={90} rx={12} fill="none" />
            </g>
          </g>
        ))}

        {onTile ? (
          <text x={648} y={TILE.y + TILE.h - 14} fontSize={11} textAnchor="middle" fill="#8a8474" fontFamily={LABEL_FONT}>
            {SPECIES[onTile.sp].name} · soaked {n2(onTile.h)} h · {swollenPercent(onTile)}% of its dry size
            {swellFrac(onTile.h) >= 0.88 ? ' · fully swollen' : ''}
          </text>
        ) : null}
      </svg>
    </Box>
  );
}
