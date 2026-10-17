'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { keyframes } from '@mui/system';

import { cellPath, peelOutlinePath } from '@labs/lib/stomata/draw';
import { MM, OBJ, liquidOn, type MicState, type SlideState } from '@labs/lib/stomata/peel';

import { apparatus, LABEL_FONT } from '../apparatus-palette';
import { benchMotionSx, motionSx, useBenchMotion } from '../bench-motion';

/**
 * THE SLIDE, CLOSE UP — the plan view, with the field of view drawn on it, and
 * a detail strip underneath.
 *
 * The eyepiece answers "what is under the lens". This answers the three things
 * it cannot, and each of them is a thing students get wrong:
 *
 * 1. **Where on the slide you are looking.** The dashed circle is the objective's
 *    real field, at its real size, in the place the stage has actually carried
 *    it to — 1.52 mm across at 10× on a 6.7 mm drop. Pan the stage and it moves.
 *    Nothing else on this bench makes "centre it at low power first" visible:
 *    from inside the eyepiece a field off the edge of the peel and a field on a
 *    bare patch look identical.
 * 2. **What a coverslip lowered at an angle actually does.** In plan view, on
 *    the bench and down the eyepiece, "lowered on a needle" and "dropped flat"
 *    are the same square of glass with different numbers of bubbles under it.
 *    The SECTION is the only view in which the two are different pictures: one
 *    shows a wedge of liquid running out ahead of the falling glass, the other
 *    a flat face landing on air with nowhere to go.
 * 3. **That the stain arrives from the edge.** Safranin has to diffuse in
 *    through the walls; it does not appear everywhere at once.
 *
 * THE NO-LEAK RULE. This draws the APPARATUS, never the observation. It shows
 * the peel's outline, the drop, the coverslip, the bubbles and where the field
 * is — all of which the student put there and the bench already shows them.
 * The magnified strip is a GENERIC patch of epidermis at the stain that was
 * actually used, not this peel's cells: it says what safranin does to a cell
 * wall, and it contains no stomata at all, so it can neither be counted nor
 * mistaken for the field. What the field shows stays in the eyepiece, where the
 * student has to look at it.
 */

const PLAN = { w: 260, h: 288 } as const;
/** Pixels per millimetre in the plan view. The slide is 228 units across. */
const K = 30;
const CX = 130;
const CY = 104;

/**
 * The stain front creeping in from the rim of the drop.
 *
 * `r` is animated as a CSS property, which a browser that does not support it
 * simply ignores — leaving the circle at the `r` ATTRIBUTE below, which is the
 * finished state. So the picture is right either way and only the sweep is lost.
 */
const soakIn = keyframes`from { r: 6px; } to { r: 150px; }`;
/** The coverslip coming down, hinged on the edge that touches first. */
const lowerOnNeedle = keyframes`from { transform: rotate(-13deg); } to { transform: rotate(0deg); }`;
const dropFlat = keyframes`from { transform: translateY(-14px); } to { transform: translateY(0); }`;

function Stencil({
  x,
  y,
  children,
  anchor = 'start',
  fill = apparatus.benchLabel,
  size = 7.5,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  anchor?: 'start' | 'middle' | 'end';
  fill?: string;
  size?: number;
}): React.ReactElement {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      textAnchor={anchor}
      fill={fill}
      fontFamily={LABEL_FONT}
      fontWeight={700}
      letterSpacing={0.55}
    >
      {children}
    </text>
  );
}

// ---------------------------------------------------------------------------
// The detail strip
// ---------------------------------------------------------------------------

const STRIP = { x: 8, y: 194, w: 244, h: 88 } as const;

/**
 * Before the coverslip: a patch of epidermis at the magnification of the 40×,
 * with the safranin front sweeping across it.
 *
 * Three rows of thirteen generic cells and NO stomata — this is what a stained
 * cell wall looks like, not what is on the slide.
 */
