'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { styled } from '@mui/material/styles';

import { type Liquids, POUR } from '@labs/lib/acetic-acid/chemistry';
import { RACK } from '@labs/lib/acetic-acid/rack';
import type { HeldItem, ToolKind, TubeState } from '@labs/lib/acetic-acid/state';

import { apparatus, LABEL_FONT } from '../apparatus-palette';
import { benchMotionSx, motionSx, pulseAnimation, useBenchMotion } from '../bench-motion';

import {
  BENCH_HEIGHT,
  BENCH_WIDTH,
  BOTTLE_ORDER,
  BOTTLE_X,
  GLASS,
  JAR_X,
  litmusRamp,
  RACK_GEOMETRY,
  TOOLS,
  TUBE_X,
} from './apparatus';
import { TubeGlass } from './tube-view';

/**
 * The chemistry bench: five reagent bottles, a jar of sodium hydrogen
 * carbonate, the tools, a litmus-against-pH card, and a rack of six labelled
 * test tubes.
 *
 * One gesture does everything, as at a real bench: pick something up, then tap
 * a tube. What that means is the engine's business — pour, dip, shake, waft,
 * cork in a delivery tube — so this component never decides what a tool does,
 * only which tube was tapped. Every hot part is also a keyboard button.
 */
export interface AceticBenchProps {
  tubes: readonly TubeState[];
  liquids: Liquids;
  held: HeldItem | null;
  /** The tube the delivery tube is corked into while its far end is chosen. */
  pend: number | null;
  delivery: { from: number; to: number } | null;
  selected: number;
  /** What a tour is pointing at: `bottle:acid`, `tool:waft`, `tube:0`. */
  pulse: readonly string[];
  onSvg: (el: SVGSVGElement | null) => void;
  /** Pick something up, or put it down with `null`. */
  onPick: (item: HeldItem | null) => void;
  /** A tube was tapped. */
  onTube: (index: number) => void;
}


/**
 * A hot part of the bench. It starts the motion it owns and never stops it:
 * stopping is the wrapper's job, in one place, for either of the two reasons a
 * bench holds still.
 */
const Hot = styled('g')({
  cursor: 'pointer',
  outline: 'none',
  '& .lift': { transition: 'transform .25s cubic-bezier(.32,.72,0,1)' },
  '&[data-picked="true"] .lift': { transform: 'translateY(-10px)' },
  '&:focus-visible .focus': { stroke: apparatus.hintRing, strokeWidth: 3 },
  '&:hover .focus': { stroke: 'rgba(143,208,255,.45)', strokeWidth: 2 },
  '&[data-pulse="true"] .focus': { animation: pulseAnimation },
});

