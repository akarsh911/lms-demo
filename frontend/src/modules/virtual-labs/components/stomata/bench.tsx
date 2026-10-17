'use client';

import * as React from 'react';
import Box from '@mui/material/Box';

import { peelOutlinePath } from '@labs/lib/stomata/draw';
import { OBJ, ZMAX, ZMIN, liquidOn, type MicState, type SlideState, type Surface } from '@labs/lib/stomata/peel';
import type { Held, StomataState } from '@labs/lib/stomata/state';
import { clamp } from '@labs/lib/numbers';

import { apparatus, LABEL_FONT } from '../apparatus-palette';
import {
  RIDE_CLASS,
  TRACK_CLASS,
  benchMotionSx,
  motionSx,
  pulseAnimation,
  rideStyle,
  useBenchMotion,
} from '../bench-motion';

import { EYE, FieldOfView, fieldCaption } from './eyepiece';

/**
 * The biology bench: a leaf in a petri dish, a watch glass of water, the tools,
 * a slide and a coverslip — and beside them a compound microscope with the
 * field of view drawn from whatever is actually under the objective.
 *
 * Everything a student does is a tap on a labelled part: pick up a tool, tap
 * what to use it on. Each one is also a keyboard control — every hot part is a
 * button in the tab order, Enter or Space activates it — because a microscope
 * you can only drive with a mouse teaches nobody anything.
 *
 * Holds no state of its own. What is on the slide and where the stage is
 * arrives as props; taps leave as one `onHot` callback, so the mapping from a
 * part of the drawing to an action lives with the engine, not in the picture.
 */
export const BENCH_WIDTH = 1000;
export const BENCH_HEIGHT = 620;


/** Where the tools sit. The order is the order they are used in. */
export const TOOLS: readonly { id: string; x: number; y: number; t: string; aria: string }[] = [
  { id: 'forceps', x: 56, y: 306, t: 'FORCEPS', aria: 'Forceps' },
  { id: 'needle', x: 136, y: 306, t: 'NEEDLE', aria: 'Mounted needle' },
  { id: 'brush', x: 216, y: 306, t: 'BRUSH', aria: 'Fine brush' },
  { id: 'water', x: 296, y: 306, t: 'WATER', aria: 'Dropper of water' },
  { id: 'safranin', x: 56, y: 386, t: 'SAFRANIN', aria: 'Safranin stain' },
  { id: 'glycerine', x: 136, y: 386, t: 'GLYCERINE', aria: 'Glycerine' },
  { id: 'blot', x: 216, y: 386, t: 'BLOTTING', aria: 'Blotting paper' },
];

/** Regions of the drawing a tour can point at, in bench coordinates. */
export const REGIONS = {
  leaf: [24, 50, 176, 216],
  dish: [232, 60, 140, 150],
  tools: [16, 268, 348, 170],
  cover: [268, 356, 68, 84],
  slide: [18, 444, 356, 140],
  scope: [396, 44, 340, 546],
  knobs: [630, 230, 90, 180],
  stagepad: [396, 408, 80, 96],
  objectives: [478, 186, 140, 130],
  eye: [742, 44, 258, 300],
  gauge: [742, 352, 258, 224],
} as const;

function Label({ x, y, children, anchor = 'middle' }: { x: number; y: number; children: React.ReactNode; anchor?: 'middle' | 'start' }): React.ReactElement {
  return (
    <text x={x} y={y} fontSize={10.5} textAnchor={anchor} fill={apparatus.benchLabel} fontFamily={LABEL_FONT} fontWeight={600} letterSpacing={1.2}>
      {children}
    </text>
  );
}

