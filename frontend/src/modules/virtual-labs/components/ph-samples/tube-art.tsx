'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { keyframes } from '@mui/system';

import {
  POUR,
  SAMPLE_BY_ID,
  developSeconds,
  liquidColour,
  pHof,
  uiColour,
  volume,
  type SampleId,
} from '@labs/lib/ph-samples/chemistry';
import {
  BLOOM_SECONDS,
  DIP_SECONDS,
  DROP_SECONDS,
  LEVEL_SECONDS,
  POUR_LEAD_SECONDS,
  POUR_TAIL_SECONDS,
  SWIRL_DELAY_SECONDS,
  SWIRL_SECONDS,
  pourRiseSeconds,
} from '@labs/lib/ph-samples/gestures';
import type { Tube } from '@labs/lib/ph-samples/state';

import { LABEL_FONT } from '../apparatus-palette';
import {
  MENISCUS_CLASS,
  SHEEN_CLASS,
  TRACK_CLASS,
  benchMotionSx,
  motionSx,
  trackStyle,
  useBenchMotion,
} from '../bench-motion';

/**
 * One test tube of this practical, drawn at any size, with everything that
 * happens to it.
 *
 * The same component is the tube in the rack and the magnified one docked in the
 * console, so the colour a student reads off the chart and the colour they are
 * marked against are literally the same drawing, larger. That is the whole
 * argument for the close-up: at 34 units across, a green at pH 7 and a green at
 * pH 8 are the same green.
 *
 * MOTION HERE IS THE MODEL'S, NOT A SCRIPT'S. Nothing schedules a frame; there
 * is no clock in this file and no state in it either. What moves, moves for one
 * of exactly two reasons:
 *
 *  - A NUMBER CHANGED and the change is carried across time instead of jumping.
 *    The level rides `volume(tube)` and the colour rides `liquidColour(tube)`,
 *    both as CSS transitions over the durations `@labs/lib/ph-samples/gestures`
 *    states. Stop them and the tube IS at its level, in its colour, at once.
 *  - A HAND DID SOMETHING and the doing is played once. Each gesture is a group
 *    keyed on the count in the model that caused it — `added.length` for a pour,
 *    the frozen `strip` for a dip — so it plays when the model says it happened
 *    and at no other time. Every one of them is drawn at `opacity: 0` and only
 *    an animation lifts it, so stopping the animation removes the gesture
 *    entirely rather than freezing a bottle in mid-air over the rack.
 *
 * Which is why `animation: false` and `prefers-reduced-motion: reduce` need no
 * second settled state: they are `stillSx`, one rule, and it lands on the tube
 * as it stands.
 */

export interface TubeGeometry {
  cx: number;
  top: number;
  bottom: number;
  /** Outside width of the glass. */
  w: number;
  /** Pixels per millilitre, which is what makes 5 mL look like 5 mL. */
  mlPx: number;
}

/** An undipped strip: the colour a developed square starts from. */
export const DRY_PAPER = '#f5f0e2';
const WET_PAPER = '#e4dcc2';

// ---------------------------------------------------------------------------
// The keyframes, all of which end where the tube already is
// ---------------------------------------------------------------------------

/** A gesture's own lifetime: invisible, present while it happens, gone. */
const gesture = keyframes`
  0% { opacity: 0 }
  7% { opacity: 1 }
  84% { opacity: 1 }
  100% { opacity: 0 }
`;

/** The bottle tipping over the mouth of the tube and lifting away again. */
const tilt = keyframes`
  0% { transform: translateY(-14px) rotate(-26deg) }
  22%, 78% { transform: translateY(0) rotate(-52deg) }
  100% { transform: translateY(18px) rotate(-30deg) }
`;

/** The stream, which only runs between the bottle arriving and it leaving. */
const stream = keyframes`
  0%, 12% { opacity: 0 }
  20%, 80% { opacity: 1 }
  92%, 100% { opacity: 0 }
`;

