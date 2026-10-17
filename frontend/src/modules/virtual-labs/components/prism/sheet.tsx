'use client';

import * as React from 'react';
import Box from '@mui/material/Box';

import {
  IMAX,
  IMIN,
  aimFromPoint,
  atMinimum,
  demoRay,
  insideSegment,
  type DemoRay,
} from '@labs/lib/prism/demo';
import {
  APEX,
  BOARD,
  CENT,
  DEG,
  FACE,
  GHOST,
  PAPER,
  PR,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  SPECTRUM,
  V,
  clipSeg,
  criticalAngle,
  inPaper,
  insidePrism,
  trace,
  vadd,
  vdot,
  vlen,
  vmul,
  vnorm,
  vsub,
  type Vec,
} from '@labs/lib/prism/optics';
import { STEP } from '@labs/lib/prism/marking';
import {
  currentTrial,
  glassDown,
  measureGeometry,
  type PrismState,
  type Trial,
} from '@labs/lib/prism/state';

import { apparatus, LABEL_FONT } from '../apparatus-palette';
import { benchMotionSx, flowClass, motionSx, useBenchMotion } from '../bench-motion';

import { ProtractorFace } from './protractor';

/**
 * The drawing board, seen from above: a sheet of paper, a 60° glass prism, the
 * pins stuck through the paper, the pencil trace, and the protractor when one
 * is laid down.
 *
 * Nothing about a ray is drawn for effect. The incident ray is the line through
 * the two pins the student actually stuck in; where it meets the glass, what
 * happens inside, and where the images of those pins appear through face AC all
 * come out of the tracer in `@labs/lib/prism/optics.ts`. Sight the last two pins
 * a degree off the images and the line drawn here is a degree off — and every
 * angle measured from it afterwards is wrong in exactly that way.
 *
 * A pin goes in by tapping the paper, and can be dragged afterwards; with the
 * keyboard the crosshair moves on the arrow keys and Enter sticks the pin in,
 * which is the same pair of gestures as the Ohm's law rheostat slider.
 */

/**
 * Pencil, ink and pin colours. Like `apparatus-palette`, these depict real
 * objects rather than interface: graphite is graphite in every grade band, and
 * a student recognises the blue normal and the red incident pins by exactly
 * these colours on the sheet in front of them.
 */
export const SHEET = {
  pencil: '#22282f',
  normal: '#1668b8',
  produced: '#98a3ad',
  angle: '#b0620b',
  ghost: '#5b6fd0',
  pinIn: '#c0392b',
  pinOut: '#1f6fb2',
  inside: '#c0392b',

  // The ray box's light. Only the demonstration uses these: a real bench shows
  // the student nothing of the sort.
  beam: '#f4341f',
  spark: '#fff3c4',
  refracted: '#1d7a3c',
  trapped: '#a3260f',
  symmetric: '#0d7a3c',
} as const;

export interface SheetProps {
  state: PrismState;
  /** Parts a tour step is pointing at: `prism`, `pins`, `protractor`. */
  pulse: readonly string[];
  onSvg: (el: SVGSVGElement | null) => void;
  onTraceOutline: () => void;
  onCross: (x: number, y: number) => void;
  onPlacePin: (x: number, y: number) => void;
  onMovePin: (index: number, x: number, y: number) => void;
  onPullPin: (index: number) => void;
  onProtractor: (deg: number) => void;
  onCommit: () => void;
  /**
   * Where the demonstration ray box is aimed. `quiet` while it is being dragged,
   * so the assistant is not re-writing its line sixty times a second.
   */
  onAim: (i: number, quiet: boolean) => void;
  fill?: boolean;
}

