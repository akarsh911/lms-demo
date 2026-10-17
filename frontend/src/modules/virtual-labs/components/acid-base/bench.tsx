'use client';

import * as React from 'react';
import Box from '@mui/material/Box';

import { LIME_CLOUDS, REAGENTS, type SolidId, type Tube, type TubeSpec } from '@labs/lib/acid-base/chemistry';
import type { Held } from '@labs/lib/acid-base/state';

import { apparatus, LABEL_FONT } from '../apparatus-palette';
import { benchMotionSx, motionSx, pulseAnimation, TRACK_CLASS, trackStyle, useBenchMotion } from '../bench-motion';

import { TubeArt, type TubeGeometry } from './tube-art';

/**
 * The bench: a shelf of reagents and tools, and a rack of eight labelled tubes.
 *
 * One gesture does everything, and it is the one a student uses at a real
 * bench: pick a thing up, then tap the tube you want to use it on. Tapping a
 * tube with empty hands only selects it, so nothing can be added by accident,
 * and what you are holding is always named under the bench.
 *
 * Holds no state of its own. What is held, what is in each tube and what the
 * lime water is showing all arrive as props; taps leave as callbacks.
 */

export const BENCH_WIDTH = 1000;
export const BENCH_HEIGHT = 560;

/** Tube centres, and the geometry every tube in the rack is drawn to. */
export const TX = [137, 241, 344, 448, 552, 656, 759, 863] as const;
export const RACK_TUBE: Omit<TubeGeometry, 'cx'> = { top: 218, bottom: 470, w: 44, mlPx: 16 };

/** Where each thing on the shelf sits, so a tour can point at it. */
export const SHELF_X = {
  'reagent:HCl': 143,
  'reagent:NaOH': 237,
  'litmus:blue': 331,
  'litmus:red': 425,
  'jar:Zn': 533,
  'jar:Na2CO3': 655,
  splinter: 769,
  lime: 863,
} as const;

export type ItemKey = keyof typeof SHELF_X;

/** What tapping a shelf item puts in your hand. */
export function heldForItem(key: ItemKey): Held {
  switch (key) {
    case 'reagent:HCl':
      return { kind: 'reagent', id: 'HCl' };
    case 'reagent:NaOH':
      return { kind: 'reagent', id: 'NaOH' };
    case 'litmus:blue':
      return { kind: 'litmus', id: 'blue' };
    case 'litmus:red':
      return { kind: 'litmus', id: 'red' };
    case 'jar:Zn':
      return { kind: 'jar', id: 'Zn' };
    case 'jar:Na2CO3':
      return { kind: 'jar', id: 'Na2CO3' };
    case 'splinter':
      return { kind: 'splinter' };
    case 'lime':
      return { kind: 'lime' };
  }
}

/** The shelf item currently in your hand, for drawing it lifted. */
export function itemForHeld(held: Held | null): ItemKey | null {
  if (!held) return null;
  switch (held.kind) {
    case 'reagent':
      return held.id === 'HCl' ? 'reagent:HCl' : 'reagent:NaOH';
    case 'litmus':
      return held.id === 'blue' ? 'litmus:blue' : 'litmus:red';
    case 'jar':
      return held.id === 'Zn' ? 'jar:Zn' : 'jar:Na2CO3';
    case 'splinter':
      return 'splinter';
    case 'lime':
      return 'lime';
  }
}

const BOTTLES: readonly {
  key: ItemKey;
  cap: string;
  label: string;
  sub: string;
  liquid: string;
  name: string;
}[] = [
  {
    key: 'reagent:HCl',
    cap: 'DIL. HCl',
    label: REAGENTS.HCl.label,
    sub: REAGENTS.HCl.sub,
    liquid: 'rgba(214,232,240,.30)',
    name: 'Dropper bottle of dilute hydrochloric acid',
  },
  {
    key: 'reagent:NaOH',
    cap: 'DIL. NaOH',
    label: REAGENTS.NaOH.label,
    sub: REAGENTS.NaOH.sub,
    liquid: 'rgba(214,232,240,.30)',
    name: 'Dropper bottle of dilute sodium hydroxide',
  },
  {
    key: 'litmus:blue',
    cap: 'BLUE LITMUS',
    label: 'blue litmus',
    sub: 'solution',
    liquid: 'rgba(51,80,200,.75)',
    name: 'Dropper bottle of blue litmus solution',
  },
  {
    key: 'litmus:red',
    cap: 'RED LITMUS',
    label: 'red litmus',
    sub: 'solution',
    liquid: 'rgba(200,50,60,.75)',
    name: 'Dropper bottle of red litmus solution',
  },
];