function PeelPatch({ stain }: { stain: number }): React.ReactElement {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const stained = stain > 0;
  const over = stain >= 4;
  const wall = over ? '#3d0a17' : '#a8324e';
  const fill = over ? '#c04d6c' : '#fbe7eb';

  const cells = (stroke: string, paint: string): React.ReactElement[] => {
    const out: React.ReactElement[] = [];
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 13; c += 1) {
        const x = STRIP.x + 10 + c * 20 + (r % 2 ? 10 : 0);
        const y = STRIP.y + 34 + r * 21;
        out.push(
          <path
            key={`${r}-${c}`}
            d={cellPath(x, y, 13, ((c * 3 + r * 5) % 7) * 0.4, c * 5 + r * 13)}
            fill={paint}
            stroke={stroke}
            strokeWidth={1.7}
          />,
        );
      }
    }
    return out;
  };

  return (
    <>
      <Stencil x={STRIP.x + 8} y={STRIP.y + 15}>
        THE PEEL, MAGNIFIED
      </Stencil>
      <Stencil
        x={STRIP.x + STRIP.w - 8}
        y={STRIP.y + 15}
        anchor="end"
        fill={stained ? '#e8859f' : apparatus.benchLabel}
      >
        {stained ? (over ? 'DROWNED IN SAFRANIN' : 'SAFRANIN SOAKING IN') : 'ALMOST COLOURLESS'}
      </Stencil>
      <defs>
        <clipPath id={`${uid}patch`}>
          <rect x={STRIP.x + 5} y={STRIP.y + 20} width={STRIP.w - 10} height={STRIP.h - 26} rx={6} />
        </clipPath>
        {stained ? (
          <mask id={`${uid}front`} maskUnits="userSpaceOnUse" x={STRIP.x} y={STRIP.y} width={STRIP.w} height={STRIP.h}>
            <rect x={STRIP.x} y={STRIP.y} width={STRIP.w} height={STRIP.h} fill="#000" />
            {/* The front advances from the rim of the drop, on the left. Keyed
                by the drop count so another drop starts another front, rather
                than a finished animation sitting still on a changed picture. */}
            <circle
              key={stain}
              className="soak"
              cx={STRIP.x + 10}
              cy={STRIP.y + 46}
              r={150}
              fill="#fff"
              style={{ animation: `${soakIn} 2.6s ease-out` }}
            />
          </mask>
        ) : null}
      </defs>
      <g clipPath={`url(#${uid}patch)`}>
        <rect x={STRIP.x + 5} y={STRIP.y + 20} width={STRIP.w - 10} height={STRIP.h - 26} fill="#f2efe6" />
        {cells('#7d8a72', '#eef3ea')}
        {stained ? <g mask={`url(#${uid}front)`}>{cells(wall, fill)}</g> : null}
      </g>
    </>
  );
}

/**
 * After the coverslip: the mount in SECTION.
 *
 * The only view in which lowering the glass on a needle and dropping it flat
 * are different pictures rather than the same square with a different bubble
 * count.
 */
