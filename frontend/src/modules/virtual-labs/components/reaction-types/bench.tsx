'use client';

import * as React from 'react';
import Box from '@mui/material/Box';

import {
  SP,
  THERMO_MAX,
  VDEF,
  fmtMin,
  tempOf,
  type ReagentKey,
  type Vessel,
} from '@labs/lib/reaction-types/chemistry';
import type { ReactionTypesState, ToolKind } from '@labs/lib/reaction-types/state';

import { apparatus, LABEL_FONT } from '../apparatus-palette';
import { benchMotionSx, motionSx, pulseAnimation, useBenchMotion } from '../bench-motion';

import { Flame, VesselArt } from './vessel-art';

/**
 * The chemistry bench: reagent bottles, a tool tray, a lab clock, five vessels
 * in a rack, and a Bunsen burner.
 *
 * One gesture the whole way through, the one a real bench has: pick a thing up,
 * then tap the vessel you want it in. Tapping a vessel with empty hands only
 * looks at it. Every control is a button, so Tab and Enter reach all of them.
 *
 * The drawing holds no state of its own — what is in each tube, what is in the
 * hand, where the burner is and whether it is lit all arrive as props, and every
 * tap leaves as a callback.
 */
export const BENCH_WIDTH = 1000;
export const BENCH_HEIGHT = 600;

export const TUBE = { top: 316, bottom: 498, w: 34, mlPx: 7, gPx: 11 } as const;
/** Where the burner stands when it is not under anything. */
export const BURN_PARK = 770;

interface BottleSpec {
  k: ReagentKey;
  x: number;
  name: string;
  lab: string;
  sub: string;
}

export const BOTTLES: readonly BottleSpec[] = [
  { k: 'CaO', x: 70, name: 'quicklime, CaO', lab: 'CaO', sub: 'quicklime' },
  { k: 'H2O', x: 156, name: 'distilled water', lab: 'H₂O', sub: 'water' },
  { k: 'FeSO4x7', x: 242, name: 'ferrous sulphate crystals', lab: 'FeSO₄', sub: 'crystals' },
  { k: 'CuSO4', x: 328, name: 'copper sulphate solution', lab: 'CuSO₄', sub: 'dilute · aq' },
  { k: 'Na2SO4', x: 414, name: 'sodium sulphate solution', lab: 'Na₂SO₄', sub: 'dilute · aq' },
  { k: 'BaCl2', x: 500, name: 'barium chloride solution', lab: 'BaCl₂', sub: 'dilute · aq' },
];


export interface ReactionBenchProps {
  state: ReactionTypesState;
  /** Things a tour step is naming: `tool:CaO`, `tool:burner`, `tube:2`. */
  pulse: readonly string[];
  /** Receives the bench `<svg>`, for a tour to spotlight regions of it. Keep it stable. */
  onSvg: (el: SVGSVGElement | null) => void;
  onReagent: (k: ReagentKey) => void;
  onTool: (tool: ToolKind) => void;
  onVessel: (k: number) => void;
  /** Escape, which is how a pair of hands is emptied without aiming at a button. */
  onPutDown: () => void;
  fill?: boolean;
}

