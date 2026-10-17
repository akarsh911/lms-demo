'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { keyframes } from '@mui/material/styles';

import { DROPS, WATERS, WATER_BY_ID, type Lather, type WaterId } from '@labs/lib/soap/chemistry';
import { TUBES } from '@labs/lib/soap/marking';
import type { Held, Tube } from '@labs/lib/soap/state';

import { apparatus, LABEL_FONT } from '../apparatus-palette';
import { benchMotionSx, motionSx, pulseAnimation, useBenchMotion } from '../bench-motion';

import { SCALE_COLOURS, ScaleRule, TubeGlass } from './tube-art';

/**
 * The chemistry bench: three water bottles, a dropper of soap solution, a box
 * of corks, a 15 cm scale, the equation card, and three test tubes in a rack.
 *
 * One gesture does everything, as at a real bench: pick something up, then tap
 * a tube. A bottle pours 5 mL, the dropper squeezes in two drops, a cork corks
 * the tube and shakes it once, the scale is held against it with its zero at
 * the water line. With free hands a tap only selects the tube.
 *
 * The tubes themselves are drawn from the chemistry, never from a script — see
 * `tube-art.tsx`.
 */

export const BENCH_WIDTH = 1000;
export const BENCH_HEIGHT = 600;

const BOTTLE_X = [92, 212, 332];
const SOAP_X = 452;
/** Rack positions, left to right: A, B, C. */
export const TUBE_X = [250, 500, 750];
const TUBE = { top: 360, bottom: 548, w: 40, pxcm: 15 };

/** Regions of the bench a tour can spotlight, in bench coordinates. */
export const REGION = {
  waters: [50, 40, 340, 180],
  soap: [408, 46, 96, 176],
  corks: [46, 236, 132, 96],
  scale: [196, 250, 534, 70],
  card: [730, 230, 254, 110],
  rack: [50, 350, 900, 250],
  tubeA: [184, 350, 126, 250],
  tubesAB: [184, 350, 376, 250],
  tools: [46, 236, 684, 96],
} as const;

/**
 * One shake of a corked tube. Restarted by remounting the group.
 *
 * The one keyframe this bench keeps of its own, because it is not apparatus
 * moving on its own account: it is the STUDENT'S HAND, a single gesture in
 * answer to a single tap, and `bench-motion.ts` has no vocabulary for a gesture
 * and should not grow one for a bench. It is still settled through the shared
 * rules rather than a media query here — see the `sx` below.
 */
const shakeOnce = keyframes`
  0% { transform: translateX(0) rotate(0deg); }
  20% { transform: translateX(-4px) rotate(-2.2deg); }
  45% { transform: translateX(4px) rotate(2.2deg); }
  70% { transform: translateX(-2.5px) rotate(-1.2deg); }
  100% { transform: translateX(0) rotate(0deg); }
`;

function Label({ x, y, text }: { x: number; y: number; text: string }): React.ReactElement {
  return (
    <text
      x={x}
      y={y}
      fontSize={11}
      textAnchor="middle"
      fill={apparatus.benchLabel}
      fontFamily={LABEL_FONT}
      fontWeight={600}
      letterSpacing="1.4"
    >
      {text}
    </text>
  );
}

/** The label on each bottle, over one line or two. */
const BOTTLE_LINES: Readonly<Record<WaterId, readonly [string, string | null]>> = {
  soft: ['distilled', 'water'],
  hard: ['hard water', null],
  boiled: ['boiled hard', 'water'],
};

/** A stoppered bottle with a printed label. */
function Bottle({ x, water }: { x: number; water: (typeof WATERS)[number] }): React.ReactElement {
  const [first, label2] = BOTTLE_LINES[water.id];
  return (
    <>
      <rect x={x - 25} y={102} width={56} height={96} rx={9} fill="#000" opacity={0.3} filter="url(#soap-soft)" />
      <rect
        x={x - 28}
        y={96}
        width={56}
        height={96}
        rx={10}
        fill="rgba(255,255,255,.06)"
        stroke="rgba(255,255,255,.4)"
        strokeWidth={1.4}
      />
      <rect x={x - 25} y={120} width={50} height={69} rx={7} fill="rgba(226,240,248,.30)" />
      <rect x={x - 10} y={78} width={20} height={20} rx={3} fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.35)" />
      <path d={`M${x - 8} 80 V58 Q${x} 44 ${x + 8} 58 V80 Z`} fill="#2a2a2c" stroke="#4a4a4e" />
      <rect x={x - 24} y={130} width={48} height={34} rx={3} fill="#f4f1ea" />
      <text x={x} y={label2 ? 142 : 147} fontSize={9} textAnchor="middle" fill="#1d1d1b" fontFamily={LABEL_FONT}>
        {first}
      </text>
      {label2 ? (
        <text x={x} y={152} fontSize={9} textAnchor="middle" fill="#1d1d1b" fontFamily={LABEL_FONT}>
          {label2}
        </text>
      ) : null}
      <text x={x} y={160} fontSize={7.5} textAnchor="middle" fill="#5c5850" fontFamily={LABEL_FONT}>
        {water.note}
      </text>
    </>
  );
}

