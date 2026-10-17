'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { keyframes } from '@mui/material/styles';

import type { Wire } from '@labs/lib/circuit';
import {
  BENCH_HEIGHT,
  BENCH_WIDTH,
  P,
  SLIDER_TRAVEL,
  SLIDER_X0,
  TERMINALS,
  terminalIdsFor,
  wiresAt,
  type TerminalId,
} from '@labs/lib/ohms-law/apparatus';
import type { LabMethod } from '@labs/lib/ohms-law/method';
import type { MeterId } from '@labs/lib/ohms-law/state';
import { clamp } from '@labs/lib/numbers';

import { apparatus } from '../apparatus-palette';
import { benchMotionSx, driftClass, driftStyle, motionSx, useBenchMotion, LAY_CLASS } from '../bench-motion';

import { BenchApparatus, BenchDefs, COIL, DRIFT_SCALE, SandPaper } from './bench-apparatus';

/**
 * The Ohm's law bench: the apparatus, and everything a student does to it.
 *
 * Wiring: tap a terminal then another to lay a wire, or drag between them; tap
 * a wire to remove it. The plug key toggles on tap. The rheostat's slider drags
 * along its rod. A meter's dial opens a close-up. Every one of those is also a
 * keyboard control: terminals are buttons (Enter arms, Enter on a second one
 * connects), the slider is a slider (← →), Esc disarms.
 *
 * Holds only interaction state (which terminal is armed, what is hovered).
 * Everything that matters, the wires, the key, the slider, lives in the lab's
 * store and arrives as props; changes leave as callbacks.
 */
export interface BenchProps {
  /**
   * Which apparatus is on the bench. Under the manual's own method the holder
   * shows a stud per cell and there is no rheostat; under the alternative the
   * holder has two ends and the rheostat is there. Terminals are drawn from
   * the same list the solver uses, so nothing can be wired that is not there.
   */
  method: LabMethod;
  wires: readonly Wire<TerminalId>[];
  keyIn: boolean;
  /** Whether the connecting-wire ends have been rubbed bright. */
  sanded: boolean;
  /** Rheostat slider, 0 at A to 1 at B. */
  slider: number;
  /** Temperature rise of the nichrome, °C, for the coil's glow. */
  heat: number;
  /**
   * How fast the electrons in the coil are moving, in metres per second, from
   * the solver's own answer (`driftSpeed(reading.Ir)`). Signed. The carriers
   * drawn on the coil run at exactly this and at nothing else, so the coil is
   * as good a reading of the current as the ammeter is.
   */
  drift: number;
  /** Terminals to pulse: a bought hint, a tour step. */
  pulse: readonly TerminalId[];
  /** Wires to flash as not part of the textbook layout (guided build). */
  stray: readonly number[];
  /** Changes whenever the bench should flash red (a short, an overload). */
  flashes: number;
  needles: Readonly<Record<MeterId, (el: SVGGElement | null) => void>>;
  /** Receives the bench `<svg>`, for a tour to spotlight regions of it. Keep it stable. */
  onSvg: (el: SVGSVGElement | null) => void;
  /**
   * Fill the box given instead of sizing from its width. The drawing scales to
   * fit and centres, so the apparatus is as large as the space allows — a
   * student has to read a needle against fifty divisions on it.
   */
  fill?: boolean;
  onConnect: (a: TerminalId, b: TerminalId) => void;
  onRemoveWire: (index: number) => void;
  onToggleKey: () => void;
  onSand: () => void;
  onSlider: (s: number) => void;
  onOpenLens: (meter: MeterId) => void;
}

const strayBlink = keyframes`50% { opacity: .35; }`;
const flashRed = keyframes`
  0% { box-shadow: inset 0 0 0 3px ${apparatus.stray}, 0 0 40px rgba(255,90,82,.5); }
  100% { box-shadow: inset 0 0 0 0 transparent; }
`;

function wireColor(a: TerminalId, b: TerminalId): string {
  const p = TERMINALS[a].pol ?? TERMINALS[b].pol;
  return p === '+' ? apparatus.wireRed : p === '-' ? apparatus.wireBlack : apparatus.wireBrass;
}