export function ReactionBench({
  state,
  pulse,
  onSvg,
  onReagent,
  onTool,
  onVessel,
  onPutDown,
  fill = false,
}: ReactionBenchProps): React.ReactElement {
  const gid = `rx${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const moving = useBenchMotion();
  const held = state.held;
  const lit = (name: string): string => (pulse.includes(name) ? ' pulse' : '');
  const key = (run: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      run();
    }
  };

  const burnerX = state.burnerAt === null ? BURN_PARK : VDEF[state.burnerAt]!.x;
  const thermoVessel = state.thermoIn !== null && !state.thermoBroken ? state.vessels[state.thermoIn] : null;

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        ...(fill ? { flex: 1, minWidth: 0, minHeight: 0, display: 'flex' } : null),
        userSelect: 'none',
        WebkitUserSelect: 'none',
        // Shared motion first, so this bench's own rules refine it rather than
        // replace it; `motionSx` last, so stopping beats everything above it.
        ...benchMotionSx,
        '& .hot': { cursor: 'pointer', outline: 'none' },
        '& .hot .focus': { transition: 'stroke .15s' },
        '& .hot:hover .focus': { stroke: 'rgba(255,255,255,.35)', strokeWidth: 2 },
        '& .hot:focus-visible .focus': { stroke: apparatus.hintRing, strokeWidth: 3 },
        '& .hot.pulse .focus': { animation: pulseAnimation },
        '& .lift': { transition: 'transform .25s cubic-bezier(.32,.72,0,1)' },
        '& .picked .lift': { transform: 'translateY(-10px)' },
        '& .sel .focus': { stroke: apparatus.hintRing, strokeWidth: 2.5 },
        ...motionSx(moving),
      }}
    >
      <svg
        ref={onSvg}
        viewBox={`0 0 ${BENCH_WIDTH} ${BENCH_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Chemistry bench: reagent bottles, iron nails, litmus paper, a thermometer, a stopper, a burner, a lab clock and five vessels"
        /* Escape puts down whatever is in the student's hand. The key is caught
           here rather than on each hot area because it bubbles from whichever
           one has focus, and because a hand can be full while nothing on the
           bench is focused at all. */
        onKeyDown={(e) => {
          if (e.key === 'Escape') onPutDown();
        }}
        style={
          fill
            ? { display: 'block', width: '100%', height: '100%', touchAction: 'manipulation' }
            : { display: 'block', width: '100%', height: 'auto', touchAction: 'manipulation' }
        }
      >
        <defs>
          <radialGradient id={`${gid}-lamp`} cx="45%" cy="38%" r="75%">
            <stop offset="0" stopColor="#2b3533" />
            <stop offset=".6" stopColor={apparatus.bench} />
            <stop offset="1" stopColor="#121817" />
          </radialGradient>
          <linearGradient id={`${gid}-wood`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9a6d3e" />
            <stop offset="1" stopColor="#6c4826" />
          </linearGradient>
          <linearGradient id={`${gid}-tile`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f1eee7" />
            <stop offset="1" stopColor="#d9d4c8" />
          </linearGradient>
          <linearGradient id={`${gid}-flame`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#7fc4ff" />
            <stop offset=".45" stopColor="#ffb545" />
            <stop offset="1" stopColor="#ffe9a8" />
          </linearGradient>
          <filter id={`${gid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <rect width={BENCH_WIDTH} height={BENCH_HEIGHT} fill={`url(#${gid}-lamp)`} />
        <rect y={592} width={BENCH_WIDTH} height={8} fill={apparatus.benchEdge} />

        {/* --- the reagent shelf ------------------------------------------- */}
        {BOTTLES.map((b) => {
          const sp = SP[b.k];
          const picked = held?.kind === 'bottle' && held.k === b.k;
          const liq = sp.sol ? `rgba(${sp.sol.join(',')},${Math.max(sp.a ?? 0, 0.16) + 0.12})` : sp.solid;
          return (
            <g
              key={b.k}
              className={`hot${picked ? ' picked' : ''}${lit(`tool:${b.k}`)}`}
              role="button"
              tabIndex={0}
              aria-label={b.name}
              aria-pressed={picked}
              onClick={() => onReagent(b.k)}
              onKeyDown={key(() => onReagent(b.k))}
            >
              <g className="lift">
                <rect x={b.x - 26} y={104} width={56} height={96} rx={9} fill="#000" opacity={0.3} filter={`url(#${gid}-soft)`} />
                <rect
                  x={b.x - 29}
                  y={98}
                  width={58}
                  height={96}
                  rx={10}
                  fill="rgba(255,255,255,.06)"
                  stroke="rgba(255,255,255,.4)"
                  strokeWidth={1.4}
                />
                <rect x={b.x - 26} y={sp.sol ? 124 : 146} width={52} height={sp.sol ? 67 : 45} rx={7} fill={liq} />
                {sp.sol
                  ? null
                  : Array.from({ length: 16 }, (_, i) => (
                      <circle key={i} cx={b.x - 22 + ((i * 37) % 45)} cy={150 + ((i * 53) % 42)} r={2.6} fill="#000" opacity={0.14} />
                    ))}
                <rect x={b.x - 10} y={80} width={20} height={20} rx={3} fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.35)" />
                <path d={`M${b.x - 8} 82 V60 Q${b.x} 46 ${b.x + 8} 60 V82 Z`} fill="#2a2a2c" stroke="#4a4a4e" />
                <rect x={b.x - 25} y={132} width={50} height={30} rx={3} fill="#f4f1ea" />
                <text x={b.x} y={146} fontSize={11} textAnchor="middle" fill="#1d1d1b" fontFamily="Georgia, serif">
                  {b.lab}
                </text>
                <text x={b.x} y={157} fontSize={6.8} textAnchor="middle" fill="#6b6658" fontFamily={LABEL_FONT}>
                  {b.sub}
                </text>
                <rect className="focus" x={b.x - 34} y={42} width={68} height={158} rx={9} fill="none" stroke="transparent" />
              </g>
            </g>
          );
        })}

        {/* --- the tool tray ------------------------------------------------ */}
        <rect x={551} y={100} width={300} height={128} rx={9} fill="#000" opacity={0.35} filter={`url(#${gid}-soft)`} />
        <rect x={548} y={94} width={300} height={128} rx={9} fill={`url(#${gid}-tile)`} />

        <Tool
          name="nails"
          label="Two clean iron nails"
          picked={held?.kind === 'nails'}
          pulsing={pulse.includes('tool:nails')}
          onPick={onTool}
          focus={[566, 112, 62, 98]}
        >
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`rotate(${-24 + i * 26} 596 160)`}>
              <rect x={591} y={126} width={9} height={52} fill="#7b8086" />
              <polygon points="591,178 600,178 595.5,186" fill="#7b8086" />
              <rect x={586} y={121} width={19} height={6} rx={1.5} fill="#8d9299" />
              <rect x={593} y={129} width={2.4} height={46} fill="#fff" opacity={0.35} />
            </g>
          ))}
          <text x={596} y={204} fontSize={10} textAnchor="middle" fill="#2a2a28" fontFamily={LABEL_FONT} fontWeight={700}>
            IRON NAILS
          </text>
        </Tool>

        <Tool
          name="litmusR"
          label="Red litmus paper"
          picked={held?.kind === 'litmusR'}
          pulsing={pulse.includes('tool:litmusR')}
          onPick={onTool}
          focus={[642, 114, 42, 76]}
        >
          <rect x={648} y={120} width={30} height={62} rx={3} fill="#d9534f" stroke="#9c3b38" />
          <rect x={652} y={124} width={22} height={10} rx={2} fill="#e8817e" />
          <text x={663} y={196} fontSize={9} textAnchor="middle" fill="#2a2a28" fontFamily={LABEL_FONT} fontWeight={700}>
            RED
          </text>
        </Tool>

        <Tool
          name="litmusB"
          label="Blue litmus paper"
          picked={held?.kind === 'litmusB'}
          pulsing={pulse.includes('tool:litmusB')}
          onPick={onTool}
          focus={[682, 114, 42, 76]}
        >
          <rect x={688} y={120} width={30} height={62} rx={3} fill="#3f6fb5" stroke="#2c4e80" />
          <rect x={692} y={124} width={22} height={10} rx={2} fill="#7699d1" />
          <text x={703} y={196} fontSize={9} textAnchor="middle" fill="#2a2a28" fontFamily={LABEL_FONT} fontWeight={700}>
            BLUE
          </text>
        </Tool>
        <text x={683} y={209} fontSize={8} textAnchor="middle" fill="#6b6658" fontFamily={LABEL_FONT}>
          litmus paper
        </text>

        {state.thermoBroken ? (
          <g>
            <text x={766} y={160} fontSize={9.5} textAnchor="middle" fill="#9c3b38" fontFamily={LABEL_FONT} fontWeight={700}>
              thermometer
            </text>
            <text x={766} y={172} fontSize={9.5} textAnchor="middle" fill="#9c3b38" fontFamily={LABEL_FONT} fontWeight={700}>
              broken
            </text>
          </g>
        ) : (
          <Tool
            name="thermo"
            label={`Laboratory thermometer, minus 10 to ${THERMO_MAX} degrees`}
            picked={held?.kind === 'thermo'}
            pulsing={pulse.includes('tool:thermo')}
            onPick={onTool}
            focus={[750, 110, 34, 100]}
          >
            <rect x={760} y={116} width={12} height={72} rx={6} fill="#fefdfa" stroke="#b5b0a2" />
            <rect x={764} y={150} width={4} height={34} fill="#cf2d22" />
            <circle cx={766} cy={186} r={6.5} fill="#cf2d22" stroke="#b5b0a2" />
            {[0, 1, 2, 3, 4].map((i) => (
              <line key={i} x1={766} y1={126 + i * 11} x2={772} y2={126 + i * 11} stroke="#8e8a7e" strokeWidth={0.8} />
            ))}
            <text x={766} y={206} fontSize={9} textAnchor="middle" fill="#2a2a28" fontFamily={LABEL_FONT} fontWeight={700}>
              °C
            </text>
          </Tool>
        )}

        <Tool
          name="stopper"
          label="Rubber stopper"
          picked={held?.kind === 'stopper'}
          pulsing={pulse.includes('tool:stopper')}
          onPick={onTool}
          focus={[798, 126, 46, 84]}
        >
          <path d="M806 140 L834 140 L830 184 L810 184 Z" fill="#b98b55" stroke="#6f5027" />
          <rect x={804} y={132} width={32} height={10} rx={3} fill="#cfa06a" stroke="#6f5027" />
          <text x={820} y={204} fontSize={9} textAnchor="middle" fill="#2a2a28" fontFamily={LABEL_FONT} fontWeight={700}>
            CORK
          </text>
        </Tool>

        {/* --- the lab clock ------------------------------------------------ */}
        <LabClock min={state.min} soft={`${gid}-soft`} />

        <BenchLabel x={285} y={250} text="REAGENTS" />
        <BenchLabel x={698} y={250} text="TOOLS" />
        <BenchLabel x={912} y={250} text="LAB CLOCK" />

        {/* --- the rack ------------------------------------------------------ */}
        <rect x={46} y={330} width={908} height={16} rx={3} fill={`url(#${gid}-wood)`} />
        <rect x={46} y={330} width={14} height={242} fill={`url(#${gid}-wood)`} />
        <rect x={940} y={330} width={14} height={242} fill={`url(#${gid}-wood)`} />
        <rect x={46} y={558} width={908} height={14} rx={3} fill={`url(#${gid}-wood)`} />

        {/* --- the burner ---------------------------------------------------- */}
        <g
          className={`hot${held?.kind === 'burner' ? ' picked' : ''}${lit('tool:burner')}`}
          role="button"
          tabIndex={0}
          aria-label={`Bunsen burner${state.flame ? ', lit' : ''}${
            state.burnerAt === null ? ', on the bench' : `, under ${VDEF[state.burnerAt]!.name}`
          }`}
          aria-pressed={held?.kind === 'burner'}
          onClick={() => onTool('burner')}
          onKeyDown={key(() => onTool('burner'))}
        >
          <g className="lift">
            {state.flame ? <Flame x={burnerX} y={526} gradient={`${gid}-flame`} /> : null}
            <rect x={burnerX - 5} y={526} width={10} height={26} rx={2} fill="#8e949a" />
            <rect x={burnerX - 7} y={522} width={14} height={6} rx={2} fill="#a8aeb4" />
            <ellipse cx={burnerX} cy={555} rx={24} ry={6} fill="#5d6369" />
            <ellipse cx={burnerX} cy={552} rx={24} ry={6} fill="#7e848a" />
            <rect x={burnerX + 4} y={540} width={13} height={5} rx={2} fill="#6d7379" />
            <rect className="focus" x={burnerX - 30} y={490} width={60} height={72} rx={8} fill="none" stroke="transparent" />
          </g>
        </g>
        {state.burnerAt === null ? <BenchLabel x={BURN_PARK} y={578} text="BURNER" /> : null}

        {/* --- the vessels ---------------------------------------------------- */}
        {state.vessels.map((v, k) => (
          <g
            key={k}
            className={`hot${state.sel === k ? ' sel' : ''}${lit(`tube:${k}`)}`}
            role="button"
            tabIndex={0}
            aria-label={VDEF[k]!.name}
            onClick={() => onVessel(k)}
            onKeyDown={key(() => onVessel(k))}
          >
            <rect
              className="focus"
              x={VDEF[k]!.x - 24}
              y={TUBE.top - 10}
              width={48}
              height={TUBE.bottom - TUBE.top + 20}
              rx={8}
              fill="rgba(0,0,0,0)"
              stroke="transparent"
            />
            <VesselArt
              v={v}
              cx={VDEF[k]!.x}
              top={TUBE.top}
              bottom={TUBE.bottom}
              w={TUBE.w}
              mlPx={TUBE.mlPx}
              gPx={TUBE.gPx}
              uid={`${gid}-b${k}`}
              minutesPerSecond={state.rate}
              thermo={state.thermoIn === k && !state.thermoBroken}
            />
          </g>
        ))}

        {VDEF.map((d) => (
          <text
            key={d.id}
            x={d.x}
            y={588}
            fontSize={11}
            textAnchor="middle"
            fill={d.id === 'ctrl' ? '#8a9794' : apparatus.benchInk}
            fontFamily={LABEL_FONT}
            fontWeight={600}
          >
            {d.label}
          </text>
        ))}

        {/* --- what the thermometer reads ------------------------------------ */}
        {thermoVessel ? <ThermoReadout v={thermoVessel} x={VDEF[thermoVessel.k]!.x + 30} /> : null}
      </svg>
    </Box>
  );
}

