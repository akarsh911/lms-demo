'use client';

import * as React from 'react';
import Box from '@mui/material/Box';

import {
  METAL,
  METALS,
  SALT,
  SALTS,
  truthOf,
  tubeKey,
  volumeOf,
  type Metal,
  type Salt,
} from '@labs/lib/reactivity-series/chemistry';
import { STAGE, describe } from '@labs/lib/reactivity-series/marking';
import type { RxState } from '@labs/lib/reactivity-series/state';

import { DIAL_FONT, LABEL_FONT, apparatus } from '../apparatus-palette';
import { TRACK_CLASS, benchMotionSx, motionSx, pulseAnimation, useBenchMotion } from '../bench-motion';

import {
  BENCH_HEIGHT,
  BENCH_WIDTH,
  BOTTLE_X,
  CLOCK,
  HOT,
  RACK,
  SAND,
  SHELF_LABEL_Y,
  STACK_X,
  TILE,
  columnX,
  rowY,
  tubeBox,
} from './geometry';
import { TubeGlass } from './tube-glass';

/**
 * The chemistry bench: a shelf of reagents and tools above a 4 × 4 rack.
 *
 * Everything a student does happens here. Pick up a dropper bottle, a metal
 * strip or the sandpaper by tapping it, then tap what to use it on — the same
 * two-step gesture as the standalone bench, and the same one a pair of hands
 * makes. Every hot area is also a button for the keyboard: Tab to it, Enter or
 * Space to use it.
 *
 * The tubes draw themselves from their own contents (see `tube-glass.tsx`), so
 * this component decides WHERE things are and never what they look like.
 */

export interface RxBenchProps {
  state: RxState;
  /** Hot-area ids a tour step or a hint is pointing at. */
  highlights: readonly string[];
  onSvg: (el: SVGSVGElement | null) => void;
  onBottle: (salt: Salt) => void;
  onMetal: (metal: Metal) => void;
  onSand: () => void;
  onTube: (index: number) => void;
  /** Escape, which is how a pair of hands is emptied without aiming at a button. */
  onPutDown: () => void;
}

function Hot({
  id,
  label,
  pressed,
  pulsing,
  onActivate,
  children,
}: {
  id: string;
  label: string;
  pressed?: boolean;
  pulsing: boolean;
  onActivate: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={pressed}
      data-hot={id}
      data-pulse={pulsing ? 'true' : undefined}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate();
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      {children}
    </g>
  );
}

/** A lifted object is the one in the student's hand. */
function Lift({ up, children }: { up: boolean; children: React.ReactNode }): React.ReactElement {
  return (
    <g
      style={{
        transform: up ? 'translateY(-10px)' : 'none',
        transition: 'transform .25s cubic-bezier(.32,.72,0,1)',
      }}
    >
      {children}
    </g>
  );
}

