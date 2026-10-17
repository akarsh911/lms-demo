'use client';

import * as React from 'react';
import Box from '@mui/material/Box';

import {
  THERMO_MAX,
  boilBubbleRate,
  fumePuffRate,
  liquidCss,
  pptMass,
  solidMass,
  solidPileCss,
  tempOf,
  vol,
  type Vessel,
} from '@labs/lib/reaction-types/chemistry';

import {
  benchMotionSx,
  bubbleTrain,
  motionSx,
  riseOffset,
  riseStyle,
  RISE_CLASS,
  TRACK_CLASS,
  useBenchMotion,
} from '../bench-motion';

/**
 * One vessel, drawn at any size.
 *
 * Everything in it is a consequence of what the chemistry says is in it: the
 * height of the liquid column is its volume, its colour is the mix of what is
 * dissolved, the cloud is precipitate still in suspension and the pale band at
 * the bottom is the part that has settled, the pile is the dry solid, and the
 * copper on the nails is the fraction of the sulphate displaced so far.
 *
 * Still a picture of the numbers — the numbers now move. The precipitate comes
 * down on the settling constant the chemistry gives it rather than in ten steps
 * a second, and the fumes leaving a heated tube are spaced by the rate the same
 * rate law says they are coming off at. Nothing here holds a clock or a phase:
 * every one of those is the model's own value, carried rather than stepped.
 */
export interface VesselArtProps {
  v: Vessel;
  cx: number;
  top: number;
  bottom: number;
  /** Tube width. Everything else is scaled from it. */
  w: number;
  /** Pixels per millilitre of liquid, and per gram of solid. */
  mlPx: number;
  gPx: number;
  /** Unique within the document: the liquid is clipped to the glass. */
  uid: string;
  /**
   * Simulated minutes the bench is running off per real second. It is what
   * turns a rate per simulated minute into fumes per second, and it is zero
   * while the clock is stopped — at which point no chemistry is happening
   * either, so a still tube is the honest drawing.
   */
  minutesPerSecond: number;
  /** A close-up draws its thermometer fatter and higher. */
  big?: boolean;
  thermo?: boolean;
}