export function AceticBench({
  tubes,
  liquids,
  held,
  pend,
  delivery,
  selected,
  pulse,
  onSvg,
  onPick,
  onTube,
}: AceticBenchProps): React.ReactElement {
  const uid = `aa${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const moving = useBenchMotion();
  const on = (run: () => void) => ({
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      run();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      run();
    },
  });

  return (
    // The whole bench's motion is started below and stopped here, in one place,
    // for either of the two reasons a bench holds still.
    <Box
      component="svg"
      sx={{ ...benchMotionSx, ...motionSx(moving) }}
      ref={onSvg}
      viewBox={`0 0 ${BENCH_WIDTH} ${BENCH_HEIGHT}`}
      role="group"
      aria-label="Chemistry bench: bottles of dilute acetic acid, water, lime water, vegetable oil and dilute hydrochloric acid, a jar of solid sodium hydrogen carbonate, litmus and pH paper, a glass rod, two ways to smell, a delivery tube, a burning splinter, and a rack of six test tubes"
      style={{ display: 'block', width: '100%', height: '100%', touchAction: 'manipulation', userSelect: 'none' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && held) onPick(null);
      }}
      fontFamily={LABEL_FONT}
    >
      <defs>
        <radialGradient id={`${uid}-lamp`} cx="45%" cy="38%" r="75%">
          <stop offset="0" stopColor="#2b3533" />
          <stop offset=".6" stopColor={apparatus.bench} />
          <stop offset="1" stopColor="#121817" />
        </radialGradient>
        <linearGradient id={`${uid}-wood`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9a6d3e" />
          <stop offset="1" stopColor="#6c4826" />
        </linearGradient>
        <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* Tapping the bench top puts down whatever is in your hand. */}
      <rect
        width={BENCH_WIDTH}
        height={BENCH_HEIGHT}
        fill={`url(#${uid}-lamp)`}
        onClick={() => held && onPick(null)}
      />
      <rect y={BENCH_HEIGHT - 8} width={BENCH_WIDTH} height={8} fill={apparatus.benchEdge} />

      {/* --- the reagent shelf ------------------------------------------- */}
      {BOTTLE_ORDER.map((id) => {
        const spec = liquids[id];
        const x = BOTTLE_X[id];
        const picked = held?.kind === 'bottle' && held.id === id;
        return (
          <Hot
            key={id}
            role="button"
            tabIndex={0}
            aria-label={spec.name}
            aria-pressed={picked}
            data-picked={picked}
            data-pulse={pulse.includes(`bottle:${id}`)}
            {...on(() => onPick(picked ? null : { kind: 'bottle', id }))}
          >
            <g className="lift">
              <rect x={x - 25} y={102} width={54} height={96} rx={9} fill="#000" opacity={0.3} filter={`url(#${uid}-soft)`} />
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
              <rect
                x={x - 25}
                y={120}
                width={50}
                height={69}
                rx={7}
                fill={`rgba(${spec.rgb.join(',')},${Math.min(0.92, Math.max(spec.a, 0.14) + 0.12)})`}
              />
              <rect x={x - 10} y={78} width={20} height={20} rx={3} fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.35)" />
              <path d={`M${x - 8} 80 V58 Q${x} 44 ${x + 8} 58 V80 Z`} fill="#2a2a2c" stroke="#4a4a4e" />
              <rect x={x - 26} y={132} width={52} height={30} rx={3} fill={GLASS.paper} />
              <text x={x} y={146} fontSize={spec.label.length > 11 ? 7 : 9.5} textAnchor="middle" fill={GLASS.paperInk}>
                {spec.label}
              </text>
              <text x={x} y={156} fontSize={6.5} textAnchor="middle" fill={GLASS.paperSub}>
                {POUR} mL a pour
              </text>
              <rect className="focus" x={x - 32} y={40} width={64} height={158} rx={9} fill="none" stroke="transparent" />
            </g>
          </Hot>
        );
      })}

      <Hot
        role="button"
        tabIndex={0}
        aria-label="Jar of solid sodium hydrogen carbonate"
        aria-pressed={held?.kind === 'jar'}
        data-picked={held?.kind === 'jar'}
        data-pulse={pulse.includes('tool:jar')}
        {...on(() => onPick(held?.kind === 'jar' ? null : { kind: 'jar' }))}
      >
        <g className="lift">
          <rect x={JAR_X - 29} y={112} width={62} height={86} rx={7} fill="#000" opacity={0.3} filter={`url(#${uid}-soft)`} />
          <rect
            x={JAR_X - 32}
            y={106}
            width={62}
            height={86}
            rx={8}
            fill="rgba(255,255,255,.07)"
            stroke="rgba(255,255,255,.4)"
            strokeWidth={1.4}
          />
          <rect x={JAR_X - 29} y={146} width={56} height={43} rx={5} fill="#f2f5f7" opacity={0.9} />
          <rect x={JAR_X - 34} y={92} width={66} height={16} rx={4} fill="#3a4a58" />
          <rect x={JAR_X - 28} y={150} width={54} height={28} rx={3} fill={GLASS.paper} />
          <text x={JAR_X - 1} y={162} fontSize={8.5} textAnchor="middle" fill={GLASS.paperInk}>
            NaHCO₃
          </text>
          <text x={JAR_X - 1} y={172} fontSize={6.5} textAnchor="middle" fill={GLASS.paperSub}>
            solid · one spatula
          </text>
          <rect className="focus" x={JAR_X - 40} y={84} width={80} height={114} rx={9} fill="none" stroke="transparent" />
        </g>
      </Hot>

      <ReferenceCard uid={uid} />

      {/* --- the tools ---------------------------------------------------- */}
      <line x1={60} y1={240} x2={968} y2={240} stroke="rgba(255,255,255,.07)" />
      {TOOLS.map((tool) => {
        const picked = held?.kind === tool.kind;
        return (
          <Hot
            key={tool.kind}
            role="button"
            tabIndex={0}
            aria-label={tool.aria}
            aria-pressed={picked}
            data-picked={picked}
            data-pulse={pulse.includes(`tool:${tool.kind}`)}
            {...on(() => onPick(picked ? null : { kind: tool.kind }))}
          >
            <g className="lift">
              <g transform={`translate(${tool.x},272)`}>
                <ToolIcon kind={tool.kind} uid={uid} />
              </g>
              <rect className="focus" x={tool.x - 52} y={248} width={104} height={82} rx={9} fill="rgba(0,0,0,0)" stroke="transparent" />
            </g>
          </Hot>
        );
      })}
      {TOOLS.map((tool) => (
        <text
          key={tool.kind}
          x={tool.x}
          y={336}
          fontSize={9}
          textAnchor="middle"
          fill={apparatus.benchLabel}
          fontWeight={600}
          letterSpacing={1.1}
        >
          {tool.label}
        </text>
      ))}

      {/* --- the rack ----------------------------------------------------- */}
      <rect x={60} y={420} width={880} height={16} rx={3} fill={`url(#${uid}-wood)`} />
      <rect x={60} y={552} width={880} height={18} rx={3} fill={`url(#${uid}-wood)`} />
      <rect x={60} y={420} width={12} height={150} fill={`url(#${uid}-wood)`} />
      <rect x={928} y={420} width={12} height={150} fill={`url(#${uid}-wood)`} />

      {tubes.map((tube, k) => (
        <Hot
          key={k}
          role="button"
          tabIndex={0}
          aria-label={`Test tube ${k + 1}, ${RACK[k]!.label.slice(4)}`}
          data-pulse={pulse.includes(`tube:${k}`)}
          {...on(() => onTube(k))}
        >
          <rect
            className="focus"
            x={TUBE_X[k]! - 26}
            y={RACK_GEOMETRY.top - 10}
            width={52}
            height={RACK_GEOMETRY.bottom - RACK_GEOMETRY.top + 20}
            rx={8}
            fill="rgba(0,0,0,0)"
            stroke={selected === k ? 'rgba(143,208,255,.7)' : pend === k ? apparatus.hintRing : 'transparent'}
            strokeWidth={selected === k ? 2 : 2.5}
          />
          <TubeGlass
            tube={tube}
            liquids={liquids}
            cx={TUBE_X[k]!}
            top={RACK_GEOMETRY.top}
            bottom={RACK_GEOMETRY.bottom}
            width={RACK_GEOMETRY.width}
            mlPx={RACK_GEOMETRY.mlPx}
            uid={`${uid}-t${k}`}
          />
        </Hot>
      ))}

      {delivery ? <DeliveryTube from={TUBE_X[delivery.from]!} to={TUBE_X[delivery.to]!} /> : null}

      {RACK.map((slot, k) => (
        <text key={slot.n} x={TUBE_X[k]} y={588} fontSize={11} textAnchor="middle" fill={apparatus.benchInk} fontWeight={600}>
          {slot.label}
        </text>
      ))}
    </Box>
  );
}

