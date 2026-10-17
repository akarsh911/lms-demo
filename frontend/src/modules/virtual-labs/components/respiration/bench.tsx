'use client';

import * as React from 'react';
import Box from '@mui/material/Box';

import {
  RISE_CAP,
  SEED,
  SETUPS,
  SETUP_KOH,
  milkiness,
  type Flask,
  type SeedKind,
} from '@labs/lib/respiration/biology';
import type { Held } from '@labs/lib/respiration/state';

import { apparatus, LABEL_FONT } from '../apparatus-palette';
import {
  RISE_CLASS,
  TRACK_CLASS,
  benchMotionSx,
  bubbleTrain,
  motionSx,
  riseOffset,
  riseStyle,
  useBenchMotion,
} from '../bench-motion';

import { LimeGlass, limeFill } from './lime-tube';

/**
 * The biology bench: three jars of seed, lime water, corks carrying bent
 * delivery tubes, vaseline, a tube of KOH, a water bath, a lab clock, and three
 * set-ups — two conical flasks each delivering into a test tube of lime water,
 * and the method 2 flask delivering into a beaker of water.
 *
 * One gesture does everything, as at a real bench: pick something up, then tap
 * a flask or a test tube. Seeds go in the flask, lime water in the tube, the
 * cork closes the flask, the vaseline seals the joint. With free hands a tap
 * only selects a set-up.
 *
 * Every mark on the glass is worked out from the model — how much seed, how
 * many millilitres, whether the tube dips, how much calcium carbonate has come
 * down — so nothing drawn here can disagree with what the observations are
 * marked against.
 */

export const BENCH_WIDTH = 1000;
export const BENCH_HEIGHT = 600;

/** The conical flask of a marked set-up. */
const FL = { baseY: 548, halfW: 62, neckY: 442, neckHalf: 15, topY: 394, corkTop: 376, corkBot: 396, riseY: 336, endY: 445 };
/** The smaller method 2 flask. */
const KF = { baseY: 548, halfW: 46, neckY: 478, neckHalf: 12, topY: 442, corkTop: 424, corkBot: 444, riseY: 386, endY: 530 };
/** The test tube of lime water. */
const TT = { top: 376, bottom: 514, w: 38, mlPx: 8, floor: 511 };
/** The beaker the method 2 tube dips into. */
const KB = { bx: 906, left: 872, right: 940, top: 492, bottom: 546, water: 504 };

/** Where each set-up stands: flask centre and tube centre. */
const PLACES = [
  { fx: 150, tx: 265 },
  { fx: 470, tx: 585 },
  { fx: 790, tx: KB.bx },
];

/** Regions of the bench a tour can spotlight, in bench coordinates. */
export const REGION = {
  jars: [18, 130, 250, 128],
  lime: [278, 96, 84, 158],
  corks: [345, 180, 128, 86],
  vaseline: [464, 196, 74, 58],
  koh: [535, 180, 56, 86],
  bath: [589, 178, 128, 72],
  clock: [812, 82, 136, 136],
  setupA: [72, 320, 300, 268],
  setupB: [392, 320, 300, 268],
  methodTwo: [730, 320, 250, 268],
  both: [72, 320, 620, 268],
  shelf: [18, 82, 720, 190],
  bench: [18, 82, 962, 506],
} as const;

/** Seeds are drawn as the eye tells them apart: sprouted, dead, dormant. */
const SEED_PAINT: Readonly<Record<SeedKind, { fill: string; edge: string; sprout?: boolean }>> = {
  germ: { fill: '#cdae72', edge: '#9c7f49', sprout: true },
  boiled: { fill: '#8d7d64', edge: '#63563f' },
  dry: { fill: '#e0cc9c', edge: '#b09a6d' },
};


function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

type Geometry = typeof FL;

function flaskPath(cx: number, g: Geometry): string {
  return (
    `M${cx - g.neckHalf} ${g.topY} V${g.neckY} L${cx - g.halfW} ${g.baseY - 10} ` +
    `Q${cx - g.halfW} ${g.baseY} ${cx - g.halfW + 10} ${g.baseY} ` +
    `H${cx + g.halfW - 10} Q${cx + g.halfW} ${g.baseY} ${cx + g.halfW} ${g.baseY - 10} ` +
    `L${cx + g.neckHalf} ${g.neckY} V${g.topY} Z`
  );
}