export function VesselArt({
  v,
  cx,
  top,
  bottom,
  w,
  mlPx,
  gPx,
  uid,
  minutesPerSecond,
  big = false,
  thermo = false,
}: VesselArtProps): React.ReactElement {
  const moving = useBenchMotion();
  const r = w / 2;
  const glass = `M${cx - r} ${top} V${bottom - r} A${r} ${r} 0 0 0 ${cx + r} ${bottom - r} V${top}`;
  const V = vol(v);
  const surf = bottom - 3 - V * mlPx;
  const ppt = pptMass(v);
  const hs = Math.min((bottom - top) * 0.5, solidMass(v) * gPx);
  const cloud = Math.min(0.82, ((ppt / Math.max(V, 1) / 0.02) * 0.7)) * (1 - v.settle * 0.75);
  // How thick the settled layer looks: a share of the tube, from how much solid
  // sits in how much liquid.
  const dense = Math.min(0.3, (ppt / Math.max(V, 1) / 0.02) * 0.12);
  const hp = v.settle * dense * (bottom - top);

  // Boiling bubbles rise through the liquid; fumes off a heated solid rise
  // through the empty part of the tube towards its mouth. Both are spaced by
  // the rate the reaction is actually going at.
  const boil = bubbleTrain(boilBubbleRate(v, minutesPerSecond), Math.max(6, bottom - 6 - surf - 2), 10);
  const fumeSpan = Math.max(8, Math.min(surf, bottom - hs) - top - 4);
  const fume = bubbleTrain(fumePuffRate(v, minutesPerSecond), fumeSpan, 7);

  return (
    // The motion rules ride with the vessel: this one component is both a tube
    // in the rack and the magnified copy in the console, each under its own SVG.
    <Box component="g" sx={{ ...benchMotionSx, ...motionSx(moving) }}>
      <clipPath id={`cl-${uid}`}>
        <path d={glass} />
      </clipPath>
      <path d={glass} fill="rgba(255,255,255,.05)" />
      <g clipPath={`url(#cl-${uid})`}>
        {V > 0 ? (
          <>
            <rect className={TRACK_CLASS} x={cx - r} y={surf} width={w} height={bottom - surf} fill={liquidCss(v)} />
            <rect x={cx - r} y={surf - 1} width={w} height={3} fill="#fff" opacity={0.3} />
          </>
        ) : null}
        {ppt > 0 && V > 0 && cloud > 0.02 ? (
          // The suspension thins as the precipitate falls out of it, and the
          // band below thickens by the same settling: both are `v.settle`,
          // which the chemistry moves on its own couple-of-minutes constant.
          <rect
            className={TRACK_CLASS}
            x={cx - r}
            y={surf}
            width={w}
            height={bottom - surf}
            fill="#fdfdfb"
            opacity={cloud.toFixed(3)}
          />
        ) : null}
        {ppt > 0 && hp > 0.5 ? (
          <rect
            className={TRACK_CLASS}
            x={cx - r}
            y={bottom - hs - hp}
            width={w}
            height={hp + 4}
            fill="#f7f7f4"
            opacity={0.95}
          />
        ) : null}
        {Array.from({ length: boil.count }, (_, k) => (
          <circle
            key={`b${k}`}
            className={RISE_CLASS}
            cx={cx - w * 0.3 + (((k * 733) % 101) / 101) * w * 0.6}
            cy={bottom - 6 - riseOffset(boil, k)}
            r={w * 0.06 + (((k * 29) % 7) / 7) * w * 0.04}
            fill="#fff"
            opacity={0.5}
            style={riseStyle(boil)}
          />
        ))}
        {hs > 0.5 ? (
          <>
            <rect x={cx - r} y={bottom - hs} width={w} height={hs + 4} fill={solidPileCss(v)} />
            {Array.from({ length: 6 }, (_, k) => (
              <circle
                key={k}
                cx={cx - r + (((k * 41) % 11) / 11) * w + w / 22}
                cy={bottom - hs + (((k * 29) % 7) / 7) * hs}
                r={w * 0.07}
                fill="#000"
                opacity={0.14}
              />
            ))}
          </>
        ) : null}
        {v.nails > 0 ? <Nails cx={cx} top={top} bottom={bottom} w={w} v={v} /> : null}

        {/* Fumes off the heated solid: steam while the water of crystallisation
            is leaving, sulphur dioxide once it is hot enough to decompose. */}
        {Array.from({ length: fume.count }, (_, k) => (
          <ellipse
            key={`f${k}`}
            className={RISE_CLASS}
            cx={cx - w * 0.16 + (((k * 311) % 97) / 97) * w * 0.32}
            cy={Math.min(surf, bottom - hs) - 4 - riseOffset(fume, k)}
            rx={w * 0.19 + (((k * 53) % 11) / 11) * w * 0.08}
            ry={w * 0.12}
            fill="#e7eef0"
            opacity={0.22}
            style={riseStyle(fume)}
          />
        ))}
      </g>

      <path d={glass} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth={1.4} />
      <line
        x1={cx - r + w * 0.2}
        y1={top + 6}
        x2={cx - r + w * 0.2}
        y2={bottom - r}
        stroke="#fff"
        strokeWidth={w * 0.07}
        opacity={0.22}
      />
      <ellipse cx={cx} cy={top} rx={r + 1} ry={w * 0.09} fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={1.4} />

      {v.burst ? (
        <>
          <path
            d={`M${cx - r} ${top + 30} l${w * 0.4} ${w * 0.5} l${-w * 0.25} ${w * 0.4} l${w * 0.6} ${w * 0.3}`}
            fill="none"
            stroke="#ffd0c6"
            strokeWidth={1.6}
          />
          <path d={`M${cx + r} ${top + 46} l${-w * 0.35} ${w * 0.35}`} fill="none" stroke="#ffd0c6" strokeWidth={1.4} />
        </>
      ) : v.cracked ? (
        <path
          d={`M${cx - r} ${bottom - w} l${w * 0.45} ${-w * 0.35} l${-w * 0.2} ${-w * 0.3}`}
          fill="none"
          stroke="#ffd0c6"
          strokeWidth={1.4}
        />
      ) : null}

      {v.stopper ? (
        <>
          <rect
            x={cx - r * 0.9}
            y={top - w * 0.42}
            width={w * 0.9}
            height={w * 0.5}
            rx={w * 0.1}
            fill="#b98b55"
            stroke="#6f5027"
            strokeWidth={1}
          />
          <rect x={cx - r * 0.72} y={top - w * 0.56} width={w * 0.72} height={w * 0.2} rx={w * 0.06} fill="#cfa06a" />
        </>
      ) : null}

      {thermo ? (
        <Thermometer
          x={cx + (big ? w * 0.34 : w * 0.3)}
          top={top - (big ? 44 : 30)}
          bulbY={bottom - 10}
          w={big ? 9 : 6}
          T={tempOf(v)}
        />
      ) : null}
    </Box>
  );
}