function shelfLabel(x: number, text: string): React.ReactElement {
  return (
    <text
      x={x}
      y={SHELF_LABEL_Y}
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

export function RxBench({
  state,
  highlights,
  onSvg,
  onBottle,
  onMetal,
  onSand,
  onTube,
  onPutDown,
}: RxBenchProps): React.ReactElement {
  const gid = `rx${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const lit = (id: string): boolean => highlights.includes(id);
  const held = state.held;
  const recording = state.step >= STAGE.record;
  const moving = useBenchMotion();

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        minHeight: 200,
        display: 'flex',
        p: { xs: 0.5, sm: 1 },
        backgroundColor: apparatus.bench,
        '& [data-hot]': { outline: 'none' },
        '& [data-hot]:focus-visible .focus-ring': { stroke: apparatus.hintRing, strokeWidth: 3 },
        ...benchMotionSx,
        '& [data-pulse="true"] .focus-ring': { animation: pulseAnimation },
        ...motionSx(moving),
      }}
    >
      <svg
        ref={onSvg}
        viewBox={`0 0 ${BENCH_WIDTH} ${BENCH_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Chemistry bench: four salt solutions, four metal strips, sandpaper, a lab clock and a rack of sixteen test tubes"
        /* Escape puts down whatever is in the student's hand. The key is caught
           here rather than on each hot area because it bubbles from whichever
           one has focus, and because a hand can be full while nothing on the
           bench is focused at all. */
        onKeyDown={(e) => {
          if (e.key === 'Escape') onPutDown();
        }}
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'manipulation', userSelect: 'none' }}
      >
        <defs>
          <radialGradient id={`${gid}-lamp`} cx="45%" cy="34%" r="78%">
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
          <pattern id={`${gid}-grit`} width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#b88b52" />
            <circle cx="1.5" cy="1.5" r=".8" fill="#8e6634" />
            <circle cx="4.5" cy="4" r=".7" fill="#d3ab74" />
          </pattern>
        </defs>

        <rect width={BENCH_WIDTH} height={BENCH_HEIGHT} fill={`url(#${gid}-lamp)`} />

        {/* --- the reagent shelf ------------------------------------------ */}
        {SALTS.map((salt, k) => {
          const x = BOTTLE_X[k]!;
          const spec = SALT[salt];
          const picked = held?.kind === 'bottle' && held.salt === salt;
          return (
            <Hot
              key={salt}
              id={HOT.bottle(salt)}
              label={`${spec.name} solution, dropper bottle`}
              pressed={picked}
              pulsing={lit(HOT.bottle(salt))}
              onActivate={() => onBottle(salt)}
            >
              <Lift up={picked}>
                <rect
                  x={x - 30}
                  y={76}
                  width={60}
                  height={116}
                  rx={11}
                  fill="rgba(255,255,255,.06)"
                  stroke="rgba(255,255,255,.4)"
                  strokeWidth={1.4}
                />
                <rect
                  x={x - 27}
                  y={104}
                  width={54}
                  height={85}
                  rx={8}
                  fill={`rgba(${spec.rgb.join(',')},${Math.max(spec.a, 0.16) + 0.12})`}
                />
                <rect
                  x={x - 11}
                  y={56}
                  width={22}
                  height={22}
                  rx={3}
                  fill="rgba(255,255,255,.1)"
                  stroke="rgba(255,255,255,.35)"
                />
                <path d={`M${x - 9} 58 V34 Q${x} 18 ${x + 9} 34 V58 Z`} fill="#2a2a2c" stroke="#4a4a4e" />
                <rect x={x - 25} y={118} width={50} height={34} rx={3} fill="#f4f1ea" />
                <text
                  x={x}
                  y={136}
                  fontSize={salt === 'Al2SO43' ? 10 : 12.5}
                  textAnchor="middle"
                  fill="#1d1d1b"
                  fontFamily={DIAL_FONT}
                >
                  {spec.label}
                </text>
                <text x={x} y={147} fontSize={7.5} textAnchor="middle" fill="#6b6658" fontFamily={LABEL_FONT}>
                  dilute · aq
                </text>
                <rect className="focus-ring" x={x - 34} y={24} width={68} height={176} rx={10} fill="none" stroke="transparent" />
              </Lift>
            </Hot>
          );
        })}

        <rect x={TILE.x} y={TILE.y} width={TILE.w} height={TILE.h} rx={9} fill={`url(#${gid}-tile)`} />
        {METALS.map((m, k) => {
          const x = STACK_X[k]!;
          const spec = METAL[m];
          const clean = state.clean[m];
          const picked = held?.kind === 'strip' && held.metal === m;
          return (
            <Hot
              key={m}
              id={HOT.metal(m)}
              label={`${spec.name} strips${clean ? ', cleaned' : ', not cleaned'}`}
              pressed={picked}
              pulsing={lit(HOT.metal(m))}
              onActivate={() => onMetal(m)}
            >
              <Lift up={picked}>
                {[-1, 0, 1].map((j) => (
                  <g key={j} transform={`rotate(${j * 7} ${x} 152)`}>
                    <rect
                      x={x - 6}
                      y={78}
                      width={12}
                      height={74}
                      rx={1.5}
                      fill={clean ? spec.strip : spec.dull}
                      stroke="rgba(0,0,0,.18)"
                    />
                    {clean ? <rect x={x - 3.5} y={82} width={2.4} height={66} fill="#fff" opacity={0.5} /> : null}
                  </g>
                ))}
                <text x={x} y={178} fontSize={13} textAnchor="middle" fill="#2a2a28" fontFamily={LABEL_FONT} fontWeight={700}>
                  {m}
                </text>
                <rect className="focus-ring" x={x - 30} y={68} width={60} height={118} rx={6} fill="none" stroke="transparent" />
              </Lift>
            </Hot>
          );
        })}

        <Hot id={HOT.sand} label="Sandpaper" pressed={held?.kind === 'sand'} pulsing={lit(HOT.sand)} onActivate={onSand}>
          <Lift up={held?.kind === 'sand'}>
            <path
              d={`M${SAND.x} ${SAND.y} H${SAND.x + SAND.w} V${SAND.y + SAND.h - SAND.fold} L${SAND.x + SAND.w - SAND.fold} ${SAND.y + SAND.h} H${SAND.x} Z`}
              fill={`url(#${gid}-grit)`}
            />
            <path
              d={`M${SAND.x + SAND.w} ${SAND.y + SAND.h - SAND.fold} L${SAND.x + SAND.w - SAND.fold} ${SAND.y + SAND.h} V${SAND.y + SAND.h - SAND.fold} Z`}
              fill="#e9dcc3"
            />
            <rect className="focus-ring" x={SAND.x - 6} y={SAND.y - 6} width={SAND.w + 12} height={SAND.h + 12} rx={6} fill="none" stroke="transparent" />
          </Lift>
        </Hot>

        <LabClock minutes={state.min} running={state.waitTo !== null} />

        {shelfLabel(191, 'SALT SOLUTIONS')}
        {shelfLabel(560, 'METAL STRIPS')}
        {shelfLabel(765, 'SANDPAPER')}
        {shelfLabel(CLOCK.cx, 'LAB CLOCK')}

        {/* --- the rack ---------------------------------------------------- */}
        {SALTS.map((salt, g) => (
          <g key={salt}>
            <circle
              cx={columnX(g) - 46}
              cy={242}
              r={4.5}
              fill={`rgba(${SALT[salt].rgb.join(',')},${Math.max(SALT[salt].a, 0.5)})`}
              stroke="rgba(255,255,255,.5)"
            />
            <text x={columnX(g) - 36} y={246} fontSize={13} fill="#dfe6e4" fontFamily={DIAL_FONT}>
              {SALT[salt].label}
            </text>
          </g>
        ))}

        {METALS.map((m, i) => (
          <g key={m}>
            <rect x={96} y={rowY(i) + 22} width={884} height={11} rx={3} fill={`url(#${gid}-wood)`} />
            <rect x={96} y={rowY(i) + 92} width={884} height={9} rx={3} fill={`url(#${gid}-wood)`} />
            <text x={38} y={rowY(i) + 52} fontSize={15} textAnchor="middle" fill="#dfe6e4" fontFamily={LABEL_FONT} fontWeight={700}>
              {m}
            </text>
            <text x={38} y={rowY(i) + 68} fontSize={8.5} textAnchor="middle" fill={apparatus.benchInkMuted} fontFamily={LABEL_FONT}>
              {METAL[m].name}
            </text>
          </g>
        ))}

        {state.tubes.map((t, index) => {
          const box = tubeBox(index);
          const selected = state.sel === index;
          const key = tubeKey(t.metal, t.salt);
          const done = Boolean(state.rec[key]?.c && state.rec[key]?.d);
          const graded = state.graded?.cells[key];
          return (
            <Hot
              key={key}
              id={HOT.tube(t.metal, t.salt)}
              label={`${t.metal} tube in the ${SALT[t.salt].label} group — ${
                volumeOf(t) ? describe(truthOf(t)).toLowerCase() : 'empty'
              }`}
              pressed={selected}
              pulsing={lit(HOT.tube(t.metal, t.salt))}
              onActivate={() => onTube(index)}
            >
              <rect
                x={box.cx - 34}
                y={rowY(Math.floor(index / SALTS.length)) + 2}
                width={68}
                height={RACK.rowHeight - 6}
                rx={10}
                fill={selected ? 'rgba(143,208,255,.10)' : 'transparent'}
                stroke={selected ? apparatus.hintRing : 'transparent'}
                strokeWidth={selected ? 2 : 0}
              />
              <TubeGlass tube={t} geometry={box} />
              {t.fresh ? (
                <circle cx={box.cx + 24} cy={box.top + 4} r={5} fill={apparatus.glow}>
                  <title>Changed since you last looked</title>
                </circle>
              ) : null}
              {recording && done ? (
                <path
                  d={`M${box.cx - 29} ${box.bottom - 4} l4 5 l7 -9`}
                  fill="none"
                  stroke={graded ? (graded.pts === 2 ? apparatus.live : apparatus.stray) : apparatus.benchInkMuted}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              <rect
                className="focus-ring"
                x={box.cx - 34}
                y={rowY(Math.floor(index / SALTS.length)) + 2}
                width={68}
                height={RACK.rowHeight - 6}
                rx={10}
                fill="none"
                stroke="transparent"
              />
            </Hot>
          );
        })}
      </svg>
    </Box>
  );
}

/**
 * The wall clock: the only thing on this bench that measures the experiment.
 *
 * The hand is a fixed line inside a rotating group rather than a line whose far
 * end is computed, so what carries the angle is a `transform` and `track` can
 * sweep it between the clock's ten steps a second. The angle is NOT taken
 * modulo an hour: 366° and 6° draw the same hand, but winding back through 360
 * would send it round the dial the wrong way once an hour.
 */
function LabClock({ minutes, running }: { minutes: number; running: boolean }): React.ReactElement {
  const angle = minutes * 6;
  const rad = (a: number): number => (a * Math.PI) / 180;
  return (
    <g aria-hidden="true">
      <circle cx={CLOCK.cx} cy={CLOCK.cy} r={CLOCK.r + 4} fill="#0d1211" opacity={0.8} />
      <circle
        cx={CLOCK.cx}
        cy={CLOCK.cy}
        r={CLOCK.r}
        fill="#f3eedf"
        stroke={running ? apparatus.hintRing : '#2b2f33'}
        strokeWidth={5}
      />
      {Array.from({ length: 60 }, (_, k) => {
        const r0 = k % 5 ? CLOCK.r - 8 : CLOCK.r - 13;
        const a = rad(k * 6);
        return (
          <line
            key={k}
            x1={CLOCK.cx + r0 * Math.sin(a)}
            y1={CLOCK.cy - r0 * Math.cos(a)}
            x2={CLOCK.cx + (CLOCK.r - 5) * Math.sin(a)}
            y2={CLOCK.cy - (CLOCK.r - 5) * Math.cos(a)}
            stroke="#1d1d1b"
            strokeWidth={k % 5 ? 0.6 : 1.4}
          />
        );
      })}
      {[0, 15, 30, 45].map((n) => (
        <text
          key={n}
          x={CLOCK.cx + (CLOCK.r - 22) * Math.sin(rad(n * 6))}
          y={CLOCK.cy - (CLOCK.r - 22) * Math.cos(rad(n * 6)) + 4}
          fontSize={10}
          textAnchor="middle"
          fill="#1d1d1b"
          fontFamily={DIAL_FONT}
        >
          {n}
        </text>
      ))}
      <text x={CLOCK.cx} y={CLOCK.cy + 24} fontSize={11} textAnchor="middle" fill="#6b6658" fontFamily={LABEL_FONT} fontWeight={600}>
        {Math.round(minutes)} min
      </text>
      <g
        className={TRACK_CLASS}
        style={{ transform: `rotate(${angle.toFixed(2)}deg)`, transformOrigin: `${CLOCK.cx}px ${CLOCK.cy}px` }}
      >
        <line
          x1={CLOCK.cx}
          y1={CLOCK.cy}
          x2={CLOCK.cx}
          y2={CLOCK.cy - (CLOCK.r - 12)}
          stroke={apparatus.needle}
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      </g>
      <circle cx={CLOCK.cx} cy={CLOCK.cy} r={4} fill={apparatus.pivot} />
    </g>
  );
}