/** The bent delivery tube: up out of the cork, across, and down into the liquid. */
function tubePath(cx: number, tx: number, g: Geometry): string {
  const d = tx > cx ? 16 : -16;
  return (
    `M${cx} ${g.corkTop} V${g.riseY + 16} Q${cx} ${g.riseY} ${cx + d} ${g.riseY} ` +
    `H${tx - d} Q${tx} ${g.riseY} ${tx} ${g.riseY + 16} V${g.endY}`
  );
}

function glint(cx: number, g: Geometry): string {
  return `M${cx - g.neckHalf + 5} ${g.topY + 8} V${g.neckY} L${cx - g.halfW + 14} ${g.baseY - 16}`;
}

function Label({ x, y, text, fill = apparatus.benchLabel }: { x: number; y: number; text: string; fill?: string }): React.ReactElement {
  return (
    <text x={x} y={y} fontSize={10} textAnchor="middle" fill={fill} fontFamily={LABEL_FONT} fontWeight={600} letterSpacing="1.2">
      {text}
    </text>
  );
}

/** The seed lying in the bottom of a flask, one ellipse per few grams. */
export function SeedPile({ flask, cx, g }: { flask: Flask; cx: number; g: Geometry }): React.ReactElement | null {
  if (!flask.seeds || !flask.seeds.g) return null;
  const paint = SEED_PAINT[flask.seeds.kind];
  const n = Math.round((flask.seeds.g / 10) * 6);

  return (
    <>
      {Array.from({ length: n }, (_, k) => {
        const row = Math.floor(k / 6);
        const col = k % 6;
        const y = g.baseY - 7 - row * 8.5 - hash(k * 3) * 2.5;
        const t = Math.max(0, Math.min(1, (g.baseY - y) / (g.baseY - g.neckY)));
        const hw = Math.max(8, g.halfW - (g.halfW - g.neckHalf) * t - 11);
        const x = cx - hw + ((col + hash(k * 7 + 1)) / 6) * hw * 2;
        return (
          <g key={k}>
            <ellipse cx={x} cy={y} rx={5.2} ry={3.9} fill={paint.fill} stroke={paint.edge} strokeWidth={0.7} />
            {paint.sprout ? (
              <path
                d={`M${x + 3.6} ${y - 1.6} q4.6 -1.4 6.4 -5.4`}
                stroke="#d6e7c6"
                strokeWidth={1.5}
                fill="none"
                strokeLinecap="round"
              />
            ) : null}
          </g>
        );
      })}
    </>
  );
}

/**
 * Gas coming up through the lime water, at the rate the flask is making it.
 *
 * `rate` is `bubbleRate` — bubbles a second, worked out in the model from the
 * seed, the temperature, the cork, the KOH and the speed of the lab clock. The
 * train's spacing and beat are that rate and nothing else, so a leaking cork or
 * a flask of boiled seeds is watched failing to bubble rather than told about.
 */
function Bubbles({ flask, tx, rate }: { flask: Flask; tx: number; rate: number }): React.ReactElement | null {
  const surface = TT.floor - flask.lime.ml * TT.mlPx;
  const span = Math.max(6, FL.endY - Math.max(surface, TT.top) - 4);
  const train = bubbleTrain(rate, span, 6);
  if (!train.count) return null;
  const style = riseStyle(train);

  return (
    <>
      {Array.from({ length: train.count }, (_, k) => (
        <circle
          key={k}
          className={RISE_CLASS}
          style={style}
          cx={tx + (k % 2 ? 3.4 : -3.4)}
          cy={FL.endY - 2 - riseOffset(train, k)}
          r={1.8 + (k % 3) * 0.5}
          fill="#fff"
          opacity={0.55}
        />
      ))}
    </>
  );
}

function Stand({ tx }: { tx: number }): React.ReactElement {
  return (
    <>
      <rect x={tx + 28} y={538} width={74} height={10} rx={3} fill="#3c4442" stroke="rgba(255,255,255,.14)" />
      <rect x={tx + 70} y={398} width={7} height={142} fill="#4a5250" />
      <rect x={tx + 19} y={418} width={54} height={8} rx={3} fill="#4a5250" stroke="rgba(255,255,255,.12)" />
    </>
  );
}

