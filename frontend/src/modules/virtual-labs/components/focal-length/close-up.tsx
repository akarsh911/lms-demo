'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

import { EmergeChip, Segmented } from '@/components/ui';
import {
  OPT,
  cm1,
  cm2,
  type Optics,
  type ScreenView,
  type Setup,
  type StandId,
} from '@labs/lib/focal-length/optics';
import { clamp } from '@labs/lib/numbers';

import { apparatus, LABEL_FONT } from '../apparatus-palette';

import { Scene } from './scene';

/**
 * The two things a drawing of a whole bench makes impossible: judging how sharp
 * the image is, and reading a metre scale to a millimetre.
 *
 * On the bench the card is eight pixels wide and the scale is printed at 8.8 px
 * per centimetre, so one millimetre is under a pixel. Both are honest — that is
 * what the apparatus looks like from where a student stands — and both are
 * useless for the two measurements the practical is made of. So the close-up is
 * docked beside the boxes the readings are typed into: the screen magnified
 * fifty-five times, and a magnifier sitting over the scale under whichever
 * stand is selected, with its red index mark.
 *
 * It is the same live optics as the bench, not a hint: the blur here IS the
 * blur being marked, and the scale here IS where the stand ended up.
 */

/**
 * Close-up magnification of the screen: pixels per centimetre of card. Chosen
 * so the TALLEST image this bench can form — a lens of f = 30 cm makes the 8 m
 * tree about 2.0 cm high — still fits the frame with room for its blur.
 */
const SCREEN_PX = 48;
/** The magnifier shows four centimetres of the scale, at 90 px each. */
const SCALE_PX = 90;
const SCALE_SPAN = 4;

export function BenchCloseUp({
  sel,
  onSelect,
  componentLabel,
  setup,
  optics,
  view,
  comp,
  scr,
  maxWidth,
}: {
  sel: StandId;
  onSelect: (stand: StandId) => void;
  /** What the optic in the stand is called right now. */
  componentLabel: string;
  setup: Setup;
  optics: Optics;
  view: ScreenView;
  comp: number;
  scr: number;
  maxWidth: number;
}): React.ReactElement {
  const theme = useTheme();
  const gid = `c${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const at = sel === 'comp' ? comp : scr;
  const standWord = sel === 'comp' ? componentLabel.toLowerCase() : 'screen';

  // Exactly one line, always: the console's height is spent on the drawings,
  // and a verdict that wraps to two rows on a short screen pushes the notebook
  // tabs below the fold.
  const verdict = !view.lit ? (
    <EmergeChip
      tone="red"
      label={
        view.why === 'side'
          ? setup.part === 'mirror'
            ? 'Card behind the mirror'
            : 'Card in front of the lens'
          : 'No real image'
      }
    />
  ) : view.sharp ? (
    <EmergeChip tone="green" label="Sharp" />
  ) : view.blur <= OPT.okBlur ? (
    <EmergeChip tone="amber" label={`Nearly sharp — ${cm1(view.blur * 10)} mm`} />
  ) : (
    <EmergeChip tone="red" label={`Blurred — ${cm1(view.blur * 10)} mm`} />
  );

  return (
    <Box data-tour="fl-closeup" sx={{ maxWidth, mx: 'auto' }}>
      <Segmented
        ariaLabel="Stand to look at"
        value={sel}
        onChange={onSelect}
        options={[
          { value: 'comp', label: componentLabel },
          { value: 'scr', label: 'Screen' },
        ]}
      />

      {/* The card, magnified */}
      <Box sx={{ mt: 1, borderRadius: `${theme.band.radius.md}px`, backgroundColor: apparatus.bench, p: 0.75 }}>
        <svg
          viewBox="0 0 360 108"
          role="img"
          aria-label={
            view.lit
              ? view.sharp
                ? `The screen, magnified: a sharp inverted image ${cm1(optics.h)} centimetre tall`
                : `The screen, magnified: a blur circle ${cm1(view.blur * 10)} millimetre across`
              : 'The screen, magnified: nothing falls on the card'
          }
          style={{ display: 'block', width: '100%', height: 'auto' }}
        >
          <defs>
            <linearGradient id={`${gid}card`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fbfaf5" />
              <stop offset="1" stopColor="#eceadf" />
            </linearGradient>
            {view.lit ? (
              <filter id={`${gid}blur`} x="-200%" y="-200%" width="500%" height="500%">
                <feGaussianBlur stdDeviation={Math.max(0, (view.blur * SCREEN_PX) / 4).toFixed(3)} />
              </filter>
            ) : null}
          </defs>
          <rect width={360} height={108} rx={4} fill={`url(#${gid}card)`} />
          {view.lit ? (
            <>
              <g opacity={clamp(view.bright, 0.1, 1).toFixed(3)} filter={`url(#${gid}blur)`}>
                <g transform={`translate(180,54) scale(${(-optics.k * SCREEN_PX).toFixed(5)})`}>
                  <Scene objId={setup.objId} />
                </g>
              </g>
              <line x1={0} y1={54} x2={14} y2={54} stroke="#c0392b" strokeWidth={1} />
              <line x1={346} y1={54} x2={360} y2={54} stroke="#c0392b" strokeWidth={1} />
              <text x={18} y={51} fontSize={9} fill="#a3705f" fontFamily={LABEL_FONT}>
                principal axis
              </text>
              <BlurCircle view={view} />
              {/* One millimetre of card, drawn to the same magnification: what
                  makes the ring beside it a measurement rather than a picture. */}
              <line x1={14} y1={100} x2={14 + SCREEN_PX / 10} y2={100} stroke="#6b6450" strokeWidth={2} />
              <text x={18 + SCREEN_PX / 10} y={103} fontSize={9} fill="#6b6450" fontFamily={LABEL_FONT}>
                1 mm on the card
              </text>
              {/* Printed on the card, so the verdict beside it stays one line. */}
              <text x={352} y={102} fontSize={9} textAnchor="end" fill="#8b8578" fontFamily={LABEL_FONT}>
                {`image ${cm1(optics.h)} cm tall, inverted`}
              </text>
            </>
          ) : (
            <text x={180} y={58} fontSize={12} textAnchor="middle" fill="#8b8578" fontFamily={LABEL_FONT}>
              nothing falls on the card
            </text>
          )}
        </svg>
      </Box>

      <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'nowrap', minWidth: 0 }}>
        {verdict}
      </Box>

      {/* The magnifier over the metre scale */}
      <Box
        data-tour="fl-scale"
        sx={{ mt: 1, borderRadius: `${theme.band.radius.md}px`, backgroundColor: apparatus.bench, p: 0.75 }}
      >
        <svg
          viewBox="0 0 360 70"
          role="img"
          aria-label={`Magnifier over the metre scale under the ${standWord} stand, index mark at ${cm2(
            at,
          )} centimetre`}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        >
          <defs>
            <linearGradient id={`${gid}ruler`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f6f1e0" />
              <stop offset="1" stopColor="#e6dcc1" />
            </linearGradient>
          </defs>
          <rect width={360} height={70} rx={3} fill={`url(#${gid}ruler)`} />
          <ScaleWindow left={at - SCALE_SPAN / 2} />
          <line x1={180} y1={0} x2={180} y2={70} stroke="#e2453f" strokeWidth={2} />
          <path d="M180 70 l-6 -10 h12 Z" fill="#e2453f" />
          <text x={186} y={66} fontSize={10} fill="#8a3b36" fontFamily={LABEL_FONT} fontWeight={600}>
            index mark
          </text>
          {/* Printed on the ruler rather than captioned under it: one line saved
              in a column where every line is spent on something to look at. */}
          <text x={6} y={66} fontSize={9.5} fill="#6b6450" fontFamily={LABEL_FONT} fontWeight={600}>
            {`under the ${standWord} · 1 div = 1 mm`}
          </text>
        </svg>
      </Box>
    </Box>
  );
}

