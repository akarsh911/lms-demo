'use client';

import * as React from 'react';
import Box from '@mui/material/Box';

import {
  LIMITS,
  OBJECTS,
  OPT,
  cm1,
  cm2,
  objectAngle,
  type Optics,
  type PartId,
  type ScreenView,
  type Setup,
  type StandId,
} from '@labs/lib/focal-length/optics';
import { clamp } from '@labs/lib/numbers';

import { apparatus, LABEL_FONT } from '../apparatus-palette';
import { benchMotionSx, motionSx, useBenchMotion } from '../bench-motion';

import { AXIS, BENCH_HEIGHT, BENCH_TOP, BENCH_WIDTH, CMX, PXCM, SCALE_BOT, SCALE_TOP, SPARE, X } from './geometry';
import { Label, LightRay, RAY, Tag, type Pt } from './ray';
import { FarScene, Scene } from './scene';
import { ZoomPanel } from './zoom-panel';

/**
 * The optical bench: a window with a view far away, the optic on a stand, a
 * screen on a stand, and a metre scale running the length of the bench.
 *
 * Everything drawn here is worked out from the optics the engine computed —
 * where the image plane falls, how wide the blur circle is on the card, how
 * much the light has been spread and therefore dimmed. Nothing is scripted, so
 * hunting for the sharp image is a real search.
 *
 * A stand is grabbed and dragged along the bench, or selected and pushed with
 * the arrow keys (Shift for a whole centimetre), exactly as the Ohm's law
 * rheostat slider works. Reading where it ended up is the close-up's job: the
 * scale is printed here at 8.8 px per centimetre, which cannot resolve a
 * millimetre, and that is deliberate.
 */
export interface OpticalBenchProps {
  /** The optic the bench is set up for, and the one actually in the stand. */
  part: PartId;
  mounted: PartId;
  comp: number;
  scr: number;
  sel: StandId;
  setup: Setup;
  optics: Optics;
  view: ScreenView;
  /** Whether the stands may still be moved. */
  live: boolean;
  /** Whether the spare optic can be put in the stand right now. */
  canMount: boolean;
  /**
   * Whether the drawn light is on the bench: the beam arriving, the cone
   * closing on the image and the cone opening out past it.
   *
   * The TEACHING LAYER, and a drawing over the apparatus rather than part of
   * it — a real bench shows none of this. Everything the student actually
   * reads is drawn regardless: the card, what falls on it, the stands, the
   * principal axis and the metre scale, none of which are light.
   */
  rays: boolean;
  /** Parts a tour step is pointing at: `comp`, `scr`, `spare`. */
  pulse: readonly string[];
  onSvg: (el: SVGSVGElement | null) => void;
  onSelect: (stand: StandId) => void;
  onDrag: (stand: StandId, cm: number) => void;
  onNudge: (stand: StandId, delta: number) => void;
  onMount: () => void;
  fill?: boolean;
}

/**
 * How far past the image the cone is drawn opening out again, px.
 *
 * A real cone goes on for ever; this one is drawn long enough to make the point
 * that the light does not stop at the image — at least as far as the card, so
 * the card is always seen to be standing IN the cone, and never so far that it
 * runs off the end of the bench.
 */
const flareLength = (diPx: number, toScreen: number): number =>
  Math.min(340, Math.max(diPx * 0.38, toScreen + 34));