function Hot({
  id,
  label,
  picked,
  selected,
  pulse,
  children,
  pressed,
}: {
  id: Record<string, string>;
  label: string;
  picked?: boolean;
  selected?: boolean;
  pulse?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <g
      data-hot=""
      {...id}
      className={[picked ? 'picked' : '', selected ? 'sel' : '', pulse ? 'pulse' : ''].join(' ').trim()}
      tabIndex={0}
      role="button"
      aria-label={label}
      aria-pressed={pressed}
    >
      {children}
    </g>
  );
}

function SeedJar({ x, kind, held, pulse }: { x: number; kind: SeedKind; held: boolean; pulse: boolean }): React.ReactElement {
  const paint = SEED_PAINT[kind];
  return (
    <Hot id={{ 'data-seed': kind }} label={`Jar of ${SEED[kind].name}`} picked={held} pressed={held} pulse={pulse}>
      <g className="lift">
        <rect x={x - 33} y={164} width={68} height={86} rx={7} fill="#000" opacity={0.3} filter="url(#rp-soft)" />
        <rect
          x={x - 36}
          y={158}
          width={68}
          height={88}
          rx={8}
          fill="rgba(255,255,255,.06)"
          stroke="rgba(255,255,255,.4)"
          strokeWidth={1.4}
        />
        <rect x={x - 30} y={146} width={56} height={16} rx={4} fill="#3a4a58" stroke="#22303b" />
        {Array.from({ length: 14 }, (_, k) => {
          const sx = x - 28 + (k % 5) * 13 + hash(k * 9) * 5;
          const sy = 236 - Math.floor(k / 5) * 11 - hash(k * 4) * 3;
          return (
            <g key={k}>
              <ellipse cx={sx} cy={sy} rx={5} ry={3.8} fill={paint.fill} stroke={paint.edge} strokeWidth={0.7} />
              {paint.sprout ? (
                <path
                  d={`M${sx + 3.4} ${sy - 1.5} q4.4 -1.3 6 -5`}
                  stroke="#d6e7c6"
                  strokeWidth={1.4}
                  fill="none"
                  strokeLinecap="round"
                />
              ) : null}
            </g>
          );
        })}
        <rect x={x - 32} y={176} width={60} height={22} rx={3} fill="#f4f1ea" />
        <text x={x - 2} y={191} fontSize={9} textAnchor="middle" fill="#1d1d1b" fontFamily={LABEL_FONT} fontWeight={600}>
          {SEED[kind].short}
        </text>
        <rect className="focus" x={x - 42} y={138} width={80} height={114} rx={8} fill="none" />
      </g>
    </Hot>
  );
}

function LabClock({ min, compact }: { min: number; compact: boolean }): React.ReactElement {
  const cx = 880;
  const cy = 150;
  const angle = (min % 60) * 6;
  const rad = (deg: number): number => (deg * Math.PI) / 180;

  return (
    <g aria-hidden="true">
      <circle cx={cx} cy={cy} r={62} fill="#000" opacity={0.3} filter="url(#rp-soft)" />
      <circle cx={cx} cy={cy} r={58} fill={apparatus.dialFace} stroke="#2b2f33" strokeWidth={5} />
      {Array.from({ length: compact ? 12 : 60 }, (_, k) => {
        const step = compact ? k * 5 : k;
        const major = step % 5 === 0;
        const r0 = major ? 45 : 50;
        const a = rad(step * 6);
        return (
          <line
            key={k}
            x1={cx + r0 * Math.sin(a)}
            y1={cy - r0 * Math.cos(a)}
            x2={cx + 53 * Math.sin(a)}
            y2={cy - 53 * Math.cos(a)}
            stroke={apparatus.dialInk}
            strokeWidth={major ? 1.4 : 0.6}
          />
        );
      })}
      {[0, 15, 30, 45].map((n) => {
        const a = rad(n * 6);
        return (
          <text
            key={n}
            x={cx + 36 * Math.sin(a)}
            y={cy - 36 * Math.cos(a) + 4}
            fontSize={10}
            textAnchor="middle"
            fill={apparatus.dialInk}
            fontFamily={LABEL_FONT}
          >
            {n}
          </text>
        );
      })}
      <text x={cx} y={cy + 22} fontSize={11} textAnchor="middle" fill={apparatus.dialInkMuted} fontFamily={LABEL_FONT} fontWeight={600}>
        {Math.round(min)} min
      </text>
      <line
        x1={cx}
        y1={cy}
        x2={cx + 46 * Math.sin(rad(angle))}
        y2={cy - 46 * Math.cos(rad(angle))}
        stroke={apparatus.needle}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={4} fill={apparatus.pivot} />
    </g>
  );
}

