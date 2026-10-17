import * as React from 'react';

import { BOARDS, P, TAP_LETTER, boardY, tapX, type ResistorId } from '@labs/lib/series-parallel/apparatus';
import type { LabMethod } from '@labs/lib/series-parallel/method';

import { DialFace, DialNeedle } from '../analog-dial';
import { apparatus, DIAL_FONT, LABEL_FONT } from '../apparatus-palette';

/**
 * The static apparatus of the series/parallel bench, on its 1000 × 600 canvas.
 *
 * The same bench as the Ohm's law practical with a SECOND resistor board on it:
 * two meters, R₁ and R₂ stacked where the single nichrome board sat, the cell
 * holder, the plug key's body, the piece of sand paper and — under the rheostat
 * method only — the rheostat. Drawn once; the parts that move (plug, slider,
 * needles, coil glow, wires, terminals) are layered on top by `bench.tsx`.
 *
 * WHAT IS ON THE BENCH FOLLOWS THE METHOD. Under the manual's own method the
 * holder is tapped between every cell and there is no rheostat at all; under
 * the alternative the holder is wired as one battery and the rheostat appears.
 *
 * Two boards rather than one is the whole difference, and it is what makes the
 * practical possible: the student can wire either resistor alone, or join them
 * end to end, or side by side, with the same wires.
 *
 * `gid` prefixes every gradient and filter id, so two benches on one page
 * cannot fight over `url(#brass)`.
 */