/** Routed through the clear band between the tool labels and the mouths of the tubes. */
function DeliveryTube({ from, to }: { from: number; to: number }): React.ReactElement {
  const cork = RACK_GEOMETRY.top - 14;
  const path = `M${from} ${cork} V350 H${to} V${RACK_GEOMETRY.bottom - 24}`;
  return (
    <g aria-hidden="true">
      <rect x={from - 15} y={cork} width={30} height={12} rx={3} fill={GLASS.cork} stroke={GLASS.corkEdge} />
      <path d={path} fill="none" stroke="rgba(255,255,255,.62)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
      <path d={path} fill="none" stroke="#fff" strokeWidth={1.5} opacity={0.55} strokeLinejoin="round" />
    </g>
  );
}

/** Litmus against pH, and the two tests for carbon dioxide. A real reference. */
function ReferenceCard({ uid }: { uid: string }): React.ReactElement {
  return (
    <g aria-hidden="true">
      <rect x={665} y={59} width={306} height={176} rx={10} fill="#000" opacity={0.3} filter={`url(#${uid}-soft)`} />
      <rect x={662} y={53} width={306} height={176} rx={10} fill={GLASS.paper} stroke="#c9c3b4" />
      <text x={815} y={74} fontSize={11} textAnchor="middle" fill={GLASS.paperInk} fontWeight={700} letterSpacing={1.2}>
        LITMUS AGAINST pH
      </text>
      {Array.from({ length: 15 }, (_, i) => (
        <React.Fragment key={i}>
          <rect x={678 + i * 18.3} y={88} width={17.6} height={26} rx={2} fill={litmusRamp(i)} />
          {i % 2 === 0 ? (
            <text x={678 + i * 18.3 + 8.8} y={126} fontSize={8.5} textAnchor="middle" fill={GLASS.paperSub}>
              {i}
            </text>
          ) : null}
        </React.Fragment>
      ))}
      <text x={678} y={146} fontSize={9.5} fill={GLASS.paperInk}>
        Blue litmus →{' '}
        <tspan fill="#c4382f" fontWeight={700}>
          red
        </tspan>{' '}
        below about pH 5
      </text>
      <text x={678} y={162} fontSize={9.5} fill={GLASS.paperInk}>
        Red litmus →{' '}
        <tspan fill="#2f5fc0" fontWeight={700}>
          blue
        </tspan>{' '}
        above about pH 8
      </text>
      <text x={678} y={178} fontSize={9.5} fill={GLASS.paperInk}>
        Litmus is purple in between — neutral
      </text>
      <line x1={678} y1={188} x2={952} y2={188} stroke="#d6d0c0" />
      <text x={678} y={203} fontSize={9.5} fill={GLASS.paperInk}>
        CO₂ turns lime water <tspan fontWeight={700}>milky</tspan>
      </text>
      <text x={678} y={219} fontSize={9.5} fill={GLASS.paperInk}>
        …and <tspan fontWeight={700}>puts out</tspan> a burning splinter
      </text>
    </g>
  );
}