/** A tappable part: a generous invisible target, a focus ring, a pulse for tours. */
function Hot({
  id,
  label,
  pulse,
  pressed,
  children,
  rect,
}: {
  id: string;
  label: string;
  pulse: boolean;
  pressed?: boolean;
  children: React.ReactNode;
  /** The focus/pulse ring, and the target: [x, y, w, h]. */
  rect: readonly [number, number, number, number];
}): React.ReactElement {
  return (
    <g
      data-hot={id}
      className={`hot${pulse ? ' pulse' : ''}`}
      tabIndex={0}
      role="button"
      aria-label={label}
      aria-pressed={pressed}
    >
      <rect x={rect[0]} y={rect[1]} width={rect[2]} height={rect[3]} rx={10} fill="rgba(0,0,0,0)" />
      {children}
      <rect className="ring" x={rect[0]} y={rect[1]} width={rect[2]} height={rect[3]} rx={10} fill="none" stroke="transparent" strokeWidth={2} />
    </g>
  );
}

function ToolIcon({ id }: { id: string }): React.ReactElement | null {
  switch (id) {
    case 'forceps':
      return (
        <>
          <path d="M-7 -24 Q-3 0 -1 20 L1 20 Q3 0 7 -24" fill="none" stroke="#cfd8d5" strokeWidth={3.4} strokeLinecap="round" />
          <rect x={-8} y={-27} width={16} height={6} rx={3} fill="#8c9a96" />
        </>
      );
    case 'needle':
      return (
        <>
          <line x1={0} y1={-26} x2={0} y2={6} stroke="#dfe6e3" strokeWidth={2.4} />
          <path d="M0 6 L0 22" stroke="#e8eeeb" strokeWidth={1.2} />
          <rect x={-5} y={-27} width={10} height={22} rx={4} fill="#8a5a3c" />
        </>
      );
    case 'brush':
      return (
        <>
          <rect x={-4} y={-26} width={8} height={26} rx={3} fill="#a8703f" />
          <rect x={-5} y={0} width={10} height={7} rx={2} fill="#b9c4c1" />
          <path d="M-5 7 Q0 26 5 7 Z" fill="#d9c18a" />
        </>
      );
    case 'water':
      return (
        <>
          <path d="M-7 -20 V-6 L-9 16 A9 9 0 0 0 9 16 L7 -6 V-20 Z" fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.5)" strokeWidth={1.3} />
          <path d="M-8 6 L8 6 L9 16 A9 9 0 0 1 -9 16 Z" fill="#7fb6d8" opacity={0.7} />
          <rect x={-4} y={-27} width={8} height={8} rx={3} fill="#3a4a58" />
        </>
      );
    case 'safranin':
    case 'glycerine': {
      const stain = id === 'safranin';
      return (
        <>
          <rect x={-11} y={-14} width={22} height={34} rx={5} fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.45)" strokeWidth={1.3} />
          <rect x={-9} y={stain ? -4 : -2} width={18} height={stain ? 22 : 20} rx={4} fill={stain ? '#c0263f' : '#dfe7e4'} opacity={stain ? 0.88 : 0.55} />
          <rect x={-5} y={-24} width={10} height={11} rx={2} fill="#2a2a2c" />
          <rect x={-10} y={stain ? 2 : 3} width={20} height={stain ? 10 : 9} rx={2} fill="#f4f1ea" />
          <text x={0} y={10} fontSize={stain ? 6 : 5.4} textAnchor="middle" fill="#1d1d1b" fontFamily={LABEL_FONT} fontWeight={700}>
            {stain ? 'SAFRANIN' : 'GLYCERINE'}
          </text>
        </>
      );
    }
    case 'blot':
      return (
        <>
          <rect x={-19} y={-10} width={38} height={24} rx={2} fill="#e6dfcb" stroke="#c3baa1" />
          <rect x={-16} y={-14} width={38} height={24} rx={2} fill="#efe9d9" stroke="#c3baa1" />
          <rect x={-13} y={-18} width={38} height={24} rx={2} fill="#f6f1e4" stroke="#c3baa1" />
        </>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// The preparation half
// ---------------------------------------------------------------------------

function Preparation({
  faceUp,
  dish,
  held,
  slide,
  pulse,
}: {
  faceUp: Surface;
  dish: boolean;
  held: Held | null;
  slide: SlideState;
  pulse: (id: string) => boolean;
}): React.ReactElement {
  const green = faceUp === 'lower' ? ['#7fae62', '#9cc47c'] : ['#3f7a43', '#55925a'];
  const holding = held?.kind ?? null;

  return (
    <g>
      <Label x={196} y={34}>PREPARATION</Label>

      {/* The petri dish, with the leaf that has been folded and snapped. */}
      <circle cx={110} cy={132} r={74} fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.35)" strokeWidth={1.5} />
      <circle cx={110} cy={132} r={66} fill="none" stroke="rgba(255,255,255,.18)" />
      <Hot id="obj:leafBody" label="The body of the leaf — the green lamina" pulse={pulse('obj:leafBody')} rect={[44, 62, 122, 140]}>
        <path d="M56 132 Q72 72 124 68 Q164 68 162 108 Q160 164 108 190 Q68 188 56 132 Z" fill={green[0]} />
        <path d="M64 134 Q78 82 124 78 Q154 80 152 110 Q150 158 108 180 Q74 178 64 134 Z" fill={green[1]} opacity={0.55} />
        <path d="M62 144 Q108 124 158 104" stroke="#4c7a3f" strokeWidth={2} fill="none" />
        <path d="M78 162 Q102 134 108 98 M92 176 Q124 146 140 120" stroke="#4c7a3f" strokeWidth={1.2} fill="none" opacity={0.7} />
      </Hot>
      <Hot id="obj:leafFlap" label="The thin transparent flap of epidermis at the torn edge" pulse={pulse('obj:leafFlap')} rect={[142, 66, 56, 70]}>
        <path d="M150 86 Q178 74 184 96 Q188 120 170 130 Q154 122 150 86 Z" fill="#dfeee0" opacity={0.72} stroke="#b6d2b8" strokeWidth={1.2} />
        <path d="M154 92 Q174 84 178 100" stroke="#9fc0a2" strokeWidth={1} fill="none" />
      </Hot>
      <text x={110} y={222} fontSize={10.5} textAnchor="middle" fontFamily={LABEL_FONT} fontWeight={700} letterSpacing={1} fill={faceUp === 'lower' ? apparatus.hintRing : '#e2b96a'}>
        {faceUp === 'lower' ? 'LOWER SURFACE UP' : 'UPPER SURFACE UP'}
      </text>
      <Hot id="obj:flip" label="Turn the leaf over" pulse={pulse('obj:flip')} rect={[48, 230, 124, 28]}>
        <rect x={50} y={232} width={120} height={24} rx={12} fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.25)" />
        <text x={110} y={248} fontSize={11} textAnchor="middle" fill={apparatus.benchInk} fontFamily={LABEL_FONT}>
          Turn the leaf over
        </text>
      </Hot>

      {/* The watch glass the peel is floated in. */}
      <Hot id="obj:dish" label="Watch glass of water, for floating the peel" pulse={pulse('obj:dish')} rect={[242, 70, 118, 124]}>
        <circle cx={301} cy={132} r={56} fill="rgba(150,200,225,.2)" stroke="rgba(255,255,255,.4)" strokeWidth={1.5} />
        <ellipse cx={301} cy={124} rx={44} ry={30} fill="rgba(180,220,240,.18)" />
        {dish ? (
          <>
            {/* A scrap of epidermis on the surface of a watch glass of water
                does not sit where it was put. This one is COSMETIC and says so:
                nothing about the watch glass is marked, and the peel that comes
                out of it is the peel that went in, wherever it has drifted to.
                What it buys is that the very first step of the practical is
                already a bench with water in it rather than a diagram. */}
            <g className={RIDE_CLASS} style={rideStyle({ x: 4.5, y: 2.8 })}>
              <path d="M273 120 Q291 104 319 112 Q335 124 323 144 Q299 158 277 144 Q267 132 273 120 Z" fill="#e7f2e6" opacity={0.85} stroke="#bcd6bd" />
            </g>
            <text x={301} y={176} fontSize={9} textAnchor="middle" fill={apparatus.hintRing} fontFamily={LABEL_FONT} fontWeight={600}>
              peel floating
            </text>
          </>
        ) : null}
      </Hot>
      <Label x={301} y={206}>WATER</Label>

      {/* The tools. */}
      {TOOLS.map((t) => (
        <g key={t.id}>
          <Hot id={`tool:${t.id}`} label={t.aria} pulse={pulse(`tool:${t.id}`)} pressed={holding === t.id} rect={[t.x - 30, t.y - 34, 60, 66]}>
            <g transform={`translate(${t.x} ${holding === t.id ? t.y - 8 : t.y})`}>
              <ToolIcon id={t.id} />
            </g>
          </Hot>
          <Label x={t.x} y={t.y + 44}>{t.t}</Label>
        </g>
      ))}

      {/* The coverslip. */}
      <Hot id="tool:cover" label="Coverslip" pulse={pulse('tool:cover')} rect={[272, 362, 56, 56]}>
        {slide.cover ? (
          <>
            <rect x={280} y={370} width={38} height={38} rx={2} fill="none" stroke="rgba(255,255,255,.18)" strokeDasharray="3 3" />
            <text x={299} y={394} fontSize={9} textAnchor="middle" fill={apparatus.benchInkMuted} fontFamily={LABEL_FONT}>
              used
            </text>
          </>
        ) : (
          <>
            <rect x={280} y={370} width={38} height={38} rx={2} fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.6)" strokeWidth={1.3} />
            <line x1={280} y1={379} x2={318} y2={375} stroke="#fff" opacity={0.3} />
          </>
        )}
      </Hot>
      <Label x={299} y={430}>COVERSLIP</Label>

      <SlideTop slide={slide} pulse={pulse('obj:slide')} />
    </g>
  );
}

