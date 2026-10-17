'use client';

import * as React from 'react';

import {
  OBJECTS,
  OPT,
  cm1,
  coneHalfCm,
  defocusForBlur,
  type Optics,
  type ScreenView,
  type Setup,
} from '@labs/lib/focal-length/optics';
import { clamp } from '@labs/lib/numbers';

import { LABEL_FONT } from '../apparatus-palette';

import { AXIS, PXCM, X, ZOOM, ZOOM_HALF_SPAN } from './geometry';
import { Label, LightRay, RAY, Tag } from './ray';

/**
 * THE ZOOM PANEL: the same cone of light, blown up around the image, so that a
 * blur circle of a fraction of a millimetre is something a student can watch
 * shut to a point and open out again.
 *
 * WHY IT IS HERE AND NOT A WIDGET OF ITS OWN. What it magnifies is a stretch of
 * bench — seven centimetres of it, centred on the image — and the screen slides
 * through that stretch. A panel showing it belongs over the bench, in the same
 * frame of reference, tied to the card by a leader line, because every
 * judgement it supports is "where is the screen, relative to where the cone
 * closes". Docked in the console it would be a second, detached picture the
 * student has to re-orient each time they look up; and the console is 340–420
 * wide, which at seven centimetres of bench is a magnification of ×5. Up here
 * it is ×12 along the bench and about ×22 across it, which is the difference
 * between seeing the cone narrow and being told that it does.
 *
 * It costs the apparatus no room. The bench SVG scales to fit its box, so
 * anything added BELOW the drawing shrinks the metre scale; this is empty
 * canvas the bench already had above the window.
 *
 * WHY IT IS PART OF THE RAYS LAYER. It is a magnified view of light in the air,
 * which no real optical bench shows — and, being centred on the image, it would
 * otherwise hand over the answer to the one question the practical asks with
 * the teaching layer switched off. The Rays switch promises the bench as it
 * really is, so it takes this with it. What is left when it goes is the card
 * and the close-up beside the console, where the dashed circle IS the blur
 * circle and it still shuts to a dot — which is the measurement, and it is
 * never taken away.
 *
 * NOTHING HERE IS A VERDICT. It draws the blur and says how many millimetres
 * across it is, exactly as the card does; deciding when that is sharp enough is
 * the student's, and four marks of every trial hang on it.
 */

/** The cone is drawn to this half-height at the edges of the panel. */
const CONE_HALF = 44;

/**
 * The ceiling on the panel's vertical scale, px per cm across the cone.
 *
 * Ten times the drawn half-height, so ONE MILLIMETRE of blur is never taller
 * than the cone itself and the key that measures it always fits the panel. Only
 * a cone far longer than this bench ever produces (the lens aimed at the candle
 * from the far end, where v runs off the metre scale entirely) reaches it, and
 * there the cone is drawn thinner than the panel edge rather than the key being
 * drawn wrong.
 */
const VZ_MAX = CONE_HALF * 10;

/** Where the cone's waist sits in the panel, and how wide the panel's margins are. */
const CX = ZOOM.x + ZOOM.w / 2;
const CY = ZOOM.y + 88;
const INNER = 14;
const BAND_TOP = ZOOM.y + 34;
const BAND_H = ZOOM.h - 58;

/** Pixels per centimetre ALONG the bench inside the panel. */
const HZ = (ZOOM.w / 2 - 22) / ZOOM_HALF_SPAN;