/** Each tool as it lies on the bench. Drawn, not iconography: a student should recognise them. */
function ToolIcon({ kind, uid }: { kind: ToolKind; uid: string }): React.ReactElement {
  if (kind === 'blue' || kind === 'red' || kind === 'ph') {
    const strips =
      kind === 'ph'
        ? ['#e8442a', '#f7ab2f', '#55bb4a', '#2a67bb']
        : Array.from({ length: 4 }, () => (kind === 'blue' ? '#2f5fc0' : '#c4382f'));
    return (
      <>
        <rect x={-38} y={-2} width={76} height={60} rx={4} fill="#000" opacity={0.3} filter={`url(#${uid}-soft)`} />
        <rect x={-40} y={-8} width={76} height={60} rx={4} fill="#e8e3d6" stroke="#bdb7a6" />
        <rect x={-40} y={-8} width={76} height={14} rx={4} fill="#3a4a58" />
        <text x={-2} y={3} fontSize={8} textAnchor="middle" fill="#eef3f7" fontWeight={700}>
          {kind === 'blue' ? 'BLUE' : kind === 'red' ? 'RED' : 'pH'}
        </text>
        {strips.map((fill, i) => (
          <rect key={i} x={-34 + i * 17} y={12} width={12} height={34} rx={2} fill={fill} />
        ))}
      </>
    );
  }
  if (kind === 'rod') {
    return (
      <>
        <line x1={-22} y1={48} x2={20} y2={-4} stroke="rgba(255,255,255,.75)" strokeWidth={6} strokeLinecap="round" />
        <line x1={-20} y1={44} x2={18} y2={-2} stroke="#fff" strokeWidth={1.6} opacity={0.7} strokeLinecap="round" />
        <circle cx={22} cy={-6} r={4.5} fill="rgba(255,255,255,.6)" />
      </>
    );
  }
  if (kind === 'waft') {
    return (
      <>
        <path
          d="M-26 46 q-6 -16 2 -24 q4 -4 7 1 l4 7 v-22 a5 5 0 0 1 10 0 v16 v-20 a5 5 0 0 1 10 0 v20 v-14 a5 5 0 0 1 10 0 v34 q0 12 -12 14 z"
          fill="#e8cdb0"
          opacity={0.95}
        />
        <path
          d="M22 4 q10 -8 0 -16 M22 20 q14 -10 0 -20 M22 -12 q8 -6 0 -12"
          fill="none"
          stroke={GLASS.gas}
          strokeWidth={2.2}
          strokeLinecap="round"
          opacity={0.85}
        />
      </>
    );
  }
  if (kind === 'sniff') {
    return (
      <>
        <path d="M-16 -6 q10 -14 22 -6 q10 7 6 18 q-2 7 4 9 l-8 4 q1 8 -6 10 q-8 3 -16 -1" fill="#e8cdb0" opacity={0.95} />
        <path d="M-4 20 q6 3 10 0" fill="none" stroke="#b08a6a" strokeWidth={1.6} strokeLinecap="round" />
        <path d="M34 34 L6 16" fill="none" stroke="#ff8b84" strokeWidth={2.6} strokeLinecap="round" />
        <path d="M12 14 l-8 1 l4 7 z" fill="#ff8b84" />
        <circle cx={24} cy={-16} r={11} fill="none" stroke={apparatus.stray} strokeWidth={2.4} />
        <line x1={17} y1={-23} x2={31} y2={-9} stroke={apparatus.stray} strokeWidth={2.4} />
      </>
    );
  }
  if (kind === 'pipe') {
    return (
      <>
        <rect x={-14} y={-12} width={22} height={13} rx={3} fill={GLASS.cork} stroke={GLASS.corkEdge} />
        <path
          d="M-3 -2 v10 q0 8 10 10 h18 q10 2 10 12 v20"
          fill="none"
          stroke="rgba(255,255,255,.72)"
          strokeWidth={5}
          strokeLinecap="round"
        />
        <path
          d="M-3 -2 v10 q0 8 10 10 h18 q10 2 10 12 v20"
          fill="none"
          stroke="rgba(255,255,255,.95)"
          strokeWidth={1.4}
          strokeLinecap="round"
          opacity={0.6}
        />
      </>
    );
  }
  if (kind === 'jar') {
    return <rect x={-18} y={-6} width={36} height={52} rx={5} fill="#f2f5f7" opacity={0.85} />;
  }
  return (
    <>
      <rect x={-4} y={0} width={8} height={50} rx={2} fill="#b98a52" />
      <rect x={-4} y={0} width={3} height={50} fill="#cfa46b" />
      <path d="M0 -22 q11 12 0 22 q-11 -10 0 -22" fill="#ffb93b" />
      <path d="M0 -13 q6 7 0 13 q-6 -6 0 -13" fill="#fff1b8" />
    </>
  );
}