/** The slide as it lies on the bench, drawn at 34 px per millimetre. */
function SlideTop({ slide, pulse }: { slide: SlideState; pulse: boolean }): React.ReactElement {
  const X = 26;
  const Y = 452;
  const W = 340;
  const H = 124;
  const cx = X + W / 2;
  const cy = Y + H / 2;
  const k = 34;
  const liq = liquidOn(slide);

  return (
    <g>
      <Hot id="obj:slide" label={slide.onStage ? 'The glass slide, on the microscope stage' : 'The glass slide'} pulse={pulse} rect={[X - 8, Y - 8, W + 16, H + 16]}>
        <rect x={X} y={Y} width={W} height={H} rx={4} fill="rgba(255,255,255,.10)" stroke="rgba(255,255,255,.55)" strokeWidth={1.4} />
        {slide.broken ? (
          <path d={`M${X} ${Y + 42}L${X + 108} ${Y + 66}L${X + 180} ${Y + 32}L${X + W} ${Y + 80}`} stroke="#ff8f88" strokeWidth={2.4} fill="none" />
        ) : null}
        {liq > 0 ? (
          <ellipse
            cx={cx}
            cy={cy}
            rx={46 + liq * 7}
            ry={30 + liq * 5}
            fill={slide.stain ? 'rgba(200,60,92,.30)' : 'rgba(150,200,225,.28)'}
            stroke="rgba(255,255,255,.3)"
          />
        ) : null}
        {slide.peel ? (
          <path
            d={peelOutlinePath(slide.peel, cx, cy, k)}
            fill={slide.stain ? 'rgba(214,90,120,.55)' : 'rgba(226,238,224,.45)'}
            stroke="rgba(255,255,255,.5)"
          />
        ) : null}
        {slide.cover ? (
          <>
            <rect x={cx - 54} y={cy - 40} width={108} height={80} rx={1} fill="rgba(255,255,255,.09)" stroke="rgba(255,255,255,.7)" strokeWidth={1.2} />
            {slide.bubbles.map((b, i) =>
              Math.abs(b.x * k) > 54 || Math.abs(b.y * k) > 40 ? null : (
                <circle key={i} cx={cx + b.x * k} cy={cy + b.y * k} r={Math.max(2, b.r * k)} fill="rgba(255,255,255,.5)" stroke="#0c1110" strokeWidth={1.4} />
              ),
            )}
          </>
        ) : null}
      </Hot>
      <Label x={cx} y={Y + H + 24}>{slide.onStage ? 'ON THE MICROSCOPE STAGE' : 'SLIDE'}</Label>
    </g>
  );
}