/** One blob of liquid crossing from the lip to the tube, over and over. */
const fallAlong = keyframes`
  0% { transform: translate(0, 0); opacity: 0 }
  18% { opacity: 1 }
  100% { transform: translate(var(--dx), var(--dy)); opacity: 0 }
`;

/** A drop of indicator leaving the nozzle and reaching the surface. */
const fallDrop = keyframes`
  0% { transform: translateY(0) scaleY(1); opacity: 0 }
  14% { opacity: 1 }
  100% { transform: translateY(var(--fall)) scaleY(1.7); opacity: 0 }
`;

/** Where the drops broke the surface, spreading down through the solution. */
const bloom = keyframes`
  0% { transform: scale(.18) translateY(0); opacity: 0 }
  18% { opacity: .85 }
  100% { transform: scale(1.7) translateY(var(--sink)); opacity: 0 }
`;

/** The solution settling after a pour: two turns and it is still. */
const swirl = keyframes`
  0% { transform: translateX(0); opacity: 0 }
  12% { opacity: .26 }
  25% { transform: translateX(var(--sw)) }
  50% { transform: translateX(0) }
  75% { transform: translateX(calc(-1 * var(--sw))) }
  100% { transform: translateX(0); opacity: 0 }
`;

/** The strip going in, standing in the solution, and coming back out. */
const dip = keyframes`
  0% { transform: translateY(0); opacity: 0 }
  6% { opacity: 1 }
  22%, 62% { transform: translateY(var(--dip)) }
  88% { transform: translateY(0); opacity: 1 }
  100% { transform: translateY(0); opacity: 0 }
`;

/** The wet end of the strip taking its colour while it is still in the tube. */
const wetThrough = keyframes`
  0% { opacity: 0 }
  100% { opacity: 1 }
`;

/**
 * The rules the gestures above are hung on, spread AFTER `benchMotionSx` and
 * BEFORE `motionSx`, so that stopping still wins.
 *
 * Only the name, the curve and the fill mode are here. Every duration and every
 * delay arrives inline from `gestures.ts`, because those are the model's numbers
 * and this is a stylesheet.
 */
const once = { animationIterationCount: 1, animationFillMode: 'none' } as const;

const gestureSx = {
  '& .gesture': { opacity: 0, animationName: `${gesture}`, animationTimingFunction: 'linear', ...once },
  '& .tilt': { animationName: `${tilt}`, animationTimingFunction: 'cubic-bezier(.32,.72,0,1)', ...once },
  '& .stream': { opacity: 0, animationName: `${stream}`, animationTimingFunction: 'linear', ...once },
  '& .blob': { opacity: 0, animationName: `${fallAlong}`, animationTimingFunction: 'cubic-bezier(.4,0,.9,.6)' },
  '& .drop': { opacity: 0, animationName: `${fallDrop}`, animationTimingFunction: 'cubic-bezier(.4,0,.9,.6)', ...once },
  '& .bloom': {
    opacity: 0,
    animationName: `${bloom}`,
    animationTimingFunction: 'cubic-bezier(.2,.6,.3,1)',
    transformBox: 'fill-box',
    transformOrigin: 'center',
    ...once,
  },
  '& .swirl': { opacity: 0, animationName: `${swirl}`, animationTimingFunction: 'ease-in-out', ...once },
  '& .dip': { opacity: 0, animationName: `${dip}`, animationTimingFunction: 'cubic-bezier(.4,.1,.3,1)', ...once },
  '& .wet': { opacity: 0, animationName: `${wetThrough}`, animationTimingFunction: 'linear', ...once },
} as const;

/** CSS custom properties, which React's `CSSProperties` has no room for. */
type Vars = Record<string, string | number>;
const style = (vars: Vars): React.CSSProperties => vars as React.CSSProperties;
const secs = (s: number): string => `${s.toFixed(3)}s`;

// ---------------------------------------------------------------------------
// What the model says about this tube
// ---------------------------------------------------------------------------

/**
 * How long the level takes to get where it is going, and how long before it
 * starts. A tube being FILLED waits for the bottle to finish tilting in; a tube
 * being emptied into the waste beaker has no bottle to wait for, and the model
 * says which of the two this is by whether anything is left in it.
 */