const JARS: readonly { key: ItemKey; id: SolidId; cap: string; label: string; sub: string; name: string }[] = [
  { key: 'jar:Zn', id: 'Zn', cap: 'ZINC GRANULES', label: 'zinc', sub: 'granules', name: 'Jar of zinc granules' },
  {
    key: 'jar:Na2CO3',
    id: 'Na2CO3',
    cap: 'SODIUM CARBONATE',
    label: 'Na₂CO₃',
    sub: 'solid',
    name: 'Jar of solid sodium carbonate',
  },
];


/**
 * A shelf caption, stacked onto two lines when one would run into its
 * neighbour's. Eight things share 900 units of shelf, and "SODIUM CARBONATE"
 * set on one line is wider than the space between its jar and the splinter —
 * so the caption wraps instead, the way a printed shelf label would.
 */
function Caption({
  x,
  fill = apparatus.benchLabel,
  children,
}: {
  x: number;
  fill?: string;
  children: string;
}): React.ReactElement {
  const lines = wrapCaption(children);
  // Grown upwards, so every caption's last line sits on the same baseline.
  const top = 192 - (lines.length - 1) * 11;

  return (
    <text
      x={x}
      y={top}
      fontSize={9.5}
      textAnchor="middle"
      fill={fill}
      fontFamily={LABEL_FONT}
      fontWeight={700}
      letterSpacing={1.1}
    >
      {lines.map((line, i) => (
        <tspan key={line} x={x} dy={i === 0 ? 0 : 11}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** Two lines at most, broken at the space that leaves them most even. */
function wrapCaption(text: string): string[] {
  if (text.length <= 11 || !text.includes(' ')) return [text];
  const spaces = [...text].flatMap((c, i) => (c === ' ' ? [i] : []));
  const mid = text.length / 2;
  const at = spaces.reduce((best, i) => (Math.abs(i - mid) < Math.abs(best - mid) ? i : best), spaces[0]!);
  return [text.slice(0, at), text.slice(at + 1)];
}

function Plate({
  x,
  y,
  w,
  h,
  label,
  sub,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub: string;
}): React.ReactElement {
  return (
    <>
      <rect x={x - w / 2} y={y} width={w} height={h} rx={3} fill="#f4f1ea" opacity={0.95} />
      <text
        x={x}
        y={y + h * 0.52}
        fontSize={10}
        textAnchor="middle"
        fill="#1d1d1b"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        {label}
      </text>
      <text x={x} y={y + h * 0.84} fontSize={6.5} textAnchor="middle" fill="#6b6658" fontFamily={LABEL_FONT}>
        {sub}
      </text>
    </>
  );
}

/** Every shelf item is the same control: a button that lifts when held. */
function ShelfItem({
  item,
  name,
  held,
  pulsing,
  focus,
  children,
}: {
  item: ItemKey;
  name: string;
  held: boolean;
  pulsing: boolean;
  /** The invisible focus/pulse ring: x, y, width, height. */
  focus: readonly [number, number, number, number];
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <g
      data-item={item}
      className={`hot${held ? ' picked' : ''}${pulsing ? ' pulse' : ''}`}
      tabIndex={0}
      role="button"
      aria-pressed={held}
      aria-label={name}
    >
      <g className="lift">
        {children}
        {/* Last, and transparently filled: the ring draws over the glassware,
            and the whole rectangle is a target a thumb can find. */}
        <rect
          className="focus"
          x={focus[0]}
          y={focus[1]}
          width={focus[2]}
          height={focus[3]}
          rx={9}
          fill="rgba(0,0,0,0)"
          stroke="transparent"
        />
      </g>
    </g>
  );
}

function Bottle({
  spec,
  held,
  pulsing,
  gid,
}: {
  spec: (typeof BOTTLES)[number];
  held: boolean;
  pulsing: boolean;
  gid: string;
}): React.ReactElement {
  const x = SHELF_X[spec.key];
  return (
    <ShelfItem item={spec.key} name={spec.name} held={held} pulsing={pulsing} focus={[x - 32, 38, 64, 140]}>
      <rect x={x - 26} y={86} width={52} height={88} rx={9} fill="#000" opacity={0.3} filter={`url(#${gid}soft)`} />
      <path d={`M${x - 8} 66 V46 Q${x} 32 ${x + 8} 46 V66 Z`} fill="#2a2a2c" stroke="#4a4a4e" />
      <rect x={x - 10} y={64} width={20} height={18} rx={3} fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.35)" />
      <rect x={x - 28} y={80} width={56} height={90} rx={10} fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.4)" strokeWidth={1.4} />
      <rect x={x - 25} y={102} width={50} height={65} rx={7} fill={spec.liquid} />
      <Plate x={x} y={112} w={48} h={30} label={spec.label} sub={spec.sub} />
    </ShelfItem>
  );
}

function Jar({
  spec,
  held,
  pulsing,
  gid,
}: {
  spec: (typeof JARS)[number];
  held: boolean;
  pulsing: boolean;
  gid: string;
}): React.ReactElement {
  const x = SHELF_X[spec.key];
  const grains: React.ReactElement[] = [];
  for (let k = 0; k < 20; k++) {
    const gx = x - 28 + (((k * 313) % 97) / 97) * 56;
    const gy = 108 - (((k * 57) % 13) / 13) * 20;
    grains.push(
      spec.id === 'Zn' ? (
        <circle key={k} cx={gx} cy={gy} r={3.4} fill="#9aa3a8" stroke="#5f686c" strokeWidth={0.7} />
      ) : (
        <circle key={k} cx={gx} cy={gy} r={2.8} fill="#f2f1ec" opacity={0.92} />
      ),
    );
  }
  return (
    <ShelfItem item={spec.key} name={spec.name} held={held} pulsing={pulsing} focus={[x - 50, 46, 100, 110]}>
      <rect x={x - 40} y={72} width={84} height={84} rx={8} fill="#000" opacity={0.3} filter={`url(#${gid}soft)`} />
      <rect x={x - 42} y={66} width={84} height={84} rx={8} fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.4)" strokeWidth={1.4} />
      <rect x={x - 46} y={54} width={92} height={14} rx={4} fill="#2a2a2c" stroke="#4a4a4e" />
      {grains}
      <Plate x={x} y={112} w={76} h={26} label={spec.label} sub={spec.sub} />
    </ShelfItem>
  );
}

function Splinter({ held, pulsing, gid }: { held: boolean; pulsing: boolean; gid: string }): React.ReactElement {
  const x = SHELF_X.splinter;
  return (
    <ShelfItem
      item="splinter"
      name="Burning splinter and matchbox"
      held={held}
      pulsing={pulsing}
      focus={[x - 42, 46, 88, 112]}
    >
      <rect x={x - 34} y={124} width={68} height={30} rx={4} fill="#000" opacity={0.3} filter={`url(#${gid}soft)`} />
      <rect x={x - 36} y={118} width={68} height={30} rx={4} fill="#8a3a2f" stroke="#5d2720" />
      <text x={x - 2} y={137} fontSize={8} textAnchor="middle" fill="#f7e7cf" fontFamily={LABEL_FONT} fontWeight={700} letterSpacing={0.6}>
        MATCHES
      </text>
      <g transform={`rotate(12 ${x + 12} 106)`}>
        <rect x={x + 10} y={76} width={5} height={52} rx={2} fill="#c8a877" />
        <path d={`M${x + 20} 78 q-9 -12 0 -22 q3 8 8 10 q5 6 -1 13 q-3 4 -7 -1 Z`} fill={`url(#${gid}flame)`} />
      </g>
    </ShelfItem>
  );
}

function LimeTube({
  held,
  pulsing,
  lime,
  gid,
}: {
  held: boolean;
  pulsing: boolean;
  lime: { from: string; milky: boolean } | null;
  gid: string;
}): React.ReactElement {
  const x = SHELF_X.lime;
  const top = 70;
  const bottom = 158;
  const w = 26;
  const r = w / 2;
  const glass = `M${x - r} ${top} V${bottom - r} A${r} ${r} 0 0 0 ${x + r} ${bottom - r} V${top}`;
  const fill = lime?.milky ? '#eef0ea' : 'rgba(238,246,244,.30)';
  return (
    <ShelfItem
      item="lime"
      name={`Lime water tube${lime ? `, ${lime.milky ? 'milky' : 'clear'} after tube ${lime.from}` : ''}`}
      held={held}
      pulsing={pulsing}
      focus={[x - 40, 50, 80, 116]}
    >
      <rect x={x - 36} y={92} width={20} height={56} rx={3} fill="#3a4148" />
      <rect x={x - 36} y={102} width={32} height={7} rx={3} fill="#59626a" />
      <clipPath id={`${gid}lime`}>
        <path d={glass} />
      </clipPath>
      <path d={glass} fill="rgba(255,255,255,.05)" />
      <g clipPath={`url(#${gid}lime)`}>
        {/* Lime water does not turn milky between one frame and the next: the
            calcium carbonate comes out of solution, and the tube is watched
            clouding. The colour is still the model's; only the arrival eases. */}
        <rect
          className={TRACK_CLASS}
          style={trackStyle(LIME_CLOUDS)}
          x={x - r}
          y={top + 26}
          width={w}
          height={bottom - top - 26}
          fill={fill}
        />
        <rect x={x - r} y={top + 25} width={w} height={3} fill="#fff" opacity={0.3} />
      </g>
      <path d={glass} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth={1.3} />
    </ShelfItem>
  );
}

export interface AcidBaseBenchProps {
  layout: readonly TubeSpec[];
  tubes: readonly Tube[];
  held: Held | null;
  /** The tube the close-up is showing, ringed on the rack. */
  selected: number;
  lime: { from: string; milky: boolean } | null;
  /** Item keys and `tube:n` a tour or a hint is pointing at. */
  highlights: readonly string[];
  onPick: (held: Held | null) => void;
  onTapTube: (tube: number) => void;
  onSvg: (el: SVGSVGElement | null) => void;
}

export function AcidBaseBench({
  layout,
  tubes,
  held,
  selected,
  lime,
  highlights,
  onPick,
  onTapTube,
  onSvg,
}: AcidBaseBenchProps): React.ReactElement {
  const gid = `ab${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const moving = useBenchMotion();
  const holding = itemForHeld(held);

  const activate = (el: Element): void => {
    const item = el.closest('[data-item]')?.getAttribute('data-item') as ItemKey | null;
    if (item) {
      onPick(holding === item ? null : heldForItem(item));
      return;
    }
    const tube = el.closest('[data-tube]')?.getAttribute('data-tube');
    if (tube !== null && tube !== undefined) onTapTube(Number(tube));
  };

  const onClick = (e: React.MouseEvent<SVGSVGElement>): void => {
    const target = e.target as Element;
    // Tapping the bare bench is how you put something down, exactly as you
    // would set a bottle back on the shelf.
    if (!target.closest('[data-item]') && !target.closest('[data-tube]')) {
      if (held) onPick(null);
      return;
    }
    activate(target);
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>): void => {
    if (e.key === 'Escape' && held) {
      e.preventDefault();
      onPick(null);
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = e.target as Element;
    if (!target.closest('[data-item]') && !target.closest('[data-tube]')) return;
    e.preventDefault();
    activate(target);
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
        // Shared motion first, so this bench's own rules refine it rather than
        // replace it; `motionSx` last, so stopping beats everything above it.
        ...benchMotionSx,
        '& .hot': { cursor: 'pointer', outline: 'none' },
        '& .lift': { transition: 'transform .25s cubic-bezier(.32,.72,0,1)' },
        '& .picked .lift': { transform: 'translateY(-10px)' },
        '& .hot:hover .focus, & .hot:focus-visible .focus': {
          stroke: apparatus.hintRing,
          strokeWidth: 2.5,
        },
        '& .pulse .focus': { stroke: apparatus.hintRing, strokeWidth: 3, animation: pulseAnimation },
        '& .tube.sel .focus': { stroke: '#ffffff', strokeWidth: 2, strokeOpacity: 0.55 },
        ...motionSx(moving),
      }}
    >
      <svg
        ref={onSvg}
        viewBox={`0 0 ${BENCH_WIDTH} ${BENCH_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Chemistry bench: dropper bottles of dilute acid, dilute alkali and litmus solution, jars of zinc granules and solid sodium carbonate, a burning splinter, a lime water tube, and a rack of eight labelled test tubes"
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'manipulation' }}
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
          <linearGradient id={`${gid}flame`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe6a3" />
            <stop offset=".5" stopColor="#f7a52f" />
            <stop offset="1" stopColor="#d9431f" />
          </linearGradient>
          <filter id={`${gid}soft`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <rect width={BENCH_WIDTH} height={BENCH_HEIGHT} fill={`url(#${gid}lamp)`} />
        <rect y={BENCH_HEIGHT - 8} width={BENCH_WIDTH} height={8} fill="#0f1413" />

        {BOTTLES.map((spec) => (
          <Bottle key={spec.key} spec={spec} gid={gid} held={holding === spec.key} pulsing={highlights.includes(spec.key)} />
        ))}
        {JARS.map((spec) => (
          <Jar key={spec.key} spec={spec} gid={gid} held={holding === spec.key} pulsing={highlights.includes(spec.key)} />
        ))}
        <Splinter gid={gid} held={holding === 'splinter'} pulsing={highlights.includes('splinter')} />
        <LimeTube gid={gid} held={holding === 'lime'} pulsing={highlights.includes('lime')} lime={lime} />

        {BOTTLES.map((spec) => (
          <Caption key={spec.key} x={SHELF_X[spec.key]}>
            {spec.cap}
          </Caption>
        ))}
        {JARS.map((spec) => (
          <Caption key={spec.key} x={SHELF_X[spec.key]}>
            {spec.cap}
          </Caption>
        ))}
        <Caption x={SHELF_X.splinter}>BURNING SPLINTER</Caption>
        <Caption x={SHELF_X.lime} fill={lime ? (lime.milky ? '#ffd98a' : '#9aa8a4') : apparatus.benchLabel}>
          {lime ? `${lime.milky ? 'MILKY' : 'CLEAR'} · TUBE ${lime.from}` : 'LIME WATER TUBE'}
        </Caption>

        {/* The rack */}
        <rect x={60} y={246} width={880} height={14} rx={3} fill={`url(#${gid}wood)`} />
        <rect x={60} y={472} width={880} height={16} rx={3} fill={`url(#${gid}wood)`} />
        <rect x={60} y={246} width={12} height={242} fill={`url(#${gid}wood)`} />
        <rect x={928} y={246} width={12} height={242} fill={`url(#${gid}wood)`} />

        {layout.map((spec, i) => {
          const cx = TX[i]!;
          return (
            <g
              key={spec.id}
              data-tube={i}
              className={`hot tube${selected === i ? ' sel' : ''}${highlights.includes(`tube:${i}`) ? ' pulse' : ''}`}
              tabIndex={0}
              role="button"
              aria-label={`Test tube ${spec.id}: ${REAGENTS[spec.reagent].name} with ${spec.what}`}
            >
              <rect
                className="focus"
                x={cx - 28}
                y={RACK_TUBE.top - 10}
                width={56}
                height={RACK_TUBE.bottom - RACK_TUBE.top + 20}
                rx={8}
                fill="rgba(0,0,0,0)"
                stroke="transparent"
              />
              <TubeArt tube={tubes[i]!} geometry={{ ...RACK_TUBE, cx }} clipId={`${gid}t${i}`} />
              <text x={cx} y={508} fontSize={11} textAnchor="middle" fill="#dfe6e4" fontFamily={LABEL_FONT} fontWeight={700}>
                {spec.id} · {REAGENTS[spec.reagent].label}
              </text>
              <text x={cx} y={522} fontSize={9} textAnchor="middle" fill="#8a9794" fontFamily={LABEL_FONT}>
                + {spec.what}
              </text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}