/** A wire hangs in a curve, sagging more the longer it is. */
function wirePath(a: TerminalId, b: TerminalId): string {
  const A = TERMINALS[a];
  const B = TERMINALS[b];
  const sag = 26 + Math.hypot(B.x - A.x, B.y - A.y) * 0.16;
  return `M${A.x} ${A.y} C${A.x} ${A.y + sag} ${B.x} ${B.y + sag} ${B.x} ${B.y}`;
}

export function Bench({
  method,
  wires,
  keyIn,
  sanded,
  slider,
  heat,
  drift,
  pulse,
  stray,
  flashes,
  needles,
  onSvg,
  fill = false,
  onConnect,
  onRemoveWire,
  onToggleKey,
  onSand,
  onSlider,
  onOpenLens,
}: BenchProps): React.ReactElement {
  const gid = `b${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const moving = useBenchMotion();
  const [armed, setArmed] = React.useState<TerminalId | null>(null);
  const [hover, setHover] = React.useState<{ id: TerminalId; left: number; top: number } | null>(null);
  const svg = React.useRef<SVGSVGElement | null>(null);
  const root = React.useRef<HTMLDivElement>(null);
  const pending = React.useRef<SVGPathElement>(null);
  const gesture = React.useRef<'none' | 'wire' | 'slider'>('none');

  const setSvg = React.useCallback(
    (el: SVGSVGElement | null) => {
      svg.current = el;
      onSvg(el);
    },
    [onSvg],
  );

  const arm = (id: TerminalId | null): void => {
    setArmed(id);
    if (!id) pending.current?.setAttribute('opacity', '0');
  };

  const toBench = (e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const terminalAt = (e: { clientX: number; clientY: number }): Element | null =>
    document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-terminal]') ?? null;

  const idOf = (el: Element | null): TerminalId | null =>
    (el?.getAttribute('data-terminal') as TerminalId | null) ?? null;

  /**
   * The hovered terminal's name, placed from the terminal's OWN position on
   * screen rather than from its bench coordinates as a percentage: the drawing
   * is letterboxed inside its box when it fills, so a percentage of the box is
   * not where the terminal is.
   */
  const showTip = (el: Element | null): void => {
    const id = idOf(el);
    if (!id) {
      if (hover) setHover(null);
      return;
    }
    if (hover?.id === id) return;
    const box = root.current?.getBoundingClientRect();
    const ring = el!.querySelector('.ring')?.getBoundingClientRect();
    if (!box || !ring) return;
    setHover({ id, left: ring.x + ring.width / 2 - box.x, top: ring.y - box.y });
  };

  const moveSlider = (e: { clientX: number; clientY: number }): void => {
    const p = toBench(e);
    if (p) onSlider(clamp((p.x - SLIDER_X0) / SLIDER_TRAVEL, 0, 1));
  };

  const activateTerminal = (id: TerminalId): void => {
    if (armed && armed !== id) {
      onConnect(armed, id);
      arm(null);
    } else {
      arm(armed === id ? null : id);
    }
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    const target = e.target as Element;
    const term = target.closest('[data-terminal]');
    if (term) {
      e.preventDefault();
      const id = term.getAttribute('data-terminal') as TerminalId;
      if (armed && armed !== id) {
        onConnect(armed, id);
        arm(null);
      } else if (armed === id) {
        arm(null);
      } else {
        arm(id);
        gesture.current = 'wire';
      }
      return;
    }
    if (target.closest('[data-slider]')) {
      gesture.current = 'slider';
      e.currentTarget.setPointerCapture(e.pointerId);
      moveSlider(e);
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (gesture.current === 'slider') {
      moveSlider(e);
      return;
    }
    showTip(terminalAt(e));
    if (armed && pending.current) {
      const p = toBench(e);
      const A = TERMINALS[armed];
      if (p) {
        pending.current.setAttribute('d', `M${A.x} ${A.y} L${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
        pending.current.setAttribute('opacity', '0.8');
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (gesture.current === 'slider') {
      gesture.current = 'none';
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      return;
    }
    if (gesture.current === 'wire') {
      gesture.current = 'none';
      const over = idOf(terminalAt(e));
      if (armed && over && over !== armed) {
        onConnect(armed, over);
        arm(null);
      }
    }
  };

  /**
   * Hit priority: terminals, then the apparatus a student OPERATES (the key,
   * the slider, a meter dial), and only then a wire.
   *
   * Wires are drawn over the apparatus, as real wires lie across a bench, so
   * they used to win the hit test: about a fifth of the plug key's face and of
   * the slider's grab box belonged to whatever wire crossed it, and tapping
   * there DELETED that wire — on a checked circuit that costs marks and reads
   * as the bench eating your work. Operating a control is reversible; deleting
   * a wire is not, so the control wins and the wire is removed by tapping any
   * of the rest of its length.
   */
  const onClick = (e: React.MouseEvent<SVGSVGElement>): void => {
    const target = e.target as Element;
    if (target.closest('[data-terminal]')) return;
    if (target.closest('[data-key]')) {
      onToggleKey();
      return;
    }
    if (target.closest('[data-sand]')) {
      onSand();
      return;
    }
    if (target.closest('[data-slider]')) return;
    const lens = target.closest('[data-lens]');
    if (lens && !armed) {
      onOpenLens(lens.getAttribute('data-lens') as MeterId);
      return;
    }
    const wire = target.closest('[data-wire]');
    if (wire && !armed) {
      onRemoveWire(Number(wire.getAttribute('data-wire')));
      return;
    }
    if (armed && !wire) arm(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>): void => {
    const target = e.target as Element;
    const act = e.key === 'Enter' || e.key === ' ';
    if (e.key === 'Escape' && armed) {
      e.preventDefault();
      arm(null);
      return;
    }
    const term = target.getAttribute('data-terminal') as TerminalId | null;
    if (term && act) {
      e.preventDefault();
      activateTerminal(term);
    } else if (target.hasAttribute('data-key') && act) {
      e.preventDefault();
      onToggleKey();
    } else if (target.hasAttribute('data-sand') && act) {
      e.preventDefault();
      onSand();
    } else if (target.hasAttribute('data-slider') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      onSlider(clamp(slider + (e.key === 'ArrowRight' ? 0.02 : -0.02), 0, 1));
    } else if (target.hasAttribute('data-lens') && act) {
      e.preventDefault();
      onOpenLens(target.getAttribute('data-lens') as MeterId);
    }
  };

  const glow = clamp((heat - 8) / 60, 0, 0.55);
  // A coil carrying nothing is drawn as a coil, not as stationary charge: a
  // dead circuit should look dead whether or not the bench is animating.
  const carriers = Math.abs(drift) * DRIFT_SCALE >= 0.05;

  return (
    <Box
      ref={root}
      sx={{
        position: 'relative',
        ...(fill ? { flex: 1, minWidth: 0, minHeight: 0, display: 'flex' } : null),
        userSelect: 'none',
        WebkitUserSelect: 'none',
        '& .term': { cursor: 'crosshair', outline: 'none' },
        '& .term .ring': { transition: 'r .15s cubic-bezier(.32,.72,0,1)' },
        '& .term:hover .ring, & .term.armed .ring, & .term:focus-visible .ring': { r: 12 },
        '& .term.armed .ring': { stroke: '#fff', strokeWidth: 2.5 },
        '& .term:focus-visible .ring': { stroke: apparatus.hintRing, strokeWidth: 2.5 },
        '& .wire': { cursor: 'pointer' },
        '& .wire:hover .w-body': { strokeWidth: 8 },
        '& .wire.stray .w-body': { stroke: apparatus.stray },
        '& .wire.stray': { animation: `${strayBlink} .9s ease-in-out infinite` },
        '& .hot': { cursor: 'pointer', outline: 'none' },
        '& .hot:focus-visible': { outline: `2px solid ${apparatus.hintRing}`, outlineOffset: 2 },
        ...benchMotionSx,
        // This bench spells a pulsed target `.term.pulse .ring`; the shared rule
        // names `.pulse .focus`, which the terminals do not have.
        '& .term.pulse .ring': benchMotionSx['& .pulse .focus'],
        ...motionSx(moving),
      }}
    >
      <svg
        ref={setSvg}
        viewBox={`0 0 ${BENCH_WIDTH} ${BENCH_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label={
          method === 'cells'
            ? 'Lab bench with a four-cell holder tapped between every cell, plug key, ammeter, voltmeter, nichrome resistor and sand paper'
            : 'Lab bench with battery, plug key, ammeter, voltmeter, nichrome resistor, rheostat and sand paper'
        }
        style={
          fill
            ? { display: 'block', width: '100%', height: '100%', touchAction: 'none' }
            : { display: 'block', width: '100%', height: 'auto', touchAction: 'none' }
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <BenchDefs gid={gid} />
        <BenchApparatus gid={gid} method={method} needles={needles} />
        <SandPaper gid={gid} sanded={sanded} />

        {/* The nichrome glows as it heats, then the coil is redrawn over its glow. */}
        <path d={COIL} fill="none" stroke={apparatus.glow} strokeWidth={5} opacity={glow} filter={`url(#${gid}glow)`} />
        <path d={COIL} fill="none" stroke="#c9c7bd" strokeWidth={1.6} strokeLinejoin="round" />
        {/*
          The charge in the coil. Its speed is `driftSpeed(reading.Ir)` and
          nothing else, so pushing the rheostat's slider towards A speeds the
          carriers up and lifts the ammeter needle by the same act, and taking
          the key out stops both. Wire the circuit backwards and they run
          backwards. Nothing here is told to the student in words: it is the
          same current, drawn where the current is.
        */}
        {carriers ? (
          <path
            className={driftClass(drift < 0 ? -1 : 1)}
            style={driftStyle(Math.abs(drift) * DRIFT_SCALE)}
            d={COIL}
            fill="none"
            stroke={apparatus.hintRing}
            strokeWidth={3.2}
            strokeLinecap="round"
            opacity={0.75}
            pointerEvents="none"
          />
        ) : null}

        <g>
          {wires.map(([a, b], i) => {
            const d = wirePath(a, b);
            return (
              <g key={`${a}-${b}-${i}`} data-wire={i} className={`wire${stray.includes(i) ? ' stray' : ''}`}>
                <path d={d} fill="none" stroke="rgba(255,255,255,.13)" strokeWidth={9} strokeLinecap="round" />
                {/* Laid, not conjured: the body draws from one terminal to the
                    other the first time this wire is mounted. */}
                <path
                  className={`w-body ${LAY_CLASS}`}
                  pathLength={1}
                  d={d}
                  fill="none"
                  stroke={wireColor(a, b)}
                  strokeWidth={6}
                  strokeLinecap="round"
                />
                <path d={d} fill="none" stroke="#fff" strokeOpacity={0.25} strokeWidth={1.4} transform="translate(-1 -1.6)" />
                <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
              </g>
            );
          })}
        </g>

        {/*
          The controls a student OPERATES are drawn after the wires, so a wire
          lying across the plug key or the slider cannot take the tap meant for
          them. See `onClick` for the matching hit priority.
        */}
        <g
          data-key=""
          className="hot"
          tabIndex={0}
          role="switch"
          aria-checked={keyIn}
          aria-label={keyIn ? 'Plug key: in, circuit closed' : 'Plug key: out, circuit open'}
        >
          <rect x={338} y={430} width={210} height={96} fill="transparent" />
          {keyIn ? (
            <g>
              <rect x={411} y={468} width={18} height={30} rx={2} fill={`url(#${gid}brass)`} />
              <rect x={405} y={436} width={30} height={34} rx={6} fill="#141414" stroke="#3a3a3a" />
              <rect x={410} y={440} width={5} height={26} rx={2} fill="#fff" opacity={0.12} />
            </g>
          ) : (
            <g transform="translate(528 500) rotate(90)">
              <rect x={-9} y={-3} width={18} height={30} rx={2} fill={`url(#${gid}brass)`} />
              <rect x={-15} y={-35} width={30} height={34} rx={6} fill="#141414" stroke="#3a3a3a" />
            </g>
          )}
        </g>

        {/* The rheostat's sliding contact, with a grab box a thumb can find.
            There is no rheostat at all under the manual's own method. */}
        {method === 'rheostat' ? (
          <g
            data-slider=""
            className="hot"
            tabIndex={0}
            role="slider"
            aria-label="Rheostat sliding contact"
            aria-valuemin={0}
            aria-valuemax={P.rRh}
            aria-valuenow={Number((P.rRh * slider).toFixed(1))}
            aria-valuetext={`${Math.round(slider * 100)}% of the coil from end A`}
            transform={`translate(${SLIDER_X0 + SLIDER_TRAVEL * slider} 0)`}
            style={{ cursor: 'ew-resize' }}
          >
            <rect x={-34} y={424} width={68} height={100} fill="transparent" />
            <line x1={0} y1={462} x2={0} y2={487} stroke="#c9ccd0" strokeWidth={2.5} />
            <rect x={-14} y={440} width={28} height={26} rx={4} fill="#40464d" stroke="#5d646b" />
            <rect x={-10} y={444} width={20} height={4} rx={2} fill="#fff" opacity={0.12} />
          </g>
        ) : null}

        {/* Terminals last, so a wire lying over one never blocks it. */}
        <g>
          {terminalIdsFor(method).map((id) => {
            const T = TERMINALS[id];
            const fill = T.pol === '+' ? apparatus.terminalRed : T.pol === '-' ? apparatus.terminalBlack : `url(#${gid}brass)`;
            const cls = ['term', armed === id ? 'armed' : '', pulse.includes(id) ? 'pulse' : ''].join(' ');
            const count = wiresAt(wires, id);
            return (
              <g
                key={id}
                data-terminal={id}
                className={cls}
                tabIndex={0}
                role="button"
                aria-pressed={armed === id}
                aria-label={`${T.name}${count ? `, ${count} wire${count === 1 ? '' : 's'}` : ''}`}
              >
                {/* A generous, invisible target: the visible ring is 9 units
                    across, which is well under a finger at any bench size. */}
                <circle cx={T.x} cy={T.y} r={26} fill="transparent" />
                <circle
                  className="ring"
                  cx={T.x}
                  cy={T.y}
                  r={9}
                  fill={fill}
                  stroke={T.pol === '-' ? '#6a6f73' : '#00000066'}
                  strokeWidth={1.5}
                />
                <circle cx={T.x - 2.5} cy={T.y - 2.5} r={2.4} fill="#fff" opacity={0.35} pointerEvents="none" />
              </g>
            );
          })}
        </g>

        <path ref={pending} fill="none" stroke="#fff" strokeWidth={2} strokeDasharray="6 5" opacity={0} pointerEvents="none" />
      </svg>

      {/* The terminal's name, placed from where the terminal actually is. */}
      <Box
        aria-hidden="true"
        sx={{
          position: 'absolute',
          pointerEvents: 'none',
          left: hover?.left ?? 0,
          top: hover?.top ?? 0,
          transform: 'translate(-50%, -130%)',
          backgroundColor: 'rgba(10,12,12,.92)',
          color: '#e9efed',
          fontSize: 12,
          px: 1,
          py: 0.5,
          borderRadius: '6px',
          whiteSpace: 'nowrap',
          opacity: hover ? 1 : 0,
          transition: 'opacity .12s',
        }}
      >
        {hover ? TERMINALS[hover.id].name : null}
      </Box>

      {flashes > 0 ? (
        <Box
          key={flashes}
          aria-hidden="true"
          sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', animation: `${flashRed} .6s ease-out forwards` }}
        />
      ) : null}
    </Box>
  );
}
