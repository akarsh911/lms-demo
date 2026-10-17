'use client';

import * as React from 'react';
import Box from '@mui/material/Box';

import {
  LAMPS,
  OBJECTIVES,
  OBJECTIVE_VALUES,
  clearance,
  focalPlane,
  totalMagnification,
  type Objective,
} from '@labs/lib/cell-division/optics';
import { viewThrough, type CellDivisionState } from '@labs/lib/cell-division/state';

import { apparatus, LABEL_FONT } from '../apparatus-palette';
import { TRACK_CLASS, benchMotionSx, motionSx, pulseAnimation, useBenchMotion } from '../bench-motion';

import { FieldOfView } from './field-of-view';

/**
 * The bench: a compound microscope, a box of six numbered prepared slides, and
 * the view through the eyepiece.
 *
 * The eyepiece is the biggest thing on it, deliberately. Identifying a stage
 * against a reference figure is this practical's "read a needle against a
 * scale", and a field of view drawn 140px across is a practical you cannot do —
 * the constriction of a dividing Amoeba is four pixels wide. Everything else on
 * the bench is a control; only the circle carries the evidence.
 *
 * Every control is a real one: the lamp dial has four positions, the nosepiece
 * swings between two objectives, the coarse and fine knobs rack the body tube
 * by 8 and by 1, and the mechanical stage carries the slide 0.12 mm at a press.
 * The image is draggable, because at a real microscope the fastest way to find
 * something is to push the slide.
 */

export const BENCH_WIDTH = 1000;
export const BENCH_HEIGHT = 620;

/** The optical axis, and the tube-up datum the nosepiece hangs from. */
const TUBE_X = 150;
const NOSE_0 = 228;
/** Top of the mechanical stage. `NOSE_0 + G0` lands exactly here, by design. */
const STAGE_Y = 380;

export const EYE = { cx: 700, cy: 222, R: 190 } as const;

const BOX_X = [406, 506, 606, 706, 806, 906] as const;
const BOX_W = 88;
const BOX_Y = 504;
const BOX_H = 102;

/** Regions a tour can spotlight, in bench coordinates. */
export const REGION = {
  scope: [36, 80, 372, 512],
  eye: [496, 20, 408, 420],
  tray: [392, 476, 608, 144],
  lamp: [50, 458, 150, 130],
  knobs: [238, 274, 70, 136],
  nose: [110, 190, 290, 312],
  stage: [56, 362, 210, 100],
  meters: [500, 436, 400, 34],
} as const;


function Stencil({
  x,
  y,
  text,
  anchor = 'middle',
  size = 11,
}: {
  x: number;
  y: number;
  text: string;
  anchor?: 'start' | 'middle' | 'end';
  size?: number;
}): React.ReactElement {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      textAnchor={anchor}
      fill={apparatus.benchLabel}
      fontFamily={LABEL_FONT}
      fontWeight={600}
      letterSpacing="1.4"
    >
      {text}
    </text>
  );
}

/** One objective barrel, with its colour band and its magnification stamped on. */
function Barrel({ objective }: { objective: Objective }): React.ReactElement {
  const b = OBJECTIVES[objective].barrel;
  const band = objective === 10 ? '#e8c53f' : '#3f7fe8';
  const w0 = 13;
  const w1 = objective === 10 ? 8 : 6;
  return (
    <g>
      <path d={`M${-w0},0 L${w0},0 L${w1},${b} L${-w1},${b} Z`} fill="url(#cd-barrel)" />
      <rect x={-w0 + 1} y={b * 0.55} width={(w0 - 1) * 2} height={7} fill={band} opacity={0.9} />
      <ellipse cx={0} cy={b} rx={w1} ry={2.6} fill="#0c1013" stroke="#8fa0ab" strokeWidth={0.8} />
      <text x={0} y={b * 0.32} fontSize={8.5} textAnchor="middle" fill="#dfe7ea" fontFamily={LABEL_FONT} fontWeight={700}>
        {objective}×
      </text>
    </g>
  );
}