/** Two nails, with however much copper has plated onto them so far. */
function Nails({
  cx,
  top,
  bottom,
  w,
  v,
}: {
  cx: number;
  top: number;
  bottom: number;
  w: number;
  v: Vessel;
}): React.ReactElement {
  const frac = v.cuso40 > 0 ? Math.min(1, v.cu / v.cuso40) : 0;
  const op = frac < 0.05 ? 0 : Math.min(0.95, 0.3 + frac * 1.5);
  const len = Math.min(bottom - top - 14, w * 2.9);
  const sw = Math.max(2.4, w * 0.1);

  return (
    <>
      {[0, 1].map((n) => {
        const ang = n ? 9 : -7;
        const x = cx + (n ? w * 0.16 : -w * 0.17);
        const y1 = bottom - 6;
        const y0 = y1 - len;
        return (
          <g key={n} transform={`rotate(${ang} ${x} ${y1})`}>
            <rect x={x - sw / 2} y={y0} width={sw} height={len - sw} fill="#6f747a" />
            <polygon points={`${x - sw / 2},${y1 - sw} ${x + sw / 2},${y1 - sw} ${x},${y1}`} fill="#6f747a" />
            <rect x={x - sw * 1.1} y={y0 - sw * 0.7} width={sw * 2.2} height={sw * 0.8} rx={sw * 0.2} fill="#82878d" />
            <rect x={x - sw / 2 + sw * 0.15} y={y0 + 2} width={sw * 0.25} height={len - sw - 4} fill="#fff" opacity={0.3} />
            {op > 0 ? (
              // The copper thickens as the displacement runs; the opacity is
              // the fraction of the sulphate displaced, carried rather than
              // stepped, so the plating is watched arriving over the minutes
              // the reaction actually takes.
              <>
                <rect
                  className={TRACK_CLASS}
                  x={x - sw / 2 - 0.5}
                  y={y0 + len * 0.12}
                  width={sw + 1}
                  height={len * 0.88 - sw}
                  fill="#b0562c"
                  opacity={op.toFixed(2)}
                />
                {Array.from({ length: 5 }, (_, q) => (
                  <circle
                    key={q}
                    className={TRACK_CLASS}
                    cx={x - sw / 2 + (((q * 31) % 9) / 9) * sw}
                    cy={y0 + len * 0.2 + (((q * 47) % 83) / 83) * len * 0.7}
                    r={sw * 0.34}
                    fill="#8f3d1a"
                    opacity={op.toFixed(2)}
                  />
                ))}
              </>
            ) : null}
          </g>
        );
      })}
    </>
  );
}

/** A laboratory thermometer, −10 to 110 °C. Past that the bulb bursts. */
export function Thermometer({
  x,
  top,
  bulbY,
  w,
  T,
}: {
  x: number;
  top: number;
  bulbY: number;
  w: number;
  T: number;
}): React.ReactElement {
  const lo = -10;
  const f = Math.max(0, Math.min(1, (T - lo) / (THERMO_MAX - lo)));
  const col = top + 8;
  const span = bulbY - 8 - col;
  return (
    <>
      <rect
        x={x - w / 2}
        y={top}
        width={w}
        height={bulbY - top}
        rx={w / 2}
        fill="rgba(255,255,255,.16)"
        stroke="rgba(255,255,255,.55)"
        strokeWidth={1}
      />
      <rect x={x - w * 0.22} y={col + span * (1 - f)} width={w * 0.44} height={span * f + 4} fill="#cf2d22" />
      <circle cx={x} cy={bulbY} r={w * 0.72} fill="#cf2d22" stroke="rgba(255,255,255,.5)" />
    </>
  );
}

/** The burner's flame. `y` is the mouth; the tip licks the tube above it. */
export function Flame({ x, y, gradient }: { x: number; y: number; gradient: string }): React.ReactElement {
  return (
    <>
      <path
        d={`M${x} ${y - 30} C${x - 11} ${y - 18} ${x - 9} ${y - 4} ${x} ${y} C${x + 9} ${y - 4} ${x + 11} ${y - 18} ${x} ${y - 30} Z`}
        fill={`url(#${gradient})`}
        opacity={0.92}
      />
      <path
        d={`M${x} ${y - 18} C${x - 5} ${y - 11} ${x - 4} ${y - 3} ${x} ${y} C${x + 4} ${y - 3} ${x + 5} ${y - 11} ${x} ${y - 18} Z`}
        fill="#cfe8ff"
        opacity={0.85}
      />
    </>
  );
}