/**
 * THE BLUR CIRCLE ITSELF, drawn over the patch: the cone of light cut across
 * where the card stands.
 *
 * The gaussian on the picture behind it is what the blur LOOKS like; this is
 * what it MEASURES. One point of the tree spreads into a disc this wide, the
 * whole picture is thousands of those discs overlapping, and four marks of
 * every trial are the student's judgement of when it is small enough. So it is
 * drawn as a ring with its width written beside it and no verdict attached —
 * at the focal plane it shuts to a dot, and that is the thing to be watched
 * for. The floor of 2.2 px keeps a perfectly focused image a visible dot.
 */
function BlurCircle({ view }: { view: Extract<ScreenView, { lit: true }> }): React.ReactElement {
  const r = Math.max(2.2, (view.blur * SCREEN_PX) / 2);
  return (
    <g pointerEvents="none">
      <circle cx={180} cy={54} r={r.toFixed(2)} fill="none" stroke="#c0392b" strokeWidth={1.2} strokeDasharray="4 3" opacity={0.85} />
      {[-1, 1].map((s) => (
        <line
          key={s}
          x1={(180 + s * r).toFixed(2)}
          y1={17}
          x2={(180 + s * r).toFixed(2)}
          y2={Math.max(17, 54 - r - 3).toFixed(2)}
          stroke="#c0392b"
          strokeWidth={0.7}
          opacity={0.5}
        />
      ))}
      <text
        x={180}
        y={13}
        fontSize={10}
        textAnchor="middle"
        fontWeight={600}
        fill={view.sharp ? '#1f7a44' : '#a3372b'}
        fontFamily={LABEL_FONT}
      >
        {view.sharp ? `blur circle under ${cm1(OPT.sharp * 10)} mm — sharp` : `blur circle ${cm1(view.blur * 10)} mm`}
      </text>
    </g>
  );
}

/** Four centimetres of the scale, in millimetres, starting at `left`. */
function ScaleWindow({ left }: { left: number }): React.ReactElement {
  const first = Math.ceil(left * 10);
  const last = Math.floor((left + SCALE_SPAN) * 10);
  const marks: React.ReactElement[] = [];
  for (let k = first; k <= last; k += 1) {
    const c = k / 10;
    const x = (c - left) * SCALE_PX;
    const big = k % 10 === 0;
    const mid = k % 5 === 0;
    marks.push(
      <React.Fragment key={k}>
        <line
          x1={x}
          y1={0}
          x2={x}
          y2={big ? 32 : mid ? 23 : 14}
          stroke="#4a4436"
          strokeWidth={big ? 1.8 : 1}
        />
        {big ? (
          <text
            x={x}
            y={48}
            fontSize={13}
            textAnchor="middle"
            fill="#3b3629"
            fontFamily={LABEL_FONT}
            fontWeight={600}
          >
            {Math.round(c)}
          </text>
        ) : null}
      </React.Fragment>,
    );
  }
  return <g>{marks}</g>;
}