// ---------------------------------------------------------------------------
// The microscope
// ---------------------------------------------------------------------------

function Knob({
  cx,
  cy,
  r,
  name,
  up,
  down,
  pulse,
}: {
  cx: number;
  cy: number;
  r: number;
  name: string;
  up: string;
  down: string;
  pulse: (id: string) => boolean;
}): React.ReactElement {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#39413f" stroke="rgba(255,255,255,.25)" />
      <circle cx={cx} cy={cy} r={r * 0.5} fill="rgba(255,255,255,.06)" />
      <Hot id={up} label={`${name} adjustment: raise the stage`} pulse={pulse(up)} rect={[cx - r, cy - r, r * 2, r]}>
        <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z`} fill="rgba(255,255,255,.05)" />
        <path d={`M${cx - 7} ${cy - r * 0.32} L${cx} ${cy - r * 0.62} L${cx + 7} ${cy - r * 0.32} Z`} fill="#cfd8d5" />
      </Hot>
      <Hot id={down} label={`${name} adjustment: lower the stage`} pulse={pulse(down)} rect={[cx - r, cy, r * 2, r]}>
        <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 0 ${cx + r} ${cy} Z`} fill="rgba(0,0,0,.12)" />
        <path d={`M${cx - 7} ${cy + r * 0.32} L${cx} ${cy + r * 0.62} L${cx + 7} ${cy + r * 0.32} Z`} fill="#cfd8d5" />
      </Hot>
    </g>
  );
}

