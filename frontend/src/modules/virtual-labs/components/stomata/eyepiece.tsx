'use client';

import * as React from 'react';

import { cellPath, fieldPalette, peelOutlinePath, stomaShape, type FieldPalette } from '@labs/lib/stomata/draw';
import {
  MM,
  OBJ,
  contrast,
  fieldCells,
  mountRideDeg,
  sharpness,
  type FieldCell,
  type MicState,
  type SlideState,
} from '@labs/lib/stomata/peel';

import { RIDE_CLASS, rideStyle } from '../bench-motion';

/**
 * What is down the eyepiece.
 *
 * Nothing here is scripted: the cells are the ones the peel really has, stained
 * the colour the safranin actually made them, blurred by however far the stage
 * is from focus, with the bubbles painted over the top of whatever they hide.
 * The same `fieldCells` the marking counts is the one this draws, so a student
 * can always count what the marking will compare against.
 *
 * Drawn into a square of `EYE.size` units; the caller decides how big that is.
 * The bench shows it on the microscope and the console docks a magnified copy
 * beside the count, the way the meter close-up works on the Ohm's law bench.
 *
 * AND IT RIDES. The peel, the bubbles over it and the torn edge round it are
 * one group, and that group turns slowly about the centre of the field by the
 * angle `mountRideDeg` reads off the slide — a settled mount barely, a mount
 * whose excess was never blotted several times as far, a dry one not at all.
 * Turning the whole mount about the optical axis is the one rigid motion that
 * cannot change what is in the field: every cell stays at the radius it was at,
 * so `visibleStomata` and the drawing agree at every instant rather than on
 * average, and a bubble in the same group hides the cells it was already
 * hiding. Nothing here decides how far it rides; `peel.ts` does, from the same
 * `floatingCover` that caps how sharp it will ever come.
 */
export const EYE = { size: 260, cx: 130, cy: 130, r: 124 } as const;

/** The lamp-lit field, the glass, the trapped air: apparatus, not interface. */
const FIELD_GROUND = '#f7f3ec';
const BROKEN_GROUND = '#e7e2d8';
const CRACK = '#3a3733';
const BUBBLE_GLASS = '#efe9dc';
const BUBBLE_RIM = '#1b1713';
const CAPTION = '#8b9490';
const DRY_RING = '#2b1d12';
const CURL = '#6b4a33';

/** One path for every ordinary epidermal cell: 700 of them at low power. */
function epidermisPath(cells: readonly FieldCell[], ox: number, oy: number, k: number, cr: number, hi: boolean, shrink: number): string {
  let d = '';
  for (const f of cells) {
    const c = f.cell;
    if (c.stoma) continue;
    const x = ox + c.x * k;
    const y = oy + c.y * k;
    const r = cr * c.sz * shrink;
    if (hi) d += cellPath(x, y, r, c.a, c.k);
    // At 10× an epidermal cell is a few pixels across: a faint ring is
    // honestly all it is, and one path for the lot keeps the field cheap.
    else d += `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(r * 2).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-r * 2).toFixed(1)} 0`;
  }
  return d;
}

/** At low power a stoma is a dark slit in a pale bean — not a resolved cell. */
function stomataLowPath(cells: readonly FieldCell[], ox: number, oy: number, k: number, cr: number): { beans: string; pores: string } {
  let beans = '';
  let pores = '';
  for (const f of cells) {
    const c = f.cell;
    if (!c.stoma) continue;
    const x = ox + c.x * k;
    const y = oy + c.y * k;
    const rx = cr * c.sz * 1.5;
    const ry = rx * 0.62;
    const deg = Math.round((c.a * 180) / Math.PI);
    const px = rx * Math.cos(c.a);
    const py = rx * Math.sin(c.a);
    beans +=
      `M${(x - px).toFixed(1)} ${(y - py).toFixed(1)}` +
      `a${rx.toFixed(1)} ${ry.toFixed(1)} ${deg} 1 0 ${(px * 2).toFixed(1)} ${(py * 2).toFixed(1)}` +
      `a${rx.toFixed(1)} ${ry.toFixed(1)} ${deg} 1 0 ${(-px * 2).toFixed(1)} ${(-py * 2).toFixed(1)}`;
    pores +=
      `M${(x - px * 0.7).toFixed(1)} ${(y - py * 0.7).toFixed(1)}` +
      `L${(x + px * 0.7).toFixed(1)} ${(y + py * 0.7).toFixed(1)}`;
  }
  return { beans, pores };
}