/** A knurled adjustment knob: its top half racks up, its bottom half racks down. */
function Knob({
  cx,
  cy,
  r,
  knob,
  name,
  h,
  pulse,
}: {
  cx: number;
  cy: number;
  r: number;
  knob: 'coarse' | 'fine';
  name: string;
  h: number;
  pulse: boolean;
}): React.ReactElement {
  const half = (dir: 1 | -1, d: string, glyph: string, ty: number): React.ReactElement => (
    <g
      data-hot=""
      data-rack={`${knob}:${dir}`}
      className={pulse ? 'pulse' : ''}
      tabIndex={0}
      role="button"
      aria-label={`${name} adjustment — ${dir < 0 ? 'rack the body tube up, away from the slide' : 'rack the body tube down, towards the slide'}`}
    >
      <path d={d} fill="rgba(255,255,255,.04)" />
      <text x={cx} y={ty} fontSize={r * 0.5} textAnchor="middle" fill="#e7eef1" opacity={0.8} fontFamily={LABEL_FONT}>
        {glyph}
      </text>
      <path className="focus" d={d} fill="none" strokeWidth={2} />
    </g>
  );

  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="url(#cd-metalv)" stroke="#4c5458" />
      {/* The knurling is drawn at fixed angles and the KNOB is turned, four
          degrees per focus unit, so the thing the student is pressing is seen
          to turn under their finger instead of jumping between positions. The
          angle is the tube height and nothing else. */}
      <g className={TRACK_CLASS} transform={`rotate(${h * 4} ${cx} ${cy})`}>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * 45 * Math.PI) / 180;
          return (
            <line
              key={i}
              x1={cx + Math.cos(a) * r * 0.45}
              y1={cy + Math.sin(a) * r * 0.45}
              x2={cx + Math.cos(a) * r * 0.92}
              y2={cy + Math.sin(a) * r * 0.92}
              stroke="#4a5257"
              strokeWidth={2}
            />
          );
        })}
      </g>
      <circle cx={cx} cy={cy} r={r * 0.3} fill="#8d989d" stroke="#4c5458" />
      {half(-1, `M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy} Z`, '▲', cy - r * 0.34)}
      {half(1, `M${cx - r},${cy} A${r},${r} 0 0 0 ${cx + r},${cy} Z`, '▼', cy + r * 0.74)}
    </g>
  );
}

function Meter({
  x,
  label,
  value,
}: {
  x: number;
  label: string;
  value: number;
}): React.ReactElement {
  const v = Math.max(0, Math.min(1, value));
  const colour = v > 0.8 ? '#5fd48a' : v > 0.4 ? '#f0a92c' : '#ff7d76';
  return (
    <g>
      <text
        x={x}
        y={452}
        fontSize={9.5}
        textAnchor="middle"
        fill={apparatus.benchInkMuted}
        fontFamily={LABEL_FONT}
        fontWeight={600}
        letterSpacing="1"
      >
        {label}
      </text>
      <rect x={x - 46} y={458} width={92} height={7} rx={3.5} fill="rgba(255,255,255,.09)" />
      <rect x={x - 46} y={458} width={Math.round(92 * v * 10) / 10} height={7} rx={3.5} fill={colour} />
    </g>
  );
}

export interface MicroscopeProps {
  state: CellDivisionState;
  /** Controls a tour is pointing at: `lamp`, `obj:40`, `rack:coarse`, `slide:2`. */
  pulse: readonly string[];
  showPins: boolean;
  activePin: number;
  onSvg: (el: SVGSVGElement | null) => void;
  onMount: (index: number) => void;
  onObjective: (objective: Objective) => void;
  onRack: (knob: 'coarse' | 'fine', dir: 1 | -1) => void;
  onMove: (dir: 'l' | 'r' | 'u' | 'd') => void;
  onLamp: () => void;
  onPan: (x: number, y: number) => void;
}