function Microscope({ mic, slide, pulse }: { mic: MicState; slide: SlideState; pulse: (id: string) => boolean }): React.ReactElement {
  const dy = clamp((mic.z - ZMIN) * 0.7, 0, 30);

  const barrel = (mag: 10 | 40, inUse: boolean): React.ReactElement => {
    const w = mag === 40 ? 11 : 14;
    const len = mag === 40 ? 62 : 48;
    // The lens in use hangs straight down over the slide; the other is swung
    // round on the turret. Both boxes are in bench coordinates, because that is
    // where the focus ring and the tap target have to be.
    const transform = inUse ? 'translate(542 258)' : 'translate(542 246) rotate(-54)';
    const box: readonly [number, number, number, number] = inUse
      ? [542 - w - 10, 248, w * 2 + 20, len + 18]
      : [566, 234, 80, 68];
    return (
      <Hot id={`mic:obj${mag}`} label={`${mag} times objective`} pulse={pulse(`mic:obj${mag}`)} pressed={inUse} rect={box}>
        <g transform={transform}>
          <path
            d={`M${-w - 4} 0 L${w + 4} 0 L${w} ${len - 10} Q${w} ${len} 0 ${len} Q${-w} ${len} ${-w} ${len - 10} Z`}
            fill="#39413f"
            stroke={inUse ? apparatus.hintRing : 'rgba(255,255,255,.3)'}
            strokeWidth={inUse ? 2 : 1}
          />
          <rect x={-w - 1} y={len * 0.45} width={w * 2 + 2} height={7} fill={mag === 40 ? '#d8b24a' : '#4aa3d8'} />
          <text x={0} y={len * 0.32} fontSize={9} textAnchor="middle" fill="#e8efec" fontFamily={LABEL_FONT} fontWeight={700}>
            {mag}×
          </text>
        </g>
      </Hot>
    );
  };

  const pan = (id: string, x: number, y: number, d: string, name: string): React.ReactElement => (
    <Hot id={`mic:${id}`} label={`Move the stage ${name}`} pulse={pulse(`mic:${id}`)} rect={[x - 14, y - 14, 28, 28]}>
      <rect x={x - 12} y={y - 12} width={24} height={24} rx={7} fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.2)" />
      <path d={d} fill="#cfd8d5" />
    </Hot>
  );

  return (
    <g>
      <Label x={568} y={34}>COMPOUND MICROSCOPE</Label>

      <rect x={430} y={540} width={280} height={34} rx={16} fill="#2c3432" />
      <rect x={644} y={182} width={44} height={358} rx={16} fill="#2c3432" />
      <rect x={498} y={134} width={150} height={52} rx={18} fill="#2c3432" />
      <rect x={520} y={76} width={44} height={62} rx={6} fill="#2c3432" />
      <rect x={512} y={58} width={60} height={26} rx={8} fill="#39413f" stroke="rgba(255,255,255,.2)" />
      <text x={542} y={75} fontSize={9} textAnchor="middle" fill={apparatus.benchInk} fontFamily={LABEL_FONT} fontWeight={600}>
        EYEPIECE 10×
      </text>

      <circle cx={542} cy={222} r={42} fill="#39413f" stroke="rgba(255,255,255,.22)" />
      <Label x={452} y={214}>OBJECTIVES</Label>
      <Label x={452} y={228}>TAP TO SWITCH</Label>
      {barrel(mic.obj === 40 ? 10 : 40, false)}
      {barrel(mic.obj, true)}

      {/* The stage is what actually moves — and it is driven by a rack and
          pinion, which arrives where it is going rather than appearing there.
          `TRACK_CLASS` carries the step between one value of `mic.z` and the
          next; the height itself is entirely the model's. */}
      <g className={TRACK_CLASS} transform={`translate(0 ${(-dy).toFixed(1)})`}>
        <Hot id="obj:stage" label="Microscope stage — put the slide here" pulse={pulse('obj:stage')} rect={[430, 344, 228, 44]}>
          <rect x={434} y={362} width={216} height={20} rx={4} fill="#2a3230" stroke="rgba(255,255,255,.25)" />
          <rect x={518} y={366} width={48} height={12} rx={2} fill="#0d1211" />
          {slide.onStage ? (
            <>
              <rect x={462} y={350} width={160} height={16} rx={2} fill="rgba(210,235,245,.35)" stroke="rgba(255,255,255,.7)" />
              <rect x={520} y={348} width={44} height={20} rx={1} fill="rgba(255,255,255,.18)" stroke="rgba(255,255,255,.75)" />
              {slide.broken ? <path d="M464 358 L504 366 L554 352 L620 362" stroke="#ff8f88" strokeWidth={2} fill="none" /> : null}
            </>
          ) : null}
          <rect x={438} y={354} width={16} height={6} rx={2} fill="#8c9a96" />
          <rect x={630} y={354} width={16} height={6} rx={2} fill="#8c9a96" />
        </Hot>
      </g>

      <circle cx={542} cy={414} r={20} fill="#39413f" stroke="rgba(255,255,255,.18)" />
      <path d="M528 436 L556 436 L550 470 L534 470 Z" fill="#2a3230" stroke="rgba(255,255,255,.14)" />
      <circle cx={542} cy={486} r={15} fill="#f6e6a8" opacity={0.85} />
      <circle cx={542} cy={486} r={26} fill="#f6e6a8" opacity={0.12} />
      <Label x={542} y={516}>LAMP</Label>

      <Knob cx={666} cy={272} r={34} name="Coarse" up="mic:coarseUp" down="mic:coarseDown" pulse={pulse} />
      <Label x={666} y={320}>COARSE</Label>
      <Knob cx={666} cy={362} r={22} name="Fine" up="mic:fineUp" down="mic:fineDown" pulse={pulse} />
      <Label x={666} y={398}>FINE</Label>

      {pan('panU', 436, 428, 'M430 432 L436 422 L442 432 Z', 'up')}
      {pan('panD', 436, 476, 'M430 472 L436 482 L442 472 Z', 'down')}
      {pan('panL', 412, 452, 'M416 446 L406 452 L416 458 Z', 'left')}
      {pan('panR', 460, 452, 'M456 446 L466 452 L456 458 Z', 'right')}
      <Label x={436} y={502}>MOVE STAGE</Label>
    </g>
  );
}

