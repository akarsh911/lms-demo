'use client';

import * as React from 'react';
import Box from '@mui/material/Box';

import {
  OX,
  PAPER,
  PX_CM,
  RAD,
  inPaper,
  mm,
  perp,
  sightOff,
  traceOf,
  unit,
  type SlabPath,
  type SlabSpec,
  type Vec,
} from '@labs/lib/glass-slab/optics';
import {
  RAY_LIMIT,
  currentTrial,
  protractorPose,
  rayAngleFromPoint,
  revealDir,
  revealO,
  revealPath,
  traceOfCurrent,
  traceOfTrial,
  type GlassSlabState,
  type ToolId,
} from '@labs/lib/glass-slab/state';
import { clamp } from '@labs/lib/numbers';

import { apparatus, LABEL_FONT } from '../apparatus-palette';
import { benchMotionSx, flowClass, motionSx, useBenchMotion } from '../bench-motion';

/**
 * The drawing board: a sheet of paper, the glass slab, and the tools.
 *
 * One gesture does everything, as at a real bench. Pick a tool off the tray,
 * then put the crosshair where you want it and press: the slab goes down, the
 * pencil traces or marks, a pin goes in, the protractor is laid on a point, the
 * ruler measures the shift. Dragging moves the crosshair and releasing uses the
 * tool, so a pin can be hunted into line before it is stuck in — which is
 * exactly what sighting through the glass is.
 *
 * Every one of those is also a keyboard control: the sheet is a button the
 * arrow keys move the crosshair on (Shift for 1 px), Enter presses, and the
 * protractor's scale turns a degree at a time under the arrow keys.
 *
 * Nothing here decides anything. The rays are drawn from the same
 * `@labs/lib/glass-slab/optics` the marking uses, so what is on the paper and
 * what the marks are computed from cannot disagree.
 */

export const SHEET_WIDTH = 1000;
export const SHEET_HEIGHT = 600;

/**
 * Pencil, ink and glass. The one place a colour is hardcoded, for the same
 * reason `apparatus-palette.ts` gives: these depict real objects on a real
 * sheet of paper, and a student learns a red ray and a blue dashed normal by
 * exactly these colours in the school lab.
 */
const INK = {
  ray: '#cc3311',
  normal: '#4d7fae',
  pencil: '#5a5a64',
  truth: '#1f9d55',
  shift: '#7a3fb5',
  paper: '#fbf9f3',
  paperEdge: '#c8c2b2',
  pinIncident: '#d93f45',
  pinEmergent: '#1f6feb',
} as const;

/** Protractor radius, in sheet units. */
const PR = 150;


// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

const f = (n: number): number => Math.round(n * 100) / 100;

/** Clip a ray from `p` along `d` to the edge of the paper. */
function toEdge(p: Vec, d: Vec): Vec {
  let best = 1e9;
  const cand: [number, number][] = [
    [PAPER.x + 4 - p.x, d.x],
    [PAPER.x + PAPER.w - 4 - p.x, d.x],
    [PAPER.y + 4 - p.y, d.y],
    [PAPER.y + PAPER.h - 4 - p.y, d.y],
  ];
  for (const [num, den] of cand) {
    if (Math.abs(den) < 1e-9) continue;
    const s = num / den;
    if (s > 0.5 && s < best) best = s;
  }
  if (best > 1e8) best = 0;
  return { x: p.x + d.x * best, y: p.y + d.y * best };
}

function Ray({
  from,
  to,
  stroke,
  width = 2.2,
  dash,
  opacity,
  arrow,
  className,
}: {
  from: Vec;
  to: Vec;
  stroke: string;
  width?: number;
  dash?: string;
  opacity?: number;
  arrow?: string;
  /** `flowClass()` when this stroke is light rather than a pencil line. */
  className?: string;
}): React.ReactElement {
  return (
    <line
      className={className}
      x1={f(from.x)}
      y1={f(from.y)}
      x2={f(to.x)}
      y2={f(to.y)}
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={dash}
      opacity={opacity}
      markerEnd={arrow}
    />
  );
}

function Ink({
  at,
  children,
  size = 11,
  fill = INK.pencil,
  anchor = 'middle',
  serif = true,
}: {
  at: Vec;
  children: React.ReactNode;
  size?: number;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
  serif?: boolean;
}): React.ReactElement {
  return (
    <text
      x={f(at.x)}
      y={f(at.y)}
      fontSize={size}
      textAnchor={anchor}
      fill={fill}
      fontFamily={serif ? 'Georgia, "Times New Roman", serif' : LABEL_FONT}
      fontWeight={600}
    >
      {children}
    </text>
  );
}