export interface RespirationBenchProps {
  flasks: readonly Flask[];
  held: Held | null;
  sel: number;
  min: number;
  tempC: number;
  warm: boolean;
  /** Bubbles a second up each tube, from the model's own delivered gas rate. */
  bubbleRate: (index: number) => number;
  compact: boolean;
  /** Parts a tour is pointing at: `seed:germ`, `tool:vas`, `flask:0`, `tube:1`. */
  pulse: readonly string[];
  onSvg: (el: SVGSVGElement | null) => void;
  onPickUp: (held: Held) => void;
  onTapFlask: (index: number) => void;
  onTapTube: (index: number) => void;
  onToggleBath: () => void;
  onPutDown: () => void;
}

export function RespirationBench({
  flasks,
  held,
  sel,
  min,
  tempC,
  warm,
  bubbleRate,
  compact,
  pulse,
  onSvg,
  onPickUp,
  onTapFlask,
  onTapTube,
  onToggleBath,
  onPutDown,
}: RespirationBenchProps): React.ReactElement {
  const gid = `rp${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const moving = useBenchMotion();

  const holding = (kind: Held['kind'], seed?: SeedKind): boolean => {
    if (!held || held.kind !== kind) return false;
    return held.kind !== 'seed' || held.seed === seed;
  };

  const activate = (el: Element | null): void => {
    if (!el) {
      onPutDown();
      return;
    }
    const seed = el.getAttribute('data-seed') as SeedKind | null;
    if (seed) {
      onPickUp({ kind: 'seed', seed });
      return;
    }
    const tool = el.getAttribute('data-tool');
    if (tool === 'bath') {
      onToggleBath();
      return;
    }
    if (tool === 'lime' || tool === 'cork' || tool === 'vas' || tool === 'koh') {
      onPickUp({ kind: tool });
      return;
    }
    const flask = el.getAttribute('data-flask');
    if (flask !== null) {
      onTapFlask(Number(flask));
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
        '& [data-hot].sel .focus': { stroke: apparatus.hintRing, strokeWidth: 2.5 },
        ...benchMotionSx,
        // This bench spells a pulsed target `[data-hot].pulse`; the shared rule
        // matches `.pulse` on its own, which a jar's `<g>` is not.
        '& [data-hot].pulse .focus': benchMotionSx['& .pulse .focus'],
        ...motionSx(moving),
      }}
    >
      <svg
        ref={onSvg}
        viewBox={`0 0 ${BENCH_WIDTH} ${BENCH_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Biology bench: jars of germinating, boiled and dry seeds, lime water, corks with bent delivery tubes, vaseline, potassium hydroxide, a water bath, a lab clock, and three set-ups"
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
          <filter id="rp-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <rect width={BENCH_WIDTH} height={BENCH_HEIGHT} fill={`url(#${gid}lamp)`} />
        <rect x={24} y={246} width={716} height={13} rx={3} fill={`url(#${gid}wood)`} />
        <rect x={28} y={259} width={6} height={22} fill="#5a3c20" />
        <rect x={730} y={259} width={6} height={22} fill="#5a3c20" />
        <rect y={548} width={BENCH_WIDTH} height={18} fill={`url(#${gid}wood)`} />
        <rect y={592} width={BENCH_WIDTH} height={8} fill={apparatus.benchEdge} />

        {/* --- the shelf ---------------------------------------------------- */}
        <SeedJar x={66} kind="germ" held={holding('seed', 'germ')} pulse={pulse.includes('seed:germ')} />
        <SeedJar x={150} kind="boiled" held={holding('seed', 'boiled')} pulse={pulse.includes('seed:boiled')} />
        <SeedJar x={234} kind="dry" held={holding('seed', 'dry')} pulse={pulse.includes('seed:dry')} />

        <Hot
          id={{ 'data-tool': 'lime' }}
          label="Bottle of lime water"
          picked={holding('lime')}
          pressed={holding('lime')}
          pulse={pulse.includes('tool:lime')}
        >
          <g className="lift">
            <rect x={293} y={162} width={54} height={88} rx={9} fill="#000" opacity={0.3} filter="url(#rp-soft)" />
            <rect
              x={290}
              y={156}
              width={56}
              height={90}
              rx={10}
              fill="rgba(255,255,255,.06)"
              stroke="rgba(255,255,255,.4)"
              strokeWidth={1.4}
            />
            <rect x={293} y={182} width={50} height={61} rx={7} fill="rgba(244,249,250,.3)" />
            <rect x={308} y={138} width={20} height={20} rx={3} fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.35)" />
            <path d="M310 140 V120 Q318 108 326 120 V140 Z" fill="#2a2a2c" stroke="#4a4a4e" />
            <rect x={294} y={194} width={48} height={26} rx={3} fill="#f4f1ea" />
            <text x={318} y={205} fontSize={8} textAnchor="middle" fill="#1d1d1b" fontFamily={LABEL_FONT} fontWeight={700}>
              LIME
            </text>
            <text x={318} y={215} fontSize={8} textAnchor="middle" fill="#1d1d1b" fontFamily={LABEL_FONT} fontWeight={700}>
              WATER
            </text>
            <rect className="focus" x={284} y={102} width={68} height={148} rx={8} fill="none" />
          </g>
        </Hot>

        <Hot
          id={{ 'data-tool': 'cork' }}
          label="Corks fitted with bent delivery tubes"
          picked={holding('cork')}
          pressed={holding('cork')}
          pulse={pulse.includes('tool:cork')}
        >
          <g className="lift">
            <rect x={360} y={206} width={104} height={44} rx={5} fill="#000" opacity={0.3} filter="url(#rp-soft)" />
            <rect x={357} y={200} width={104} height={44} rx={5} fill="#2f3a38" stroke="rgba(255,255,255,.2)" />
            {[0, 1].map((k) => {
              const bx = 384 + k * 52;
              return (
                <g key={k}>
                  <path
                    d={`M${bx} 226 V204 Q${bx} 194 ${bx + 10} 194 H${bx + 22}`}
                    fill="none"
                    stroke="rgba(214,240,255,.85)"
                    strokeWidth={3.4}
                    strokeLinecap="round"
                  />
                  <path d={`M${bx - 11} 226 h22 l-3 16 h-16 Z`} fill="#c08a4e" stroke="#8a5f30" />
                </g>
              );
            })}
            <rect className="focus" x={351} y={186} width={116} height={60} rx={7} fill="none" />
          </g>
        </Hot>
        <Label x={409} y={262} text="CORK + DELIVERY TUBE" />

        <Hot
          id={{ 'data-tool': 'vas' }}
          label="Tin of vaseline for sealing the cork"
          picked={holding('vas')}
          pressed={holding('vas')}
          pulse={pulse.includes('tool:vas')}
        >
          <g className="lift">
            <ellipse cx={500} cy={248} rx={26} ry={7} fill="#000" opacity={0.3} filter="url(#rp-soft)" />
            <rect x={476} y={214} width={48} height={30} rx={4} fill="#2f6b8a" stroke="#1d4457" />
            <ellipse cx={500} cy={214} rx={24} ry={7} fill="#4d93b5" />
            <text x={500} y={234} fontSize={8} textAnchor="middle" fill="#eaf6fb" fontFamily={LABEL_FONT} fontWeight={700}>
              VASELINE
            </text>
            <rect className="focus" x={470} y={202} width={60} height={48} rx={7} fill="none" />
          </g>
        </Hot>

        <Hot
          id={{ 'data-tool': 'koh' }}
          label="Small tube of potassium hydroxide solution"
          picked={holding('koh')}
          pressed={holding('koh')}
          pulse={pulse.includes('tool:koh')}
        >
          <g className="lift">
            <rect x={550} y={200} width={30} height={50} rx={5} fill="#000" opacity={0.3} filter="url(#rp-soft)" />
            <rect
              x={547}
              y={194}
              width={30}
              height={50}
              rx={5}
              fill="rgba(255,255,255,.06)"
              stroke="rgba(255,255,255,.4)"
              strokeWidth={1.3}
            />
            <rect x={549} y={212} width={26} height={30} rx={4} fill="rgba(226,240,214,.45)" />
            <rect x={548} y={216} width={28} height={14} rx={2} fill="#f4f1ea" />
            <text x={562} y={226} fontSize={8} textAnchor="middle" fill="#1d1d1b" fontFamily={LABEL_FONT} fontWeight={700}>
              KOH
            </text>
            <rect className="focus" x={541} y={186} width={42} height={62} rx={7} fill="none" />
          </g>
        </Hot>
        <Label x={562} y={262} text="METHOD 2" />

        <Hot
          id={{ 'data-tool': 'bath' }}
          label={`Water bath, currently ${tempC} degrees Celsius. Activate to toggle.`}
          pressed={warm}
          pulse={pulse.includes('tool:bath')}
        >
          <rect x={600} y={196} width={112} height={50} rx={7} fill="#000" opacity={0.3} filter="url(#rp-soft)" />
          <rect x={597} y={190} width={112} height={50} rx={7} fill="#232e2c" stroke="rgba(255,255,255,.24)" />
          <rect x={605} y={198} width={62} height={26} rx={4} fill="#0c1412" />
          <text
            x={636}
            y={216}
            fontSize={14}
            textAnchor="middle"
            fill={warm ? apparatus.glow : apparatus.hintRing}
            fontFamily={LABEL_FONT}
            fontWeight={700}
          >
            {tempC}°C
          </text>
          <circle cx={689} cy={211} r={12} fill={warm ? '#c4621d' : '#2f3a38'} stroke="rgba(255,255,255,.3)" />
          <line x1={689} y1={211} x2={warm ? 697 : 681} y2={203} stroke="#f2f5f4" strokeWidth={2} strokeLinecap="round" />
          <text x={636} y={235} fontSize={8} textAnchor="middle" fill="#8fa39e" fontFamily={LABEL_FONT} fontWeight={600} letterSpacing="1">
            WATER BATH
          </text>
          <rect className="focus" x={591} y={184} width={124} height={62} rx={9} fill="none" />
        </Hot>

        <LabClock min={min} compact={compact} />

        {/* --- the two marked set-ups --------------------------------------- */}
        {SETUPS.map((setup, i) => {
          const f = flasks[i];
          const place = PLACES[i];
          if (!f || !place) return null;
          const { fx, tx } = place;
          const m = milkiness(f);
          const surface = TT.floor - f.lime.ml * TT.mlPx;
          const submerged = Math.max(0, FL.endY - Math.max(surface, TT.top));

          return (
            <g key={setup.id}>
              <Hot
                id={{ 'data-flask': String(i) }}
                label={`${setup.name}, conical flask — ${
                  f.seeds ? `${f.seeds.g} grams of ${SEED[f.seeds.kind].name}` : 'empty'
                }${f.cork ? ', corked' : ''}${f.sealed ? ' and sealed' : ''}`}
                selected={sel === i}
                pulse={pulse.includes(`flask:${i}`)}
              >
                <rect
                  className="focus"
                  x={fx - FL.halfW - 10}
                  y={FL.riseY - 14}
                  width={FL.halfW * 2 + 20}
                  height={FL.baseY - FL.riseY + 28}
                  rx={10}
                  fill="rgba(0,0,0,0)"
                />
                <ellipse cx={fx} cy={FL.baseY + 4} rx={FL.halfW + 6} ry={7} fill="#000" opacity={0.35} filter="url(#rp-soft)" />
                <path d={flaskPath(fx, FL)} fill="rgba(255,255,255,.05)" />
                <SeedPile flask={f} cx={fx} g={FL} />
                <path d={flaskPath(fx, FL)} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth={1.5} />
                <path d={glint(fx, FL)} fill="none" stroke="#fff" strokeWidth={2.4} opacity={0.16} strokeLinecap="round" strokeLinejoin="round" />
                {warm ? (
                  <path
                    d={`M${fx - 26} ${FL.baseY - 4} q6 -12 0 -22 M${fx} ${FL.baseY - 4} q6 -12 0 -22 M${fx + 26} ${FL.baseY - 4} q6 -12 0 -22`}
                    stroke="#ffb44d"
                    strokeWidth={1.6}
                    fill="none"
                    opacity={0.45}
                    strokeLinecap="round"
                  />
                ) : null}
                {!f.cork ? (
                  <ellipse cx={fx} cy={FL.topY} rx={FL.neckHalf + 2} ry={4} fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={1.4} />
                ) : null}
              </Hot>

              <Hot
                id={{ 'data-tube': String(i) }}
                // VOLUME ONLY. How milky this tube is IS the marked observation,
                // so naming it here would read the answer out to a screen-reader
                // user and leave everyone else to judge it by eye. What a blind
                // student still needs is which tube this is and how much is in
                // it; the reading itself is theirs to make, from the reference
                // strip in the close-up.
                label={`${setup.name}, test tube of lime water — ${f.lime.ml} millilitres`}
                selected={sel === i}
                pulse={pulse.includes(`tube:${i}`)}
              >
                <rect className="focus" x={tx - 26} y={TT.top - 10} width={52} height={TT.bottom - TT.top + 20} rx={8} fill="rgba(0,0,0,0)" />
                <Stand tx={tx} />
                <LimeGlass
                  m={m}
                  ml={f.lime.ml}
                  cx={tx}
                  top={TT.top}
                  bottom={TT.bottom}
                  w={TT.w}
                  mlPx={TT.mlPx}
                  floor={TT.floor}
                  uid={`${gid}b${i}`}
                />
                <Bubbles flask={f} tx={tx} rate={bubbleRate(i)} />
              </Hot>

              {/* Drawn last so the glass reads as being in front of both. */}
              {f.cork ? (
                <g>
                  <path d={tubePath(fx, tx, FL)} fill="none" stroke="rgba(210,238,255,.8)" strokeWidth={5} strokeLinecap="round" />
                  <path d={tubePath(fx, tx, FL)} fill="none" stroke="rgba(255,255,255,.45)" strokeWidth={1.6} strokeLinecap="round" />
                  {submerged > 0 && m > 0.2 ? (
                    <rect className={TRACK_CLASS} x={tx - 3} y={FL.endY - submerged} width={6} height={submerged} fill={limeFill(m)} opacity={0.8} />
                  ) : null}
                  <rect x={fx - 21} y={FL.corkTop} width={42} height={FL.corkBot - FL.corkTop} rx={3} fill="#c08a4e" stroke="#8a5f30" />
                  {f.sealed ? (
                    <rect x={fx - 24} y={FL.corkBot - 5} width={48} height={7} rx={3} fill="#ffd98a" opacity={0.85} />
                  ) : (
                    <path
                      d={`M${fx - 24} ${FL.corkTop + 4} l-8 -7 M${fx + 24} ${FL.corkTop + 4} l8 -7`}
                      stroke="#ff9a92"
                      strokeWidth={2}
                      strokeLinecap="round"
                      opacity={0.9}
                    />
                  )}
                </g>
              ) : null}

              <text
                x={(fx + tx) / 2}
                y={580}
                fontSize={10}
                textAnchor="middle"
                fill={i === 1 ? '#9fd2ff' : apparatus.benchInk}
                fontFamily={LABEL_FONT}
                fontWeight={700}
                letterSpacing="1.1"
              >
                {i === 0 ? 'SET-UP A · GERMINATING SEEDS' : 'SET-UP B · CONTROL, BOILED SEEDS'}
              </text>
            </g>
          );
        })}

        {/* --- method 2: KOH inside, water climbs the tube ------------------- */}
        <MethodTwo flask={flasks[SETUP_KOH]} selected={sel === SETUP_KOH} pulse={pulse} />
      </svg>
    </Box>
  );
}