function levelTiming(v: number): { seconds: number; delay: number } {
  return { seconds: LEVEL_SECONDS, delay: v > 0 ? POUR_LEAD_SECONDS : 0 };
}

/**
 * …and the same for the colour, which has a third case: indicator dropped into
 * a tube cannot start colouring it before the drops have landed.
 */
function colourTiming(tube: Tube): { seconds: number; delay: number } {
  if (tube.indicator) return { seconds: developSeconds(tube), delay: DROP_SECONDS };
  return { seconds: LEVEL_SECONDS, delay: volume(tube) > 0 ? POUR_LEAD_SECONDS : 0 };
}

// ---------------------------------------------------------------------------
// The gestures, each drawn above the tube it is happening to
// ---------------------------------------------------------------------------


/**
 * The same liquid, drawn so it can be SEEN to be there.
 *
 * Five of this bench's six samples are colourless — the chemistry gives them
 * 7% alpha, which is honest and very nearly invisible against a dark bench. So
 * a student poured 5 mL of hydrochloric acid, the tube said "5 mL in the tube",
 * and the tube looked exactly as empty as before: the pour appeared not to have
 * animated at all.
 *
 * Real glassware solves this without colour — a column of water is visible by
 * its surface, its edges and the way it carries light — so this lifts the body
 * to a floor and the surface is drawn properly, and NO HUE IS INVENTED. All
 * five colourless samples still look identical to each other, which is not a
 * compromise but the point of the practical: you cannot tell them apart until
 * the indicator goes in.
 */
const BODY_FLOOR = 0.2;

function visible(colour: string): string {
  const m = /^rgba?\(([^)]+)\)$/.exec(colour);
  if (!m) return colour;
  const parts = m[1]!.split(',').map((x) => x.trim());
  const [r, g, bl] = parts;
  const a = parts[3] === undefined ? 1 : Number(parts[3]);
  if (!Number.isFinite(a) || a >= BODY_FLOOR) return colour;
  return `rgba(${r},${g},${bl},${BODY_FLOOR})`;
}

/** A bottle tipped over the tube, the stream, and the blobs crossing it. */
function PourGesture({ id, geo, surface }: { id: SampleId; geo: TubeGeometry; surface: number }): React.ReactElement {
  const sample = SAMPLE_BY_ID[id];
  const { cx, top } = geo;
  const scale = geo.w / 34;
  const lipX = cx - 7 * scale;
  const lipY = top - 28 * scale;
  const endY = Math.min(surface, top + 18);
  const liq = `rgba(${sample.rgb.join(',')},${Math.min(0.92, sample.a * 2.2 + 0.52).toFixed(2)})`;
  const run = pourRiseSeconds(POUR);
  const total = POUR_LEAD_SECONDS + run + POUR_TAIL_SECONDS;
  // Finite, and sized to the run: an infinite train would go on falling long
  // after the bottle had left, invisibly, forever.
  const blobs = Math.max(2, Math.round(run / 0.21));

  return (
    <g className="gesture" style={{ animationDuration: secs(total) }}>
      <g transform={`translate(${lipX.toFixed(1)} ${lipY.toFixed(1)}) scale(${scale.toFixed(3)})`}>
        <g className="tilt" style={{ animationDuration: secs(total) }}>
          <rect x={-23} y={-86} width={46} height={66} rx={9} fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.5)" strokeWidth={1.4} />
          <rect x={-20} y={-62} width={40} height={40} rx={6} fill={liq} />
          <rect x={-19} y={-56} width={38} height={18} rx={2} fill="#f4f1ea" />
          <text x={0} y={-44} fontSize={8.5} textAnchor="middle" fill="#1d1d1b" fontFamily={LABEL_FONT}>
            {sample.short}
          </text>
          <path d="M-7 -20 V-4 Q0 4 7 -4 V-20 Z" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.42)" />
        </g>
      </g>
      <g className="stream" style={{ animationDuration: secs(total) }}>
        <path
          d={`M${lipX.toFixed(1)} ${(lipY + 2).toFixed(1)} Q${lipX.toFixed(1)} ${((lipY + endY) / 2).toFixed(1)} ${cx} ${endY.toFixed(1)}`}
          fill="none"
          stroke={liq}
          strokeWidth={4.6 * scale}
          strokeLinecap="round"
        />
        <path
          d={`M${lipX.toFixed(1)} ${(lipY + 2).toFixed(1)} Q${lipX.toFixed(1)} ${((lipY + endY) / 2).toFixed(1)} ${cx} ${endY.toFixed(1)}`}
          fill="none"
          stroke="#fff"
          strokeWidth={1.3 * scale}
          strokeOpacity={0.32}
          strokeLinecap="round"
        />
        {Array.from({ length: 3 }, (_, k) => (
          <ellipse
            key={k}
            className="blob"
            cx={lipX}
            cy={lipY + 2}
            rx={2.6 * scale}
            ry={4 * scale}
            fill={liq}
            style={style({
              '--dx': `${(cx - lipX).toFixed(1)}px`,
              '--dy': `${(endY - lipY - 2).toFixed(1)}px`,
              animationDuration: secs(0.21),
              animationDelay: secs((k * 0.21) / 3),
              animationIterationCount: blobs,
            })}
          />
        ))}
      </g>
    </g>
  );
}