/** The little arc between two directions, with its label: ∠i, ∠r, ∠e. */
function Arc({
  c,
  rad,
  v1,
  v2,
  stroke,
  label,
}: {
  c: Vec;
  rad: number;
  v1: Vec;
  v2: Vec;
  stroke: string;
  label?: string;
}): React.ReactElement {
  const p1 = { x: c.x + v1.x * rad, y: c.y + v1.y * rad };
  const p2 = { x: c.x + v2.x * rad, y: c.y + v2.y * rad };
  const sweep = v1.x * v2.y - v1.y * v2.x > 0 ? 1 : 0;
  const bis = unit({ x: v1.x + v2.x, y: v1.y + v2.y });
  return (
    <>
      <path
        d={`M${f(p1.x)} ${f(p1.y)} A${rad} ${rad} 0 0 ${sweep} ${f(p2.x)} ${f(p2.y)}`}
        fill="none"
        stroke={stroke}
        strokeWidth={1.2}
      />
      {label ? (
        <Ink at={{ x: c.x + bis.x * (rad + 13), y: c.y + bis.y * (rad + 13) + 4 }} size={12} fill={stroke}>
          {label}
        </Ink>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// The tool tray
// ---------------------------------------------------------------------------

interface TrayEntry {
  id: ToolId;
  x: number;
  w: number;
  label: string;
  aria: string;
}

const TRAY: readonly TrayEntry[] = [
  { id: 'slab', x: 60, w: 96, label: 'GLASS SLAB', aria: 'Rectangular glass slab' },
  { id: 'pin', x: 198, w: 74, label: 'PINS', aria: 'Box of optical pins' },
  { id: 'pencil', x: 312, w: 84, label: 'PENCIL', aria: 'Pencil' },
  { id: 'protractor', x: 430, w: 104, label: 'PROTRACTOR', aria: 'Protractor' },
  { id: 'ruler', x: 570, w: 150, label: 'RULER', aria: 'Ruler' },
];

function TrayArt({ id, on }: { id: ToolId; on: boolean }): React.ReactElement {
  switch (id) {
    case 'slab':
      return (
        <>
          <rect
            x={60}
            y={8}
            width={96}
            height={20}
            rx={2}
            fill={on ? 'rgba(255,255,255,.05)' : 'rgba(190,235,242,.35)'}
            stroke={on ? 'rgba(255,255,255,.16)' : 'rgba(190,235,242,.85)'}
            strokeWidth={1.2}
          />
          <line x1={66} y1={12} x2={150} y2={12} stroke="#fff" strokeWidth={1.4} opacity={on ? 0.08 : 0.35} />
        </>
      );
    case 'pin':
      return (
        <>
          <rect x={198} y={8} width={74} height={21} rx={3} fill="#2c3a36" stroke="rgba(255,255,255,.3)" />
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <React.Fragment key={k}>
              <circle cx={208 + k * 11} cy={18} r={3.4} fill="#e06058" />
              <circle cx={206.8 + k * 11} cy={16.8} r={1.1} fill="#ffd9d6" />
            </React.Fragment>
          ))}
        </>
      );
    case 'pencil':
      return (
        <>
          <path d="M312 22 L378 12 L390 17 L378 22 L312 27 Z" fill="#d9a441" stroke="rgba(0,0,0,.3)" strokeWidth={0.8} />
          <path d="M378 12 L390 17 L378 22 Z" fill="#e8e2d4" />
          <path d="M386 15.6 L390 17 L386 18.4 Z" fill="#43413f" />
        </>
      );
    case 'protractor':
      return (
        <>
          <path d="M430 30 A52 52 0 0 1 534 30 Z" fill="rgba(255,255,255,.5)" stroke="rgba(255,255,255,.75)" strokeWidth={1.2} />
          {[0, 30, 60, 90, 120, 150, 180].map((a) => (
            <line
              key={a}
              x1={f(482 + 46 * Math.cos(a * RAD))}
              y1={f(30 - 46 * Math.sin(a * RAD))}
              x2={f(482 + 52 * Math.cos(a * RAD))}
              y2={f(30 - 52 * Math.sin(a * RAD))}
              stroke="#2b3a44"
              strokeWidth={1}
            />
          ))}
        </>
      );
    default:
      return (
        <>
          <rect x={570} y={12} width={150} height={16} rx={2} fill="#f0e7c8" stroke="#b9ac86" />
          {Array.from({ length: 15 }, (_, k) => (
            <line
              key={k}
              x1={576 + k * 10}
              y1={12}
              x2={576 + k * 10}
              y2={k % 5 === 0 ? 22 : 18}
              stroke="#7c7253"
              strokeWidth={1}
            />
          ))}
        </>
      );
  }
}

// ---------------------------------------------------------------------------
// The protractor, laid on the paper
// ---------------------------------------------------------------------------

function Protractor({ c, up }: { c: Vec; up: boolean }): React.ReactElement {
  const sgn = up ? -1 : 1;
  const at = (th: number, rad: number): Vec => ({
    x: c.x + rad * Math.cos(th * RAD),
    y: c.y + sgn * rad * Math.sin(th * RAD),
  });
  const ticks = React.useMemo(() => {
    const out: React.ReactElement[] = [];
    for (let th = 0; th <= 180; th += 1) {
      const long = th % 10 === 0;
      const med = th % 5 === 0;
      const r0 = PR - (long ? 17 : med ? 11 : 6);
      const a = { x: c.x + r0 * Math.cos(th * RAD), y: c.y + sgn * r0 * Math.sin(th * RAD) };
      const b = { x: c.x + PR * Math.cos(th * RAD), y: c.y + sgn * PR * Math.sin(th * RAD) };
      out.push(
        <line
          key={`t${th}`}
          x1={f(a.x)}
          y1={f(a.y)}
          x2={f(b.x)}
          y2={f(b.y)}
          stroke="#31454f"
          strokeWidth={long ? 1.2 : 0.7}
          opacity={long ? 1 : 0.75}
        />,
      );
      if (long) {
        const o1 = { x: c.x + (PR - 26) * Math.cos(th * RAD), y: c.y + sgn * (PR - 26) * Math.sin(th * RAD) };
        out.push(
          <text
            key={`n${th}`}
            x={f(o1.x)}
            y={f(o1.y) + 3.4}
            fontSize={8.5}
            textAnchor="middle"
            fill="#22333c"
            fontFamily={LABEL_FONT}
            fontWeight={600}
          >
            {th}
          </text>,
        );
      }
    }
    return out;
  }, [c.x, c.y, sgn]);

  return (
    <>
      <path
        d={`M${f(c.x - PR)} ${f(c.y)} A${PR} ${PR} 0 0 ${up ? 1 : 0} ${f(c.x + PR)} ${f(c.y)} Z`}
        fill="#ffffff"
        fillOpacity={0.42}
        stroke="#4a5f6c"
        strokeWidth={1.3}
      />
      {ticks}
      <line x1={f(c.x - PR)} y1={f(c.y)} x2={f(c.x + PR)} y2={f(c.y)} stroke="#31454f" strokeWidth={1.3} />
      <circle cx={f(c.x)} cy={f(c.y)} r={3} fill="none" stroke="#31454f" strokeWidth={1.2} />
      <line x1={f(c.x)} y1={f(c.y + sgn * 5)} x2={f(c.x)} y2={f(c.y + sgn * 16)} stroke="#31454f" strokeWidth={1} />
      <text
        x={f(c.x)}
        y={f(at(90, PR - 54).y) + 4}
        fontSize={8.5}
        textAnchor="middle"
        fill="#54707f"
        fontFamily={LABEL_FONT}
        fontWeight={500}
      >
        least count 1°
      </text>
    </>
  );
}

// ---------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------

export interface GlassSlabBenchProps {
  state: GlassSlabState;
  /**
   * Whether the teaching layer exists on this bench at all. False and none of
   * it is built: no beam, no ray box, no inset — not a hidden one.
   */
  teach: boolean;
  /** Parts a tour or a hint is pointing at: `tool:pin`, `paper`, `protractor`. */
  pulse: readonly string[];
  onSvg: (el: SVGSVGElement | null) => void;
  onPickTool: (tool: ToolId) => void;
  onPutDown: () => void;
  /** Move the crosshair. */
  onAim: (at: Vec) => void;
  /** Use whatever is in hand, at the crosshair. */
  onUse: (at: Vec) => void;
  /** Lay the protractor's sight line where this point is on the scale. */
  onAimProtractor: (at: Vec) => void;
  onNudgeProtractor: (by: number) => void;
  /** Write down the reading the sight line is on. */
  onCommitProtractor: () => void;
  /** Swing the teaching ray box, in signed degrees from the normal. */
  onAimRay: (deg: number) => void;
}

export function GlassSlabBench({
  state,
  teach,
  pulse,
  onSvg,
  onPickTool,
  onPutDown,
  onAim,
  onUse,
  onAimProtractor,
  onNudgeProtractor,
  onCommitProtractor,
  onAimRay,
}: GlassSlabBenchProps): React.ReactElement {
  const moving = useBenchMotion();
  const gid = `gs${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const svg = React.useRef<SVGSVGElement | null>(null);
  const gesture = React.useRef<'none' | 'aim' | 'protractor' | 'ray'>('none');

  /** The teaching view, as it is actually drawn: never without the flag. */
  const revealing = teach && state.reveal;
  const slab = state.slab;
  const tr = currentTrial(state);
  const o = traceOfCurrent(state);
  const pose = protractorPose(state);
  const drawing = state.held !== null && state.held !== 'protractor';

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
    return { x: p.x, y: p.y };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    const target = e.target as Element;
    const tool = target.closest('[data-tool]')?.getAttribute('data-tool') as ToolId | null;
    if (tool) {
      e.preventDefault();
      onPickTool(tool);
      return;
    }
    const p = toSheet(e);
    if (!p) return;
    // The ray box is a teaching control lying over the paper. With a tool in
    // hand the press belongs to the paper underneath, exactly as it would if
    // you reached past the lamp to stick a pin in.
    if (revealing && !state.held && target.closest('[data-ray]')) {
      gesture.current = 'ray';
      e.currentTarget.setPointerCapture(e.pointerId);
      const deg = rayAngleFromPoint(state, p);
      if (deg !== null) onAimRay(deg);
      return;
    }
    if (target.closest('[data-prot]')) {
      gesture.current = 'protractor';
      e.currentTarget.setPointerCapture(e.pointerId);
      onAimProtractor(p);
      return;
    }
    if (target.closest('[data-paper]')) {
      gesture.current = 'aim';
      e.currentTarget.setPointerCapture(e.pointerId);
      onAim(p);
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (gesture.current === 'none') return;
    const p = toSheet(e);
    if (!p) return;
    if (gesture.current === 'ray') {
      const deg = rayAngleFromPoint(state, p);
      if (deg !== null) onAimRay(deg);
      return;
    }
    if (gesture.current === 'protractor') onAimProtractor(p);
    else onAim(p);
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>): void => {
    const was = gesture.current;
    gesture.current = 'none';
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (was !== 'aim') return;
    const p = toSheet(e);
    if (p) onUse(p);
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>): void => {
    const target = e.target as Element;
    const act = e.key === 'Enter' || e.key === ' ';
    if (e.key === 'Escape' && state.held) {
      e.preventDefault();
      onPutDown();
      return;
    }
    const tool = target.getAttribute('data-tool') as ToolId | null;
    if (tool && act) {
      e.preventDefault();
      onPickTool(tool);
      return;
    }
    if (revealing && target.closest('[data-ray]')) {
      const step = e.shiftKey ? 5 : 1;
      const by = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[e.key];
      if (by !== undefined) {
        e.preventDefault();
        onAimRay(clamp(state.rayA + by, -RAY_LIMIT, RAY_LIMIT));
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        onAimRay(0);
      }
      return;
    }
    if (target.hasAttribute('data-prot')) {
      const by = { ArrowLeft: 1, ArrowUp: 1, ArrowRight: -1, ArrowDown: -1 }[e.key];
      if (by !== undefined) {
        e.preventDefault();
        onNudgeProtractor(by);
        return;
      }
      if (act) {
        e.preventDefault();
        onCommitProtractor();
      }
      return;
    }
    if (target.hasAttribute('data-paper')) {
      const step = e.shiftKey ? 1 : 5;
      const d = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }[e.key];
      if (d) {
        e.preventDefault();
        onAim({
          x: clamp(state.cross.x + (d[0] ?? 0), PAPER.x + 8, PAPER.x + PAPER.w - 8),
          y: clamp(state.cross.y + (d[1] ?? 0), PAPER.y + 8, PAPER.y + PAPER.h - 8),
        });
        return;
      }
      if (act) {
        e.preventDefault();
        onUse(state.cross);
      }
    }
  };

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
        aria-label="Drawing board: a sheet of paper, a rectangular glass slab, a box of pins, a pencil, a protractor and a ruler"
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <defs>
          <radialGradient id={`${gid}lamp`} cx="45%" cy="34%" r="80%">
            <stop offset="0" stopColor="#2b3533" />
            <stop offset=".6" stopColor={apparatus.bench} />
            <stop offset="1" stopColor="#121817" />
          </radialGradient>
          <linearGradient id={`${gid}board`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7d5730" />
            <stop offset="1" stopColor="#5a3d20" />
          </linearGradient>
          <linearGradient id={`${gid}sheet`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={INK.paper} />
            <stop offset="1" stopColor="#f1ece0" />
          </linearGradient>
          <linearGradient id={`${gid}glass`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#cfeef3" stopOpacity=".62" />
            <stop offset=".5" stopColor="#a9dbe4" stopOpacity=".38" />
            <stop offset="1" stopColor="#cfeef3" stopOpacity=".62" />
          </linearGradient>
          <filter id={`${gid}soft`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <marker
            id={`${gid}head`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 1 L9 5 L0 9 z" fill={INK.ray} />
          </marker>
        </defs>

        <rect width={SHEET_WIDTH} height={SHEET_HEIGHT} fill={`url(#${gid}lamp)`} />
        <rect x={14} y={46} width={972} height={546} rx={8} fill={`url(#${gid}board)`} />
        <rect x={14} y={46} width={972} height={546} rx={8} fill="none" stroke="rgba(0,0,0,.35)" />

        {/* The tray along the top of the board */}
        {TRAY.map((item) => {
          const on = state.held === item.id || (item.id === 'slab' && state.slabOn);
          return (
            <g
              key={item.id}
              data-hot=""
              data-tool={item.id}
              className={[state.held === item.id ? 'picked' : '', pulse.includes(`tool:${item.id}`) ? 'pulse' : '']
                .join(' ')
                .trim()}
              tabIndex={0}
              role="button"
              aria-label={item.aria}
              aria-pressed={state.held === item.id}
            >
              <g className="lift">
                <TrayArt id={item.id} on={on} />
                <rect className="focus" x={item.x - 4} y={2} width={item.w + 8} height={42} rx={7} fill="none" />
              </g>
              <text
                x={item.x + item.w / 2}
                y={40}
                fontSize={8.5}
                textAnchor="middle"
                fill={state.held === item.id ? '#dfeef6' : apparatus.benchLabel}
                fontFamily={LABEL_FONT}
                fontWeight={600}
                letterSpacing=".8"
              >
                {item.id === 'slab' && state.slabOn ? 'ON THE PAPER' : item.label}
              </text>
            </g>
          );
        })}
        <text
          x={880}
          y={26}
          fontSize={9.5}
          textAnchor="middle"
          fill="#6d7a76"
          fontFamily={LABEL_FONT}
          fontWeight={600}
          letterSpacing="1.2"
        >
          CBSE EXPERIMENT 11 · PIN METHOD
        </text>

        {/* The sheet itself: the one surface every tool acts on */}
        <g
          data-hot=""
          data-paper=""
          className={pulse.includes('paper') ? 'pulse' : ''}
          tabIndex={0}
          role="button"
          aria-label="Drawing paper. Move the crosshair with the arrow keys and press Enter to use the tool you are holding."
        >
          <rect
            x={PAPER.x + 3}
            y={PAPER.y + 5}
            width={PAPER.w}
            height={PAPER.h}
            rx={3}
            fill="#000"
            opacity={0.33}
            filter={`url(#${gid}soft)`}
          />
          <rect x={PAPER.x} y={PAPER.y} width={PAPER.w} height={PAPER.h} rx={3} fill={`url(#${gid}sheet)`} />
          <rect
            className="focus"
            x={PAPER.x - 4}
            y={PAPER.y - 4}
            width={PAPER.w + 8}
            height={PAPER.h + 8}
            rx={6}
            fill="none"
          />
          {[
            [PAPER.x + 14, PAPER.y + 14],
            [PAPER.x + PAPER.w - 14, PAPER.y + 14],
            [PAPER.x + 14, PAPER.y + PAPER.h - 14],
            [PAPER.x + PAPER.w - 14, PAPER.y + PAPER.h - 14],
          ].map(([x, y], k) => (
            <React.Fragment key={k}>
              <circle cx={x} cy={y} r={5} fill={INK.paperEdge} />
              <circle cx={x} cy={y} r={2.2} fill="#8d8677" />
            </React.Fragment>
          ))}
        </g>

        {/* Everything drawn on the sheet. None of it takes the pointer. */}
        <g pointerEvents="none">
          <SlabArt state={state} gid={gid} />
          <TraceArt state={state} gid={gid} />
          {state.showAll ? <AllTracesArt state={state} /> : <Pins state={state} />}
          {revealing ? <RevealArt state={state} gid={gid} /> : null}
        </g>

        {pose ? (
          <g
            data-hot=""
            data-prot=""
            className={pulse.includes('protractor') ? 'pulse' : ''}
            tabIndex={0}
            role="button"
            aria-label={`Protractor on ${state.prot === 'O' ? 'the point of incidence' : 'the point of emergence'}. Arrow keys turn the sight line one degree at a time; Enter writes the reading down.`}
          >
            <path
              className="focus"
              d={`M${f(pose.c.x - PR - 6)} ${f(pose.c.y)} A${PR + 6} ${PR + 6} 0 0 ${pose.up ? 1 : 0} ${f(
                pose.c.x + PR + 6,
              )} ${f(pose.c.y)} Z`}
              fill="none"
            />
            <Protractor c={pose.c} up={pose.up} />
            {state.protAim !== null ? <SightLine c={pose.c} up={pose.up} reading={state.protAim} /> : null}
          </g>
        ) : null}

        {/* The one part of the teaching view that takes the pointer. */}
        {revealing ? <RayBoxArt state={state} pulse={pulse} /> : null}

        {/* The crosshair, and how far it is from the line of sight */}
        {drawing ? <Crosshair state={state} slab={slab} trialPins={tr.pins.length} trace={o} /> : null}
      </svg>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The slab, its outline, and the pencil work
// ---------------------------------------------------------------------------

function SlabArt({ state, gid }: { state: GlassSlabState; gid: string }): React.ReactElement | null {
  const { slab } = state;
  if (!state.slabOn) return null;
  const lifted = currentTrial(state).joined;
  const corner = (label: string, at: Vec): React.ReactElement => (
    <Ink at={at} size={11}>
      {label}
    </Ink>
  );

  return (
    <>
      {state.outline ? (
        <>
          <rect
            x={slab.x}
            y={slab.y}
            width={slab.w}
            height={slab.t}
            fill="none"
            stroke={INK.pencil}
            strokeWidth={1.3}
          />
          {corner('A', { x: slab.x - 9, y: slab.y - 5 })}
          {corner('B', { x: slab.x + slab.w + 9, y: slab.y - 5 })}
          {corner('C', { x: slab.x + slab.w + 9, y: slab.y + slab.t + 13 })}
          {corner('D', { x: slab.x - 9, y: slab.y + slab.t + 13 })}
        </>
      ) : null}

      {lifted ? (
        <>
          <rect x={slab.x} y={slab.y} width={slab.w} height={slab.t} fill="rgba(169,219,228,.10)" />
          <Ink at={{ x: slab.x + 8, y: slab.y + slab.t - 7 }} size={9} fill="#a39b8a" anchor="start" serif={false}>
            slab lifted off
          </Ink>
        </>
      ) : (
        <>
          <rect
            x={slab.x}
            y={slab.y}
            width={slab.w}
            height={slab.t}
            fill={`url(#${gid}glass)`}
            stroke="rgba(56,120,133,.75)"
            strokeWidth={1.4}
          />
          <rect
            x={slab.x + 3}
            y={slab.y + 3}
            width={slab.w - 6}
            height={slab.t - 6}
            fill="none"
            stroke="rgba(255,255,255,.65)"
            strokeWidth={1}
          />
          <line
            x1={slab.x + 16}
            y1={slab.y + 9}
            x2={slab.x + slab.w - 40}
            y2={slab.y + 9}
            stroke="#fff"
            strokeWidth={3}
            opacity={0.45}
          />
        </>
      )}
    </>
  );
}

/** The pencil work and the rays of the trial on the board. */
function TraceArt({ state, gid }: { state: GlassSlabState; gid: string }): React.ReactElement {
  const { slab } = state;
  const tr = currentTrial(state);
  const o = traceOfCurrent(state);
  const arrow = `url(#${gid}head)`;
  /** Where the pencil marked O, which is where the normal was drawn through. */
  const O: Vec = { x: OX, y: slab.y };

  return (
    <>
      {state.origin ? (
        <>
          <line
            x1={O.x}
            y1={slab.y - 118}
            x2={O.x}
            y2={slab.y + slab.t + 34}
            stroke={INK.normal}
            strokeWidth={1.3}
            strokeDasharray="7 5"
          />
          <circle cx={O.x} cy={slab.y} r={2.6} fill={INK.pencil} />
          <Ink at={{ x: O.x, y: slab.y - 124 }}>N</Ink>
          <Ink at={{ x: O.x - 11, y: slab.y - 6 }} size={12}>
            O
          </Ink>
        </>
      ) : null}

      {/* The construction line drawn with the protractor, before the pins go in */}
      {o.drawDir && !tr.joined && !state.showAll ? (
        <>
          <Ray
            from={O}
            to={toEdge(O, { x: -o.drawDir.x, y: -o.drawDir.y })}
            stroke={INK.pencil}
            width={1.3}
          />
          <Arc
            c={O}
            rad={34}
            v1={{ x: 0, y: -1 }}
            v2={{ x: -o.drawDir.x, y: -o.drawDir.y }}
            stroke={INK.pencil}
            label={`${tr.target}°`}
          />
        </>
      ) : null}

      {/* The trace of the trial on the board. It steps aside for the
          comparison view, which is about the three traces rather than this
          one — and it is NOT what the teaching view draws: that is an
          independent ray, aimed by the student, whose numbers give nothing
          away because nothing about it is marked. */}
      {tr.joined && !state.showAll && o.inc && o.emg && o.mid && o.real ? (
        <>
          <Ray
            from={o.inc.O}
            to={toEdge(o.inc.O, o.inc.d)}
            stroke={INK.ray}
            width={1.2}
            dash="3 5"
            opacity={0.5}
          />
          <Ray
            from={toEdge(o.inc.O, { x: -o.inc.d.x, y: -o.inc.d.y })}
            to={o.inc.O}
            stroke={INK.ray}
            arrow={arrow}
          />
          <Ray from={o.inc.O} to={o.emg.O2} stroke={INK.ray} arrow={arrow} />
          <Ray from={o.emg.O2} to={toEdge(o.emg.O2, o.emg.d)} stroke={INK.ray} arrow={arrow} />

          <line
            x1={f(o.emg.O2.x)}
            y1={f(o.emg.O2.y - 34)}
            x2={f(o.emg.O2.x)}
            y2={f(o.emg.O2.y + 108)}
            stroke={INK.normal}
            strokeWidth={1.3}
            strokeDasharray="7 5"
          />
          <circle cx={f(o.emg.O2.x)} cy={f(o.emg.O2.y)} r={2.6} fill={INK.pencil} />
          <Ink at={{ x: o.emg.O2.x + 12, y: o.emg.O2.y + 116 }}>N′</Ink>
          <Ink at={{ x: o.emg.O2.x + 13, y: o.emg.O2.y + 13 }} size={12}>
            O′
          </Ink>

          <Arc
            c={o.inc.O}
            rad={40}
            v1={{ x: 0, y: -1 }}
            v2={{ x: -o.inc.d.x, y: -o.inc.d.y }}
            stroke={INK.ray}
            label="i"
          />
          <Arc c={o.inc.O} rad={26} v1={{ x: 0, y: 1 }} v2={o.mid} stroke={INK.ray} label="r" />
          <Arc c={o.emg.O2} rad={40} v1={{ x: 0, y: 1 }} v2={o.emg.d} stroke={INK.ray} label="e" />

          {/* The ray the light really leaves along, shown only when the pins missed it */}
          {!state.reveal && (emergentMiss(state) ?? 0) > 2 ? (
            <>
              <Ray
                from={o.real.O2}
                to={toEdge(o.real.O2, o.real.dout)}
                stroke={INK.truth}
                width={1.6}
                dash="6 5"
              />
              <Ink
                at={{
                  x: o.real.O2.x + o.real.dout.x * 120,
                  y: o.real.O2.y + o.real.dout.y * 120 - 10,
                }}
                size={9.5}
                fill={INK.truth}
                serif={false}
              >
                where the light really came out
              </Ink>
            </>
          ) : null}

          {tr.lat !== null && o.foot ? (
            <>
              <Ray from={o.foot} to={o.emg.O2} stroke={INK.shift} width={1.6} />
              <rect
                x={f((o.foot.x + o.emg.O2.x) / 2 - 24)}
                y={f((o.foot.y + o.emg.O2.y) / 2 - 20)}
                width={48}
                height={15}
                rx={4}
                fill={INK.paper}
                opacity={0.9}
              />
              <Ink
                at={{ x: (o.foot.x + o.emg.O2.x) / 2, y: (o.foot.y + o.emg.O2.y) / 2 - 9 }}
                size={9.5}
                fill={INK.shift}
                serif={false}
              >
                {`d = ${tr.lat.toFixed(1)} cm`}
              </Ink>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// The teaching view: an independent ray, aimed by the student
// ---------------------------------------------------------------------------

/**
 * THE RAY BOX AND WHAT IT DRAWS.
 *
 * Everything below is worked out by `slabPath` — the same Snell's-law model the
 * marking is computed from — for a ray the student aims themselves. It is
 * deliberately NOT the student's own traced ray: the marks come from measuring
 * their four-pin trace, so a live ∠r for a ray that was never pinned hands over
 * nothing, while the same readout wired to their own trace would hand over the
 * whole practical.
 */
/** How far in front of O the lamp stands. */
const SRCD = 122;
const BEAM_GLOW = 'rgba(31,157,85,.30)';

function Beam({ from, to, width = 2.6 }: { from: Vec; to: Vec; width?: number }): React.ReactElement {
  return (
    <>
      <Ray from={from} to={to} stroke={BEAM_GLOW} width={width * 3.4} opacity={0.45} />
      <Ray from={from} to={to} stroke={INK.truth} width={width} className={flowClass()} />
    </>
  );
}

/** The magnified view of the point of entry: at bench scale the bend is a few pixels. */
function EntryInset({
  path,
  din,
  left,
  gid,
}: {
  path: SlabPath;
  din: Vec;
  left: boolean;
  gid: string;
}): React.ReactElement {
  const w = 208;
  const h = 152;
  const x0 = left ? PAPER.x + 18 : PAPER.x + PAPER.w - 18 - w;
  const y0 = PAPER.y + PAPER.h - 18 - h;
  const cx = x0 + w / 2;
  const cy = y0 + h * 0.4;
  const L = 300;
  const C: Vec = { x: cx, y: cy };
  const at = (d: Vec, k: number): Vec => ({ x: cx + d.x * k, y: cy + d.y * k });

  return (
    <>
      <defs>
        <clipPath id={`${gid}inset`}>
          <rect x={f(x0)} y={f(y0)} width={w} height={h} rx={12} />
        </clipPath>
      </defs>
      <rect
        x={f(x0)}
        y={f(y0)}
        width={w}
        height={h}
        rx={12}
        fill={INK.paper}
        stroke="rgba(40,80,92,.5)"
        strokeWidth={1.3}
      />
      <g clipPath={`url(#${gid}inset)`}>
        <rect x={f(x0)} y={f(cy)} width={w} height={f(y0 + h - cy)} fill="rgba(169,219,228,.36)" />
        <Ray from={{ x: x0, y: cy }} to={{ x: x0 + w, y: cy }} stroke="rgba(46,110,124,.9)" width={1.6} />
        <Ray
          from={{ x: cx, y: cy - 70 }}
          to={{ x: cx, y: cy + 74 }}
          stroke={INK.normal}
          width={1.2}
          dash="6 5"
        />
        <Ray from={C} to={at(din, L)} stroke="#b9b2a4" width={1} dash="3 5" />
        <Beam from={at(din, -L)} to={C} width={2.2} />
        <Beam from={C} to={at(path.dmid, L)} width={2.2} />
        <Arc
          c={C}
          rad={40}
          v1={{ x: 0, y: -1 }}
          v2={{ x: -din.x, y: -din.y }}
          stroke={INK.ray}
          label={`i ${path.i.toFixed(1)}°`}
        />
        <Arc c={C} rad={30} v1={{ x: 0, y: 1 }} v2={path.dmid} stroke={INK.normal} label={`r ${path.r.toFixed(1)}°`} />
      </g>
      <Ink
        at={{ x: left ? x0 + 10 : x0 + w - 10, y: y0 + 16 }}
        size={8.5}
        fill="#7f8f93"
        anchor={left ? 'start' : 'end'}
        serif={false}
      >
        MAGNIFIED AT O
      </Ink>
      <Ink at={{ x: x0 + w / 2, y: y0 + h - 9 }} size={8.5} fill="#8d8677" serif={false}>
        the beam turns towards the normal on entering
      </Ink>
    </>
  );
}

/** The lamp itself: drag it round the arc, or arrow-key it a degree at a time. */
function RayBoxArt({ state, pulse }: { state: GlassSlabState; pulse: readonly string[] }): React.ReactElement | null {
  const O = revealO(state);
  const din = revealDir(state);
  const src: Vec = { x: O.x - din.x * SRCD, y: O.y - din.y * SRCD };
  const a = (Math.atan2(din.y, din.x) * 180) / Math.PI;
  const v = Math.round(Math.abs(state.rayA));
  const sg = din.x >= 0 ? 1 : -1;

  return (
    <g
      data-hot=""
      data-ray=""
      className={pulse.includes('raybox') ? 'pulse' : ''}
      tabIndex={0}
      role="slider"
      aria-label="Ray box. Drag it across the paper, or use the left and right arrow keys, to change the angle of incidence."
      aria-valuemin={0}
      aria-valuemax={RAY_LIMIT}
      aria-valuenow={v}
      aria-valuetext={`${v} degrees from the normal`}
    >
      <g transform={`translate(${f(src.x)} ${f(src.y)}) rotate(${f(a)})`}>
        <rect x={-60} y={-15} width={60} height={30} rx={6} fill="#26323a" stroke="#8fd0ff" strokeWidth={1.3} />
        <rect x={-53} y={-9} width={31} height={18} rx={3} fill="#3d4b53" />
        <circle cx={-5} cy={0} r={4.8} fill="#ffe0b0" />
        <rect className="focus" x={-66} y={-21} width={72} height={42} rx={9} fill="none" />
      </g>
      <Ink
        at={{ x: src.x + sg * -din.y * 38, y: Math.max(PAPER.y + 14, src.y + sg * din.x * 38) }}
        size={8.5}
        fill="#2b6f8a"
        serif={false}
      >
        RAY BOX · drag me
      </Ink>
    </g>
  );
}

/** Everything the teaching view draws on the paper, except the lamp itself. */
function RevealArt({ state, gid }: { state: GlassSlabState; gid: string }): React.ReactElement | null {
  const { slab } = state;
  const O = revealO(state);
  const din = revealDir(state);
  const P = revealPath(state);
  if (!P) return null;

  const src: Vec = { x: O.x - din.x * SRCD, y: O.y - din.y * SRCD };
  const far = toEdge(P.O2, P.dout);
  const prod = toEdge(O, din);
  const sgn = perp(P.O2, O, din);
  const foot: Vec = { x: P.O2.x - din.y * sgn, y: P.O2.y + din.x * sgn };
  const dcm = Math.abs(sgn) / PX_CM;

  // The arc the lamp swings along, so the gesture is visible before it is made.
  const a0: Vec = {
    x: O.x - Math.sin(RAY_LIMIT * RAD) * SRCD,
    y: O.y - Math.cos(RAY_LIMIT * RAD) * SRCD,
  };
  const a1: Vec = { x: O.x + Math.sin(RAY_LIMIT * RAD) * SRCD, y: a0.y };

  const Lm = Math.min(200, 0.55 * Math.hypot(far.x - P.O2.x, far.y - P.O2.y));
  const lm: Vec = { x: P.O2.x + P.dout.x * Lm, y: P.O2.y + P.dout.y * Lm };
  const Q: Vec = { x: P.O2.x + P.dout.x * 120, y: P.O2.y + P.dout.y * 120 };
  const Qf: Vec = { x: Q.x - din.y * sgn, y: Q.y + din.x * sgn };
  const un = unit({ x: Qf.x - Q.x, y: Qf.y - Q.y });
  const lp: Vec = { x: Qf.x + un.x * 16, y: Qf.y + un.y * 16 };

  return (
    <>
      {/* A block of glass to read the beam against, even before the real slab
          is down: the teaching view is about the light, not about how far the
          student has got. */}
      {state.slabOn ? (
        <rect
          x={slab.x}
          y={slab.y}
          width={slab.w}
          height={slab.t}
          fill="none"
          stroke="rgba(46,110,124,.55)"
          strokeWidth={1}
        />
      ) : (
        <>
          <rect
            x={slab.x}
            y={slab.y}
            width={slab.w}
            height={slab.t}
            fill={`url(#${gid}glass)`}
            stroke="rgba(56,120,133,.75)"
            strokeWidth={1.4}
          />
          <Ink at={{ x: slab.x + 14, y: slab.y + slab.t - 9 }} size={9} fill="#3f7480" anchor="start" serif={false}>
            glass, n = 1.50
          </Ink>
        </>
      )}

      <path
        d={`M${f(a0.x)} ${f(a0.y)} A${SRCD} ${SRCD} 0 0 1 ${f(a1.x)} ${f(a1.y)}`}
        fill="none"
        stroke="#9fb6bd"
        strokeWidth={1}
        strokeDasharray="2 7"
        opacity={0.7}
      />

      {/* What the light would have done with no slab there */}
      <Ray from={O} to={prod} stroke="#9a9486" width={1.2} dash="4 6" />
      <Ink
        at={{
          x: Math.min(PAPER.x + PAPER.w - 66, Math.max(PAPER.x + 66, O.x + (prod.x - O.x) * 0.92 + din.y * 36)),
          y: Math.min(PAPER.y + PAPER.h - 12, O.y + (prod.y - O.y) * 0.92 - din.x * 36),
        }}
        size={9}
        fill="#9a9486"
        serif={false}
      >
        with no slab: straight on
      </Ink>

      <Ray from={{ x: O.x, y: O.y - 96 }} to={{ x: O.x, y: O.y + slab.t + 10 }} stroke={INK.normal} width={1.2} dash="7 5" />
      <Ray
        from={{ x: P.O2.x, y: P.O2.y - slab.t - 10 }}
        to={{ x: P.O2.x, y: P.O2.y + 96 }}
        stroke={INK.normal}
        width={1.2}
        dash="7 5"
      />
      <Ink at={{ x: O.x, y: O.y - 102 }}>N</Ink>
      <Ink at={{ x: P.O2.x, y: P.O2.y + 110 }}>N′</Ink>

      <Beam from={src} to={O} />
      <Beam from={O} to={P.O2} />
      <Beam from={P.O2} to={far} />
      <circle cx={f(O.x)} cy={f(O.y)} r={3} fill="#7a2f00" />
      <circle cx={f(P.O2.x)} cy={f(P.O2.y)} r={3} fill="#7a2f00" />
      <Ink at={{ x: O.x - 13, y: O.y - 7 }} size={12} fill="#7a2f00">
        O
      </Ink>
      <Ink at={{ x: P.O2.x + 14, y: P.O2.y + 14 }} size={12} fill="#7a2f00">
        O′
      </Ink>

      {/* The lateral displacement, drawn clear of O′ with its label pushed out
          past the far end so it never sits on the beam or on ∠e. */}
      {dcm > 0.04 ? (
        <>
          <Ray from={Qf} to={Q} stroke={INK.shift} width={1.6} />
          <rect
            x={f(un.x >= 0 ? lp.x - 2 : lp.x - 64)}
            y={f(lp.y - 9)}
            width={66}
            height={17}
            rx={5}
            fill={INK.paper}
            opacity={0.95}
            stroke={INK.shift}
            strokeWidth={0.7}
          />
          <Ink
            at={{ x: un.x >= 0 ? lp.x + 4 : lp.x - 4, y: lp.y + 3.5 }}
            size={9.5}
            fill={INK.shift}
            anchor={un.x >= 0 ? 'start' : 'end'}
            serif={false}
          >
            {`d = ${dcm.toFixed(2)} cm`}
          </Ink>
        </>
      ) : null}

      <Arc
        c={O}
        rad={58}
        v1={{ x: 0, y: -1 }}
        v2={{ x: -din.x, y: -din.y }}
        stroke={INK.ray}
        label={`i = ${P.i.toFixed(1)}°`}
      />
      <Arc c={O} rad={34} v1={{ x: 0, y: 1 }} v2={P.dmid} stroke={INK.normal} label={`r = ${P.r.toFixed(1)}°`} />
      <Arc c={P.O2} rad={58} v1={{ x: 0, y: 1 }} v2={P.dout} stroke={INK.ray} label={`e = ${P.e.toFixed(1)}°`} />

      <Ink
        at={{ x: lm.x - P.dout.y * 32, y: lm.y + P.dout.x * 32 }}
        size={9.5}
        fill="#7a2f00"
        serif={false}
      >
        emergent ray — parallel to the incident ray
      </Ink>

      <EntryInset path={P} din={din} left={din.x >= 0} gid={gid} />

      {/* The honest caption. It is the one thing on this drawing a real bench
          would never show you. */}
      <rect x={PAPER.x + 14} y={PAPER.y + 10} width={248} height={21} rx={6} fill="#7a2f00" opacity={0.92} />
      <Ink at={{ x: PAPER.x + 138, y: PAPER.y + 24.5 }} size={9} fill="#ffe6d2" serif={false}>
        TEACHING VIEW · NOT VISIBLE IN A REAL LAB
      </Ink>
    </>
  );
}

// ---------------------------------------------------------------------------
// The finished traces, side by side
// ---------------------------------------------------------------------------

/** One colour per trace, so three rays can be told apart at a glance. */
const ALL_COLOURS = ['#c4342c', '#1668c4', '#7a3fb5'] as const;

function AllTracesArt({ state }: { state: GlassSlabState }): React.ReactElement | null {
  const rows: { colour: string; target: number; i: number; r: number; e: number; d: number }[] = [];
  const art: React.ReactElement[] = [];
  let rightward = true;

  state.trials.forEach((tr, k) => {
    const o = traceOfTrial(state, k);
    if (!tr.joined || !o.inc || !o.emg || !o.ang || o.lat === null || !o.foot) return;
    const colour = ALL_COLOURS[k] ?? ALL_COLOURS[0];
    rightward = o.inc.d.x >= 0;
    const start = toEdge(o.inc.O, { x: -o.inc.d.x, y: -o.inc.d.y });
    const prod = toEdge(o.inc.O, o.inc.d);
    const far = toEdge(o.emg.O2, o.emg.d);
    art.push(
      <React.Fragment key={k}>
        <Ray from={o.inc.O} to={prod} stroke={colour} width={1} dash="3 6" opacity={0.45} />
        <Ray from={start} to={o.inc.O} stroke={colour} width={2.1} />
        <Ray from={o.inc.O} to={o.emg.O2} stroke={colour} width={2.1} />
        <Ray from={o.emg.O2} to={far} stroke={colour} width={2.1} />
        <Ray from={o.foot} to={o.emg.O2} stroke={colour} width={1.4} dash="2 3" />
        <Ink
          at={{
            x: far.x - o.emg.d.x * 40 - o.emg.d.y * 16,
            y: far.y - o.emg.d.y * 40 + o.emg.d.x * 16,
          }}
          size={11}
          fill={colour}
        >
          {`${tr.target}°`}
        </Ink>
      </React.Fragment>,
    );
    rows.push({ colour, target: tr.target, i: o.ang.i, r: o.ang.r, e: o.ang.e, d: o.lat / PX_CM });
  });

  if (!rows.length) return null;

  const w = 292;
  const x0 = rightward ? PAPER.x + PAPER.w - 16 - w : PAPER.x + 16;
  const y0 = PAPER.y + 12;
  const h = 46 + rows.length * 17;
  const foot =
    rows.length < state.trials.length
      ? ['finish the other traces to compare them']
      : ['each emergent ray is parallel to its own incident ray,', 'and the shift d grows with the angle of incidence'];

  return (
    <>
      {art}
      <rect x={f(x0)} y={y0} width={w} height={h} rx={10} fill={INK.paper} opacity={0.96} stroke="rgba(0,0,0,.2)" />
      <Ink at={{ x: x0 + 11, y: y0 + 16 }} size={8.5} fill="#7f8f93" anchor="start" serif={false}>
        ALL YOUR FINISHED TRACES TOGETHER
      </Ink>
      {rows.map((row, j) => (
        <React.Fragment key={row.target}>
          <rect x={f(x0 + 11)} y={f(y0 + 32 + j * 17 - 7)} width={12} height={3.5} fill={row.colour} />
          <Ink at={{ x: x0 + 29, y: y0 + 32 + j * 17 }} size={10} fill="#3a3a42" anchor="start" serif={false}>
            {`i ${row.i.toFixed(1)}°  →  r ${row.r.toFixed(1)}°   e ${row.e.toFixed(1)}°   d ${row.d.toFixed(2)} cm`}
          </Ink>
        </React.Fragment>
      ))}
      {foot.map((line, j) => (
        <Ink
          key={line}
          at={{ x: x0 + 11, y: y0 + h - 19 + j * 11 }}
          size={8.5}
          fill="#8d8677"
          anchor="start"
          serif={false}
        >
          {line}
        </Ink>
      ))}
    </>
  );
}

function Pins({ state }: { state: GlassSlabState }): React.ReactElement {
  const tr = currentTrial(state);
  return (
    <>
      {tr.pins.map((p, k) => (
        <g key={k}>
          <circle cx={f(p.x)} cy={f(p.y)} r={6.4} fill="#000" opacity={0.18} />
          <circle
            cx={f(p.x)}
            cy={f(p.y)}
            r={5.4}
            fill={k < 2 ? INK.pinIncident : INK.pinEmergent}
            stroke="#fff"
            strokeWidth={1.2}
          />
          <circle cx={f(p.x - 1.5)} cy={f(p.y - 1.6)} r={1.5} fill="#fff" opacity={0.8} />
          <Ink
            at={{ x: p.x + 12, y: p.y - 7 }}
            size={11}
            fill={k < 2 ? '#a3252b' : '#14508f'}
            anchor="start"
            serif={false}
          >
            {`P${'₁₂₃₄'[k] ?? ''}`}
          </Ink>
        </g>
      ))}
    </>
  );
}

/** The sight line laid across the protractor's scale, and what it reads. */
function SightLine({ c, up, reading }: { c: Vec; up: boolean; reading: number }): React.ReactElement {
  const sgn = up ? -1 : 1;
  const at = (rad: number): Vec => ({
    x: c.x + rad * Math.cos(reading * RAD),
    y: c.y + sgn * rad * Math.sin(reading * RAD),
  });
  const tip = at(PR + 4);
  const lab = at(PR + 26);
  return (
    <>
      <line x1={f(c.x)} y1={f(c.y)} x2={f(tip.x)} y2={f(tip.y)} stroke="#0a84ff" strokeWidth={1.6} opacity={0.85} />
      <rect x={f(lab.x - 32)} y={f(lab.y - 11)} width={64} height={21} rx={6} fill="#0a3d6b" opacity={0.92} />
      <text
        x={f(lab.x)}
        y={f(lab.y) + 4}
        fontSize={9.5}
        textAnchor="middle"
        fill="#dff0ff"
        fontFamily={LABEL_FONT}
        fontWeight={700}
      >
        {`${reading}° → ∠${Math.abs(90 - reading)}°`}
      </text>
    </>
  );
}

/** How far the worst emergent pin is from the true line of sight, in mm. */
function emergentMiss(state: GlassSlabState): number | null {
  const tr = currentTrial(state);
  const offs = [2, 3].map((k) => {
    const p = tr.pins[k];
    const off = p ? sightOff(tr, state.slab, p) : null;
    return off === null ? null : Math.abs(off) / mm(1);
  });
  return offs.every((v) => v !== null) ? Math.max(...(offs as number[])) : null;
}

/** The crosshair, with how far it is from the line the images lie along. */
function Crosshair({
  state,
  slab,
  trialPins,
  trace,
}: {
  state: GlassSlabState;
  slab: SlabSpec;
  trialPins: number;
  trace: ReturnType<typeof traceOf>;
}): React.ReactElement | null {
  const h = state.cross;
  if (!inPaper(h)) return null;
  const sighting = state.held === 'pin' && trialPins >= 2 && trialPins < 4 && trace.real !== null;
  const off = sighting ? sightOff(currentTrial(state), slab, h) : null;
  const away = off === null ? null : Math.abs(off) / mm(1);
  const colour =
    away === null ? '#3b3b44' : away <= 1 ? '#1f9d55' : away <= 3 ? '#c97a00' : '#8a8a93';
  const note =
    away === null
      ? null
      : away <= 0.6
        ? 'in line'
        : `${away.toFixed(1)} mm ${(off ?? 0) > 0 ? 'right' : 'left'} of the line`;

  return (
    <g pointerEvents="none">
      <line x1={f(h.x - 11)} y1={f(h.y)} x2={f(h.x + 11)} y2={f(h.y)} stroke={colour} strokeWidth={1.1} opacity={0.85} />
      <line x1={f(h.x)} y1={f(h.y - 11)} x2={f(h.x)} y2={f(h.y + 11)} stroke={colour} strokeWidth={1.1} opacity={0.85} />
      <circle cx={f(h.x)} cy={f(h.y)} r={4.5} fill="none" stroke={colour} strokeWidth={1.4} />
      {note ? (
        <>
          <rect x={f(h.x + 12)} y={f(h.y + 6)} width={118} height={17} rx={5} fill={colour} opacity={0.92} />
          <text
            x={f(h.x + 71)}
            y={f(h.y + 18)}
            fontSize={9.5}
            textAnchor="middle"
            fill="#fff"
            fontFamily={LABEL_FONT}
            fontWeight={700}
          >
            {note}
          </text>
        </>
      ) : null}
    </g>
  );
}