export function Microscope({
  state,
  pulse,
  showPins,
  activePin,
  onSvg,
  onMount,
  onObjective,
  onRack,
  onMove,
  onLamp,
  onPan,
}: MicroscopeProps): React.ReactElement {
  const uid = `cd${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const repeat = React.useRef<{ hold?: ReturnType<typeof setTimeout>; tick?: ReturnType<typeof setInterval> }>({});
  // `moved` separates a DRAG of the image from a PRESS on a point: a press that
  // never turned into a drag is a request to bring that point to the centre, and
  // the two gestures start identically.
  const drag = React.useRef<{ x: number; y: number; px: number; py: number; pxmm: number } | null>(null);
  // Outlives `drag`, which `pointerup` clears before the click arrives.
  const dragMoved = React.useRef(false);

  const stopRepeat = React.useCallback((): void => {
    if (repeat.current.hold) clearTimeout(repeat.current.hold);
    if (repeat.current.tick) clearInterval(repeat.current.tick);
    repeat.current = {};
  }, []);

  React.useEffect(() => {
    const end = (): void => {
      stopRepeat();
      drag.current = null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      stopRepeat();
    };
  }, [stopRepeat]);

  const setSvg = (el: SVGSVGElement | null): void => {
    svgRef.current = el;
    onSvg(el);
  };

  const v = viewThrough(state);
  const slide = v.slide;
  const h = state.h;
  const lit = state.lamp > 0;
  const moving = useBenchMotion();
  const idle: Objective = state.objective === 10 ? 40 : 10;

  /** Where a pointer is, in bench coordinates. The drawing is letterboxed. */
  const benchPoint = (e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const el = svgRef.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const k = Math.min(box.width / BENCH_WIDTH, box.height / BENCH_HEIGHT);
    if (!k) return null;
    return {
      x: (e.clientX - (box.left + (box.width - BENCH_WIDTH * k) / 2)) / k,
      y: (e.clientY - (box.top + (box.height - BENCH_HEIGHT * k) / 2)) / k,
    };
  };

  const activate = (el: Element): void => {
    const slideIndex = el.getAttribute('data-slide');
    if (slideIndex !== null) {
      onMount(Number(slideIndex));
      return;
    }
    const objective = el.getAttribute('data-obj');
    if (objective !== null) {
      onObjective(Number(objective) as Objective);
      return;
    }
    const rack = el.getAttribute('data-rack');
    if (rack !== null) {
      const [knob, dir] = rack.split(':');
      onRack(knob as 'coarse' | 'fine', Number(dir) as 1 | -1);
      return;
    }
    const move = el.getAttribute('data-mv');
    if (move !== null) {
      onMove(move as 'l' | 'r' | 'u' | 'd');
      return;
    }
    if (el.getAttribute('data-act') === 'lamp') onLamp();
  };

  /**
   * A press inside the eyepiece that did not turn into a drag drives the stage
   * until the point pressed on sits in the middle of the field — the same
   * movement the four arrows make, in one go.
   *
   * It is how a mechanical stage is really driven: you look at the thing you
   * want and bring it to the middle. With the arrows alone, crossing a 40× field
   * is a dozen presses, which is long enough that students stop centring and
   * start hoping.
   */
  const centreOnPoint = (e: { clientX: number; clientY: number }): void => {
    if (!slide || v.broken) return;
    const at = benchPoint(e);
    if (!at || Math.hypot(at.x - EYE.cx, at.y - EYE.cy) > EYE.R) return;
    const pxmm = EYE.R / OBJECTIVES[state.objective].R;
    onPan(state.pos.x + (at.x - EYE.cx) / pxmm, state.pos.y + (at.y - EYE.cy) / pxmm);
  };

  const onClick = (e: React.MouseEvent<SVGSVGElement>): void => {
    const hot = (e.target as Element).closest('[data-hot]');
    // The knobs and the stage arrows fire on pointerdown, so they can repeat.
    if (!hot || hot.hasAttribute('data-rack') || hot.hasAttribute('data-mv')) return;
    if (hot.hasAttribute('data-field')) {
      if (!dragMoved.current) centreOnPoint(e);
      return;
    }
    activate(hot);
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>): void => {
    const hot = (e.target as Element).closest('[data-hot]');
    if (!hot) return;
    // The field has no single "activate": there is no one point a key press
    // could mean. What it has instead is the stage, under the arrow keys.
    if (hot.hasAttribute('data-field')) {
      const dir = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd' }[e.key];
      if (!dir) return;
      e.preventDefault();
      onMove(dir as 'l' | 'r' | 'u' | 'd');
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate(hot);
      return;
    }
    const rack = hot.getAttribute('data-rack');
    if (rack && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      onRack(rack.split(':')[0] as 'coarse' | 'fine', e.key === 'ArrowUp' ? -1 : 1);
    }
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    const hot = (e.target as Element).closest('[data-hot]');
    if (hot && (hot.hasAttribute('data-rack') || hot.hasAttribute('data-mv'))) {
      e.preventDefault();
      activate(hot);
      stopRepeat();
      repeat.current.hold = setTimeout(() => {
        repeat.current.tick = setInterval(() => activate(hot), 90);
      }, 420);
      return;
    }
    if (!slide || v.broken) return;
    const at = benchPoint(e);
    if (!at || Math.hypot(at.x - EYE.cx, at.y - EYE.cy) > EYE.R) return;
    drag.current = {
      x: at.x,
      y: at.y,
      px: state.pos.x,
      py: state.pos.y,
      pxmm: EYE.R / OBJECTIVES[state.objective].R,
    };
    dragMoved.current = false;
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const d = drag.current;
    if (!d) return;
    const at = benchPoint(e);
    if (!at) return;
    // A couple of bench units of slop, so the hand shaking on a press does not
    // turn it into a drag and swallow the tap.
    if (Math.hypot(at.x - d.x, at.y - d.y) > 3) dragMoved.current = true;
    if (!dragMoved.current) return;
    onPan(d.px - (at.x - d.x) / d.pxmm, d.py - (at.y - d.y) / d.pxmm);
  };

  const caption = v.none
    ? 'No slide on the stage'
    : v.broken
      ? `Slide ${slide?.n} — cracked`
      : `Slide ${slide?.n} · ${totalMagnification(state.objective)}× total magnification`;

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
        '& [data-hot].sel .focus': { stroke: apparatus.hintRing, strokeWidth: 2.5 },
        '& [data-hot].pulse .focus': { animation: pulseAnimation },
        // `benchMotionSx` first for the rules that move, `motionSx` last so that
        // stopping beats every one of them: the `animation` flag and
        // `prefers-reduced-motion` settle this bench by the same code path.
        ...benchMotionSx,
        ...motionSx(moving),
      }}
    >
      <svg
        ref={setSvg}
        viewBox={`0 0 ${BENCH_WIDTH} ${BENCH_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Biology bench: a compound microscope with a lamp, coarse and fine adjustments, a two-objective nosepiece and a mechanical stage, a box of six numbered prepared slides, and the view through the eyepiece"
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <defs>
          <radialGradient id="cd-room" cx="45%" cy="38%" r="75%">
            <stop offset="0" stopColor="#2b3533" />
            <stop offset=".6" stopColor={apparatus.bench} />
            <stop offset="1" stopColor="#121817" />
          </radialGradient>
          <linearGradient id="cd-metal" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7d878c" />
            <stop offset=".35" stopColor="#cfd7db" />
            <stop offset=".7" stopColor="#98a3a8" />
            <stop offset="1" stopColor="#5f686c" />
          </linearGradient>
          <linearGradient id="cd-metalv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c3ccd1" />
            <stop offset="1" stopColor="#79848a" />
          </linearGradient>
          <linearGradient id="cd-barrel" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#20262a" />
            <stop offset=".35" stopColor="#59636a" />
            <stop offset="1" stopColor="#171c1f" />
          </linearGradient>
          <linearGradient id="cd-beam" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#ffe9a8" stopOpacity=".55" />
            <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cd-tray" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3c3630" />
            <stop offset="1" stopColor="#241f1b" />
          </linearGradient>
          <filter id="cd-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <rect width={BENCH_WIDTH} height={BENCH_HEIGHT} fill="url(#cd-room)" />
        <rect y={BENCH_HEIGHT - 8} width={BENCH_WIDTH} height={8} fill={apparatus.benchEdge} />

        {/* --- the microscope --- */}
        <rect x={46} y={516} width={254} height={58} rx={16} fill="url(#cd-metal)" stroke="#4c5458" />
        <rect x={46} y={564} width={254} height={12} rx={6} fill="#3c4448" />

        <rect x={116} y={478} width={68} height={44} rx={7} fill="#4e585d" stroke="#38403f" />
        {/* The lamp comes UP rather than switching: the filament, the beam and
            the glow all follow the dial through `TRACK_CLASS`, at the four
            brightnesses the model has and no others. */}
        <ellipse className={TRACK_CLASS} cx={TUBE_X} cy={478} rx={17} ry={6} fill={lit ? '#ffeeb4' : '#7f8a90'} />
        {lit ? (
          <>
            <polygon
              className={TRACK_CLASS}
              points={`135,474 165,474 159,${STAGE_Y + 10} 141,${STAGE_Y + 10}`}
              fill="url(#cd-beam)"
              opacity={0.35 + state.lamp * 0.22}
            />
            <ellipse className={TRACK_CLASS} cx={TUBE_X} cy={478} rx={26} ry={12} fill="#ffeeb4" opacity={0.12 + state.lamp * 0.09} filter="url(#cd-soft)" />
          </>
        ) : null}

        {/* lamp dial */}
        <g
          data-hot=""
          data-act="lamp"
          className={pulse.includes('lamp') ? 'pulse' : ''}
          tabIndex={0}
          role="button"
          aria-label={`Lamp: ${LAMPS[state.lamp]} — press to change`}
        >
          <circle cx={83} cy={544} r={19} fill="#2e3639" stroke="#5c666b" />
          {[0, 1, 2, 3].map((i) => {
            const a = ((-120 + i * 80) * Math.PI) / 180;
            return (
              <circle
                key={i}
                cx={83 + Math.cos(a) * 23}
                cy={544 + Math.sin(a) * 23}
                r={1.9}
                fill={i <= state.lamp && state.lamp > 0 ? '#ffd75e' : '#6d787d'}
              />
            );
          })}
          <line
            x1={83}
            y1={544}
            x2={83 + Math.cos(((-120 + state.lamp * 80) * Math.PI) / 180) * 13}
            y2={544 + Math.sin(((-120 + state.lamp * 80) * Math.PI) / 180) * 13}
            stroke="#ffd75e"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <circle className="focus" cx={83} cy={544} r={27} fill="none" />
        </g>
        <Stencil x={83} y={584} text={`LAMP · ${(LAMPS[state.lamp] ?? 'off').toUpperCase()}`} size={9.5} />

        {/* the arm */}
        <path
          d="M225,513 C219,428 219,270 227,212 C233,170 245,154 267,150 L281,150 C281,188 267,202 261,224 C253,252 247,428 253,513 Z"
          fill="url(#cd-metal)"
          stroke="#4c5458"
        />

        {/* the stage, its clips and whatever is clipped to it */}
        <rect x={61} y={STAGE_Y} width={200} height={20} rx={3} fill="#39413f" stroke="#20262a" />
        <rect x={61} y={STAGE_Y} width={200} height={5} fill="#525c59" />
        <circle cx={TUBE_X} cy={STAGE_Y + 10} r={9} fill="#0d1113" />
        {slide ? (
          <g>
            <rect
              x={93}
              y={STAGE_Y - 10}
              width={134}
              height={10}
              rx={1.5}
              fill={slide.broken ? 'rgba(217,63,69,.35)' : 'rgba(214,238,246,.5)'}
              stroke="#cfe3ea"
              strokeWidth={0.8}
            />
            <rect x={93} y={STAGE_Y - 10} width={30} height={10} fill="#e9e3d4" opacity={0.9} />
            <text x={108} y={STAGE_Y - 2.5} fontSize={7.5} textAnchor="middle" fill="#2b2b2b" fontFamily={LABEL_FONT} fontWeight={700}>
              {slide.n}
            </text>
            <rect x={135} y={STAGE_Y - 10} width={34} height={10} fill="rgba(255,255,255,.25)" stroke="#eaf4f8" strokeWidth={0.6} />
            {slide.broken ? (
              <path
                d={`M95,${STAGE_Y - 10} L121,${STAGE_Y} M145,${STAGE_Y - 10} L133,${STAGE_Y} M171,${STAGE_Y - 9} L189,${STAGE_Y} M207,${STAGE_Y - 10} L197,${STAGE_Y}`}
                stroke="#ff8f8a"
                strokeWidth={1.1}
              />
            ) : null}
          </g>
        ) : null}
        <path d={`M95,${STAGE_Y - 12} h22 v4 h-18 v6 h-4 z`} fill="#b9c4c9" />
        <path d={`M225,${STAGE_Y - 12} h-22 v4 h18 v6 h4 z`} fill="#b9c4c9" />

        {/* the mechanical stage */}
        <rect x={69} y={404} width={52} height={44} rx={8} fill="#2e3639" stroke="#4c5458" />
        {(
          [
            ['u', '95,407 86,419 104,419', 'up'],
            ['d', '95,445 86,433 104,433', 'down'],
            ['l', '73,426 85,418 85,434', 'left'],
            ['r', '117,426 105,418 105,434', 'right'],
          ] as const
        ).map(([dir, points, word]) => (
          <g
            key={dir}
            data-hot=""
            data-mv={dir}
            className={pulse.includes('move') ? 'pulse' : ''}
            tabIndex={0}
            role="button"
            aria-label={`Move the field of view ${word}`}
          >
            <polygon points={points} fill="#8d989d" stroke="#4c5458" strokeWidth={0.8} />
            <polygon className="focus" points={points} fill="none" />
          </g>
        ))}
        <circle cx={95} cy={426} r={3} fill="#5c666b" />
        <Stencil x={95} y={464} text="MECHANICAL STAGE" size={9} />

        {/* the adjustments */}
        <Knob cx={271} cy={308} r={27} knob="coarse" name="Coarse" h={h} pulse={pulse.includes('rack:coarse')} />
        <Stencil x={271} y={348} text="COARSE" size={9} />
        <Knob cx={271} cy={380} r={17} knob="fine" name="Fine" h={h} pulse={pulse.includes('rack:fine')} />
        <Stencil x={271} y={408} text="FINE" size={9} />

        {/*
          THE BODY TUBE. Everything on it — the tube, the eyepiece, the
          nosepiece and both barrels — is drawn once at the tube-up datum and
          the whole assembly is racked down by `h`, which is exactly what a rack
          and pinion does to it. One transform rather than `h` added into a
          dozen coordinates, and `TRACK_CLASS` carries the step between one
          value of `h` and the next, so a press of the coarse knob is seen to
          drive the tube eight units towards the slide rather than to teleport
          it there. The height is the model's; nothing here invents it.
        */}
        <g className={TRACK_CLASS} transform={`translate(0 ${h})`}>
          <rect x={171} y={158} width={62} height={26} rx={5} fill="url(#cd-metal)" stroke="#4c5458" />
          <rect x={133} y={128} width={34} height={88} rx={4} fill="url(#cd-metalv)" stroke="#4c5458" />
          <rect x={127} y={92} width={46} height={38} rx={5} fill="url(#cd-barrel)" />
          <ellipse cx={TUBE_X} cy={92} rx={25} ry={6} fill="#2c3438" stroke="#8fa0ab" strokeWidth={1} />
          <ellipse cx={TUBE_X} cy={92} rx={15} ry={3.6} fill="#0e1416" />
          <Stencil x={187} y={112} text="EYEPIECE 10×" anchor="start" size={9} />

          <path
            d={`M116,${NOSE_0 - 16} h68 a6,6 0 0 1 6,6 v10 a6,6 0 0 1 -6,6 h-68 a6,6 0 0 1 -6,-6 v-10 a6,6 0 0 1 6,-6 z`}
            fill="url(#cd-metal)"
            stroke="#4c5458"
          />
          <g transform={`translate(${TUBE_X},${NOSE_0}) rotate(-58)`}>
            <Barrel objective={idle} />
          </g>
          <g transform={`translate(${TUBE_X},${NOSE_0})`}>
            <Barrel objective={state.objective} />
          </g>
        </g>

        {OBJECTIVE_VALUES.map((o, i) => {
          const y = 469 + i * 26;
          const on = state.objective === o;
          return (
            <g
              key={o}
              data-hot=""
              data-obj={o}
              className={pulse.includes(`obj:${o}`) ? 'pulse' : ''}
              tabIndex={0}
              role="button"
              aria-pressed={on}
              aria-label={`Swing in the ${o}× objective`}
            >
              <rect
                x={302}
                y={y - 14}
                width={94}
                height={22}
                rx={7}
                fill={on ? 'rgba(143,208,255,.22)' : 'rgba(255,255,255,.05)'}
                stroke={on ? apparatus.hintRing : 'rgba(255,255,255,.16)'}
              />
              <circle cx={314} cy={y - 3} r={4} fill={o === 10 ? '#e8c53f' : '#3f7fe8'} />
              <text x={325} y={y + 1} fontSize={10.5} fill="#dbe6e3" fontFamily={LABEL_FONT} fontWeight={600}>
                {o}× objective
              </text>
              <rect className="focus" x={298} y={y - 18} width={102} height={30} rx={9} fill="none" />
            </g>
          );
        })}
        <Stencil x={349} y={512} text="NOSEPIECE" size={9} />

        {/* --- through the eyepiece --- */}
        <FieldOfView state={state} cx={EYE.cx} cy={EYE.cy} R={EYE.R} uid={uid} showPins={showPins} activePin={activePin} />
        {/*
          THE FIELD IS A CONTROL, not a picture — and until now it had no
          accessible name at all, so to a screen reader the one thing on this
          bench a student spends the practical looking at did not exist. It is a
          button in the tab order; pressing a point brings it to the centre, the
          arrow keys drive the stage a step at a time, and dragging still moves
          the image under the hand.
        */}
        <g
          data-hot=""
          data-field=""
          tabIndex={0}
          role="button"
          aria-label={`The field of view — ${caption}. Press a point to bring it to the centre of the field, drag the image to drive the mechanical stage, or use the arrow keys.`}
        >
          <circle cx={EYE.cx} cy={EYE.cy} r={EYE.R} fill="rgba(0,0,0,0)" />
          <circle className="focus" cx={EYE.cx} cy={EYE.cy} r={EYE.R + 6} fill="none" />
        </g>
        <text
          x={EYE.cx}
          y={432}
          fontSize={12.5}
          textAnchor="middle"
          fill={apparatus.benchInk}
          fontFamily={LABEL_FONT}
          fontWeight={600}
        >
          {caption}
        </text>
        <Meter x={560} label="SHARPNESS" value={v.sharp} />
        <Meter x={700} label="IN THE FIELD" value={v.f} />
        <Meter x={840} label="LIGHT" value={v.light} />

        {/* --- the box of slides --- */}
        <Stencil x={EYE.cx} y={486} text="BOX OF PREPARED SLIDES — EACH LABELLED ONLY BY A NUMBER" size={9.5} />
        <rect x={392} y={492} width={604} height={122} rx={10} fill="url(#cd-tray)" stroke="#4a423a" />
        <rect x={392} y={492} width={604} height={14} rx={7} fill="#4a423a" />
        {state.tray.map((s, i) => {
          const x = BOX_X[i]!;
          const on = state.mounted === i;
          const done = s.broken || Boolean(s.org && s.proc && s.labels.every((l) => l));
          return (
            <g
              key={s.n}
              data-hot=""
              data-slide={i}
              className={[on ? 'sel' : '', pulse.includes(`slide:${i}`) ? 'pulse' : ''].join(' ').trim()}
              tabIndex={0}
              role="button"
              aria-pressed={on}
              aria-label={`Prepared slide ${s.n}${s.broken ? ', cracked' : on ? ', on the stage' : ''}`}
            >
              <rect x={x - 4} y={BOX_Y - 4} width={BOX_W + 8} height={BOX_H + 8} rx={4} fill="rgba(0,0,0,.35)" />
              {on ? (
                <>
                  <rect
                    x={x}
                    y={BOX_Y}
                    width={BOX_W}
                    height={BOX_H}
                    rx={2}
                    fill="none"
                    stroke="rgba(255,255,255,.2)"
                    strokeDasharray="4 3"
                  />
                  <text x={x + BOX_W / 2} y={BOX_Y + 48} fontSize={9} textAnchor="middle" fill={apparatus.hintRing} fontFamily={LABEL_FONT} fontWeight={600}>
                    ON THE
                  </text>
                  <text x={x + BOX_W / 2} y={BOX_Y + 60} fontSize={9} textAnchor="middle" fill={apparatus.hintRing} fontFamily={LABEL_FONT} fontWeight={600}>
                    STAGE
                  </text>
                </>
              ) : (
                <>
                  <rect
                    x={x}
                    y={BOX_Y}
                    width={BOX_W}
                    height={BOX_H}
                    rx={2}
                    fill={s.broken ? 'rgba(217,63,69,.18)' : 'rgba(214,238,246,.16)'}
                    stroke={s.broken ? '#ff8f8a' : '#9fc3d0'}
                    strokeWidth={0.9}
                  />
                  <rect x={x} y={BOX_Y} width={BOX_W} height={28} fill="#e9e3d4" opacity={0.92} />
                  <text x={x + BOX_W / 2} y={BOX_Y + 21} fontSize={17} textAnchor="middle" fill="#2b2b2b" fontFamily={LABEL_FONT} fontWeight={700}>
                    {s.n}
                  </text>
                  <rect x={x + 26} y={BOX_Y + 44} width={36} height={36} fill="rgba(255,255,255,.2)" stroke="#eaf4f8" strokeWidth={0.7} />
                  <circle cx={x + 44} cy={BOX_Y + 62} r={4.5} fill="#b98ba4" opacity={0.55} />
                  {s.broken ? (
                    <>
                      <path
                        d={`M${x},${BOX_Y + 10} L${x + 30},${BOX_Y + 54} L${x + 16},${BOX_Y + BOX_H} M${x + 30},${BOX_Y + 54} L${x + BOX_W},${BOX_Y + 80} M${x + 30},${BOX_Y + 54} L${x + 58},${BOX_Y}`}
                        stroke="#ff8f8a"
                        strokeWidth={1.3}
                        fill="none"
                      />
                      <text x={x + BOX_W / 2} y={BOX_Y + 96} fontSize={8.5} textAnchor="middle" fill="#ff8f8a" fontFamily={LABEL_FONT} fontWeight={700}>
                        CRACKED
                      </text>
                    </>
                  ) : null}
                </>
              )}
              {done && !s.broken ? (
                <>
                  <circle cx={x + BOX_W - 9} cy={BOX_Y + 9} r={7} fill="#1f9d55" />
                  <path d={`M${x + BOX_W - 12},${BOX_Y + 9} l2.2,2.4 4.2,-4.6`} stroke="#fff" strokeWidth={1.6} fill="none" />
                </>
              ) : null}
              <rect className="focus" x={x - 6} y={BOX_Y - 6} width={BOX_W + 12} height={BOX_H + 12} rx={6} fill="none" />
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

/** The one line under the apparatus: what the instrument is set to right now. */
export function instrumentLine(state: CellDivisionState): string {
  const slide = state.mounted === null ? null : state.tray[state.mounted];
  const plane = focalPlane(state.objective) + (slide && !slide.broken ? slide.dz : 0);
  return (
    `Objective ${state.objective}× · lamp ${LAMPS[state.lamp]} · tube ${state.h} ` +
    `(this slide comes into focus at ${plane}) · clearance ${clearance(state.objective, state.h)} · ` +
    (slide ? `slide ${slide.n} on the stage${slide.broken ? ' — cracked' : ''}` : 'no slide on the stage')
  );
}