/** The dropper bottle over the tube, and two drops of indicator falling in. */
function DropGesture({ geo, surface }: { geo: TubeGeometry; surface: number }): React.ReactElement {
  const { cx, top } = geo;
  const scale = geo.w / 34;
  const noz = top - 30 * scale;
  const fall = Math.max(6, surface - noz);

  return (
    <g className="gesture" style={{ animationDuration: secs(DROP_SECONDS + 0.3) }}>
      <g transform={`translate(${cx} ${noz.toFixed(1)}) scale(${scale.toFixed(3)})`}>
        <rect x={-17} y={-66} width={34} height={52} rx={7} fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.5)" strokeWidth={1.3} />
        <rect x={-14} y={-50} width={28} height={33} rx={5} fill="#7fa83e" opacity={0.8} />
        <path d="M-5 -16 L-2.4 0 L2.4 0 L5 -16 Z" fill="#2a2a2c" stroke="#4a4a4e" strokeWidth={1} />
      </g>
      {([-2.5, 3] as const).map((dx, k) => (
        <ellipse
          key={k}
          className="drop"
          cx={cx + dx * scale}
          cy={noz}
          rx={3.1 * scale}
          ry={3.1 * scale}
          fill="#6f9a3a"
          style={style({
            '--fall': `${fall.toFixed(1)}px`,
            animationDuration: secs(DROP_SECONDS * 0.82),
            animationDelay: secs(k * DROP_SECONDS * 0.4),
          })}
        />
      ))}
    </g>
  );
}