export function ZoomPanel({
  setup,
  optics,
  view,
  scr,
  gid,
}: {
  setup: Setup;
  optics: Optics;
  view: ScreenView;
  /** Where the screen stands on the metre scale, cm. */
  scr: number;
  /** The bench's id prefix, for the card gradient the screen is painted in. */
  gid: string;
}): React.ReactElement {
  const word = setup.part === 'mirror' ? 'MIRROR' : 'LENS';
  const frame = (
    <>
      <rect
        x={ZOOM.x}
        y={ZOOM.y}
        width={ZOOM.w}
        height={ZOOM.h}
        rx={12}
        fill="#121a19"
        stroke="rgba(255,255,255,.10)"
      />
      <Label x={ZOOM.x + 16} y={ZOOM.y + 24} anchor="start" size={12.5} text="ZOOM ON THE CONE OF LIGHT" fill="#8ea09b" />
    </>
  );

  // Nothing converges: no object aimed at, or one so near that the light leaves
  // still spreading. The panel says which, because those are two different
  // mistakes and the second is the one the practical is built to catch.
  if (!optics.real) {
    return (
      <g data-zoom="">
        {frame}
        <text
          x={CX}
          y={CY}
          fontSize={15}
          textAnchor="middle"
          fill="#8b9994"
          fontFamily={LABEL_FONT}
          fontWeight={500}
          pointerEvents="none"
        >
          {setup.objId === null
            ? `Choose what the ${word.toLowerCase()} is aimed at, and the cone appears here.`
            : 'No cone: this object is nearer than the focus, so the light leaves still spreading out.'}
        </text>
      </g>
    );
  }

  // THE LABEL THAT CHANGES, and the reason the panel earns its space during
  // set-up as well as during the hunt: aimed at something distant the cone
  // closes in the FOCAL PLANE and the distance measured is f; aimed at the
  // candle it closes wherever 1/v = 1/f − 1/u puts it, and the distance
  // measured is v. The panel says which of the two is on the bench.
  const far = setup.objId !== null && OBJECTS[setup.objId].far;
  const zx = (cm: number): number => CX + (cm - optics.xImg) * HZ;

  // The vertical scale: how tall a centimetre ACROSS the cone is drawn. Set so
  // the cone exactly reaches the panel's edges — which makes the panel a
  // constant shape and the SCREEN'S SLICE the only thing that moves in it.
  const edgeHalf = coneHalfCm(setup, optics, optics.xImg + ZOOM_HALF_SPAN);
  const vz = Math.min(VZ_MAX, CONE_HALF / Math.max(edgeHalf, 1e-9));
  const drawnHalf = Math.min(CONE_HALF, edgeHalf * vz);

  // The stretch of bench in which the blur circle is under a millimetre. It is
  // the same tolerance the trial is marked against, read out of the optics
  // rather than restated here. Clamped to the panel: a cone slow enough to be
  // sharp across the whole seven centimetres shades the whole strip, which is
  // true, rather than painting outside the frame.
  const bandHalf = Math.min(ZOOM.w / 2 - INNER, defocusForBlur(setup, optics, OPT.sharp) * HZ);

  // Where the screen cuts through, and whether it is inside the panel at all.
  const beyond = (scr - setup.x) * setup.side;
  const rawX = zx(scr);
  const lo = ZOOM.x + INNER;
  const hi = ZOOM.x + ZOOM.w - INNER;
  const offEdge = rawX < lo || rawX > hi;
  const zsx = clamp(rawX, lo, hi);

  // One millimetre, drawn to the same scale as the cone: the panel's own ruler,
  // and the only honest way to read a magnified picture.
  const key = Math.max(6, OPT.sharp * vz);
  const keyX = ZOOM.x + 30;
  const keyY = ZOOM.y + ZOOM.h - 30;

  return (
    <g data-zoom="">
      {frame}
      <Label
        x={ZOOM.x + ZOOM.w - 16}
        y={ZOOM.y + 24}
        anchor="end"
        size={11.5}
        text={`×${Math.round(HZ / PXCM)} ALONG THE BENCH`}
        fill="#6f7f7a"
      />

      {/* Under a millimetre of blur — as sharp as this bench goes. A stretch,
          not a line, because that is what the tolerance is. */}
      <rect x={(CX - bandHalf).toFixed(1)} y={BAND_TOP} width={(2 * bandHalf).toFixed(1)} height={BAND_H} rx={3} fill="#34d364" opacity={0.11} />
      <Tag
        x={Math.min(CX + bandHalf + 8, ZOOM.x + ZOOM.w - 200)}
        y={ZOOM.y + 46}
        anchor="start"
        size={11}
        text={`BLUR UNDER ${cm1(OPT.sharp * 10)} mm`}
        fill="#7fe0a0"
      />

      {/* The cone: converging on the side the light comes from, opening out
          again on the other. Which side is which is `setup.side`, so the mirror
          draws its cone coming back the way the light came. */}
      {[-1, 1].map((dir) => {
        const xe = zx(optics.xImg + dir * ZOOM_HALF_SPAN);
        const away = dir === setup.side;
        const waist = { x: CX, y: CY };
        return (
          <g key={dir}>
            <polygon
              points={`${xe.toFixed(1)},${CY - drawnHalf} ${CX},${CY} ${xe.toFixed(1)},${CY + drawnHalf}`}
              fill="#ffeec2"
              opacity={0.15}
            />
            {[1, 0.45, -0.45, -1].map((t) => {
              const edge = { x: xe, y: CY + t * drawnHalf };
              return (
                <LightRay
                  key={t}
                  from={away ? waist : edge}
                  to={away ? edge : waist}
                  stroke={RAY.axial}
                  width={Math.abs(t) === 1 ? 1.5 : 1.1}
                  opacity={Math.abs(t) === 1 ? 0.7 : 0.45}
                />
              );
            })}
          </g>
        );
      })}
      <line x1={CX} y1={ZOOM.y + 52} x2={CX} y2={ZOOM.y + ZOOM.h - 22} stroke="#ffd98a" strokeWidth={1} strokeDasharray="4 5" opacity={0.85} pointerEvents="none" />
      <circle cx={CX} cy={CY} r={3} fill="#ffe9b0" pointerEvents="none" />
      <Tag
        x={CX}
        y={ZOOM.y + ZOOM.h - 8}
        size={12}
        text={far ? 'FOCAL PLANE — WHERE THE CONE IS A POINT' : 'IMAGE PLANE — THIS IS v, NOT f'}
        fill={far ? '#ffd98a' : '#ffab6b'}
      />

      {/* The panel's ruler. Drawn over the cone, on a plate, because it is
          measured against the slice beside it. */}
      <g pointerEvents="none">
        <rect x={ZOOM.x + 10} y={(keyY - key - 12).toFixed(1)} width={182} height={(key + 24).toFixed(1)} rx={6} fill="#0e1615" opacity={0.84} />
        <line x1={keyX} y1={keyY} x2={keyX} y2={(keyY - key).toFixed(1)} stroke="#9fb0ab" strokeWidth={2} />
        <line x1={keyX - 4} y1={keyY} x2={keyX + 4} y2={keyY} stroke="#9fb0ab" strokeWidth={1.4} />
        <line x1={keyX - 4} y1={(keyY - key).toFixed(1)} x2={keyX + 4} y2={(keyY - key).toFixed(1)} stroke="#9fb0ab" strokeWidth={1.4} />
        <text x={keyX + 10} y={keyY - key / 2 + 4} fontSize={11.5} fill="#8ea09b" fontFamily={LABEL_FONT} fontWeight={600}>
          {`${cm1(OPT.sharp * 10)} mm across the cone`}
        </text>
      </g>

      {beyond <= 1 ? (
        <Tag x={CX} y={ZOOM.y + 74} size={12} text={`THE SCREEN IS ON THE OTHER SIDE OF THE ${word}`} fill="#ff9c94" />
      ) : offEdge ? (
        <Tag
          x={rawX < lo ? zsx + 16 : zsx - 16}
          y={CY - 16}
          size={12}
          anchor={rawX < lo ? 'start' : 'end'}
          text={`${rawX < lo ? '◀ ' : ''}THE SCREEN IS OFF THIS EDGE${rawX > hi ? ' ▶' : ''}`}
          fill="#cbd6d2"
        />
      ) : (
        <ScreenSlice view={view} x={zsx} vz={vz} gid={gid} scr={scr} />
      )}
    </g>
  );
}