function MethodTwo({
  flask,
  selected,
  pulse,
}: {
  flask: Flask | undefined;
  selected: boolean;
  pulse: readonly string[];
}): React.ReactElement | null {
  if (!flask) return null;
  const cx = PLACES[SETUP_KOH]?.fx ?? 790;
  const top = KB.water - flask.rise;

  return (
    <g>
      <Hot
        id={{ 'data-flask': String(SETUP_KOH) }}
        label={`Method 2 flask — ${flask.seeds ? `${flask.seeds.g} grams of ${SEED[flask.seeds.kind].name}` : 'empty'}${
          flask.koh ? ', with a tube of potassium hydroxide inside' : ''
        }${flask.cork ? ', corked' : ''}`}
        selected={selected}
        pulse={pulse.includes(`flask:${SETUP_KOH}`)}
      >
        <rect
          className="focus"
          x={cx - KF.halfW - 10}
          y={KF.riseY - 14}
          width={KF.halfW * 2 + 20}
          height={KF.baseY - KF.riseY + 28}
          rx={10}
          fill="rgba(0,0,0,0)"
        />
        <ellipse cx={cx} cy={KF.baseY + 4} rx={KF.halfW + 5} ry={6} fill="#000" opacity={0.35} filter="url(#rp-soft)" />
        <path d={flaskPath(cx, KF)} fill="rgba(255,255,255,.05)" />
        <SeedPile flask={flask} cx={cx} g={KF} />
        {flask.koh ? (
          <>
            <line x1={cx} y1={KF.corkBot} x2={cx} y2={470} stroke="#cfd6d3" strokeWidth={1} />
            <rect x={cx - 9} y={470} width={18} height={48} rx={9} fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.5)" strokeWidth={1.2} />
            <rect x={cx - 7} y={488} width={14} height={28} rx={6} fill="rgba(190,226,164,.5)" />
            <text x={cx + 20} y={496} fontSize={8} fill="#a9c79a" fontFamily={LABEL_FONT} fontWeight={700}>
              KOH
            </text>
          </>
        ) : null}
        <path d={flaskPath(cx, KF)} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth={1.5} />
        <path d={glint(cx, KF)} fill="none" stroke="#fff" strokeWidth={2} opacity={0.16} strokeLinecap="round" strokeLinejoin="round" />
        {flask.cork ? (
          <>
            <path d={tubePath(cx, KB.bx, KF)} fill="none" stroke="rgba(210,238,255,.8)" strokeWidth={5} strokeLinecap="round" />
            <rect x={cx - 17} y={KF.corkTop} width={34} height={KF.corkBot - KF.corkTop} rx={3} fill="#c08a4e" stroke="#8a5f30" />
            {flask.sealed ? <rect x={cx - 20} y={KF.corkBot - 5} width={40} height={7} rx={3} fill="#ffd98a" opacity={0.85} /> : null}
          </>
        ) : null}
      </Hot>

      <Hot
        id={{ 'data-tube': String(SETUP_KOH) }}
        label={`Beaker of coloured water — the column has risen ${Math.round(flask.rise)} of ${RISE_CAP}`}
        selected={selected}
        pulse={pulse.includes(`tube:${SETUP_KOH}`)}
      >
        <rect
          className="focus"
          x={KB.left - 10}
          y={KF.riseY - 10}
          width={KB.right - KB.left + 20}
          height={KB.bottom - KF.riseY + 22}
          rx={8}
          fill="rgba(0,0,0,0)"
        />
        <path
          d={`M${KB.left} ${KB.top} V${KB.bottom} H${KB.right} V${KB.top}`}
          fill="rgba(255,255,255,.05)"
          stroke="rgba(255,255,255,.5)"
          strokeWidth={1.4}
        />
        <rect x={KB.left + 1} y={KB.water} width={KB.right - KB.left - 2} height={KB.bottom - KB.water - 1} fill="rgba(90,160,220,.45)" />
        {flask.cork ? (
          <>
            <rect x={KB.bx - 2.2} y={top} width={4.4} height={KB.water - top} fill="rgba(90,160,220,.85)" />
            {flask.rise > 2 ? (
              <>
                <line x1={KB.bx - 34} y1={top} x2={KB.bx - 8} y2={top} stroke={apparatus.hintRing} strokeWidth={1.2} strokeDasharray="3 3" />
                <line
                  x1={KB.bx - 34}
                  y1={KB.water}
                  x2={KB.bx - 8}
                  y2={KB.water}
                  stroke={apparatus.hintRing}
                  strokeWidth={1.2}
                  strokeDasharray="3 3"
                  opacity={0.55}
                />
                <text x={KB.bx - 36} y={top + 4} fontSize={9} textAnchor="end" fill={apparatus.hintRing} fontFamily={LABEL_FONT} fontWeight={600}>
                  rise
                </text>
              </>
            ) : null}
          </>
        ) : null}
      </Hot>
      <text x={850} y={580} fontSize={10} textAnchor="middle" fill={apparatus.benchInk} fontFamily={LABEL_FONT} fontWeight={700} letterSpacing="1.1">
        METHOD 2 · KOH ABSORBS CO₂, WATER RISES
      </text>
    </g>
  );
}