/** One stoma at high power: two guard cells, the pore, and the chloroplasts. */
function Stoma({ x, y, L, angle, C, detail }: { x: number; y: number; L: number; angle: number; C: FieldPalette; detail: boolean }): React.ReactElement {
  const shape = stomaShape(L);
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${Math.round((angle * 180) / Math.PI)})`}>
      {shape.guards.map((d, i) => (
        <path key={i} d={d} fill={C.guard} stroke={C.gwall} strokeWidth={shape.strokeWidth} strokeOpacity={C.op} />
      ))}
      <path d={shape.pore} fill={C.pore} fillOpacity={0.35 + C.op * 0.6} />
      {detail
        ? shape.chloroplasts.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r={c.r} fill={C.chl} opacity={0.85} />)
        : null}
    </g>
  );
}

export function FieldOfView({ slide, mic }: { slide: SlideState; mic: MicState }): React.ReactElement {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const view = React.useMemo(() => ({ slide, mic }), [slide, mic]);
  const o = OBJ[mic.obj];
  const hi = mic.obj === 40;
  const k = EYE.r / o.fieldR;
  const sharp = sharpness(view);
  const C = fieldPalette(slide.stain, contrast(view));

  const cells = React.useMemo(() => (slide.peel ? fieldCells(view) : []), [view, slide.peel]);

  const ground = (
    <circle cx={EYE.cx} cy={EYE.cy} r={EYE.r} fill={FIELD_GROUND} />
  );

  if (!slide.onStage) {
    return (
      <>
        {ground}
        <text x={EYE.cx} y={EYE.cy} fontSize={14} textAnchor="middle" fill={CAPTION}>
          no slide on the stage
        </text>
      </>
    );
  }

  if (slide.broken || !slide.peel) {
    return (
      <>
        <defs>
          <clipPath id={`${uid}clip`}>
            <circle cx={EYE.cx} cy={EYE.cy} r={EYE.r} />
          </clipPath>
        </defs>
        {ground}
        <g clipPath={`url(#${uid}clip)`}>
          {slide.broken ? (
            <>
              <rect x={EYE.cx - EYE.r} y={EYE.cy - EYE.r} width={EYE.r * 2} height={EYE.r * 2} fill={BROKEN_GROUND} />
              <path d={`M${EYE.cx - 132} ${EYE.cy - 36}l62 23l-19 30l76 16l-36 37l85 9`} fill="none" stroke={CRACK} strokeWidth={4.5} />
              <path d={`M${EYE.cx - 53} ${EYE.cy - 132}l14 81l-41 28l53 71`} fill="none" stroke={CRACK} strokeWidth={3.5} />
            </>
          ) : null}
        </g>
        <text x={EYE.cx} y={slide.broken ? EYE.cy + 100 : EYE.cy} fontSize={13} fontWeight={700} textAnchor="middle" fill={slide.broken ? '#b03a3a' : CAPTION}>
          {slide.broken ? 'THE SLIDE IS CRACKED' : 'nothing on the slide'}
        </text>
      </>
    );
  }

  const ox = EYE.cx - mic.cx * k;
  const oy = EYE.cy - mic.cy * k;
  const cr = MM.CELL * 0.55 * k;
  const lw = Math.max(0.5, k * 0.0022);
  const shrink = slide.dry ? 0.86 : 1;
  const blur = (1 - sharp) * (hi ? 13 : 5);
  const low = stomataLowPath(cells, ox, oy, k, cr);

  const layer = (dx: number, dy: number, opacity: number, key: string): React.ReactElement => (
    <g key={key} transform={`translate(${dx.toFixed(1)} ${dy.toFixed(1)})`} opacity={opacity}>
      <path
        d={epidermisPath(cells, ox, oy, k, cr, hi, shrink)}
        fill={hi ? C.fill : 'none'}
        stroke={C.wall}
        strokeWidth={hi ? lw * 2.2 : lw * 1.6}
        strokeOpacity={hi ? C.op : C.op * 0.8}
      />
      {hi ? (
        cells
          .filter((f) => f.cell.stoma)
          .map((f) => (
            <Stoma
              key={f.cell.k}
              x={ox + f.cell.x * k}
              y={oy + f.cell.y * k}
              L={cr * f.cell.sz * shrink * 3}
              angle={f.cell.a}
              C={C}
              detail={sharp > 0.3}
            />
          ))
      ) : (
        <>
          <path d={low.beans} fill={C.guard} fillOpacity={0.35 + C.op * 0.55} stroke={C.gwall} strokeWidth={lw * 1.4} strokeOpacity={C.op} />
          <path d={low.pores} fill="none" stroke={C.pore} strokeWidth={Math.max(0.8, cr * 0.5)} strokeOpacity={0.4 + C.op * 0.5} strokeLinecap="round" />
        </>
      )}
      {slide.dry && hi ? (
        <path
          d={epidermisPath(cells, ox, oy, k, cr * 1.05, false, shrink)}
          fill="none"
          stroke={DRY_RING}
          strokeWidth={lw * 1.6}
          strokeOpacity={0.45}
        />
      ) : null}
    </g>
  );

  const body = (
    <>
      <path
        d={peelOutlinePath(slide.peel, ox, oy, k)}
        fill={C.wash}
        stroke={C.wall}
        strokeWidth={Math.max(1, k * 0.006)}
        strokeOpacity={C.op * 0.8}
      />
      {/* A peel several cells thick has layers under it that no focus setting
          brings in together — the reason a thick piece never looks right. */}
      {slide.peel.thick ? [layer(cr * 0.55, -cr * 0.4, 0.4, 'under1'), layer(-cr * 0.5, cr * 0.35, 0.4, 'under2')] : null}
      {layer(0, 0, 1, 'main')}
      {slide.peel.curled ? (
        <rect
          x={ox - 0.1 * k}
          y={EYE.cy - EYE.r}
          width={0.3 * k}
          height={EYE.r * 2}
          fill={CURL}
          opacity={0.3}
          transform={`rotate(-12 ${ox.toFixed(1)} ${EYE.cy})`}
        />
      ) : null}
    </>
  );

  return (
    <>
      <defs>
        <clipPath id={`${uid}clip`}>
          <circle cx={EYE.cx} cy={EYE.cy} r={EYE.r} />
        </clipPath>
        {blur > 0.12 ? (
          <filter id={`${uid}blur`} x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation={blur.toFixed(1)} />
          </filter>
        ) : null}
      </defs>
      {ground}
      <g clipPath={`url(#${uid}clip)`}>
        <g className={RIDE_CLASS} style={rideStyle({ deg: mountRideDeg(view), about: [EYE.cx, EYE.cy] })}>
          {blur > 0.12 ? <g filter={`url(#${uid}blur)`}>{body}</g> : body}
          {slide.bubbles.map((b, i) => {
            const x = ox + b.x * k;
            const y = oy + b.y * k;
            const r = b.r * k;
            if (Math.hypot(x - EYE.cx, y - EYE.cy) > EYE.r + r) return null;
            return (
              <g key={i}>
                <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r={r.toFixed(1)} fill={BUBBLE_GLASS} />
                <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r={(r * 0.86).toFixed(1)} fill="none" stroke={BUBBLE_RIM} strokeWidth={(r * 0.3).toFixed(1)} opacity={0.85} />
                <circle cx={(x - r * 0.3).toFixed(1)} cy={(y - r * 0.32).toFixed(1)} r={(r * 0.2).toFixed(1)} fill="#fff" opacity={0.8} />
              </g>
            );
          })}
        </g>
        {/* The dark rim of the tube. It is the objective, not the mount: it
            does not ride, and it is outside the group that does. */}
        <circle cx={EYE.cx} cy={EYE.cy} r={EYE.r} fill="none" stroke="#000" strokeWidth={24} opacity={0.12} />
      </g>
    </>
  );
}

/** The line under the field: which lens, what it comes to, and how wide it is. */
export function fieldCaption(mic: MicState): string {
  return `OBJECTIVE ${OBJ[mic.obj].name} · TOTAL ${mic.obj * 10}× · FIELD ${(OBJ[mic.obj].fieldR * 2).toFixed(2)} mm`;
}