/**
 * The screen standing in the magnified strip, and the slice it takes out of the
 * cone. That slice IS the blur circle: the same `view.blur` the card is painted
 * with and the trial is marked on, at this panel's scale.
 */
function ScreenSlice({
  view,
  x,
  vz,
  gid,
  scr,
}: {
  view: ScreenView;
  x: number;
  vz: number;
  gid: string;
  scr: number;
}): React.ReactElement {
  const half = view.lit ? clamp((view.blur * vz) / 2, 1, CONE_HALF) : 0;
  const top = Math.max(ZOOM.y + 64, CY - half - 12);
  const anchor = x > ZOOM.x + ZOOM.w - 150 ? 'end' : x < ZOOM.x + 150 ? 'start' : 'middle';
  return (
    <>
      <rect x={(x - 3).toFixed(1)} y={BAND_TOP} width={6} height={BAND_H} rx={2} fill={`url(#${gid}card)`} opacity={0.95} pointerEvents="none" />
      {view.lit ? (
        <>
          <line
            x1={x.toFixed(1)}
            y1={(CY - half).toFixed(1)}
            x2={x.toFixed(1)}
            y2={(CY + half).toFixed(1)}
            stroke="#ffcf5e"
            strokeWidth={5}
            strokeLinecap="round"
            pointerEvents="none"
          />
          <Tag
            x={x}
            y={top}
            size={12.5}
            anchor={anchor}
            text={view.sharp ? `SHARP — UNDER ${cm1(OPT.sharp * 10)} mm` : `BLUR CIRCLE ${cm1(view.blur * 10)} mm`}
            fill={view.sharp ? '#8ee6a8' : '#ffcf5e'}
          />
        </>
      ) : null}
      {/* Ties the slice up here to the patch on the card down on the bench, so
          the panel is read as a magnified piece of the bench and not as a
          separate instrument. */}
      <line
        x1={x.toFixed(1)}
        y1={ZOOM.y + ZOOM.h}
        x2={X(scr)}
        y2={AXIS - 58}
        stroke="#ffcf5e"
        strokeWidth={1}
        strokeDasharray="3 5"
        opacity={0.28}
        pointerEvents="none"
      />
    </>
  );
}