function MountSection({ slide }: { slide: SlideState }): React.ReactElement {
  const angle = slide.cover?.angle ?? false;
  const px = STRIP.x + 66;
  const L = 92;
  const BY = STRIP.y + 55;
  const SY = BY + 8;
  const wet = liquidOn(slide) > 0;
  const liquid = slide.stain ? 'rgba(198,70,105,.85)' : 'rgba(150,200,225,.8)';
  const k2 = L / (MM.PEEL_W + 0.5);

  return (
    <>
      <Stencil x={STRIP.x + 8} y={STRIP.y + 15}>
        THE MOUNT FROM THE SIDE
      </Stencil>
      <Stencil x={STRIP.x + STRIP.w - 8} y={STRIP.y + 15} anchor="end" fill={angle ? '#8fd0ff' : '#ff8f88'}>
        {angle ? 'LOWERED ON THE NEEDLE' : 'DROPPED FLAT'}
      </Stencil>

      <rect x={STRIP.x + 12} y={SY + 1} width={STRIP.w - 24} height={8} fill="rgba(210,235,245,.45)" />
      <Stencil x={STRIP.x + 12} y={SY + 19} fill="#5d6a66" size={7.5}>
        SLIDE
      </Stencil>

      {/* The meniscus the advancing liquid climbs, on the side the glass met first. */}
      {wet ? (
        <path d={`M${px - 4} ${SY} Q${px + 12} ${BY - 9} ${px + 30} ${SY} Z`} fill={liquid} opacity={0.55} />
      ) : null}
      <rect x={px} y={BY} width={L} height={9} fill={liquid} />
      <rect
        x={px + 12}
        y={BY + 3}
        width={L - 24}
        height={3}
        fill={slide.stain ? '#f093ab' : '#e2efe6'}
      />
      <Stencil x={px + L / 2} y={SY + 19} anchor="middle" fill="#5d6a66" size={7.5}>
        THE PEEL, IN THE LIQUID
      </Stencil>

      {/* Air driven out ahead of the falling glass — only when it was lowered. */}
      {angle ? (
        <g>
          {[0, 10, 20].map((d) => (
            <path
              key={d}
              d={`M${px + 8 + d} ${BY - 15} l7 5 l-7 5`}
              fill="none"
              stroke="#bfe6ff"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          ))}
          <Stencil x={px + 20} y={BY - 21} anchor="middle" fill="#bfe6ff" size={7.5}>
            AIR PUSHED OUT
          </Stencil>
        </g>
      ) : (
        <Stencil x={px + L / 2} y={BY - 21} anchor="middle" fill="#ff8f88" size={7.5}>
          AIR SEALED IN
        </Stencil>
      )}

      <g
        className="slip"
        style={{
          transformOrigin: `${px + L}px ${BY}px`,
          animation: `${angle ? lowerOnNeedle : dropFlat} 1.4s ease-in`,
        }}
      >
        <rect x={px} y={BY - 5} width={L} height={5} fill="rgba(255,255,255,.26)" stroke="rgba(255,255,255,.9)" strokeWidth={1} />
        <Stencil x={px + L / 2} y={BY - 9} anchor="middle" fill="#9fb0ab" size={7}>
          COVERSLIP
        </Stencil>
        {angle ? (
          <>
            <line x1={px + L - 10} y1={BY - 6} x2={px + L + 12} y2={BY - 26} stroke="#dfe6e3" strokeWidth={2.4} strokeLinecap="round" />
            <circle cx={px + L + 13} cy={BY - 27} r={2.6} fill="#8a5a3c" />
          </>
        ) : null}
      </g>

      {slide.bubbles.map((b, i) => {
        const bx = px + L / 2 + b.x * k2;
        if (bx < px + 4 || bx > px + L - 4) return null;
        return (
          <circle
            key={i}
            cx={bx.toFixed(1)}
            cy={(BY + 4.5).toFixed(1)}
            r={Math.min(4, Math.max(2.6, b.r * k2 * 0.85)).toFixed(1)}
            fill="#f7f3ea"
            stroke="#0c1110"
            strokeWidth={1.5}
          />
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// The plan view
// ---------------------------------------------------------------------------

export function SlideCloseUp({
  slide,
  mic,
  maxWidth,
  compact = false,
}: {
  slide: SlideState;
  mic: MicState;
  maxWidth?: number;
  /**
   * Beside the magnified eyepiece rather than instead of it: the plan view
   * alone, without the section strip or the caption.
   *
   * Once the slide is on the stage the eyepiece is the thing being read and it
   * must keep the column; what is still worth a corner of it is WHERE the field
   * is — which is exactly the half of this panel the strip is not.
   */
  compact?: boolean;
}): React.ReactElement {
  const theme = useTheme();
  const moving = useBenchMotion();
  const liq = liquidOn(slide);
  const strip = slide.peel !== null && !compact;
  const fieldR = OBJ[mic.obj].fieldR * K;
  const fx = CX + mic.cx * K;
  const fy = CY + mic.cy * K;

  return (
    <Box
      data-tour="st-closeup"
      sx={{ maxWidth, mx: 'auto', width: '100%', ...benchMotionSx, ...motionSx(moving) }}
    >
      <svg
        viewBox={`0 0 ${PLAN.w} ${strip ? PLAN.h : 200}`}
        role="img"
        aria-label={
          `The slide from above: ${
            slide.peel ? `a peel of ${slide.peel.surface} epidermis` : 'no peel'
          }, ${liq ? `${liq} drop${liq === 1 ? '' : 's'} of liquid` : 'dry'}, ${
            slide.cover
              ? `coverslip ${slide.cover.angle ? 'lowered at an angle' : 'dropped flat'} with ${
                  slide.bubbles.length
                } bubbles under it`
              : 'no coverslip'
          }${slide.onStage ? ', on the microscope stage' : ''}`
        }
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        <rect width={PLAN.w} height={PLAN.h} fill="#131a19" />
        <rect x={16} y={44} width={228} height={120} rx={4} fill="rgba(210,235,245,.12)" stroke="rgba(255,255,255,.5)" />
        <Stencil x={PLAN.w / 2} y={30} anchor="middle">
          THE SLIDE, FROM ABOVE
        </Stencil>

        {liq > 0 ? (
          <ellipse
            cx={CX}
            cy={CY}
            rx={40 + liq * 6}
            ry={26 + liq * 4}
            fill={slide.stain ? 'rgba(200,60,92,.3)' : 'rgba(150,200,225,.28)'}
          />
        ) : null}

        {slide.peel ? (
          <path
            d={peelOutlinePath(slide.peel, CX, CY, K)}
            fill={slide.stain ? 'rgba(214,90,120,.55)' : 'rgba(226,238,224,.45)'}
            stroke="rgba(255,255,255,.5)"
          />
        ) : null}

        {slide.cover ? (
          <>
            <rect x={CX - 48} y={CY - 36} width={96} height={72} rx={1} fill="rgba(255,255,255,.09)" stroke="rgba(255,255,255,.7)" strokeWidth={1.2} />
            {slide.bubbles.map((b, i) =>
              Math.abs(b.x * K) > 48 || Math.abs(b.y * K) > 36 ? null : (
                <circle
                  key={i}
                  cx={(CX + b.x * K).toFixed(1)}
                  cy={(CY + b.y * K).toFixed(1)}
                  r={Math.max(2, b.r * K).toFixed(1)}
                  fill="rgba(255,255,255,.5)"
                  stroke="#0c1110"
                  strokeWidth={1.4}
                />
              ),
            )}
          </>
        ) : null}

        {slide.broken ? (
          <path d="M16 70 L90 96 L150 60 L244 110" stroke="#ff8f88" strokeWidth={2.5} fill="none" />
        ) : null}

        {/* WHERE YOU ARE LOOKING. The objective's real field, at its real size,
            where the stage has actually carried it. */}
        {slide.onStage ? (
          <g>
            <circle cx={fx.toFixed(1)} cy={fy.toFixed(1)} r={fieldR.toFixed(1)} fill="none" stroke={apparatus.hintRing} strokeWidth={1.6} strokeDasharray="4 3" />
            <text
              x={fx.toFixed(1)}
              y={(fy - fieldR - 6).toFixed(1)}
              fontSize={9}
              textAnchor="middle"
              fill={apparatus.hintRing}
              fontFamily={LABEL_FONT}
            >
              field of view
            </text>
          </g>
        ) : null}

        <text x={PLAN.w / 2} y={188} fontSize={10} textAnchor="middle" fill="#76837f" fontFamily={LABEL_FONT}>
          {slide.onStage ? `on the stage · ${OBJ[mic.obj].name}` : 'on the bench'}
        </text>

        {strip ? (
          <>
            <rect x={STRIP.x} y={STRIP.y} width={STRIP.w} height={STRIP.h} rx={9} fill="#0b100f" stroke="rgba(255,255,255,.09)" />
            {slide.cover ? <MountSection slide={slide} /> : <PeelPatch stain={slide.stain} />}
          </>
        ) : null}
      </svg>

      {compact ? null : (
        <Typography sx={{ mt: 0.75, fontSize: theme.band.type.min, color: theme.brand.tert, textWrap: 'pretty' }}>
          {slide.onStage
            ? 'The dashed circle is what the objective can see, drawn where the stage has carried it. Move the stage and watch it move.'
            : slide.cover
              ? 'In section, a coverslip lowered on a needle and one dropped flat are not the same picture.'
              : 'The safranin has to diffuse in from the edge of the drop — it does not arrive everywhere at once.'}
        </Typography>
      )}
    </Box>
  );
}