export function PrismSheet({
  state,
  pulse,
  onSvg,
  onTraceOutline,
  onCross,
  onPlacePin,
  onMovePin,
  onPullPin,
  onProtractor,
  onCommit,
  onAim,
  fill = false,
}: SheetProps): React.ReactElement {
  const moving = useBenchMotion();
  const gid = `p${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const svg = React.useRef<SVGSVGElement | null>(null);
  /** What the pointer is doing: laying a new pin, moving one, reading, or aiming. */
  const drag = React.useRef<{ kind: 'place' | 'pin' | 'prot' | 'ray'; index: number } | null>(null);
  const at = React.useRef<Vec>(V(state.cx, state.cy));

  const setSvg = React.useCallback(
    (el: SVGSVGElement | null) => {
      svg.current = el;
      onSvg(el);
    },
    [onSvg],
  );

  const toSheet = (e: { clientX: number; clientY: number }): Vec | null => {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return V(p.x, p.y);
  };

  const t = currentTrial(state);
  const geom = measureGeometry(state);
  const pinning = state.tool === 'pin' && !t.traced;
  const sel = state.trials[state.sel] ?? t;
  // One trace, shared by the beam on the paper and by the box that throws it.
  const beam = state.demo.on ? demoRay(state.demo.i, state.n) : null;

  const readProtractor = (p: Vec): void => {
    if (!geom) return;
    const v = vsub(p, geom.c);
    // Too close to the centre and the angle is meaningless — as on the real
    // instrument, you read it out at the scale.
    if (vlen(v) < 12) return;
    onProtractor(Math.round(angleFrom(geom.ref, geom.target, v)));
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    const el = e.target as Element;
    const p = toSheet(e);
    if (!p) return;
    at.current = p;

    const pin = el.closest('[data-pin]')?.getAttribute('data-pin');
    if (pin !== null && pin !== undefined) {
      drag.current = { kind: 'pin', index: Number(pin) };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (el.closest('[data-ray]')) {
      drag.current = { kind: 'ray', index: -1 };
      onAim(aimFromPoint(p), true);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (el.closest('[data-prot]') && geom) {
      drag.current = { kind: 'prot', index: -1 };
      readProtractor(p);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (el.closest('[data-paper]') && pinning) {
      drag.current = { kind: 'place', index: -1 };
      onCross(p.x, p.y);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const held = drag.current;
    if (!held) return;
    const p = toSheet(e);
    if (!p) return;
    at.current = p;
    if (held.kind === 'place') onCross(p.x, p.y);
    else if (held.kind === 'pin') onMovePin(held.index, p.x, p.y);
    else if (held.kind === 'ray') onAim(aimFromPoint(p), true);
    else readProtractor(p);
  };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>): void => {
    const held = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (held?.kind === 'place') onPlacePin(at.current.x, at.current.y);
    // Let go of the box and the assistant works the angles through for you.
    if (held?.kind === 'ray') onAim(aimFromPoint(at.current), false);
  };

  const onClick = (e: React.MouseEvent<SVGSVGElement>): void => {
    if ((e.target as Element).closest('[data-prism]')) onTraceOutline();
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>): void => {
    const el = e.target as Element;
    const pin = el.closest('[data-pin]')?.getAttribute('data-pin');

    if (pin !== null && pin !== undefined) {
      const index = Number(pin);
      const p = state.trials[state.trial]?.pins[index];
      if (!p) return;
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const d = e.shiftKey ? 2 : 10;
        onMovePin(
          index,
          p.x + (e.key === 'ArrowRight' ? d : e.key === 'ArrowLeft' ? -d : 0),
          p.y + (e.key === 'ArrowDown' ? d : e.key === 'ArrowUp' ? -d : 0),
        );
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onPullPin(index);
      }
      return;
    }

    if (el.closest('[data-ray]')) {
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) * (e.shiftKey ? 5 : 1);
        onAim(state.demo.i + step, false);
      }
      return;
    }

    if (el.closest('[data-prot]') && geom) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        onProtractor(state.prov + (e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : -step));
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onCommit();
      }
      return;
    }

    if (el.closest('[data-paper]')) {
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const d = e.shiftKey ? 2 : 10;
        onCross(
          state.cx + (e.key === 'ArrowRight' ? d : e.key === 'ArrowLeft' ? -d : 0),
          state.cy + (e.key === 'ArrowDown' ? d : e.key === 'ArrowUp' ? -d : 0),
        );
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && pinning) {
        e.preventDefault();
        onPlacePin(state.cx, state.cy);
      }
      return;
    }

    if (el.closest('[data-prism]') && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onTraceOutline();
    }
  };

  return (
    <Box
      sx={{
        position: 'relative',
        ...(fill ? { flex: 1, minWidth: 0, minHeight: 0, display: 'flex' } : null),
        userSelect: 'none',
        WebkitUserSelect: 'none',
        '& .hot': { outline: 'none' },
        '& .hot .focus': { transition: 'stroke .15s' },
        '& .hot:focus-visible .focus': { stroke: apparatus.hintRing, strokeWidth: 3 },
        // The hint ring, the light running along a ray, and the reduced-motion
        // guard over both — one definition, shared with the other optics benches.
        // `benchMotionSx` first for the rules that move, `motionSx` last so an
        // administrator's `animation: false` settles them — the same code path
        // reduced motion takes.
        ...benchMotionSx,
        ...motionSx(moving),
      }}
    >
      <svg
        ref={setSvg}
        viewBox={`0 0 ${SHEET_WIDTH} ${SHEET_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Drawing board seen from above: a sheet of paper with a 60° glass prism on it, the pins, the pencil trace and the protractor"
        style={
          fill
            ? { display: 'block', width: '100%', height: '100%', touchAction: 'none' }
            : { display: 'block', width: '100%', height: 'auto', touchAction: 'none' }
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <defs>
          <radialGradient id={`${gid}lamp`} cx="45%" cy="34%" r="78%">
            <stop offset="0" stopColor="#2b3533" />
            <stop offset=".6" stopColor="#1b2221" />
            <stop offset="1" stopColor="#121817" />
          </radialGradient>
          <linearGradient id={`${gid}wood`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9a6d3e" />
            <stop offset="1" stopColor="#6c4826" />
          </linearGradient>
          <linearGradient id={`${gid}sheet`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbf9f3" />
            <stop offset="1" stopColor="#eee9dc" />
          </linearGradient>
          <linearGradient id={`${gid}glass`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#cfe9f6" stopOpacity=".62" />
            <stop offset=".55" stopColor="#a3c9de" stopOpacity=".42" />
            <stop offset="1" stopColor="#d9eef8" stopOpacity=".58" />
          </linearGradient>
          <clipPath id={`${gid}paper`}>
            <rect x={PAPER.x} y={PAPER.y} width={PAPER.w} height={PAPER.h} />
          </clipPath>
        </defs>

        <rect width={SHEET_WIDTH} height={SHEET_HEIGHT} fill={`url(#${gid}lamp)`} />
        <rect x={BOARD.x} y={BOARD.y} width={BOARD.w} height={BOARD.h} rx={8} fill={`url(#${gid}wood)`} />
        <rect x={PAPER.x} y={PAPER.y} width={PAPER.w} height={PAPER.h} fill={`url(#${gid}sheet)`} />

        <g clipPath={`url(#${gid}paper)`}>
          {state.trials.map((trial) => (
            <RayTrace
              key={trial.k}
              t={trial}
              active={trial.k === state.sel || (!state.graded && trial.k === state.trial)}
            />
          ))}
          {state.white ? <Spectrum state={state} /> : null}
          <Ghosts state={state} />
          <Prism outline={state.outline} glass={glassDown(state)} />
          {beam ? <DemoBeam r={beam} n={state.n} /> : null}
          {state.trials.map((trial) =>
            trial.pins.map((p, k) => (
              <Pin
                key={`${trial.k}-${k}`}
                p={p}
                k={k}
                faded={trial.k !== state.trial || trial.traced}
              />
            )),
          )}
          {pinning ? <Crosshair x={state.cx} y={state.cy} /> : null}
        </g>

        {/* Hit targets, outside the clip so a focus ring is never cut in half */}
        <rect
          data-paper=""
          data-tour="prism-paper"
          className="hot"
          x={PAPER.x}
          y={PAPER.y}
          width={PAPER.w}
          height={PAPER.h}
          fill="rgba(0,0,0,0)"
          tabIndex={0}
          role="button"
          aria-label={
            pinning
              ? 'Drawing paper — tap to fix a pin. With the keyboard: arrow keys move the crosshair, Enter fixes a pin.'
              : 'Drawing paper'
          }
          style={{ cursor: pinning ? 'crosshair' : 'default' }}
        />

        {glassDown(state) ? (
          <g
            data-prism=""
            className={`hot${pulse.includes('prism') ? ' pulse' : ''}`}
            tabIndex={0}
            role="button"
            style={{ cursor: 'pointer' }}
            aria-label={
              state.outline
                ? 'Glass prism, outline already traced'
                : 'Glass prism — tap to pin it down and trace its outline on the paper'
            }
          >
            <polygon
              className="focus"
              points={`${PR.A.x},${PR.A.y} ${PR.B.x},${PR.B.y} ${PR.C.x},${PR.C.y}`}
              fill="rgba(0,0,0,0)"
              stroke="transparent"
              strokeWidth={2}
            />
          </g>
        ) : null}

        {/* The ray box, outside the clip so that neither it nor its focus ring
            is cut in half at the edge of the paper. Inert while a pin is in the
            hand: the paper must win that tap, or the box swallows it. */}
        {beam ? (
          <g
            data-ray=""
            data-tour="prism-raybox"
            className={`hot${pulse.includes('raybox') ? ' pulse' : ''}`}
            tabIndex={pinning ? -1 : 0}
            role="slider"
            style={{ cursor: 'grab', pointerEvents: pinning ? 'none' : undefined }}
            aria-label="Ray box — drag it round the prism, or use the arrow keys, to change the angle of incidence. A demonstration; nothing here is marked."
            aria-valuemin={IMIN}
            aria-valuemax={IMAX}
            aria-valuenow={Math.round(beam.i)}
            aria-valuetext={`${beam.i.toFixed(1)} degrees`}
          >
            <RayBoxArt r={beam} />
          </g>
        ) : null}

        {state.trials.map((trial) =>
          trial.k === state.trial && !trial.traced && !state.graded
            ? trial.pins.map((p, k) => (
                <g
                  key={`hot-${k}`}
                  data-pin={k}
                  className="hot"
                  tabIndex={0}
                  role="button"
                  style={{ cursor: 'grab' }}
                  aria-label={`Pin P${k + 1} — drag it, nudge it with the arrow keys, or press Delete to pull it out`}
                >
                  <circle
                    className="focus"
                    cx={p.x}
                    cy={p.y}
                    r={11}
                    fill="rgba(0,0,0,0)"
                    stroke="transparent"
                    strokeWidth={2}
                  />
                </g>
              ))
            : null,
        )}

        {geom ? (
          <g
            data-prot=""
            data-tour="prism-protractor"
            className={`hot${pulse.includes('protractor') ? ' pulse' : ''}`}
            tabIndex={0}
            role="slider"
            style={{ cursor: 'pointer' }}
            aria-label={`Protractor on the paper, measuring ${geom.what} — drag the pointer to where the ${geom.rayName} crosses the scale, or use the arrow keys, then press Enter to record`}
            aria-valuemin={0}
            aria-valuemax={180}
            aria-valuenow={state.prov}
            aria-valuetext={`${state.prov} degrees`}
          >
            <ProtractorFace
              c={geom.c}
              ref0={geom.ref}
              target={geom.target}
              radius={124}
              value={state.prov}
              labelEvery={10}
            />
          </g>
        ) : null}

        <text
          x={SHEET_WIDTH / 2}
          y={SHEET_HEIGHT - 8}
          fontSize={11}
          textAnchor="middle"
          fill={apparatus.benchLabel}
          fontFamily={LABEL_FONT}
          fontWeight={600}
          letterSpacing={1.4}
          pointerEvents="none"
        >
          {sel.traced
            ? 'EVERY ANGLE IS MEASURED FROM YOUR OWN PENCIL TRACE'
            : `DRAWING BOARD · EQUILATERAL PRISM, A = ${APEX}°`}
        </text>
      </svg>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Pieces of the drawing
// ---------------------------------------------------------------------------

/** The angle of a direction from the protractor's baseline, 0–180. */
function angleFrom(ref: Vec, target: Vec, v: Vec): number {
  const side = Math.sign(ref.x * target.y - ref.y * target.x) || 1;
  const a = Math.atan2(side * (ref.x * v.y - ref.y * v.x), ref.x * v.x + ref.y * v.y) * DEG;
  return Math.max(0, Math.min(180, a));
}

function Ink({
  a,
  b,
  stroke,
  width,
  dash,
  opacity,
  className,
}: {
  a: Vec;
  b: Vec;
  stroke: string;
  width: number;
  dash?: string;
  opacity?: number;
  /** `flowClass()` when this stroke is light rather than a pencil line. */
  className?: string;
}): React.ReactElement | null {
  const c = clipSeg(a, b);
  if (!c) return null;
  return (
    <line
      className={className}
      x1={c[0].x}
      y1={c[0].y}
      x2={c[1].x}
      y2={c[1].y}
      stroke={stroke}
      strokeWidth={width}
      strokeDasharray={dash}
      strokeLinecap="round"
      opacity={opacity}
    />
  );
}

function Ticked({
  x,
  y,
  children,
  fill,
  size = 11,
  anchor = 'middle',
  weight = 600,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  fill: string;
  size?: number;
  anchor?: 'start' | 'middle' | 'end';
  weight?: number;
}): React.ReactElement {
  return (
    <text x={x} y={y} fontSize={size} textAnchor={anchor} fill={fill} fontFamily={LABEL_FONT} fontWeight={weight}>
      {children}
    </text>
  );
}

/** A small arc between two directions, as it is drawn for i, e and D. */
function Arc({
  c,
  from,
  to,
  r,
  colour,
  label,
}: {
  c: Vec;
  from: Vec;
  to: Vec;
  r: number;
  colour: string;
  label: string;
}): React.ReactElement {
  const a0 = Math.atan2(from.y, from.x);
  const a1 = Math.atan2(to.y, to.x);
  let dA = a1 - a0;
  while (dA > Math.PI) dA -= 2 * Math.PI;
  while (dA < -Math.PI) dA += 2 * Math.PI;
  const pts: string[] = [];
  for (let k = 0; k <= 24; k += 1) {
    const a = a0 + (dA * k) / 24;
    pts.push(`${(c.x + r * Math.cos(a)).toFixed(1)},${(c.y + r * Math.sin(a)).toFixed(1)}`);
  }
  const am = a0 + dA / 2;
  return (
    <g>
      <polyline points={pts.join(' ')} fill="none" stroke={colour} strokeWidth={1.6} />
      <Ticked x={c.x + (r + 12) * Math.cos(am)} y={c.y + (r + 12) * Math.sin(am) + 4} fill={colour} size={12.5}>
        {label}
      </Ticked>
    </g>
  );
}

function Prism({ outline, glass }: { outline: boolean; glass: boolean }): React.ReactElement {
  const poly = `${PR.A.x},${PR.A.y} ${PR.B.x},${PR.B.y} ${PR.C.x},${PR.C.y}`;
  return (
    <g pointerEvents="none">
      {outline ? (
        <g>
          <polygon points={poly} fill="none" stroke={SHEET.pencil} strokeWidth={1.7} strokeLinejoin="round" opacity={0.85} />
          <Ticked x={PR.A.x} y={PR.A.y - 10} fill={SHEET.pencil} size={13}>
            A
          </Ticked>
          <Ticked x={PR.B.x - 14} y={PR.B.y + 16} fill={SHEET.pencil} size={13}>
            B
          </Ticked>
          <Ticked x={PR.C.x + 14} y={PR.C.y + 16} fill={SHEET.pencil} size={13}>
            C
          </Ticked>
          <Ticked x={PR.A.x - 32} y={PR.A.y + 44} fill={SHEET.pencil} size={10} weight={500}>
            A = {APEX}°
          </Ticked>
        </g>
      ) : null}
      {glass ? (
        <g>
          <polygon points={poly} fill="rgba(196,228,244,.52)" stroke="#f0fbff" strokeWidth={2} strokeLinejoin="round" />
          <polygon points={poly} fill="none" stroke="#3c5666" strokeWidth={0.8} strokeLinejoin="round" opacity={0.55} />
          <path
            d={`M${PR.A.x - 6} ${PR.A.y + 26} L${PR.B.x + 16} ${PR.B.y - 18}`}
            stroke="#ffffff"
            strokeWidth={3}
            opacity={0.5}
            strokeLinecap="round"
          />
          <path
            d={`M${PR.A.x + 10} ${PR.A.y + 34} L${PR.C.x - 22} ${PR.C.y - 24}`}
            stroke="#ffffff"
            strokeWidth={2}
            opacity={0.32}
            strokeLinecap="round"
          />
        </g>
      ) : null}
    </g>
  );
}

/**
 * A pencil trace as it would really be drawn: lines only as long as the pins
 * that justify them, with the construction lines shown for the ray in hand.
 */
function RayTrace({ t, active }: { t: Trial; active: boolean }): React.ReactElement | null {
  if (!t.pins.length && !t.P) return null;
  const bits: React.ReactNode[] = [];

  if (t.P && t.dinc) {
    const reach = Math.max(...t.pins.slice(0, 2).map((p) => vlen(vsub(p, t.P!)))) + 46;
    const start = vsub(t.P, vmul(t.dinc, reach));
    bits.push(<Ink key="inc" a={start} b={t.P} stroke={SHEET.pencil} width={2.1} />);
    bits.push(<circle key="P" cx={t.P.x} cy={t.P.y} r={3} fill={SHEET.pencil} />);
    if (active) {
      bits.push(
        <Ink
          key="normP"
          a={vadd(t.P, vmul(FACE.AB.n, 96))}
          b={vadd(t.P, vmul(FACE.AB.n, -62))}
          stroke={SHEET.normal}
          width={1.4}
          dash="5 4"
        />,
      );
      bits.push(
        <Ticked
          key="N"
          x={t.P.x + FACE.AB.n.x * 108}
          y={t.P.y + FACE.AB.n.y * 108 + 4}
          fill={SHEET.normal}
          size={11.5}
        >
          N
        </Ticked>,
      );
      bits.push(
        <Ticked key="Plab" x={t.P.x - 8 + FACE.AB.d.x * 18} y={t.P.y + 4 + FACE.AB.d.y * 18} fill={SHEET.pencil} size={11.5}>
          P
        </Ticked>,
      );
      bits.push(
        <Ticked key="ray" x={start.x} y={start.y - 12} fill={SHEET.pencil} size={11.5} weight={700}>
          ray {t.k + 1}
        </Ticked>,
      );
    }
  }

  if (t.traced && t.Mp && t.demg && t.P && t.dinc) {
    const reach = Math.max(...t.pins.slice(2).map((p) => vlen(vsub(p, t.Mp!)))) + 46;
    bits.push(<Ink key="emg" a={t.Mp} b={vadd(t.Mp, vmul(t.demg, reach))} stroke={SHEET.pencil} width={2.1} />);
    bits.push(<Ink key="in" a={t.P} b={t.Mp} stroke={SHEET.pencil} width={1.6} dash="7 5" />);
    bits.push(<circle key="M" cx={t.Mp.x} cy={t.Mp.y} r={3} fill={SHEET.pencil} />);
    if (active) {
      bits.push(
        <Ink
          key="normM"
          a={vadd(t.Mp, vmul(FACE.AC.n, 96))}
          b={vadd(t.Mp, vmul(FACE.AC.n, -62))}
          stroke={SHEET.normal}
          width={1.4}
          dash="5 4"
        />,
      );
      bits.push(
        <Ticked key="Nd" x={t.Mp.x + FACE.AC.n.x * 108} y={t.Mp.y + FACE.AC.n.y * 108 + 4} fill={SHEET.normal} size={11.5}>
          N′
        </Ticked>,
      );
      bits.push(
        <Ticked key="Mlab" x={t.Mp.x + 16} y={t.Mp.y + 14} fill={SHEET.pencil} size={11.5}>
          M
        </Ticked>,
      );
      if (t.X) {
        bits.push(
          <Ink
            key="prod1"
            a={t.P}
            b={vadd(t.P, vmul(t.dinc, vlen(vsub(t.X, t.P)) + 74))}
            stroke={SHEET.produced}
            width={1.5}
            dash="6 5"
          />,
        );
        bits.push(
          <Ink
            key="prod2"
            a={t.Mp}
            b={vadd(t.Mp, vmul(t.demg, -(vlen(vsub(t.X, t.Mp)) + 16)))}
            stroke={SHEET.produced}
            width={1.5}
            dash="6 5"
          />,
        );
        bits.push(<Arc key="D" c={t.X} from={t.dinc} to={t.demg} r={44} colour={SHEET.angle} label="D" />);
        bits.push(<circle key="Xdot" cx={t.X.x} cy={t.X.y} r={2.6} fill={SHEET.angle} />);
      }
      bits.push(<Arc key="i" c={t.P} from={FACE.AB.n} to={vmul(t.dinc, -1)} r={36} colour={SHEET.angle} label="i" />);
      bits.push(<Arc key="e" c={t.Mp} from={FACE.AC.n} to={t.demg} r={36} colour={SHEET.angle} label="e" />);
    }
  }

  // "Show me what happened inside", after total internal reflection.
  if (active && t.reveal && t.phys) {
    t.phys.segs.forEach((g, k) =>
      g.inside
        ? bits.push(<Ink key={`in-${k}`} a={g.a} b={g.b} stroke={SHEET.inside} width={1.8} dash="4 4" />)
        : null,
    );
    if (t.phys.exitFace) {
      bits.push(
        <Ink
          key="out"
          a={t.phys.exitPt}
          b={vadd(t.phys.exitPt, vmul(t.phys.exitDir, 260))}
          stroke={SHEET.inside}
          width={1.8}
          dash="4 4"
        />,
      );
    }
  }

  return (
    <g opacity={active ? 1 : 0.26} pointerEvents="none">
      {bits}
    </g>
  );
}

/** The images of P1 and P2 as they appear through face AC, while sighting. */
function Ghosts({ state }: { state: PrismState }): React.ReactElement | null {
  const t = currentTrial(state);
  const show =
    !state.graded &&
    state.step === STEP.trace &&
    t.P &&
    t.phys &&
    t.phys.exitFace &&
    t.pins.length >= 2 &&
    !t.traced;
  if (!show || !t.phys) return null;

  const M = t.phys.exitPt;
  const d = t.phys.exitDir;
  let perp = V(-d.y, d.x);
  if (vdot(perp, vsub(M, CENT)) < 0) perp = vmul(perp, -1);
  const cap = vadd(vadd(M, vmul(d, (GHOST[0] + GHOST[1]) / 2)), vmul(perp, 26));

  return (
    <g opacity={0.62} pointerEvents="none">
      {GHOST.map((dist, k) => {
        const p = vadd(M, vmul(d, dist));
        return (
          <g key={k}>
            <circle cx={p.x} cy={p.y} r={7} fill="none" stroke={SHEET.ghost} strokeWidth={1.4} strokeDasharray="3 3" />
            <circle cx={p.x} cy={p.y} r={2.4} fill={SHEET.ghost} />
            <Ticked x={p.x + 12} y={p.y - 9} fill={SHEET.ghost} size={10} anchor="start">
              P{k + 1}
            </Ticked>
          </g>
        );
      })}
      <Ticked x={cap.x} y={cap.y + 4} fill={SHEET.ghost} size={10}>
        images seen through the prism
      </Ticked>
    </g>
  );
}

/** The white-light demonstration: one ray per colour, and the card that catches them. */
function Spectrum({ state }: { state: PrismState }): React.ReactElement | null {
  const t = state.trials[state.sel] ?? currentTrial(state);
  if (!t.dinc || !t.P) return null;
  const start = vsub(t.P, vmul(t.dinc, 600));
  const cardX = PAPER.x + PAPER.w - 34;
  const rays: React.ReactNode[] = [];
  const caught: { y: number; colour: string }[] = [];

  SPECTRUM.forEach(([colour, dn], ci) => {
    const r = trace(start, t.dinc!, state.n + dn);
    r.segs.forEach((g, k) =>
      rays.push(<Ink key={`${ci}-${k}`} a={g.a} b={g.b} stroke={colour} width={g.inside ? 1.6 : 2.6} />),
    );
    if (r.exitFace && r.exitDir.x > 0.05) {
      caught.push({ y: r.exitPt.y + ((cardX - r.exitPt.x) / r.exitDir.x) * r.exitDir.y, colour });
    }
  });

  const onCard =
    caught.length === SPECTRUM.length &&
    caught.every((v) => v.y > PAPER.y + 20 && v.y < PAPER.y + PAPER.h - 20);
  const lo = onCard ? Math.min(...caught.map((v) => v.y)) : 0;
  const hi = onCard ? Math.max(...caught.map((v) => v.y)) : 0;
  const h = Math.max(hi - lo, 6);

  return (
    <g pointerEvents="none">
      <g opacity={0.88}>{rays}</g>
      {onCard ? (
        <g>
          <rect x={cardX - 13} y={lo - 16} width={26} height={h + 32} rx={3} fill="#fdfcf7" stroke="#c3bba6" />
          {caught.map((v, k) => (
            <rect key={k} x={cardX - 10} y={v.y - h / 12} width={20} height={h / 6 + 1.6} fill={v.colour} opacity={0.9} />
          ))}
          <Ticked x={cardX} y={lo - 22} fill="#6b6658" size={9.5} weight={700}>
            spectrum
          </Ticked>
        </g>
      ) : null}
    </g>
  );
}

// ---------------------------------------------------------------------------
// The demonstration: a ray box on the paper, and the light going through
// ---------------------------------------------------------------------------

/**
 * The light the ray box throws, drawn from the same tracer the student's own
 * pencil trace is marked against.
 *
 * Each stroke is drawn from where the light ENTERS it to where it leaves, in
 * the order it travels — in to the first face, across the glass, out of the
 * second — and the bright dashes run along it in that order, so the bend at
 * each face is watched happening rather than deduced from a static kink. Under
 * `prefers-reduced-motion` the dashes stop and the beam is still a beam.
 *
 * None of this is on a real bench, and none of it is marked.
 */
function DemoBeam({ r, n }: { r: DemoRay; n: number }): React.ReactElement {
  const bits: React.ReactNode[] = [];
  const inside = insideSegment(r);
  const inDir = inside ? vnorm(vsub(inside.b, inside.a)) : null;

  r.res.segs.forEach((g, k) => {
    bits.push(
      <Ink key={`beam${k}`} a={g.a} b={g.b} stroke={SHEET.beam} width={g.inside ? 2.8 : 3.4} opacity={0.85} />,
    );
    bits.push(
      <Ink key={`flow${k}`} a={g.a} b={g.b} stroke={SHEET.spark} width={1.7} className={flowClass()} />,
    );
  });

  if (r.P) {
    bits.push(
      <Ink
        key="normP"
        a={vadd(r.P, vmul(FACE.AB.n, 74))}
        b={vadd(r.P, vmul(FACE.AB.n, -52))}
        stroke={SHEET.normal}
        width={1.3}
        dash="5 4"
      />,
      <Ticked key="Nlab" x={r.P.x + FACE.AB.n.x * 86} y={r.P.y + FACE.AB.n.y * 86 + 4} fill={SHEET.normal} size={11}>
        N
      </Ticked>,
      <circle key="Pdot" cx={r.P.x} cy={r.P.y} r={3.4} fill={SHEET.beam} />,
      <Arc key="iArc" c={r.P} from={FACE.AB.n} to={vmul(r.d, -1)} r={46} colour={SHEET.angle} label={`i = ${r.i.toFixed(1)}°`} />,
    );
    if (inDir && r.r1 !== null) {
      bits.push(
        <Arc
          key="r1Arc"
          c={r.P}
          from={vmul(FACE.AB.n, -1)}
          to={inDir}
          r={21}
          colour={SHEET.refracted}
          label={`r₁ ${r.r1.toFixed(1)}°`}
        />,
      );
    }
  }

  if (r.clean && r.M && r.e !== null && r.D !== null) {
    bits.push(
      <Ink
        key="normM"
        a={vadd(r.M, vmul(FACE.AC.n, 74))}
        b={vadd(r.M, vmul(FACE.AC.n, -52))}
        stroke={SHEET.normal}
        width={1.3}
        dash="5 4"
      />,
      <Ticked key="Ndlab" x={r.M.x + FACE.AC.n.x * 86} y={r.M.y + FACE.AC.n.y * 86 + 4} fill={SHEET.normal} size={11}>
        N′
      </Ticked>,
      <circle key="Mdot" cx={r.M.x} cy={r.M.y} r={3.4} fill={SHEET.beam} />,
      <Arc key="eArc" c={r.M} from={FACE.AC.n} to={r.exitDir} r={40} colour={SHEET.angle} label={`e = ${r.e.toFixed(1)}°`} />,
    );
    if (inDir && r.r2 !== null) {
      bits.push(
        <Arc
          key="r2Arc"
          c={r.M}
          from={vmul(FACE.AC.n, -1)}
          to={vmul(inDir, -1)}
          r={21}
          colour={SHEET.refracted}
          label={`r₂ ${r.r2.toFixed(1)}°`}
        />,
      );
    }
    if (r.X && r.P) {
      const reach = vlen(vsub(r.X, r.P));
      bits.push(
        <Ink
          key="prodIn"
          a={r.P}
          b={vadd(r.P, vmul(r.d, reach + 126))}
          stroke={SHEET.produced}
          width={1.5}
          dash="7 5"
        />,
        <Ink
          key="prodOut"
          a={r.M}
          b={vsub(r.M, vmul(r.exitDir, vlen(vsub(r.X, r.M))))}
          stroke={SHEET.produced}
          width={1.5}
          dash="7 5"
        />,
        <circle key="Xdot" cx={r.X.x} cy={r.X.y} r={3} fill={SHEET.angle} />,
        <Arc
          key="Darc"
          c={r.X}
          from={r.d}
          to={r.exitDir}
          r={insidePrism(r.X) ? 150 : 112}
          colour={SHEET.angle}
          label={`D = ${r.D.toFixed(1)}°`}
        />,
      );
    }
    // At the minimum the ray inside lies along the base. That is the classic
    // figure, and it is the whole content of "i = e at the bottom of the curve".
    if (atMinimum(r) && inside) {
      const mid = vmul(vadd(inside.a, inside.b), 0.5);
      bits.push(
        <Ink key="minGlow" a={inside.a} b={inside.b} stroke={SHEET.symmetric} width={7} opacity={0.3} />,
        <Ink
          key="minBase"
          a={V(PR.B.x + 8, mid.y)}
          b={V(PR.C.x - 8, mid.y)}
          stroke={SHEET.symmetric}
          width={1.3}
          dash="4 4"
        />,
        <Ticked key="minCap" x={CENT.x} y={PR.B.y + 22} fill={SHEET.symmetric} size={10.5} weight={700}>
          minimum deviation: the ray inside runs parallel to the base
        </Ticked>,
        <Ticked key="minCap2" x={CENT.x} y={PR.B.y + 36} fill={SHEET.symmetric} size={10} weight={600}>
          {`i = e = ${r.i.toFixed(1)}°  ·  r₁ = r₂ = ${(r.r1 ?? 0).toFixed(1)}° = A/2`}
        </Ticked>,
      );
    } else {
      const far = vadd(r.M, vmul(r.exitDir, 150));
      if (inPaper(far)) {
        bits.push(
          <Ticked key="bent" x={far.x} y={far.y + 24} fill={SHEET.trapped} size={10.5} anchor="end" weight={700}>
            emergent ray — bent towards the base
          </Ticked>,
        );
      }
    }
  }

  // Trapped light, shown honestly: below the useful minimum there is no
  // emergent ray at all, because the refraction equation at AC has no solution.
  if (r.tirAt) {
    const hit = r.tirAt.pt;
    bits.push(
      <circle key="tirRing" cx={hit.x} cy={hit.y} r={9} fill="none" stroke={SHEET.trapped} strokeWidth={1.6} />,
      <Ticked key="tir1" x={hit.x + 16} y={hit.y - 16} fill={SHEET.trapped} size={10.5} anchor="start" weight={700}>
        total internal reflection
      </Ticked>,
      <Ticked key="tir2" x={hit.x + 16} y={hit.y - 4} fill={SHEET.trapped} size={9.5} anchor="start">
        {`r₂ = ${r.tirAt.ang.toFixed(1)}° is past the critical angle ${criticalAngle(n).toFixed(1)}°,`}
      </Ticked>,
      <Ticked key="tir3" x={hit.x + 16} y={hit.y + 7} fill={SHEET.trapped} size={9.5} anchor="start">
        so sin(refraction) would exceed 1 — none of it gets out here
      </Ticked>,
    );
    if (r.exitFace === 'BC') {
      bits.push(
        <Ticked key="tir4" x={CENT.x} y={PR.B.y + 26} fill={SHEET.trapped} size={10.5} weight={700}>
          all of it leaves through the base instead
        </Ticked>,
      );
    }
  }

  return <g pointerEvents="none">{bits}</g>;
}

/**
 * The box itself, standing on the paper where the light comes from, with its
 * angle written on a card beside it. Drawn from the same `o` and `d` the tracer
 * used, so the box cannot point anywhere but along its own beam.
 */
function RayBoxArt({ r }: { r: DemoRay }): React.ReactElement {
  const angle = Math.atan2(r.d.y, r.d.x) * DEG;
  return (
    <g>
      <g transform={`translate(${r.o.x.toFixed(1)} ${r.o.y.toFixed(1)}) rotate(${angle.toFixed(2)})`}>
        <rect x={-58} y={-17} width={62} height={34} rx={6} fill="#20282c" stroke="#75838a" strokeWidth={1.3} />
        <rect x={-52} y={-11} width={30} height={22} rx={3} fill="#38434a" />
        <circle cx={-14} cy={0} r={6.5} fill={SHEET.beam} opacity={0.95} />
        <rect x={-4} y={-3.4} width={8} height={6.8} rx={1.5} fill={SHEET.beam} />
        <rect
          className="focus"
          x={-64}
          y={-23}
          width={74}
          height={46}
          rx={9}
          fill="rgba(0,0,0,0)"
          stroke="transparent"
          strokeWidth={2}
        />
      </g>
      <g transform={`translate(${r.o.x.toFixed(1)} ${(r.o.y + 46).toFixed(1)})`}>
        <rect x={-62} y={-13} width={124} height={28} rx={7} fill="#fdfbf4" opacity={0.92} stroke="#c9c0ab" />
        <Ticked x={0} y={0} fill="#3c4a44" size={10} weight={700}>
          {`RAY BOX · i = ${r.i.toFixed(1)}°`}
        </Ticked>
        <Ticked x={0} y={11} fill="#7b867f" size={8.5} weight={600}>
          drag me, or use the arrow keys
        </Ticked>
      </g>
    </g>
  );
}

function Pin({ p, k, faded }: { p: Vec; k: number; faded: boolean }): React.ReactElement {
  const colour = k < 2 ? SHEET.pinIn : SHEET.pinOut;
  return (
    <g opacity={faded ? 0.4 : 1} pointerEvents="none">
      <ellipse cx={p.x + 3} cy={p.y + 4} rx={6} ry={4} fill="#000" opacity={0.18} />
      <circle cx={p.x} cy={p.y} r={6.5} fill={colour} stroke="#f7fbff" strokeWidth={1.6} />
      <circle cx={p.x - 2} cy={p.y - 2} r={1.8} fill="#fff" opacity={0.7} />
      <Ticked x={p.x} y={p.y - 12} fill={colour} size={10.5}>
        P{k + 1}
      </Ticked>
    </g>
  );
}

function Crosshair({ x, y }: { x: number; y: number }): React.ReactElement {
  return (
    <g opacity={0.8} pointerEvents="none">
      <line x1={x - 12} y1={y} x2={x + 12} y2={y} stroke={SHEET.normal} strokeWidth={1.2} />
      <line x1={x} y1={y - 12} x2={x} y2={y + 12} stroke={SHEET.normal} strokeWidth={1.2} />
      <circle cx={x} cy={y} r={4} fill="none" stroke={SHEET.normal} strokeWidth={1.2} />
    </g>
  );
}