/**
 * The gap between the front lens and the coverslip, seen from the side.
 *
 * This is the warning a student needs and a real microscope gives them: watch
 * from the side while racking up, because at 40× there is less than half a turn
 * between a sharp image and a cracked slide.
 */
function GapGauge({ mic, slide }: { mic: MicState; slide: SlideState }): React.ReactElement {
  const X = 748;
  const Y = 356;
  const W = 246;
  const H = 216;
  const o = OBJ[mic.obj];
  const gap = clamp((o.crash - mic.z) * 5, 0, 74);
  const slideY = Y + 156;
  const tip = slideY - 13 - gap;
  const danger = o.crash - mic.z < 1.2;
  const sx = X + 28;
  const s0 = Y + 38;
  const s1 = Y + H - 26;
  const zy = (z: number): number => s1 - ((z - ZMIN) / (ZMAX - ZMIN)) * (s1 - s0);
  const bx = X + 150;

  return (
    <g>
      <rect x={X} y={Y} width={W} height={H} rx={14} fill="#101615" stroke="rgba(255,255,255,.1)" />
      <Label x={X + W / 2} y={Y + 22}>LOOK FROM THE SIDE</Label>

      <rect x={sx - 5} y={s0} width={10} height={s1 - s0} rx={5} fill="rgba(255,255,255,.07)" />
      <rect x={sx - 5} y={zy(ZMAX)} width={10} height={zy(o.crash) - zy(ZMAX)} rx={5} fill="#d93f45" opacity={0.45} />
      <circle className={TRACK_CLASS} cx={sx} cy={zy(mic.z)} r={7} fill={apparatus.hintRing} />
      <text x={sx} y={s1 + 15} fontSize={9} textAnchor="middle" fill={apparatus.benchInkMuted} fontFamily={LABEL_FONT}>
        STAGE
      </text>

      <path
        d={`M${bx - 24} ${Y + 32} L${bx + 24} ${Y + 32} L${bx + 12} ${(tip - 8).toFixed(1)} Q${bx + 12} ${tip.toFixed(1)} ${bx} ${tip.toFixed(1)} Q${bx - 12} ${tip.toFixed(1)} ${bx - 12} ${(tip - 8).toFixed(1)} Z`}
        fill="#39413f"
        stroke={danger ? '#ff8f88' : 'rgba(255,255,255,.35)'}
        strokeWidth={1.6}
      />
      <text x={bx} y={Y + 52} fontSize={9} textAnchor="middle" fill="#e8efec" fontFamily={LABEL_FONT} fontWeight={700}>
        {o.name}
      </text>
      <rect x={bx - 68} y={slideY} width={136} height={7} fill="rgba(210,235,245,.5)" />
      <rect x={bx - 20} y={slideY - 6} width={40} height={6} fill="rgba(255,255,255,.35)" stroke="rgba(255,255,255,.6)" strokeWidth={0.8} />
      <rect x={bx - 68} y={slideY + 7} width={136} height={12} fill="#2a3230" />
      <text x={bx} y={slideY + 38} fontSize={10.5} textAnchor="middle" fontFamily={LABEL_FONT} fill={slide.broken || danger ? '#ff8f88' : apparatus.benchInkMuted} fontWeight={slide.broken ? 700 : 400}>
        {slide.broken
          ? 'SLIDE CRACKED'
          : !slide.onStage
            ? 'no slide on the stage'
            : danger
              ? 'the lens is almost touching'
              : 'gap between lens and coverslip'}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// The bench
// ---------------------------------------------------------------------------

export function Bench({
  state,
  onHot,
  highlights,
  onSvg,
}: {
  state: StomataState;
  onHot: (id: string) => void;
  /** Parts a tour step or a hint is pointing at. */
  highlights: readonly string[];
  onSvg: (el: SVGSVGElement | null) => void;
}): React.ReactElement {
  const pulse = React.useCallback((id: string) => highlights.includes(id), [highlights]);
  const moving = useBenchMotion();

  const activate = (target: Element | null): void => {
    const hot = target?.closest('[data-hot]');
    const id = hot?.getAttribute('data-hot');
    if (id) onHot(id);
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
        '& .hot': { cursor: 'pointer', outline: 'none' },
        '& .hot:hover .ring': { stroke: 'rgba(255,255,255,.25)' },
        '& .hot:focus-visible .ring': { stroke: apparatus.hintRing, strokeWidth: 3 },
        '& .hot.pulse .ring': { stroke: apparatus.hintRing, animation: pulseAnimation },
        // `benchMotionSx` first for the rules that move, `motionSx` last so that
        // stopping beats every one of them: the `animation` flag and
        // `prefers-reduced-motion` settle this bench by the same code path.
        ...benchMotionSx,
        ...motionSx(moving),
      }}
    >
      <svg
        ref={onSvg}
        viewBox={`0 0 ${BENCH_WIDTH} ${BENCH_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Biology bench: a leaf in a petri dish, a watch glass of water, forceps, needle, brush, water, safranin, glycerine, blotting paper, a slide and coverslip, and a compound microscope with the view down its eyepiece"
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'manipulation' }}
        onClick={(e) => activate(e.target as Element)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          const hot = (e.target as Element).closest('[data-hot]');
          if (!hot) return;
          e.preventDefault();
          activate(hot);
        }}
      >
        <rect width={BENCH_WIDTH} height={BENCH_HEIGHT} fill={apparatus.bench} />
        <line x1={392} y1={30} x2={392} y2={592} stroke="rgba(255,255,255,.07)" />
        <line x1={740} y1={30} x2={740} y2={592} stroke="rgba(255,255,255,.07)" />

        <Preparation
          faceUp={state.faceUp}
          dish={state.dish !== null}
          held={state.held}
          slide={state.slide}
          pulse={pulse}
        />
        <Microscope mic={state.mic} slide={state.slide} pulse={pulse} />

        {/* The field of view, live, on the microscope itself. The console docks
            a magnified copy of the same view beside the count when there is
            room for one. */}
        <g>
          <Label x={871} y={34}>DOWN THE EYEPIECE</Label>
          <circle cx={871} cy={180} r={EYE.r * (250 / EYE.size) + 10} fill="#0d1211" stroke="rgba(255,255,255,.18)" strokeWidth={2} />
          <svg x={746} y={55} width={250} height={250} viewBox={`0 0 ${EYE.size} ${EYE.size}`}>
            <FieldOfView slide={state.slide} mic={state.mic} />
          </svg>
          <text x={871} y={328} fontSize={11} textAnchor="middle" fill={apparatus.benchInk} fontFamily={LABEL_FONT} fontWeight={600}>
            {fieldCaption(state.mic)}
          </text>
        </g>

        <GapGauge mic={state.mic} slide={state.slide} />
      </svg>
    </Box>
  );
}
