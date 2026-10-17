'use client';

import * as React from 'react';
import Box from '@mui/material/Box';

import {
  PAPER_DEVELOP_SECONDS,
  SAMPLES,
  SAMPLE_BY_ID,
  volume,
  type SampleId,
} from '@labs/lib/ph-samples/chemistry';
import { LAY_ON_TILE_SECONDS } from '@labs/lib/ph-samples/gestures';
import type { Held, Tube } from '@labs/lib/ph-samples/state';

import { apparatus, LABEL_FONT } from '../apparatus-palette';
import { benchMotionSx, motionSx, pulseAnimation, useBenchMotion } from '../bench-motion';

import { ChartPlate } from './colour-chart';
import { DRY_PAPER, StripArt, TubeArt } from './tube-art';

/**
 * The chemistry bench: six sample bottles, the universal indicator chart, a pH
 * paper booklet, an indicator dropper, a white tile and six test tubes in a
 * rack.
 *
 * One gesture does everything, as at a real bench: pick something up, then tap
 * a tube. A bottle pours 5 mL, the paper dips a fresh strip and lays it on the
 * tile, the dropper adds indicator to the tube itself. With free hands a tap
 * only selects the tube.
 *
 * Every colour drawn here comes from the chemistry — a tube's liquid, a strip's
 * square — so nothing on the bench can disagree with what the readings are
 * marked against.
 */

export const BENCH_WIDTH = 1000;
export const BENCH_HEIGHT = 600;

const BOTTLE_X = [78, 186, 294, 402, 510, 618];
/** Rack positions, left to right. */
export const TUBE_X = [120, 260, 400, 540, 680, 820];
const SLOT_X = [330, 436, 542, 648, 754, 860];
/**
 * The rack's tubes. `TubeArt` draws one at any size from exactly this shape, so
 * the console's close-up is the same drawing with a bigger `w` and `mlPx`.
 */
export const TUBE = { top: 366, bottom: 548, w: 34, mlPx: 13 };

/** Regions of the bench a tour can spotlight, in bench coordinates. */
export const REGION = {
  bottles: [30, 38, 640, 176],
  chart: [652, 44, 328, 176],
  tools: [48, 196, 232, 160],
  tile: [292, 236, 686, 108],
  rack: [50, 354, 900, 246],
} as const;


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

export interface PhBenchProps {
  /** Which sample each rack position is labelled for. */
  layout: readonly SampleId[];
  tubes: readonly Tube[];
  held: Held | null;
  /** The tube in the close-up and in the record step's input. */
  sel: number;
  /** Parts a tour is pointing at: `sample:HCl`, `tool:paper`, `tube:2`. */
  pulse: readonly string[];
  onSvg: (el: SVGSVGElement | null) => void;
  onPickUp: (held: Held) => void;
  onTapTube: (index: number) => void;
  onPutDown: () => void;
}