function Tool({
  name,
  label,
  picked,
  pulsing,
  onPick,
  focus,
  children,
}: {
  name: ToolKind;
  label: string;
  picked: boolean;
  pulsing: boolean;
  onPick: (t: ToolKind) => void;
  focus: readonly [number, number, number, number];
  children: React.ReactNode;
}): React.ReactElement {
  const [x, y, w, h] = focus;
  return (
    <g
      className={`hot${picked ? ' picked' : ''}${pulsing ? ' pulse' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={picked}
      onClick={() => onPick(name)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPick(name);
        }
      }}
    >
      <g className="lift">
        {children}
        <rect className="focus" x={x} y={y} width={w} height={h} rx={6} fill="none" stroke="transparent" />
      </g>
    </g>
  );
}

function BenchLabel({ x, y, text }: { x: number; y: number; text: string }): React.ReactElement {
  return (
    <text
      x={x}
      y={y}
      fontSize={11}
      textAnchor="middle"
      fill={apparatus.benchLabel}
      fontFamily={LABEL_FONT}
      fontWeight={600}
      letterSpacing={1.4}
    >
      {text}
    </text>
  );
}

/** The wall clock. Nothing on this bench moves until its hand does. */
function LabClock({ min, soft }: { min: number; soft: string }): React.ReactElement {
  const cx = 912;
  const cy = 158;
  const a = ((min % 60) * 6 * Math.PI) / 180;
  return (
    <g aria-hidden="true">
      <circle cx={cx} cy={cy} r={60} fill="#000" opacity={0.3} filter={`url(#${soft})`} />
      <circle cx={cx} cy={cy} r={56} fill="#f3eedf" stroke="#2b2f33" strokeWidth={5} />
      {Array.from({ length: 60 }, (_, k) => {
        const r0 = k % 5 ? 48 : 43;
        const an = (k * 6 * Math.PI) / 180;
        return (
          <line
            key={k}
            x1={cx + r0 * Math.sin(an)}
            y1={cy - r0 * Math.cos(an)}
            x2={cx + 51 * Math.sin(an)}
            y2={cy - 51 * Math.cos(an)}
            stroke="#1d1d1b"
            strokeWidth={k % 5 ? 0.6 : 1.4}
          />
        );
      })}
      {[0, 15, 30, 45].map((k) => {
        const an = (k * 6 * Math.PI) / 180;
        return (
          <text
            key={k}
            x={cx + 34 * Math.sin(an)}
            y={cy - 34 * Math.cos(an) + 4}
            fontSize={10}
            textAnchor="middle"
            fill="#1d1d1b"
            fontFamily="Georgia, serif"
          >
            {k}
          </text>
        );
      })}
      <text x={cx} y={cy + 22} fontSize={11} textAnchor="middle" fill="#6b6658" fontFamily={LABEL_FONT} fontWeight={600}>
        {fmtMin(min)}
      </text>
      <line
        x1={cx}
        y1={cy}
        x2={cx + 44 * Math.sin(a)}
        y2={cy - 44 * Math.cos(a)}
        stroke={apparatus.needle}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={4} fill={apparatus.pivot} />
    </g>
  );
}

function ThermoReadout({ v, x }: { v: Vessel; x: number }): React.ReactElement {
  const T = tempOf(v);
  const over = T > THERMO_MAX;
  return (
    <g>
      <rect x={x} y={TUBE.top - 34} width={62} height={22} rx={6} fill={apparatus.benchEdge} opacity={0.82} />
      <text
        x={x + 31}
        y={TUBE.top - 19}
        fontSize={12}
        textAnchor="middle"
        fill={over ? '#ff9d92' : T > 45 ? '#ffcf8f' : '#cfe8ff'}
        fontFamily={LABEL_FONT}
        fontWeight={600}
      >
        {over ? 'off scale' : `${T.toFixed(0)} °C`}
      </text>
    </g>
  );
}
