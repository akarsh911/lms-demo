'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/system';
import { ChevronRight } from 'lucide-react';

import { RichText } from '@/components/ui';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

import { resolveRect } from './guided-tour';
import type { TourRect, TourStep } from './types';

/**
 * THE VISUAL TRAINER: the bench doing it, one step at a time.
 *
 * "Show me this step" is not a tour. A tour tells a student what to try; this
 * DOES it in front of them. A pointer moves to a control, presses it, the bench
 * actually responds, and the commentary says why — then the bench goes back
 * exactly as it was.
 *
 * The doing is automatic and the pacing is not: each step performs itself the
 * moment it opens and then waits for Next. See 2 below for why.
 *
 * Three things this runner has to get right, and each was got wrong first:
 *
 * 1. WHERE IT POINTS. A step names a control sometimes ("tap Put down") and a
 *    whole area other times ("the shelf of bottles"). A dot dropped in the
 *    middle of an AREA lands in empty space and reads as a bug — so the dot is
 *    drawn only when the target is small enough to be a thing you could press.
 *    An area gets the outline alone, which is what an area means.
 *
 * 2. HOW LONG IT STAYS: until the student says otherwise.
 *
 *    It used to hold each step for as long as its own commentary took to read,
 *    at an assumed reading speed, with a Pause for when that assumption was
 *    wrong. It was wrong constantly. A countdown running under something you
 *    are trying to understand is a pressure to stop understanding it, and a
 *    student who looks from the card to the apparatus and back — which is
 *    exactly what a demonstration is asking them to do — comes back to find the
 *    thing they were reading gone. Pause only turns a bad default into a chore.
 *
 *    So the ACTION still plays itself and the PACE is the student's. Each step
 *    performs its demonstration the moment it opens, the bench responds, and
 *    then it waits. Nothing moves on until Next.
 *
 *    There is deliberately no Back. Going back would remount the step's content
 *    and demonstrations DO things — a wire would be laid twice, a bottle poured
 *    twice — so "back" would not undo a step, it would repeat it onto a bench
 *    that had already had it. Stop gives the bench back untouched, which is the
 *    honest way out.
 *
 * 3. WHERE THE WORDS ARE. Pinned to the bottom of the screen they sit far from
 *    the thing they describe, and the eye cannot watch both. The commentary
 *    follows the target instead, and is kept off it.
 *
 * Under `prefers-reduced-motion` nothing glides, but every step still happens
 * in order and the words are still readable: the demonstration is the content,
 * not the movement.
 */

const press = keyframes`
  0%   { transform: translate(-50%, -50%) scale(1); }
  45%  { transform: translate(-50%, -50%) scale(0.62); }
  100% { transform: translate(-50%, -50%) scale(1); }
`;

/**
 * The WORDS change; the card does not flinch.
 *
 * An earlier version keyed the whole card on the step index, so every step tore
 * the old card down and built a new one somewhere else. It read as a teleport —
 * and against a spotlight that was gliding smoothly at the same moment, the two
 * movements plainly disagreed. Now one card lives for the whole run and TRAVELS
 * on a transform, and only its contents are replaced. This is the replacement:
 * the new text comes up while the box is still moving, so the eye follows the
 * box and finds the words already there when it arrives.
 */
const textIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
`;

/**
 * ONE duration and ONE curve for everything that moves.
 *
 * The spotlight used to slide on one timing and resize on another, so a target
 * that was both further away and a different shape appeared to drift and then
 * change shape — two movements where the student is being shown one. The card,
 * the outline and the pointer now share these, and read as a single gesture.
 */
const GLIDE_MS = 560;
const EASE = 'cubic-bezier(.32,.72,0,1)';
const PRESS_MS = 220;

/** Below this a target is a CONTROL and gets the pointer; above it, an AREA. */
const POINTABLE = 190;

/**
 * Above this in either direction, a target is too big to stand beside.
 *
 * A card chasing a whole circuit, a whole rack or a whole drawing board has
 * nowhere to stand that is both near it and off it, so it ends up wherever
 * there is room — and "wherever there is room" is a different corner for every
 * step, which is most of the jumping a student sees. For those, the card takes
 * a fixed home and STAYS there while the spotlight does the work. Nothing is
 * lost: the point of following a target is to say WHICH small thing is meant,
 * and a target this size is not in doubt.
 */
const BIG_W = 340;
const BIG_H = 260;

const CARD_W = 380;
const GAP = 14;

/**
 * How tall the card will be, from the words in it.
 *
 * Estimated rather than measured: measuring means rendering it somewhere first,
 * and the first frame would be the one in the wrong place. A fixed guess was
 * worse — a long line overflowed it and the card sat on top of the very thing
 * it was pointing at.
 */
function cardHeight(title: string, body: string): number {
  const lines = (text: string, perLine: number): number =>
    Math.max(1, Math.ceil(text.replace(/\*\*/g, '').length / perLine));
  return 92 + lines(title, 40) * 21 + lines(body, 52) * 19;
}

/**
 * The card's fixed home, for the steps whose target is too big to stand beside.
 *
 * Chosen by how little of the apparatus each corner covers, and — this is the
 * part that matters — it does not depend on the step. Two big targets in a row
 * therefore leave the card exactly where it was, which is the whole point.
 *
 * It is pinned by whichever edge it grew from rather than by its top-left, so a
 * longer line for one step pushes the card open instead of sliding it: at the
 * bottom of the screen it grows upwards, at the top it grows down.
 */
function dockFor(bench: Box | null, h: number, vw: number, vh: number): { left: number; top: number } {
  const corners = [
    { left: vw - CARD_W - 16, top: vh - h - 16 },
    { left: 16, top: vh - h - 16 },
    { left: vw - CARD_W - 16, top: 16 },
    { left: 16, top: 16 },
  ];
  let best = corners[0]!;
  let bestCost = Infinity;
  for (const c of corners) {
    // Ties go to the first, which is the bottom right — where a reader already
    // expects a caption to be.
    const cost = area({ left: c.left, top: c.top, width: CARD_W, height: h }, bench);
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  return { left: Math.max(8, best.left), top: Math.max(8, best.top) };
}

/**
 * The commentary goes beside what it is describing, never on top of it.
 *
 * Below the target, or above it. When a target is tall enough that neither
 * fits — a whole rack, a whole drawing board — it goes BESIDE instead, which
 * is the case a vertical-only rule got wrong: it ran out of room and put the
 * card over the very thing it was pointing at.
 */
const area = (a: Box, b: Box | null): number => {
  if (!b) return 0;
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const hh = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && hh > 0 ? w * hh : 0;
};

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function placeCard(
  spot: TourRect | null,
  bench: Box | null,
  h: number,
  vw: number,
  vh: number,
): { left: number; top: number } {
  const clampX = (x: number): number => Math.max(16, Math.min(vw - CARD_W - 16, x));
  const clampY = (y: number): number => Math.max(8, Math.min(vh - h - 8, y));

  if (!spot) return { left: clampX((vw - CARD_W) / 2), top: clampY(vh - h - 16) };

  const centreX = clampX(spot.left + spot.width / 2 - CARD_W / 2);
  const middleY = clampY(spot.top + spot.height / 2 - h / 2);

  // Every place worth considering, nearest the target first.
  const candidates: { left: number; top: number }[] = [
    { left: centreX, top: spot.top + spot.height + GAP },
    { left: centreX, top: spot.top - h - GAP },
    { left: spot.left - GAP - CARD_W, top: middleY },
    { left: spot.left + spot.width + GAP, top: middleY },
    { left: clampX(vw - CARD_W - 16), top: clampY(vh - h - 16) },
    { left: 16, top: clampY(vh - h - 16) },
    { left: clampX(vw - CARD_W - 16), top: 8 },
    { left: 16, top: 8 },
  ];

  let best = candidates[0]!;
  let bestCost = Infinity;
  for (const c of candidates) {
    const box = { left: c.left, top: c.top, width: CARD_W, height: h };
    const offscreen = c.left < 8 || c.top < 8 || c.left + CARD_W > vw - 8 || c.top + h > vh - 8;
    // Covering the outlined target is the worst thing it can do; covering the
    // rest of the apparatus is the next worst; going off screen rules it out.
    const cost = (offscreen ? 1e9 : 0) + area(box, spot) * 4 + area(box, bench);
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  return { left: clampX(best.left), top: clampY(best.top) };
}

export function TrainerRun<C>({
  steps,
  ctx,
  onStop,
  keepClear,
}: {
  steps: readonly TourStep<C>[];
  ctx: C;
  /** Called when the script ends or the student stops it. */
  onStop: () => void;
  /**
   * The apparatus. The card is kept off ALL of it, not merely off the outlined
   * target — a demonstration that lays a wire leaves the card standing on the
   * other wires, and an explanation covering the circuit explains nothing.
   */
  keepClear?: () => DOMRect | null;
}): React.ReactElement | null {
  const [index, setIndex] = React.useState(0);
  const [spot, setSpot] = React.useState<TourRect | null>(null);
  /** The last thing pointed at, which is where the card stays if a step names nothing. */
  const [anchor, setAnchor] = React.useState<TourRect | null>(null);
  const [pressing, setPressing] = React.useState(false);

  // Read as an external store: the glide time is used while rendering, so it
  // must be right on the first render rather than corrected by an effect.
  const reduce = useReducedMotion();

  const step = steps[index];
  const done = index >= steps.length;
  const body = step ? (typeof step.body === 'function' ? step.body(ctx) : step.body) : '';
  const last = index === steps.length - 1;

  const stop = React.useEffectEvent(() => onStop());
  const next = (): void => setIndex((i) => i + 1);

  // Where this step points, and the press when it points at a control.
  React.useEffect(() => {
    if (done) {
      stop();
      return undefined;
    }
    let live = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void): void => {
      timers.push(setTimeout(() => live && fn(), ms));
    };

    const rect = step?.target ? resolveRect(step.target) : null;
    const glide = reduce ? 0 : GLIDE_MS;

    // A step with no target of its own keeps the last one's POSITION — the
    // card stays where the eye left it instead of flying to a default corner
    // and back. The outline goes, because there is nothing to outline.
    at(0, () => {
      setSpot(rect);
      if (rect) setAnchor(rect);
    });
    if (rect && rect.width <= POINTABLE && rect.height <= POINTABLE) {
      at(glide, () => setPressing(true));
      at(glide + PRESS_MS, () => setPressing(false));
    }
    return () => {
      live = false;
      for (const t of timers) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, done, reduce]);

  // The keyboard, for a student who is not going to reach for a mouse between
  // every step. Space, Enter and the arrows all mean "carry on", because all
  // three are what a person actually presses; Escape gives the bench back.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        stop();
        return;
      }
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        // Space scrolls and Enter re-presses whatever has focus, and behind an
        // overlay neither is what was meant.
        e.preventDefault();
        setIndex((i) => i + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (done || !step) return null;

  const vw = typeof window === 'undefined' ? 1440 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 900 : window.innerHeight;
  const bench = keepClear?.() ?? null;
  const height = cardHeight(step.title, body);
  // A step with no target of its own keeps the LAST one's aim, so the card
  // stays where the eye left it rather than flying to a corner and back.
  const aim = spot ?? anchor;
  const huge = aim !== null && (aim.width > BIG_W || aim.height > BIG_H);
  const card = aim && !huge ? placeCard(aim, bench, height, vw, vh) : dockFor(bench, height, vw, vh);
  const pointable = Boolean(spot && spot.width <= POINTABLE && spot.height <= POINTABLE);
  // How far through the demonstration, not how long until it moves. The bar
  // used to be a countdown, which is a thing to race rather than a thing to
  // read; this one only ever says where you are.
  const progress = (index + 1) / steps.length;

  return (
    <>
      {/* Rendering the step is what performs its action — and the KEY is what
          makes that true more than once. A card's content mounts an element
          whose mount effect does the deed; two acting cards in a row are the
          same component in the same slot, so without a key React updates that
          instance instead of remounting it, the effect never re-runs, and the
          second demonstration silently does nothing at all. That failure is
          invisible: the commentary still reads correctly while the bench sits
          untouched. */}
      {step.content ? (
        <React.Fragment key={`act-${index}`}>
          {step.content({ ctx, completed: false, complete: NOOP })}
        </React.Fragment>
      ) : null}

      {spot ? (
        <Box
          aria-hidden="true"
          sx={{
            position: 'fixed',
            zIndex: (t) => t.zIndex.modal + 1,
            pointerEvents: 'none',
            left: spot.left - 4,
            top: spot.top - 4,
            width: spot.width + 8,
            height: spot.height + 8,
            borderRadius: (t) => `${t.band.radius.sm}px`,
            border: '2px solid rgba(143,208,255,.95)',
            backgroundColor: 'rgba(143,208,255,.10)',
            boxShadow: '0 0 0 9999px rgba(20,16,10,.32)',
            // All four on one timing: moving and resizing are the same gesture.
            transition: `left ${GLIDE_MS}ms ${EASE}, top ${GLIDE_MS}ms ${EASE}, width ${GLIDE_MS}ms ${EASE}, height ${GLIDE_MS}ms ${EASE}`,
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        />
      ) : null}

      {pointable && spot ? (
        <Box
          aria-hidden="true"
          sx={{
            position: 'fixed',
            zIndex: (t) => t.zIndex.modal + 2,
            left: spot.left + spot.width / 2,
            top: spot.top + spot.height / 2,
            width: 26,
            height: 26,
            borderRadius: '999px',
            pointerEvents: 'none',
            transform: 'translate(-50%, -50%)',
            border: '2px solid rgba(255,255,255,.92)',
            backgroundColor: 'rgba(143,208,255,.5)',
            boxShadow: '0 0 0 3px rgba(20,16,10,.4), 0 6px 18px rgba(0,0,0,.35)',
            transition: `left ${GLIDE_MS}ms ${EASE}, top ${GLIDE_MS}ms ${EASE}`,
            ...(pressing ? { animation: `${press} ${PRESS_MS}ms ease-out` } : null),
            '@media (prefers-reduced-motion: reduce)': { transition: 'none', animation: 'none' },
          }}
        />
      ) : null}

      <Box
        role="status"
        aria-live="polite"
        data-trainer-card=""
        sx={{
          position: 'fixed',
          zIndex: (t) => t.zIndex.modal + 3,
          // Pinned at the origin and MOVED by a transform. Animating left/top
          // lays the box out again on every frame; a transform does not, and it
          // is the only way this glides rather than stutters on a page that is
          // also redrawing a bench.
          left: 0,
          top: 0,
          transform: `translate3d(${Math.round(card.left)}px, ${Math.round(card.top)}px, 0)`,
          transition: `transform ${GLIDE_MS}ms ${EASE}`,
          willChange: 'transform',
          width: CARD_W,
          maxWidth: 'calc(100vw - 32px)',
          borderRadius: (t) => `${t.band.radius.lg}px`,
          backgroundColor: (t) => t.brand.ink,
          color: (t) => t.brand.surface,
          boxShadow: (t) => t.shadows[8],
          overflow: 'hidden',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      >
        <Box sx={{ px: 1.75, pt: 1.25, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            component="span"
            sx={{
              fontWeight: 800,
              fontSize: (t) => t.band.type.min,
              letterSpacing: '.09em',
              textTransform: 'uppercase',
              opacity: 0.72,
            }}
          >
            Watch
          </Box>
          <Box component="span" sx={{ flex: 1 }} />
          <Box component="span" sx={{ fontSize: (t) => t.band.type.min, opacity: 0.6 }}>
            {index + 1} of {steps.length}
          </Box>
        </Box>

        {/*
          WHAT is happening, then WHY. The step's own title has always said the
          first and the card never showed it — a student watching a pointer move
          was left to work out what the movement was FOR from a paragraph of
          reasoning. Setting the two apart, and keyed so they are replaced
          rather than edited, is most of the difference between a demonstration
          you can follow and one you merely watch.
        */}
        <Box key={`text-${index}`} sx={{ px: 1.75, pt: 0.6, pb: 1.25 }}>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: (t) => t.band.type.base,
              lineHeight: 1.3,
              animation: `${textIn} .3s ease-out both`,
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
          >
            {step.title}
          </Typography>
          <Typography
            sx={{
              mt: 0.4,
              fontSize: (t) => t.band.type.base - 1,
              opacity: 0.84,
              animation: `${textIn} .3s ease-out .06s both`,
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
          >
            <RichText text={body} />
          </Typography>
        </Box>

        <Box
          sx={{
            px: 1.25,
            pb: 1.25,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            // The bar reads as a rule under the words rather than a control.
            '& .rule': { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.22)' },
          }}
        >
          <Button
            size="small"
            variant="outlined"
            onClick={() => stop()}
            sx={{
              flex: 'none',
              color: 'inherit',
              borderColor: 'rgba(255,255,255,.4)',
              '&:hover': { borderColor: 'rgba(255,255,255,.78)' },
            }}
          >
            Stop
          </Button>
          <Box component="span" className="rule">
            <Box
              sx={{
                height: '100%',
                borderRadius: 2,
                width: `${Math.round(progress * 100)}%`,
                backgroundColor: 'rgba(143,208,255,.95)',
                transition: 'width .3s ease-out',
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            />
          </Box>
          {/*
            The only way forward, and it is on the right where a student's hand
            already is. On the last card it says so, because "Next" on a step
            with nothing after it is a small lie that ends the demonstration.
          */}
          <Button
            size="small"
            variant="contained"
            onClick={last ? () => stop() : next}
            autoFocus
            endIcon={last ? undefined : <ChevronRight size={15} />}
            sx={{ flex: 'none' }}
          >
            {last ? 'Done' : 'Next'}
          </Button>
        </Box>
      </Box>
    </>
  );
}

/** A demonstration drives itself; nothing completes a step by hand. */
const NOOP = (): void => {};