export interface SoapBenchProps {
  tubes: readonly Tube[];
  /** What each tube is showing, worked out from its contents. */
  lathers: readonly Lather[];
  held: Held | null;
  sel: number;
  /** Parts a tour is pointing at: `water:hard`, `tool:soap`, `tube:1`. */
  pulse: readonly string[];
  onSvg: (el: SVGSVGElement | null) => void;
  onPickUp: (held: Held) => void;
  onTapTube: (index: number) => void;
  onPutDown: () => void;
}

export function SoapBench({
  tubes,
  lathers,
  held,
  sel,
  pulse,
  onSvg,
  onPickUp,
  onTapTube,
  onPutDown,
}: SoapBenchProps): React.ReactElement {
  const gid = `soap${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const moving = useBenchMotion();

  const holding = (kind: Held['kind'], id?: string): boolean => {
    if (!held || held.kind !== kind) return false;
    return held.kind !== 'water' || held.id === id;
  };

  const activate = (el: Element | null): void => {
    if (!el) {
      onPutDown();
      return;
    }
    const water = el.getAttribute('data-water');
    if (water) {
      onPickUp({ kind: 'water', id: water as WaterId });
      return;
    }
    const tool = el.getAttribute('data-tool');
    if (tool === 'soap' || tool === 'cork' || tool === 'scale') {
      onPickUp({ kind: tool });
      return;
    }
    const tube = el.getAttribute('data-tube');
    if (tube !== null) onTapTube(Number(tube));
  };

  const onClick = (e: React.MouseEvent<SVGSVGElement>): void => {
    activate((e.target as Element).closest('[data-hot]'));
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>): void => {
    if (e.key === 'Escape') {
      onPutDown();
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const hot = (e.target as Element).closest('[data-hot]');
    if (!hot) return;
    e.preventDefault();
    activate(hot);
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
        ...benchMotionSx,
        '& [data-hot].pulse .focus': { animation: pulseAnimation },
        '& [data-hot].sel .focus': { stroke: apparatus.hintRing, strokeWidth: 2.5 },
        '& .shaking': { animation: `${shakeOnce} .45s ease-in-out`, transformBox: 'fill-box', transformOrigin: 'center' },
        ...motionSx(moving),
      }}
    >
      <svg
        ref={onSvg}
        viewBox={`0 0 ${BENCH_WIDTH} ${BENCH_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Chemistry bench: bottles of distilled water, hard water and boiled hard water, a soap solution dropper, corks, a centimetre scale and three test tubes in a rack"
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'manipulation' }}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <defs>
          <radialGradient id={`${gid}lamp`} cx="45%" cy="38%" r="75%">
            <stop offset="0" stopColor="#2b3533" />
            <stop offset=".6" stopColor={apparatus.bench} />
            <stop offset="1" stopColor="#121817" />
          </radialGradient>
          <linearGradient id={`${gid}wood`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9a6d3e" />
            <stop offset="1" stopColor="#6c4826" />
          </linearGradient>
          <filter id="soap-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <rect width={BENCH_WIDTH} height={BENCH_HEIGHT} fill={`url(#${gid}lamp)`} />
        <rect y={592} width={BENCH_WIDTH} height={8} fill={apparatus.benchEdge} />

        {/* The three waters. They look identical in the bottle — that is the point. */}
        {WATERS.map((w, k) => {
          const x = BOTTLE_X[k] ?? 0;
          const picked = holding('water', w.id);
          return (
            <g
              key={w.id}
              data-hot=""
              data-water={w.id}
              className={[picked ? 'picked' : '', pulse.includes(`water:${w.id}`) ? 'pulse' : ''].join(' ').trim()}
              tabIndex={0}
              role="button"
              aria-label={`Bottle of ${w.name}`}
              aria-pressed={picked}
            >
              <g className="lift">
                <Bottle x={x} water={w} />
                <rect className="focus" x={x - 32} y={40} width={64} height={158} rx={9} fill="none" />
              </g>
            </g>
          );
        })}

        {/* The soap solution, in a dropper bottle */}
        <g
          data-hot=""
          data-tool="soap"
          className={[holding('soap') ? 'picked' : '', pulse.includes('tool:soap') ? 'pulse' : ''].join(' ').trim()}
          tabIndex={0}
          role="button"
          aria-label="Dropper bottle of soap solution"
          aria-pressed={holding('soap')}
        >
          <g className="lift">
            <rect x={SOAP_X - 23} y={112} width={52} height={80} rx={8} fill="#000" opacity={0.3} filter="url(#soap-soft)" />
            <rect
              x={SOAP_X - 26}
              y={106}
              width={52}
              height={80}
              rx={8}
              fill="rgba(255,255,255,.06)"
              stroke="rgba(255,255,255,.4)"
              strokeWidth={1.4}
            />
            <rect x={SOAP_X - 23} y={126} width={46} height={57} rx={6} fill="#d8c98a" opacity={0.85} />
            <rect x={SOAP_X - 11} y={90} width={22} height={18} rx={3} fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.35)" />
            <path d={`M${SOAP_X - 9} 92 V72 Q${SOAP_X} 58 ${SOAP_X + 9} 72 V92 Z`} fill="#2a2a2c" stroke="#4a4a4e" />
            <rect x={SOAP_X - 22} y={140} width={44} height={30} rx={3} fill="#f4f1ea" />
            <text x={SOAP_X} y={152} fontSize={8} textAnchor="middle" fill="#1d1d1b" fontFamily={LABEL_FONT} fontWeight={700}>
              SOAP
            </text>
            <text x={SOAP_X} y={161} fontSize={8} textAnchor="middle" fill="#1d1d1b" fontFamily={LABEL_FONT} fontWeight={700}>
              SOLUTION
            </text>
            <text x={SOAP_X} y={168} fontSize={5.5} textAnchor="middle" fill="#6b6658" fontFamily={LABEL_FONT}>
              C₁₇H₃₅COONa
            </text>
            <rect className="focus" x={SOAP_X - 32} y={52} width={64} height={146} rx={9} fill="none" />
          </g>
        </g>
        <text x={SOAP_X} y={212} fontSize={9.5} textAnchor="middle" fill={apparatus.benchInkMuted} fontFamily={LABEL_FONT}>
          dropper · {DROPS} drops a squeeze
        </text>

        {/* What the ions do to the soap, printed on a card propped on the bench */}
        <rect x={739} y={242} width={240} height={98} rx={10} fill="#000" opacity={0.3} filter="url(#soap-soft)" />
        <rect x={736} y={236} width={240} height={98} rx={10} fill="#f4f1ea" stroke="#c9c3b4" />
        <text x={856} y={256} fontSize={10} textAnchor="middle" fill="#1d1d1b" fontFamily={LABEL_FONT} fontWeight={700} letterSpacing="1">
          SOAP + HARD WATER
        </text>
        <text x={856} y={278} fontSize={10.5} textAnchor="middle" fill="#1d1d1b" fontFamily={LABEL_FONT}>
          2C₁₇H₃₅COONa + Ca²⁺ ⟶
        </text>
        <text x={856} y={294} fontSize={10.5} textAnchor="middle" fill="#1d1d1b" fontFamily={LABEL_FONT}>
          (C₁₇H₃₅COO)₂Ca↓ + 2Na⁺
        </text>
        <text x={856} y={313} fontSize={8.5} textAnchor="middle" fill="#6b6658" fontFamily={LABEL_FONT}>
          the precipitate is the scum — insoluble,
        </text>
        <text x={856} y={324} fontSize={8.5} textAnchor="middle" fill="#6b6658" fontFamily={LABEL_FONT}>
          so that soap can never make lather
        </text>

        {/* Corks: one tap corks a tube and shakes it once */}
        <g
          data-hot=""
          data-tool="cork"
          className={[holding('cork') ? 'picked' : '', pulse.includes('tool:cork') ? 'pulse' : ''].join(' ').trim()}
          tabIndex={0}
          role="button"
          aria-label="Corks — cork a tube and shake it once"
          aria-pressed={holding('cork')}
        >
          <g className="lift">
            <rect x={59} y={252} width={112} height={76} rx={6} fill="#000" opacity={0.3} filter="url(#soap-soft)" />
            <rect x={56} y={246} width={112} height={76} rx={6} fill="#2f3a38" stroke="rgba(255,255,255,.22)" />
            {[0, 1, 2].map((i) => (
              <path key={i} d={`M${70 + i * 34} 300 h20 l-3 -34 h-14 Z`} fill="#c99a5e" stroke="#8d6a3c" strokeWidth={1} />
            ))}
            <text x={112} y={316} fontSize={8} textAnchor="middle" fill="#9fb0ab" fontFamily={LABEL_FONT} fontWeight={600}>
              cork &amp; shake ×1
            </text>
            <rect className="focus" x={50} y={240} width={124} height={88} rx={8} fill="none" />
          </g>
        </g>

        {/* The 15 cm scale, lying on the bench */}
        <g
          data-hot=""
          data-tool="scale"
          className={[holding('scale') ? 'picked' : '', pulse.includes('tool:scale') ? 'pulse' : ''].join(' ').trim()}
          tabIndex={0}
          role="button"
          aria-label="Centimetre scale, least count 1 millimetre"
          aria-pressed={holding('scale')}
        >
          <g className="lift">
            <rect x={207} y={266} width={514} height={44} rx={4} fill="#000" opacity={0.3} filter="url(#soap-soft)" />
            <rect x={204} y={260} width={514} height={44} rx={4} fill={SCALE_COLOURS.wood} stroke={SCALE_COLOURS.edge} />
            {Array.from({ length: 151 }, (_, i) => {
              const x = 216 + i * 3.26;
              const major = i % 10 === 0;
              const half = i % 5 === 0;
              return (
                <React.Fragment key={i}>
                  <line
                    x1={x.toFixed(1)}
                    y1={260}
                    x2={x.toFixed(1)}
                    y2={(260 + (major ? 18 : half ? 12 : 7)).toFixed(1)}
                    stroke={SCALE_COLOURS.rule}
                    strokeWidth={major ? 1.2 : 0.7}
                  />
                  {major ? (
                    <text
                      x={x.toFixed(1)}
                      y={292}
                      fontSize={9}
                      textAnchor="middle"
                      fill={SCALE_COLOURS.ink}
                      fontFamily={LABEL_FONT}
                      fontWeight={600}
                    >
                      {i / 10}
                    </text>
                  ) : null}
                </React.Fragment>
              );
            })}
            <text x={700} y={276} fontSize={8} textAnchor="end" fill="#7d6c45" fontFamily={LABEL_FONT} fontWeight={700}>
              L.C. 1 mm
            </text>
            <rect className="focus" x={198} y={254} width={526} height={56} rx={6} fill="none" />
          </g>
        </g>

        <Label x={114} y={338} text="CORKS — SHAKE" />
        <Label x={420} y={338} text="SCALE — 15 cm, mm DIVISIONS" />

        {/* The rack */}
        <rect x={60} y={420} width={880} height={16} rx={3} fill={`url(#${gid}wood)`} />
        <rect x={60} y={552} width={880} height={18} rx={3} fill={`url(#${gid}wood)`} />
        <rect x={60} y={420} width={12} height={150} fill={`url(#${gid}wood)`} />
        <rect x={928} y={420} width={12} height={150} fill={`url(#${gid}wood)`} />

        {tubes.map((t, k) => {
          const spec = TUBES[k];
          const m = lathers[k];
          const cx = TUBE_X[k] ?? 0;
          if (!spec || !m) return null;
          return (
            <g
              key={`tube-${k}`}
              data-hot=""
              data-tube={k}
              className={[sel === k ? 'sel' : '', pulse.includes(`tube:${k}`) ? 'pulse' : ''].join(' ').trim()}
              tabIndex={0}
              role="button"
              aria-label={`${spec.title}${m.volume ? `, holding ${m.volume} mL, ${t.drops} drops of soap, shaken ${t.shakes} times` : ', empty'}`}
            >
              <rect
                className="focus"
                x={cx - 26}
                y={TUBE.top - 14}
                width={52}
                height={TUBE.bottom - TUBE.top + 22}
                rx={8}
                fill="rgba(0,0,0,0)"
              />
              {/* Remounted on every shake, which is what replays the animation. */}
              <g key={`shake-${t.shakes}`} className={t.shakes > 0 ? 'shaking' : undefined}>
                {t.measured && m.volume > 0 ? (
                  <ScaleRule
                    x={cx - 58}
                    width={26}
                    yZero={TUBE.bottom - 3 - m.waterCm * TUBE.pxcm}
                    pxcm={TUBE.pxcm}
                    cm={5}
                  />
                ) : null}
                <TubeGlass
                  lather={m}
                  geometry={{ cx, top: TUBE.top, bottom: TUBE.bottom, w: TUBE.w, pxcm: TUBE.pxcm }}
                  corked={t.shakes > 0}
                  bubbleSeed={k + 2}
                />
              </g>
            </g>
          );
        })}

        {TUBES.map((spec, k) => (
          <React.Fragment key={spec.id}>
            <text
              x={TUBE_X[k]}
              y={584}
              fontSize={12}
              textAnchor="middle"
              fill="#e3ebe8"
              fontFamily={LABEL_FONT}
              fontWeight={700}
            >
              {spec.id}
            </text>
            <text x={TUBE_X[k]} y={596} fontSize={9.5} textAnchor="middle" fill="#8fa09b" fontFamily={LABEL_FONT}>
              {WATER_BY_ID[spec.water].name}
              {spec.marked ? '' : ' · extra'}
            </text>
          </React.Fragment>
        ))}
      </svg>
    </Box>
  );
}