export function PhBench({
  layout,
  tubes,
  held,
  sel,
  pulse,
  onSvg,
  onPickUp,
  onTapTube,
  onPutDown,
}: PhBenchProps): React.ReactElement {
  const gid = `ph${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const moving = useBenchMotion();
  const holding = (kind: Held['kind'], id?: SampleId): boolean => {
    if (!held || held.kind !== kind) return false;
    return held.kind !== 'bottle' || held.id === id;
  };

  const activate = (el: Element | null): void => {
    if (!el) {
      onPutDown();
      return;
    }
    const sample = el.getAttribute('data-sample') as SampleId | null;
    if (sample) {
      onPickUp({ kind: 'bottle', id: sample });
      return;
    }
    const tool = el.getAttribute('data-tool');
    if (tool === 'paper' || tool === 'ui') {
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
        ...motionSx(moving),
      }}
    >
      <svg
        ref={onSvg}
        viewBox={`0 0 ${BENCH_WIDTH} ${BENCH_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Chemistry bench: six sample bottles, a universal indicator chart, pH paper, an indicator dropper, a white tile and six test tubes"
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
          <linearGradient id={`${gid}tile`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f1eee7" />
            <stop offset="1" stopColor="#d9d4c8" />
          </linearGradient>
          <filter id="ph-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <rect width={BENCH_WIDTH} height={BENCH_HEIGHT} fill={`url(#${gid}lamp)`} />
        <rect y={592} width={BENCH_WIDTH} height={8} fill={apparatus.benchEdge} />

        {/* The six bottles on the shelf, always in syllabus order. */}
        {SAMPLES.map((s, k) => {
          const x = BOTTLE_X[k]!;
          const picked = holding('bottle', s.id);
          return (
            <g
              key={s.id}
              data-hot=""
              data-sample={s.id}
              className={[picked ? 'picked' : '', pulse.includes(`sample:${s.id}`) ? 'pulse' : ''].join(' ').trim()}
              tabIndex={0}
              role="button"
              aria-label={`Bottle of ${s.name}`}
              aria-pressed={picked}
            >
              <g className="lift">
                <rect x={x - 25} y={102} width={54} height={96} rx={9} fill="#000" opacity={0.3} filter="url(#ph-soft)" />
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
                  fill={`rgba(${s.rgb.join(',')},${Math.max(s.a, 0.14) + 0.1})`}
                />
                <rect x={x - 10} y={78} width={20} height={20} rx={3} fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.35)" />
                <path d={`M${x - 8} 80 V58 Q${x} 44 ${x + 8} 58 V80 Z`} fill="#2a2a2c" stroke="#4a4a4e" />
                <rect x={x - 24} y={132} width={48} height={30} rx={3} fill="#f4f1ea" />
                <text
                  x={x}
                  y={146}
                  fontSize={s.label.length > 10 ? 8 : 9.5}
                  textAnchor="middle"
                  fill="#1d1d1b"
                  fontFamily={LABEL_FONT}
                >
                  {s.label}
                </text>
                <text x={x} y={156} fontSize={6.5} textAnchor="middle" fill="#6b6658" fontFamily={LABEL_FONT}>
                  sample {k + 1}
                </text>
                <rect className="focus" x={x - 32} y={40} width={64} height={158} rx={9} fill="none" />
              </g>
            </g>
          );
        })}

        <g transform="translate(662 53)">
          <ChartPlate />
        </g>

        {/* pH paper booklet */}
        <g
          data-hot=""
          data-tool="paper"
          className={[holding('paper') ? 'picked' : '', pulse.includes('tool:paper') ? 'pulse' : ''].join(' ').trim()}
          tabIndex={0}
          role="button"
          aria-label="pH paper booklet"
          aria-pressed={holding('paper')}
        >
          <g className="lift">
            <rect x={63} y={256} width={108} height={76} rx={4} fill="#000" opacity={0.3} filter="url(#ph-soft)" />
            <rect x={60} y={250} width={108} height={76} rx={4} fill="#e8e3d6" stroke="#bdb7a6" />
            <rect x={60} y={250} width={108} height={16} rx={4} fill="#3a4a58" />
            <text
              x={114}
              y={262}
              fontSize={9}
              textAnchor="middle"
              fill="#eef3f7"
              fontFamily={LABEL_FONT}
              fontWeight={700}
              letterSpacing=".6"
            >
              pH PAPER
            </text>
            {[0, 1, 2, 3, 4].map((k) => (
              <rect key={k} x={70 + k * 20} y={274} width={14} height={44} rx={2} fill={DRY_PAPER} stroke="#cfc7b2" />
            ))}
            <rect className="focus" x={54} y={244} width={120} height={88} rx={8} fill="none" />
          </g>
        </g>

        {/* Universal indicator dropper bottle */}
        <g
          data-hot=""
          data-tool="ui"
          className={[holding('ui') ? 'picked' : '', pulse.includes('tool:ui') ? 'pulse' : ''].join(' ').trim()}
          tabIndex={0}
          role="button"
          aria-label="Universal indicator dropper bottle"
          aria-pressed={holding('ui')}
        >
          <g className="lift">
            <rect x={208} y={262} width={52} height={70} rx={8} fill="#000" opacity={0.3} filter="url(#ph-soft)" />
            <rect
              x={205}
              y={256}
              width={52}
              height={70}
              rx={8}
              fill="rgba(255,255,255,.06)"
              stroke="rgba(255,255,255,.4)"
              strokeWidth={1.4}
            />
            <rect x={208} y={276} width={46} height={47} rx={6} fill="#7fa83e" opacity={0.8} />
            <rect x={220} y={240} width={22} height={18} rx={3} fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.35)" />
            <path d="M222 242 V222 Q231 208 240 222 V242 Z" fill="#2a2a2c" stroke="#4a4a4e" />
            <rect x={209} y={288} width={44} height={24} rx={3} fill="#f4f1ea" />
            <text x={231} y={298} fontSize={7} textAnchor="middle" fill="#1d1d1b" fontFamily={LABEL_FONT} fontWeight={700}>
              UNIVERSAL
            </text>
            <text x={231} y={307} fontSize={7} textAnchor="middle" fill="#1d1d1b" fontFamily={LABEL_FONT} fontWeight={700}>
              INDICATOR
            </text>
            <rect className="focus" x={199} y={200} width={64} height={132} rx={8} fill="none" />
          </g>
        </g>

        {/* The white tile: used strips are laid out on it, one slot per tube. */}
        <rect x={303} y={250} width={668} height={86} rx={8} fill="#000" opacity={0.3} filter="url(#ph-soft)" />
        <rect x={300} y={244} width={668} height={86} rx={8} fill={`url(#${gid}tile)`} />
        {tubes.map((t, i) => {
          const x = SLOT_X[i]!;
          return (
            <g key={`strip-${i}`}>
              <rect x={x} y={258} width={62} height={58} rx={4} fill="#fff" opacity={0.45} />
              <text x={x + 31} y={326} fontSize={8.5} textAnchor="middle" fill="#6b6658" fontFamily={LABEL_FONT}>
                {SAMPLE_BY_ID[t.sample].short}
              </text>
              {/*
                The strip arrives on the tile when the HAND gets it there —
                which is part of the way through the dip, not the instant the
                tube was tapped — and its colour then comes up over the second
                or so the dye takes to wet through the paper.
              */}
              <StripArt
                ph={t.strip}
                x={x + 18}
                y={264}
                width={26}
                height={46}
                delay={LAY_ON_TILE_SECONDS}
                develop={PAPER_DEVELOP_SECONDS}
              />
            </g>
          );
        })}

        <Label x={114} y={348} text="pH PAPER" />
        <Label x={231} y={348} text="INDICATOR" />
        <Label x={634} y={348} text="TILE — LAY THE STRIPS HERE" />

        {/* The rack */}
        <rect x={60} y={420} width={880} height={16} rx={3} fill={`url(#${gid}wood)`} />
        <rect x={60} y={552} width={880} height={18} rx={3} fill={`url(#${gid}wood)`} />
        <rect x={60} y={420} width={12} height={150} fill={`url(#${gid}wood)`} />
        <rect x={928} y={420} width={12} height={150} fill={`url(#${gid}wood)`} />

        {tubes.map((t, k) => (
          <g
            key={`tube-${k}`}
            data-hot=""
            data-tube={k}
            className={[sel === k ? 'sel' : '', pulse.includes(`tube:${k}`) ? 'pulse' : ''].join(' ').trim()}
            tabIndex={0}
            role="button"
            aria-label={`Test tube ${k + 1}, for ${SAMPLE_BY_ID[t.sample].name}${
              volume(t) ? `, holding ${volume(t)} mL` : ', empty'
            }`}
          >
            <rect
              className="focus"
              x={(TUBE_X[k] ?? 0) - 24}
              y={TUBE.top - 8}
              width={48}
              height={TUBE.bottom - TUBE.top + 16}
              rx={8}
              fill="rgba(0,0,0,0)"
            />
            <TubeArt
              tube={t}
              geometry={{ ...TUBE, cx: TUBE_X[k] ?? 0 }}
              clipId={`${gid}clip${k}`}
              gestures
            />
          </g>
        ))}

        {layout.map((id, i) => (
          <text
            key={`label-${i}`}
            x={TUBE_X[i]}
            y={588}
            fontSize={11}
            textAnchor="middle"
            fill={apparatus.benchInk}
            fontFamily={LABEL_FONT}
            fontWeight={600}
          >
            {SAMPLE_BY_ID[id].short}
          </text>
        ))}
      </svg>
    </Box>
  );
}