/** A fresh strip of pH paper going into the tube and coming back out wet. */
function DipGesture({ geo, surface, ph }: { geo: TubeGeometry; surface: number; ph: number }): React.ReactElement {
  const { cx, top, bottom } = geo;
  const scale = geo.w / 34;
  const h = (bottom - top) * 0.84;
  const width = 13 * scale;
  const outside = top - 26 * scale - h;
  const inside = Math.min(surface + 15 * scale, bottom - 16 * scale) - h;
  const wet = 26 * scale;

  return (
    <g className="dip" style={style({ '--dip': `${(inside - outside).toFixed(1)}px`, animationDuration: secs(DIP_SECONDS) })}>
      <rect x={cx - width / 2 + 1.5} y={outside + 3} width={width} height={h} rx={2} fill="#000" opacity={0.28} />
      <rect x={cx - width / 2} y={outside} width={width} height={h} rx={2} fill={DRY_PAPER} stroke="#cfc7b2" />
      <rect
        className="wet"
        x={cx - width / 2}
        y={outside + h - wet}
        width={width}
        height={wet}
        rx={2}
        fill={uiColour(ph)}
        style={{ animationDuration: secs(DIP_SECONDS * 0.42), animationDelay: secs(DIP_SECONDS * 0.34) }}
      />
      <rect x={cx - width / 2 - 4 * scale} y={outside + 4} width={width + 8 * scale} height={11 * scale} rx={3} fill="#b9c4c1" opacity={0.8} />
      <rect x={cx - width / 2 - 4 * scale} y={outside + 4} width={width + 8 * scale} height={4 * scale} rx={2} fill="#fff" opacity={0.35} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// The tube
// ---------------------------------------------------------------------------

export function TubeArt({
  tube,
  geometry,
  clipId,
  gestures = false,
}: {
  tube: Tube;
  geometry: TubeGeometry;
  /** Unique within the document: the liquid is clipped to the glass. */
  clipId: string;
  /**
   * Whether the hands are drawn as well as the glass. On the bench they are:
   * that is where the pouring happens. In the console's close-up they are not,
   * because a bottle tipped over a tube magnified four times would fill the
   * panel and the panel is for looking INTO the tube.
   */
  gestures?: boolean;
}): React.ReactElement {
  const moving = useBenchMotion();
  const { cx, top, bottom, w, mlPx } = geometry;
  const r = w / 2;
  const scale = w / 34;
  const glass = `M${cx - r} ${top} V${bottom - r} A${r} ${r} 0 0 0 ${cx + r} ${bottom - r} V${top}`;
  const v = volume(tube);
  const surface = bottom - 3 - v * mlPx;
  const depth = bottom - top + 10;
  const level = levelTiming(v);
  const colour = colourTiming(tube);
  // A pour is identified by how many pours there have been, a dip by the pH the
  // strip froze at. Both are the model's own counters, so a gesture is mounted
  // exactly when the thing it depicts happened and is never replayed by a
  // re-render that changed nothing.
  const pours = tube.added.length;
  const poured = tube.added[pours - 1];
  const bloomColour = uiColour(pHof(tube) ?? 7);

  return (
    // The motion rules ride with the tube rather than with the bench: this one
    // component is both a tube in the rack and the magnified copy in the
    // console, and each is mounted under a different SVG.
    <Box component="g" sx={{ ...benchMotionSx, ...gestureSx, ...motionSx(moving) }}>
      <defs>
        <clipPath id={clipId}>
          <path d={glass} />
        </clipPath>
        {/* The cloud is the tube's OWN colour — the one the chemistry computed
            for what is in it — so the bloom cannot arrive at a different answer
            from the column it spreads through. */}
        <radialGradient id={`${clipId}-bloom`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={bloomColour} stopOpacity="0.95" />
          <stop offset="0.5" stopColor={bloomColour} stopOpacity="0.6" />
          <stop offset="1" stopColor={bloomColour} stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={glass} fill="rgba(255,255,255,.05)" />

      {/*
        THE COLUMN IS ALWAYS MOUNTED, at the bottom of the tube and empty, and
        this is the whole reason a pour can be watched. A transition carries a
        property from the value it had to the value it has; an element that
        appears already full has no value it HAD, so it arrives full and the
        filling is never seen. An empty tube is drawn as a column of nothing
        standing at the bottom, which costs a rect nobody can see and is what
        the first 5 mL then rises out of.
      */}
      <g clipPath={`url(#${clipId})`}>
        {/*
          THE LEVEL AND THE COLOUR ARE TWO DIFFERENT CLOCKS, which is why they
          are two elements. A pour takes as long as it takes to tip a bottle;
          universal indicator dropped into a solution is already mixed through
          it and needs only a swirl. Carried on ONE element they would have to
          share a duration, and either the level would crawl or the colour
          would snap.
        */}
        <g
          className={TRACK_CLASS}
          style={{
            ...trackStyle(level.seconds),
            transitionDelay: secs(level.delay),
            transform: `translateY(${surface.toFixed(1)}px)`,
          }}
        >
          <rect
            className={TRACK_CLASS}
            style={{ ...trackStyle(colour.seconds), transitionDelay: secs(colour.delay) }}
            x={cx - r}
            y={0}
            width={w}
            height={depth}
            fill={visible(liquidColour(tube))}
          />
          {tube.indicator ? (
            <circle
              key={`bloom-${pours}`}
              className="bloom"
              cx={cx - 2.5 * scale}
              cy={6 * scale}
              r={Math.max(w, 18) * 0.9}
              fill={`url(#${clipId}-bloom)`}
              style={style({
                '--sink': `${(w * 0.5).toFixed(1)}px`,
                animationDuration: secs(BLOOM_SECONDS),
                animationDelay: secs(DROP_SECONDS),
              })}
            />
          ) : null}
          {pours > 0
            ? [0, 1].map((k) => (
                <ellipse
                  key={`swirl-${pours}-${k}`}
                  className="swirl"
                  cx={cx}
                  cy={(bottom - surface) * (0.24 + k * 0.3)}
                  rx={r * 0.78}
                  ry={2 * scale + k * 1.2 * scale}
                  fill="#fff"
                  style={style({
                    '--sw': `${(r * 0.3).toFixed(1)}px`,
                    animationDuration: secs(SWIRL_SECONDS),
                    animationDelay: secs(SWIRL_DELAY_SECONDS + k * 0.1),
                  })}
                />
              ))
            : null}
          {/* No liquid, no surface — but the rect stays mounted so the surface
              is there to fade in as the first 5 mL arrives under it. */}
          <rect
            className={`${MENISCUS_CLASS} ${TRACK_CLASS}`}
            style={{ ...trackStyle(level.seconds), transitionDelay: secs(level.delay) }}
            x={cx - r}
            y={-1}
            width={w}
            height={3}
            fill="#fff"
            opacity={v > 0 ? 0.62 : 0}
          />
        </g>
      </g>

      <path d={glass} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth={1.4} />
      <line
        className={SHEEN_CLASS}
        x1={cx - r + w * 0.2}
        y1={top + 6}
        x2={cx - r + w * 0.2}
        y2={bottom - r}
        stroke="#fff"
        strokeWidth={w * 0.07}
        opacity={0.22}
      />
      <ellipse cx={cx} cy={top} rx={r + 1} ry={w * 0.09} fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={1.4} />

      {gestures ? (
        <>
          {poured ? <PourGesture key={`pour-${pours}`} id={poured} geo={geometry} surface={surface} /> : null}
          {tube.indicator ? <DropGesture key={`drop-${pours}`} geo={geometry} surface={surface} /> : null}
          {tube.tested === 'paper' && tube.strip !== null ? (
            <DipGesture key={`dip-${pours}-${tube.strip}`} geo={geometry} surface={surface} ph={tube.strip} />
          ) : null}
        </>
      ) : null}
    </Box>
  );
}

/** The used strip on the tile, which arrives when the hand puts it there. */
export function StripArt({
  ph,
  x,
  y,
  width,
  height,
  delay,
  develop,
}: {
  /** The pH the strip froze at, or null while no strip has been laid here. */
  ph: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  /** When the hand reaches the tile, from the dip it is on its way back from. */
  delay: number;
  /** How long the dye then takes to wet through the paper. */
  develop: number;
}): React.ReactElement {
  const there = ph !== null;
  return (
    <>
      {/*
        Both rects are mounted from the start and only their opacity and their
        fill change: a patch mounted already coloured would have nothing to
        develop FROM, and the wait before matching it against the chart is half
        of what this practical teaches.
      */}
      <rect
        className={TRACK_CLASS}
        style={{ ...trackStyle(0.12), transitionDelay: secs(there ? delay : 0) }}
        x={x}
        y={y}
        width={width}
        height={height}
        rx={3}
        fill={DRY_PAPER}
        stroke="#cfc7b2"
        opacity={there ? 1 : 0}
      />
      <rect
        className={TRACK_CLASS}
        style={{ ...trackStyle(develop), transitionDelay: secs(there ? delay : 0) }}
        x={x}
        y={y}
        width={width}
        height={height * 0.65}
        rx={3}
        fill={there ? uiColour(ph) : WET_PAPER}
        opacity={there ? 1 : 0}
      />
    </>
  );
}