export const BenchDefs = React.memo(function BenchDefs({ gid }: { gid: string }): React.ReactElement {
  return (
    <defs>
      <radialGradient id={`${gid}lamp`} cx="45%" cy="38%" r="75%">
        <stop offset="0" stopColor="#2b3533" />
        <stop offset=".6" stopColor={apparatus.bench} />
        <stop offset="1" stopColor="#121817" />
      </radialGradient>
      <linearGradient id={`${gid}bakelite`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={apparatus.bakeliteTop} />
        <stop offset="1" stopColor={apparatus.bakeliteBottom} />
      </linearGradient>
      <linearGradient id={`${gid}brass`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ecd087" />
        <stop offset=".5" stopColor="#c49a3e" />
        <stop offset="1" stopColor="#8a6a26" />
      </linearGradient>
      <linearGradient id={`${gid}wood`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#9a6d3e" />
        <stop offset="1" stopColor="#6c4826" />
      </linearGradient>
      <linearGradient id={`${gid}cell`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3d4f8f" />
        <stop offset=".45" stopColor="#22306a" />
        <stop offset="1" stopColor="#121a3e" />
      </linearGradient>
      <linearGradient id={`${gid}ceramic`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f0ebdf" />
        <stop offset=".55" stopColor="#cfc6b3" />
        <stop offset="1" stopColor="#9f9684" />
      </linearGradient>
      <linearGradient id={`${gid}steel`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e4e8ea" />
        <stop offset="1" stopColor="#7d868b" />
      </linearGradient>
      <filter id={`${gid}soft`} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="6" />
      </filter>
      <filter id={`${gid}glow`} x="-10%" y="-200%" width="120%" height="500%">
        <feGaussianBlur stdDeviation="3" />
      </filter>
      <pattern id={`${gid}grit`} width="7" height="7" patternUnits="userSpaceOnUse">
        <rect width="7" height="7" fill="#b3895a" />
        <circle cx="1.6" cy="2.2" r=".9" fill="#79582f" />
        <circle cx="5.1" cy="4.9" r=".8" fill="#8e6b3c" />
        <circle cx="3.4" cy="6.2" r=".6" fill="#6d4f2a" />
      </pattern>
    </defs>
  );
});

/** A zig-zag coil between two x positions. */
export function coilPath(x0: number, x1: number, y: number, amp: number, step: number): string {
  let d = `M${x0} ${y}`;
  for (let x = x0, k = 0; x < x1; x += step, k += 1) {
    d += ` L${x + step / 2} ${y + (k % 2 ? amp : -amp)} L${x + step} ${y}`;
  }
  return d;
}

/** One coil path per board, so the bench can glow each independently. */
export const COILS = Object.fromEntries(
  BOARDS.map((b) => [b.id, coilPath(520, 818, boardY(b), Math.min(8, b.h / 2 - 10), 6)]),
) as Record<ResistorId, string>;

/**
 * Dash periods a second per metre a second of drift.
 *
 * The electrons in the coils move at well under a millimetre a second — that is
 * the point of the number, and it is why neither board could be drawn at its
 * true speed. So the drawing keeps the RATIO between the two, which is the
 * whole of what this practical is about, and stretches the scale so that the
 * busiest branch this bench can reach — the parallel combination on three cells,
 * a little over 2 A in the smaller resistor — still reads as separate dashes
 * rather than a blur, and a quiet 0.3 A branch still plainly moves.
 */
export const DRIFT_SCALE = 2700;

function Label({ x, y, children }: { x: number; y: number; children: string }): React.ReactElement {
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
      {children}
    </text>
  );
}

function Meter({
  gid,
  kind,
  x,
  y,
  needleRef,
}: {
  gid: string;
  kind: 'am' | 'vm';
  x: number;
  y: number;
  needleRef: (el: SVGGElement | null) => void;
}): React.ReactElement {
  const label = kind === 'am' ? 'AMMETER' : 'VOLTMETER';
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={3} y={8} width={200} height={200} rx={14} fill="#000" opacity={0.35} filter={`url(#${gid}soft)`} />
      <rect width={200} height={200} rx={14} fill={`url(#${gid}bakelite)`} stroke="#2c3034" />
      <g
        className="hot"
        data-lens={kind}
        tabIndex={0}
        role="button"
        aria-label={`Close-up of the ${label.toLowerCase()} dial`}
      >
        {/* Range and divisions both come from `P`, so the face a student counts
            and the least count the bench marks against cannot disagree. */}
        <DialFace
          fullScale={kind === 'am' ? P.amFS : P.vmFS}
          divs={kind === 'am' ? P.amDivs : P.vmDivs}
          letter={kind === 'am' ? 'A' : 'V'}
        />
        <DialNeedle needleRef={needleRef} />
      </g>
      <text
        x={100}
        y={146}
        fontSize={10}
        textAnchor="middle"
        fill="#9aa4a8"
        fontFamily={LABEL_FONT}
        fontWeight={600}
        letterSpacing={2}
      >
        {label}
      </text>
      <circle cx={100} cy={160} r={4} fill="#3a3f44" stroke="#5b6166" />
      <line x1={97.5} y1={160} x2={102.5} y2={160} stroke="#1a1d20" strokeWidth={1.2} />
      <text x={60} y={172} fontSize={12} textAnchor="middle" fill="#e05a50" fontWeight={700} fontFamily={LABEL_FONT}>
        +
      </text>
      <text x={140} y={172} fontSize={12} textAnchor="middle" fill="#c9d2cf" fontWeight={700} fontFamily={LABEL_FONT}>
        −
      </text>
    </g>
  );
}

/**
 * THE CELL HOLDER. A stud at the − end (the manual's point A) and, under the
 * cells method, one more after every cell — B, C, D — so the student puts one,
 * two or three cells in the circuit by moving a single lead. Under the rheostat
 * method the holder is wired as one battery and only its two ends show.
 */
function CellHolder({ gid, method }: { gid: string; method: LabMethod }): React.ReactElement {
  const taps = method === 'cells';
  const n = P.cells;
  const x1 = tapX(n);
  const width = x1 - tapX(0) + 24;
  const studs = taps ? Array.from({ length: n + 1 }, (_, k) => k) : [0, n];

  return (
    <g>
      <rect
        x={tapX(0) - 9}
        y={476}
        width={width}
        height={60}
        rx={8}
        fill="#000"
        opacity={0.35}
        filter={`url(#${gid}soft)`}
      />
      <rect x={tapX(0) - 12} y={470} width={width} height={60} rx={8} fill="#2a2d31" stroke="#3a3e43" />
      {Array.from({ length: n }, (_, i) => {
        const x = tapX(i) + 4;
        return (
          <g key={i}>
            <rect x={x} y={479} width={48} height={42} rx={5} fill={`url(#${gid}cell)`} />
            <rect x={x + 12} y={479} width={7} height={42} fill="#d4ad4c" opacity={0.85} />
            <rect x={x + 48} y={493} width={4} height={14} rx={1.5} fill={`url(#${gid}steel)`} />
            <text x={x + 30} y={504} fontSize={9} textAnchor="middle" fill="#e6e9f5" fontFamily={LABEL_FONT} fontWeight={700}>
              1.5V
            </text>
          </g>
        );
      })}
      {studs.map((k) => (
        <rect key={`s${k}`} x={tapX(k) - 4} y={458} width={8} height={14} fill={`url(#${gid}brass)`} />
      ))}
      {taps
        ? studs.map((k) => (
            <text
              key={`l${k}`}
              x={tapX(k)}
              y={547}
              fontSize={10}
              textAnchor="middle"
              fill="#9aa4a8"
              fontFamily={LABEL_FONT}
              fontWeight={700}
            >
              {TAP_LETTER[k]}
            </text>
          ))
        : null}
      <Label x={(tapX(0) + x1) / 2} y={taps ? 566 : 556}>
        {taps ? `CELL HOLDER · ${n} × 1.5 V · TAPS A–${TAP_LETTER[n]}` : `BATTERY · ${n} × 1.5 V`}
      </Label>
    </g>
  );
}

/**
 * THE PIECE OF SAND PAPER the manual asks for in step 2, with three connecting
 * wire ends lying on it. Tapping it cleans them; the ends go from dull oxide
 * grey to bright copper, which is the whole of the feedback. It matters more
 * here than anywhere: this practical rewires four times, and a film at one
 * joint falls inside whichever combination is under test at the time.
 */
export function SandPaper({ gid, sanded }: { gid: string; sanded: boolean }): React.ReactElement {
  return (
    <g>
      <g
        data-sand=""
        className="hot"
        tabIndex={0}
        role="button"
        aria-pressed={sanded}
        aria-label={
          sanded
            ? 'Sand paper — the connecting wire ends are already cleaned'
            : 'Sand paper — clean the ends of the connecting wires'
        }
      >
        <rect x={62} y={322} width={118} height={58} rx={5} fill="#000" opacity={0.28} filter={`url(#${gid}soft)`} />
        <rect x={60} y={318} width={118} height={58} rx={5} fill="#6f5232" stroke="#8a6a41" />
        <rect x={68} y={325} width={102} height={44} rx={2.5} fill={`url(#${gid}grit)`} />
        {[0, 1, 2].map((i) => {
          const y = 336 + i * 13;
          return (
            <g key={i}>
              <path
                d={`M75 ${y} q20 -5 36 0 q15 5 32 -1`}
                fill="none"
                stroke="#1d6b4f"
                strokeWidth={3.2}
                strokeLinecap="round"
                opacity={0.92}
              />
              <rect x={136} y={y - 5} width={15} height={4} rx={1.5} fill={sanded ? '#e6a642' : '#6e695d'} />
            </g>
          );
        })}
        {sanded ? (
          <path
            d="M156 327 l4.5 5 9 -11"
            fill="none"
            stroke="#3ddc84"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </g>
      <Label x={119} y={392}>
        {sanded ? 'ENDS CLEANED' : 'SAND PAPER'}
      </Label>
    </g>
  );
}

/**
 * Everything that never moves, plus the two needles (animated imperatively,
 * so passing their refs does not make this re-render).
 */
export const BenchApparatus = React.memo(function BenchApparatus({
  gid,
  method,
  needles,
}: {
  gid: string;
  method: LabMethod;
  needles: Readonly<Record<'am' | 'vm', (el: SVGGElement | null) => void>>;
}): React.ReactElement {
  const rheostatWinding: React.ReactElement[] = [];
  for (let x = 607; x <= 893; x += 3.2) {
    rheostatWinding.push(
      <line
        key={x.toFixed(1)}
        x1={x.toFixed(1)}
        y1={487}
        x2={(x + 1.4).toFixed(1)}
        y2={525}
        stroke="#8d6b3b"
        strokeWidth={1.1}
        opacity={0.9}
      />,
    );
  }

  return (
    <>
      <rect width={1000} height={600} fill={`url(#${gid}lamp)`} />
      <rect y={592} width={1000} height={8} fill={apparatus.benchEdge} />

      <Meter gid={gid} kind="am" x={150} y={32} needleRef={needles.am} />
      <Meter gid={gid} kind="vm" x={570} y={32} needleRef={needles.vm} />

      {/* R₁ and R₂ on their own wooden boards. Coil glow is layered by the bench. */}
      {BOARDS.map((b) => {
        const yc = boardY(b);
        return (
          <g key={b.id}>
            <rect
              x={483}
              y={b.y + 6}
              width={380}
              height={b.h}
              rx={6}
              fill="#000"
              opacity={0.35}
              filter={`url(#${gid}soft)`}
            />
            <rect x={480} y={b.y} width={380} height={b.h} rx={6} fill={`url(#${gid}wood)`} />
            <rect x={492} y={yc - 11} width={26} height={22} rx={3} fill={`url(#${gid}brass)`} />
            <rect x={822} y={yc - 11} width={26} height={22} rx={3} fill={`url(#${gid}brass)`} />
            <path d={COILS[b.id]} fill="none" stroke="#c9c7bd" strokeWidth={1.6} strokeLinejoin="round" />
            <text
              x={530}
              y={b.y + 14}
              fontSize={11}
              fill="#f2dcb8"
              opacity={0.85}
              fontFamily={DIAL_FONT}
              fontStyle="italic"
            >
              {b.tag}
            </text>
          </g>
        );
      })}

      <CellHolder gid={gid} method={method} />

      {/* Plug key body; the plug itself is layered by the bench. */}
      <rect x={341} y={464} width={164} height={62} rx={6} fill="#000" opacity={0.35} filter={`url(#${gid}soft)`} />
      <rect x={338} y={458} width={164} height={62} rx={6} fill="#2b2622" stroke="#3d3630" />
      <rect x={350} y={466} width={56} height={34} rx={3} fill={`url(#${gid}brass)`} />
      <rect x={434} y={466} width={56} height={34} rx={3} fill={`url(#${gid}brass)`} />
      <Label x={420} y={544}>
        PLUG KEY  K
      </Label>

      {/* Rheostat; the slider is layered by the bench. Only the alternative
          method has one — under the manual's own method it is not on the bench. */}
      {method === 'rheostat' ? (
        <>
          <rect x={578} y={446} width={350} height={120} rx={6} fill="#000" opacity={0.3} filter={`url(#${gid}soft)`} />
          <rect x={575} y={440} width={26} height={122} rx={4} fill="#2d3237" />
          <rect x={899} y={440} width={26} height={122} rx={4} fill="#2d3237" />
          <rect x={601} y={486} width={298} height={40} rx={20} fill={`url(#${gid}ceramic)`} />
          {rheostatWinding}
          <rect x={588} y={449} width={324} height={7} rx={3.5} fill={`url(#${gid}steel)`} />
          <text x={603} y={572} fontSize={10} fill="#9aa4a8" fontFamily={LABEL_FONT} fontWeight={700}>
            A
          </text>
          <text x={897} y={572} fontSize={10} textAnchor="end" fill="#9aa4a8" fontFamily={LABEL_FONT} fontWeight={700}>
            B
          </text>
          <text x={605} y={444} fontSize={10} fill="#9aa4a8" fontFamily={LABEL_FONT} fontWeight={700}>
            C
          </text>
          <Label x={750} y={585}>
            {`RHEOSTAT · 0–${P.rRh} Ω`}
          </Label>
        </>
      ) : null}
    </>
  );
});