export function OpticalBench({
  part,
  mounted,
  comp,
  scr,
  sel,
  setup,
  optics,
  view,
  live,
  canMount,
  rays,
  pulse,
  onSvg,
  onSelect,
  onDrag,
  onNudge,
  onMount,
  fill = false,
}: OpticalBenchProps): React.ReactElement {
  const gid = `f${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const svg = React.useRef<SVGSVGElement | null>(null);
  /** The stand being dragged, and how far the grab was from its index mark. */
  const drag = React.useRef<{ stand: StandId; offset: number } | null>(null);

  const setSvg = React.useCallback(
    (el: SVGSVGElement | null) => {
      svg.current = el;
      onSvg(el);
    },
    [onSvg],
  );

  const toBenchCm = (e: { clientX: number; clientY: number }): number | null => {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return null;
    return CMX(new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()).x);
  };

  const at = (stand: StandId): number => (stand === 'comp' ? comp : scr);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    const stand = (e.target as Element).closest('[data-stand]')?.getAttribute('data-stand') as StandId | null;
    if (!stand) return;
    onSelect(stand);
    if (!live) return;
    const cm = toBenchCm(e);
    if (cm === null) return;
    e.preventDefault();
    drag.current = { stand, offset: at(stand) - cm };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const held = drag.current;
    if (!held) return;
    const cm = toBenchCm(e);
    if (cm !== null) onDrag(held.stand, cm + held.offset);
  };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (!drag.current) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onClick = (e: React.MouseEvent<SVGSVGElement>): void => {
    if ((e.target as Element).closest('[data-spare]') && canMount) onMount();
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>): void => {
    const target = e.target as Element;
    const stand = target.getAttribute('data-stand') as StandId | null;
    if (stand && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      // Select first: the push always acts on the stand the hand is on.
      onSelect(stand);
      onNudge(stand, (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : OPT.lc));
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (stand) {
      e.preventDefault();
      onSelect(stand);
    } else if (target.hasAttribute('data-spare') && canMount) {
      e.preventDefault();
      onMount();
    }
  };

  const moving = useBenchMotion();
  const apPx = (setup.ap * PXCM) / 2;
  const top = AXIS - apPx;
  const bot = AXIS + apPx;
  const cx = X(comp);
  const sx = X(scr);
  const spareIsLens = mounted === 'mirror';
  const far = setup.objId !== null && OBJECTS[setup.objId].far;
  const ix = X(optics.xImg);
  const diPx = optics.di * PXCM;
  /** The angle the object subtends, as a slope: rise in px per px along. */
  const slope = objectAngle(setup);
  /** Half the image, px. The cone's waist is a line this tall, not a point. */
  const imgHalf = (optics.h * PXCM) / 2;
  /** Whether the waist is anywhere on the metre scale worth marking. */
  const waistOnBench = optics.real && optics.xImg > 0 && optics.xImg < 100;

  return (
    <Box
      sx={{
        position: 'relative',
        ...(fill ? { flex: 1, minWidth: 0, minHeight: 0, display: 'flex' } : null),
        userSelect: 'none',
        WebkitUserSelect: 'none',
        '& .stand': { cursor: live ? 'ew-resize' : 'default', outline: 'none' },
        '& .stand .focus': { transition: 'stroke .15s' },
        '& .stand.sel .focus': { stroke: apparatus.hintRing, strokeWidth: 2.5 },
        '& .stand:focus-visible .focus': { stroke: '#fff', strokeWidth: 3 },
        '& .hot': { cursor: 'pointer', outline: 'none' },
        '& .hot:focus-visible .focus': { stroke: apparatus.hintRing, strokeWidth: 3 },
        // `benchMotionSx` first for the rules that move, `motionSx` last so
        // that stopping beats every one of them: the `animation` flag and
        // `prefers-reduced-motion` settle this bench by the same code path.
        ...benchMotionSx,
        ...motionSx(moving),
      }}
    >
      <svg
        ref={setSvg}
        viewBox={`0 0 ${BENCH_WIDTH} ${BENCH_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Optical bench: a window onto a distant view, a concave mirror or convex lens on a stand, a screen on a stand and a metre scale"
        style={
          fill
            ? { display: 'block', width: '100%', height: '100%', touchAction: 'none' }
            : { display: 'block', width: '100%', height: 'auto', touchAction: 'none' }
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <defs>
          <radialGradient id={`${gid}lamp`} cx="45%" cy="38%" r="75%">
            <stop offset="0" stopColor="#2b3533" />
            <stop offset=".6" stopColor="#1b2221" />
            <stop offset="1" stopColor="#121817" />
          </radialGradient>
          <linearGradient id={`${gid}wood`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9a6d3e" />
            <stop offset="1" stopColor="#6c4826" />
          </linearGradient>
          <linearGradient id={`${gid}ruler`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6f1e0" />
            <stop offset="1" stopColor="#e2d8bd" />
          </linearGradient>
          <linearGradient id={`${gid}card`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fbfaf5" />
            <stop offset="1" stopColor="#e8e5da" />
          </linearGradient>
          <clipPath id={`${gid}win`}>
            <rect x={12} y={198} width={148} height={224} rx={2} />
          </clipPath>
          <clipPath id={`${gid}clip`}>
            <rect x={sx - 4} y={AXIS - 46} width={8} height={92} />
          </clipPath>
          {view.lit ? (
            <filter id={`${gid}blur`} x="-160%" y="-160%" width="420%" height="420%">
              <feGaussianBlur stdDeviation={Math.max(0, (view.blur * PXCM) / 4).toFixed(3)} />
            </filter>
          ) : null}
        </defs>

        <rect width={BENCH_WIDTH} height={BENCH_HEIGHT} fill={`url(#${gid}lamp)`} />
        <rect y={BENCH_HEIGHT - 8} width={BENCH_WIDTH} height={8} fill="#0f1413" />

        {/* The window at the back of the room, and the view through it */}
        <rect x={4} y={190} width={164} height={240} rx={4} fill="#25302e" stroke="#3a4745" />
        <g clipPath={`url(#${gid}win)`}>
          <g transform="translate(86,306) scale(0.168)">
            <FarScene />
          </g>
        </g>
        <rect x={12} y={198} width={148} height={224} rx={2} fill="none" stroke="#46514f" strokeWidth={2} />
        <line x1={86} y1={198} x2={86} y2={422} stroke="#46514f" strokeWidth={4} />
        <line x1={12} y1={310} x2={160} y2={310} stroke="#46514f" strokeWidth={4} />
        <Label x={86} y={182} text="THE WINDOW" />
        <Label x={190} y={182} anchor="start" text="THE VIEW IS FAR AWAY — THE RAYS ARRIVE PARALLEL" />

        {/* Bench top and the metre scale laid along it */}
        <rect y={BENCH_TOP} width={BENCH_WIDTH} height={BENCH_HEIGHT - BENCH_TOP} fill={`url(#${gid}wood)`} />
        <rect y={BENCH_TOP} width={BENCH_WIDTH} height={4} fill="#b3accb" opacity={0.08} />
        <rect
          x={X(0) - 10}
          y={SCALE_TOP}
          width={X(100) - X(0) + 20}
          height={SCALE_BOT - SCALE_TOP}
          rx={3}
          fill={`url(#${gid}ruler)`}
          stroke="#c3b894"
        />
        <ScaleTicks />
        <text x={X(100) + 4} y={SCALE_TOP + 26} fontSize={9.5} fill="#6b6450" fontFamily={LABEL_FONT}>
          cm
        </text>

        {/* The principal axis */}
        <line
          x1={X(1)}
          y1={AXIS}
          x2={X(99)}
          y2={AXIS}
          stroke="#6f7c7a"
          strokeWidth={1}
          strokeDasharray="7 6"
          opacity={0.8}
        />

        {/* The beam arriving: parallel from a distant object, spreading from the
            candle. The edges of the cone and the middle of the parallel beam are
            drawn as rays and set running, because that is what they are: the
            light on its way to the optic, from a source that is always to the
            left of it. */}
        {rays && setup.u !== null ? (
          setup.objId === 'candle' ? (
            <g>
              <polygon
                points={`${X(OPT.candleX)},${AXIS} ${cx},${top} ${cx},${bot}`}
                fill={RAY.dim}
                opacity={0.07}
              />
              {/* Four of them, filling the aperture, because the one thing
                  this drawing has to show is that they are still SPREADING
                  when they arrive — two edges alone read as a corridor. */}
              {[1, 0.45, -0.45, -1].map((t) => (
                <LightRay
                  key={t}
                  from={{ x: X(OPT.candleX), y: AXIS }}
                  to={{ x: cx, y: AXIS + t * apPx }}
                  stroke={RAY.axial}
                  width={1.3}
                  opacity={0.55}
                />
              ))}
              <Tag
                x={(X(OPT.candleX) + cx) / 2}
                y={AXIS + 62}
                text="THESE RAYS ARRIVE STILL SPREADING OUT"
                fill="#e0b46a"
              />
            </g>
          ) : (
            <g>
              <polygon
                points={`${X(0.4)},${top} ${cx},${top} ${cx},${bot} ${X(0.4)},${bot}`}
                fill={RAY.dim}
                opacity={0.06}
              />
              {[top + 3, AXIS, bot - 3].map((y) => (
                <LightRay key={y} from={{ x: X(0.4), y }} to={{ x: cx, y }} stroke={RAY.dim} width={1.2} opacity={0.45} />
              ))}
              {/* ONE BUNDLE FROM THE TOP OF THE TREE AND ONE FROM ITS FOOT.
                  They arrive at the angle the object really subtends — two
                  hundredths of a degree, drawn as the slope it is — and they
                  cross at the pole, which is the whole of why the image comes
                  out upside down. Told apart by colour so that crossing can be
                  followed; the same two colours come out the far side of the
                  optic, arriving the other way up. */}
              <LightRay
                from={{ x: X(0.4), y: AXIS - slope * (cx - X(0.4)) }}
                to={{ x: cx, y: AXIS }}
                stroke={RAY.top}
                width={1.7}
                opacity={0.95}
              />
              <LightRay
                from={{ x: X(0.4), y: AXIS + slope * (cx - X(0.4)) }}
                to={{ x: cx, y: AXIS }}
                stroke={RAY.foot}
                width={1.7}
                opacity={0.95}
              />
              <BundleLabels cx={cx} slope={slope} />
            </g>
          )
        ) : null}

        {/* The candle, when that is what the optic is aimed at. It is APPARATUS,
            standing on the bench whether or not the drawn light is on: take the
            rays away and there is still a candle there, which is what a student
            in the room would see. */}
        {setup.u !== null && setup.objId === 'candle' ? (
          <g>
            <rect
              x={X(OPT.candleX) - 5}
              y={AXIS + 12}
              width={10}
              height={BENCH_TOP - AXIS - 12}
              fill="#efe7d2"
            />
            <ellipse cx={X(OPT.candleX)} cy={AXIS + 2} rx={5} ry={12} fill="#ffc95e" />
            <ellipse cx={X(OPT.candleX)} cy={AXIS + 5} rx={2.2} ry={6} fill="#fff8e0" />
            <path d={`M${X(OPT.candleX) - 16} ${BENCH_TOP} h32 l-5 -8 h-22 Z`} fill="#40484a" />
            <Label x={X(OPT.candleX)} y={AXIS - 22} text="CANDLE" fill="#e0b46a" />
          </g>
        ) : null}

        {/* The converging cone and, past the image, the cone opening out again.
            Both leave the optic, so both travel whichever way `setup.side`
            points: on through the lens, or back off the mirror.

            Drawn light, so it goes with the rest of it. What is left when it
            does is the card and whatever is falling on it — which is the only
            thing on this bench a mark is ever taken from. */}
        {rays && optics.real ? (
          <g>
            <polygon points={`${cx},${top} ${ix},${AXIS} ${cx},${bot}`} fill="#ffeec2" opacity={0.14} />
            {[1, 0.45, -0.45, -1].map((t) => (
              <LightRay
                key={t}
                from={{ x: cx, y: AXIS + t * apPx }}
                to={{ x: ix, y: AXIS }}
                stroke={RAY.axial}
                width={Math.abs(t) === 1 ? 1.4 : 1.1}
                opacity={Math.abs(t) === 1 ? 0.75 : 0.5}
              />
            ))}
            {/* The two coloured bundles coming out the other side, each to the
                end of the image it makes. The foot's light now arrives above
                the axis and the top's below it — the crossing, completed. */}
            {far ? (
              <>
                <LightRay from={{ x: cx, y: AXIS }} to={{ x: ix, y: AXIS + imgHalf }} stroke={RAY.top} width={1.7} opacity={0.95} />
                <LightRay from={{ x: cx, y: AXIS }} to={{ x: ix, y: AXIS - imgHalf }} stroke={RAY.foot} width={1.7} opacity={0.95} />
              </>
            ) : null}
            <Flare ix={ix} apPx={apPx} diPx={diPx} side={setup.side} toScreen={(sx - ix) * setup.side} />
          </g>
        ) : null}

        {/* The screen on its stand, with whatever is falling on it */}
        <Stand
          id="scr"
          cm={scr}
          top={AXIS + 46}
          title="Screen stand"
          part={part}
          selected={sel === 'scr'}
          pulsing={pulse.includes('scr')}
          live={live}
        />
        <rect x={sx - 4} y={AXIS - 46} width={8} height={92} rx={2} fill={`url(#${gid}card)`} stroke="#b9b3a2" />
        {view.lit ? (
          <g
            clipPath={`url(#${gid}clip)`}
            opacity={clamp(view.bright, 0.1, 1).toFixed(3)}
            filter={`url(#${gid}blur)`}
          >
            <g transform={`translate(${sx},${AXIS}) scale(${(-optics.k * PXCM).toFixed(5)})`}>
              <Scene objId={setup.objId} />
            </g>
          </g>
        ) : null}
        {/* THE SLICE THE CARD TAKES OUT OF THE CONE, which is the blur circle
            and the only thing on this bench a focus mark is taken from. Drawn
            whether or not the rays are on, because it is not light in the air:
            it is the patch lying on the card, and a student in the room would
            see it. Given a floor of 0.7 px so a perfectly focused image is a
            bright point rather than nothing at all. */}
        {view.lit ? (
          <>
            <line
              x1={sx}
              y1={(AXIS - Math.max(0.7, (view.blur * PXCM) / 2)).toFixed(1)}
              x2={sx}
              y2={(AXIS + Math.max(0.7, (view.blur * PXCM) / 2)).toFixed(1)}
              stroke="#ffcf5e"
              strokeWidth={3.4}
              strokeLinecap="round"
              opacity={0.95}
              pointerEvents="none"
            />
            <Tag
              x={sx}
              y={AXIS - 54}
              text={view.sharp ? 'SHARP' : `BLUR ${cm1(view.blur * 10)} mm`}
              fill={view.sharp ? '#8ee6a8' : '#ffcf5e'}
            />
          </>
        ) : null}

        {/* THE WAIST OF THE CONE, on top of everything so the card cannot hide
            it: where the light actually comes to a point, and the plane the
            student is hunting for. Drawn light, so the Rays switch takes it. */}
        {rays && waistOnBench ? (
          <g pointerEvents="none">
            <line x1={ix} y1={AXIS - 11} x2={ix} y2={AXIS + 11} stroke="#ffd98a" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={ix} cy={AXIS} r={2.8} fill="#ffe9b0" />
            <Tag x={ix} y={AXIS + 26} text={far ? 'F' : 'v'} size={11} fill={far ? '#ffd98a' : '#ffab6b'} />
          </g>
        ) : null}

        {/* The mirror or the lens on its stand */}
        <Stand
          id="comp"
          cm={comp}
          top={top}
          title={mounted === 'mirror' ? 'Concave mirror stand' : 'Convex lens stand'}
          part={part}
          selected={sel === 'comp'}
          pulsing={pulse.includes('comp')}
          live={live}
        />
        {mounted === 'mirror' ? (
          <g>
            <path
              d={`M${cx + 7} ${top} Q${cx - 9} ${AXIS} ${cx + 7} ${bot} L${cx + 13} ${bot} L${cx + 13} ${top} Z`}
              fill="#5a6a70"
              opacity={0.85}
            />
            <path
              d={`M${cx + 7} ${top} Q${cx - 9} ${AXIS} ${cx + 7} ${bot}`}
              fill="none"
              stroke="#cfe3ea"
              strokeWidth={3.2}
              strokeLinecap="round"
            />
            <Label x={cx} y={top - 12} text="CONCAVE MIRROR" />
          </g>
        ) : (
          <g>
            <path
              d={`M${cx} ${top} Q${cx + 15} ${AXIS} ${cx} ${bot} Q${cx - 15} ${AXIS} ${cx} ${top} Z`}
              fill="#cfe3ea"
              opacity={0.5}
              stroke="#dff0f5"
              strokeWidth={1.6}
            />
            <Label x={cx} y={top - 12} text="CONVEX LENS" />
          </g>
        )}

        {/* The spare optic resting at the front of the bench */}
        <g
          data-spare=""
          className={`hot${pulse.includes('spare') ? ' pulse' : ''}`}
          tabIndex={canMount ? 0 : -1}
          role="button"
          aria-disabled={!canMount}
          aria-label={`${spareIsLens ? 'Convex lens' : 'Concave mirror'} lying on the bench${
            canMount ? ' — put it in the stand' : ''
          }`}
          opacity={canMount ? 1 : 0.55}
        >
          <rect
            className="focus"
            x={SPARE.x - 4}
            y={SPARE.y - 4}
            width={SPARE.w + 8}
            height={SPARE.h + 8}
            rx={10}
            fill="rgba(0,0,0,0)"
            stroke="transparent"
          />
          <rect
            x={SPARE.x}
            y={SPARE.y}
            width={SPARE.w}
            height={SPARE.h}
            rx={8}
            fill="#2a3234"
            stroke="#4a5457"
          />
          {spareIsLens ? (
            <path
              d={`M80 ${SPARE.y + 6} Q92 ${SPARE.y + 22} 80 ${SPARE.y + 38} Q68 ${SPARE.y + 22} 80 ${SPARE.y + 6} Z`}
              fill="#cfe3ea"
              opacity={0.55}
              stroke="#dff0f5"
            />
          ) : (
            <path
              d={`M86 ${SPARE.y + 6} Q72 ${SPARE.y + 22} 86 ${SPARE.y + 38}`}
              fill="none"
              stroke="#cfe3ea"
              strokeWidth={3}
            />
          )}
        </g>
        <Label x={80} y={SPARE.y + SPARE.h + 16} text={spareIsLens ? 'CONVEX LENS' : 'CONCAVE MIRROR'} />

        <Label
          x={580}
          y={578}
          text="METRE SCALE — LEAST COUNT 0.1 cm · USE THE CLOSE-UP TO READ IT"
          fill="#c9bfa2"
        />

        {/* Last, so nothing on the bench can be drawn over it. It magnifies
            the drawn cone, so the Rays switch takes it with the rest of the
            light; see `zoom-panel.tsx` for why that is the honest gate. */}
        {rays ? <ZoomPanel setup={setup} optics={optics} view={view} scr={scr} gid={gid} /> : null}
      </svg>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/**
 * Which bundle is which, wherever the bench leaves room to say so: the two
 * coloured rays are only worth telling apart if the student is told what they
 * are. The labels sit ON the rays, so they ride up and down with the slope and
 * shorten to TOP / FOOT when the optic has been pushed close to the window.
 */
function BundleLabels({ cx, slope }: { cx: number; slope: number }): React.ReactElement | null {
  const room = cx - 184;
  const words = room > 150 ? ['FROM THE TOP', 'FROM THE FOOT'] : room > 64 ? ['TOP', 'FOOT'] : null;
  if (!words) return null;
  const bx = room > 150 ? 184 : cx - 60;
  return (
    <>
      <Tag x={bx} y={AXIS - slope * (cx - bx) - 7} anchor="start" size={9.5} text={words[0] ?? ''} fill={RAY.top} />
      <Tag x={bx} y={AXIS + slope * (cx - bx) + 15} anchor="start" size={9.5} text={words[1] ?? ''} fill={RAY.foot} />
    </>
  );
}

/**
 * The cone opening out again past the image.
 *
 * It is what makes the search a genuine search: the blur does not shrink to
 * nothing and stay there, it shrinks to a point and grows back, so the student
 * has to come at the focus from both sides. Drawn from the image outwards, the
 * way the light goes, and clamped to the ends of the bench.
 */
function Flare({
  ix,
  apPx,
  diPx,
  side,
  toScreen,
}: {
  ix: number;
  apPx: number;
  diPx: number;
  side: -1 | 1;
  /** How far past the image the card stands, px. Negative when it is short of it. */
  toScreen: number;
}): React.ReactElement {
  const xe = clamp(ix + side * flareLength(diPx, toScreen), X(0.4), X(99.6));
  const he = (apPx * Math.abs(xe - ix)) / diPx;
  const from: Pt = { x: ix, y: AXIS };
  return (
    <g>
      <polygon
        points={`${ix},${AXIS} ${xe.toFixed(1)},${(AXIS - he).toFixed(1)} ${xe.toFixed(1)},${(AXIS + he).toFixed(1)}`}
        fill="#ffeec2"
        opacity={0.1}
      />
      {[1, 0.45, -0.45, -1].map((t) => (
        <LightRay key={t} from={from} to={{ x: xe, y: AXIS + t * he }} stroke={RAY.axial} width={1.2} opacity={0.5} />
      ))}
    </g>
  );
}

/** Every centimetre of the metre scale, tall at ten and at five. */
const ScaleTicks = React.memo(function ScaleTicks(): React.ReactElement {
  return (
    <g pointerEvents="none">
      {Array.from({ length: 101 }, (_, c) => {
        const x = X(c);
        const big = c % 10 === 0;
        const mid = c % 5 === 0;
        return (
          <React.Fragment key={c}>
            <line
              x1={x}
              y1={SCALE_TOP}
              x2={x}
              y2={SCALE_TOP + (big ? 13 : mid ? 9 : 5)}
              stroke="#4a4436"
              strokeWidth={big ? 1.4 : 0.9}
            />
            {big ? (
              <text
                x={x}
                y={SCALE_TOP + 26}
                fontSize={10.5}
                textAnchor="middle"
                fill="#3b3629"
                fontFamily={LABEL_FONT}
                fontWeight={600}
              >
                {c}
              </text>
            ) : null}
          </React.Fragment>
        );
      })}
    </g>
  );
});

/**
 * A stand: the rod, the base plate, and the red index mark that points at the
 * metre scale. The index mark is what a reading is taken from, so it is drawn
 * as a hairline and read in the close-up rather than here.
 */
function Stand({
  id,
  cm,
  top,
  title,
  part,
  selected,
  pulsing,
  live,
}: {
  id: StandId;
  cm: number;
  top: number;
  title: string;
  part: PartId;
  selected: boolean;
  pulsing: boolean;
  live: boolean;
}): React.ReactElement {
  const px = X(cm);
  const limit = LIMITS[part][id];
  return (
    <g
      data-stand={id}
      className={`stand${selected ? ' sel' : ''}${pulsing ? ' pulse' : ''}`}
      tabIndex={0}
      role="slider"
      aria-label={`${title}${live ? ' — drag it, or use the arrow keys' : ''}`}
      aria-valuemin={limit[0]}
      aria-valuemax={limit[1]}
      aria-valuenow={Number(cm.toFixed(2))}
      aria-valuetext={`${cm2(cm)} centimetre`}
      aria-disabled={!live}
    >
      <rect
        className="focus"
        x={px - 26}
        y={top - 8}
        width={52}
        height={SCALE_TOP - top + 16}
        rx={9}
        fill="rgba(0,0,0,0)"
        stroke="transparent"
      />
      <rect x={px - 3} y={top} width={6} height={BENCH_TOP - top} rx={2} fill="#8d9694" />
      <path d={`M${px - 20} ${BENCH_TOP} h40 l-6 12 h-28 Z`} fill="#40484a" stroke="#5c6668" />
      <line x1={px} y1={BENCH_TOP + 12} x2={px} y2={SCALE_TOP} stroke="#e2453f" strokeWidth={1.6} />
      <path d={`M${px} ${SCALE_TOP} l-4 -7 h8 Z`} fill="#e2453f" />
    </g>
  );
}
