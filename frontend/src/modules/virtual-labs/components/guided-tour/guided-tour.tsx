'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Check, TriangleAlert } from 'lucide-react';

import { RichText } from '@/components/ui/rich-text';

import type { TourRect, TourStep, TourTarget } from './types';

/**
 * The guided-tour engine: a spotlight over the live interface and a coach card
 * that follows it. See `types.ts` for how a tour is authored.
 *
 * CONTROLLED: the host owns which step is showing (`index`) and what happens
 * on exit, so a host can pause other work while the tour runs and restore it
 * after. The engine owns only per-step completion.
 *
 * The spotlight dims everything else with one enormous box-shadow and takes
 * no pointer events, so the real controls under it stay usable. That is the
 * point of a "your turn" step: the student does the real thing.
 *
 * Drawn in place with `position: fixed` rather than portalled, so it keeps
 * working inside a fullscreen widget frame, where a portal to the body would
 * be invisible.
 */
export function GuidedTour<C>({
  label,
  steps,
  index,
  ctx,
  onIndexChange,
  onExit,
  notice,
  keepClear,
  finishLabel = 'Done',
  finishActions,
}: {
  /** Shown in the card's header, e.g. "Tutorial" or "Guided build". */
  label: string;
  steps: readonly TourStep<C>[];
  index: number;
  ctx: C;
  onIndexChange: (next: number) => void;
  /** Called by Skip, and by Next on the last step. */
  onExit: () => void;
  /** A warning shown on every step while it is non-null (a stray wire, say). */
  notice?: string | null;
  /**
   * The region the card must not sit on: the thing the student has to operate.
   *
   * Without it the card is simply parked next to the spotlight, which on a lab
   * bench means on top of the apparatus — it was covering ten of fourteen
   * controls, so a step that says "connect these two terminals" could not be
   * completed. Given this, the card prefers whatever free space exists beside
   * it (the console column, the page margin) and only overlaps as a last resort.
   */
  keepClear?: () => DOMRect | null;
  finishLabel?: string;
  /** Extra buttons beside Next on the last step. */
  finishActions?: React.ReactNode;
}): React.ReactElement | null {
  const theme = useTheme();
  const step = steps[index];

  // --- per-step memory, reset when the step changes -------------------------
  // Adjusted during render (the derived-state pattern), not in an effect: the
  // new step's first paint already has fresh memory, with no stale frame.
  const [memory, setMemory] = React.useState<{ index: number; entry: C; completed: boolean }>(() => ({
    index,
    entry: ctx,
    completed: false,
  }));
  let current = memory;
  if (memory.index !== index) {
    current = { index, entry: ctx, completed: false };
    setMemory(current);
  }

  // A detected completion latches: undoing the thing afterwards does not
  // un-complete the step, exactly as a teacher would not un-tick it.
  const detected = Boolean(step?.done?.(ctx, current.entry));
  if (detected && !current.completed) {
    current = { ...current, completed: true };
    setMemory(current);
  }
  const completed = current.completed;

  const complete = React.useCallback(() => {
    setMemory((m) => (m.index === index ? { ...m, completed: true } : m));
  }, [index]);

  // --- move on a beat after a detected completion ---------------------------
  // An effect EVENT, so a host that re-renders many times a second (a live
  // simulation) does not restart the timer with every new callback identity.
  const advance = React.useEffectEvent(() => onIndexChange(index + 1));
  const autoAdvance = Boolean(step?.done) && !step?.stay && completed;
  React.useEffect(() => {
    if (!autoAdvance) return undefined;
    // Long enough to read "Done." and see what changed on the bench; a second
    // was gone before a student had looked up from what they were doing.
    const timer = window.setTimeout(advance, 1400);
    return () => window.clearTimeout(timer);
  }, [autoAdvance, index]);

  // --- placement, every frame -----------------------------------------------
  const spotRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const target = step?.target;
  React.useEffect(() => {
    let frame = 0;
    const loop = (): void => {
      place(spotRef.current, cardRef.current, target ? resolveRect(target) : null, keepClear?.() ?? null);
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [target, keepClear]);

  // Bring the target into view when a step opens on something off screen.
  // Always centred: aligning to the top parks the target under the app's own
  // header, where the spotlight then points at the logo and the tap that
  // should complete the step lands on a header button instead.
  React.useEffect(() => {
    const el = target?.element();
    if (!el) return;
    const r = resolveRect(target!);
    if (!r) return;
    if (r.top < 8 || r.top + r.height > window.innerHeight - 8 || window.innerWidth <= NARROW) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [index, target]);

  // Focus Next when there is nothing to do first, so Enter moves on.
  const nextRef = React.useRef<HTMLButtonElement>(null);
  const isTask = Boolean(step && (step.done || step.content));
  const gated = step ? (step.gated ?? isTask) : false;
  React.useEffect(() => {
    if (!gated || completed) nextRef.current?.focus({ preventScroll: true });
  }, [index, gated, completed]);

  if (!step) return null;

  const n = steps.length;
  const last = index === n - 1;
  const titleId = `tour-title-${index}`;
  const body = typeof step.body === 'function' ? step.body(ctx) : step.body;

  return (
    <>
      <Box
        ref={spotRef}
        aria-hidden="true"
        sx={{
          position: 'fixed',
          zIndex: theme.zIndex.modal,
          pointerEvents: 'none',
          borderRadius: `${theme.band.radius.md}px`,
          boxShadow: `0 0 0 9999px rgba(20,16,10,.56), 0 0 0 2px ${theme.brand.orangeHi}, 0 0 24px 4px rgba(250,124,54,.35)`,
          transition: `top ${theme.band.motion.slow}ms, left ${theme.band.motion.slow}ms, width ${theme.band.motion.slow}ms, height ${theme.band.motion.slow}ms`,
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      />
      <Box
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        sx={{
          position: 'fixed',
          zIndex: theme.zIndex.modal + 1,
          width: 'min(380px, calc(100vw - 32px))',
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
          backgroundColor: theme.brand.surface,
          color: theme.brand.text,
          border: `1px solid ${theme.brand.line}`,
          borderRadius: `${theme.band.radius.lg}px`,
          boxShadow: theme.shadows[8],
          p: 2,
          transition: `top ${theme.band.motion.slow}ms, left ${theme.band.motion.slow}ms`,
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          // A bottom sheet on a phone, where there is no room beside anything.
          [`@media (max-width:${NARROW}px)`]: {
            left: '16px !important',
            right: 16,
            top: 'auto !important',
            bottom: 16,
            width: 'auto',
            maxHeight: '52dvh',
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            fontSize: theme.band.type.min,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: theme.brand.tert,
          }}
        >
          <span>
            {label} · {index + 1} of {n}
          </span>
          <Box sx={{ flex: 1, height: 3, borderRadius: '999px', backgroundColor: theme.brand.sunken, overflow: 'hidden' }}>
            <Box
              sx={{
                height: '100%',
                width: `${((index + 1) / n) * 100}%`,
                backgroundColor: theme.brand.orange,
                transition: `width ${theme.band.motion.slow}ms`,
              }}
            />
          </Box>
        </Box>

        <Typography
          id={titleId}
          component="h3"
          sx={{ fontWeight: 800, fontSize: theme.band.type.h3, color: theme.brand.ink, mt: 1.25, mb: 0.75, lineHeight: 1.2 }}
        >
          {step.title}
        </Typography>
        <Typography component="div" sx={{ color: theme.brand.sub, fontSize: theme.band.type.base - 0.5, mb: 1 }}>
          <RichText text={body} />
        </Typography>

        {step.media ? step.media(ctx) : null}

        {notice ? (
          <TaskLine tone="warn" icon={<TriangleAlert size={12} />}>
            <RichText text={notice} />
          </TaskLine>
        ) : null}

        {step.task ? (
          <TaskLine tone={completed ? 'done' : 'todo'} icon={completed ? <Check size={12} strokeWidth={3} /> : null}>
            {completed ? (
              <>
                <strong>Done.</strong> {step.doneMessage ?? 'Nice work.'}
              </>
            ) : (
              <>
                <strong>Your turn.</strong>{' '}
                <RichText text={typeof step.task === 'function' ? step.task(ctx) : step.task} />
              </>
            )}
          </TaskLine>
        ) : null}

        {/* Keyed by step, so a check component's own state never leaks into the next step. */}
        {step.content ? <React.Fragment key={index}>{step.content({ ctx, completed, complete })}</React.Fragment> : null}

        {completed && step.after ? (
          <Typography component="div" sx={{ fontSize: theme.band.type.base - 1, mt: 1.25 }}>
            <RichText text={step.after(ctx, current.entry)} />
          </Typography>
        ) : null}

        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1.5 }}>
          {last ? null : (
            <Button variant="text" size="small" color="inherit" onClick={onExit}>
              Skip {label.toLowerCase()}
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          {index > 0 ? (
            <Button variant="outlined" size="small" color="inherit" onClick={() => onIndexChange(index - 1)}>
              Back
            </Button>
          ) : null}
          {last ? finishActions : null}
          {gated && !completed ? (
            // Not a disabled button: greyed-on-grey at 1.7:1, the one control
            // that explains the wait was the least readable thing on the card.
            <Box
              sx={{
                px: 1.5,
                py: 0.75,
                borderRadius: `${theme.band.radius.sm}px`,
                backgroundColor: theme.tints.orange,
                color: theme.onTint.orange,
                fontSize: theme.band.type.min + 1,
                fontWeight: 700,
              }}
            >
              Waiting for you…
            </Box>
          ) : (
            <Button
              ref={nextRef}
              variant="contained"
              size="small"
              onClick={() => (last ? onExit() : onIndexChange(index + 1))}
            >
              {last ? finishLabel : 'Next'}
            </Button>
          )}
        </Box>
      </Box>
    </>
  );
}

/** Below this width the card is a bottom sheet. */
const NARROW = 700;

function TaskLine({
  tone,
  icon,
  children,
}: {
  tone: 'todo' | 'done' | 'warn';
  icon: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  const theme = useTheme();
  const colour = tone === 'done' ? theme.hues.green : tone === 'warn' ? theme.hues.red : theme.brand.orange;
  const tint = tone === 'done' ? theme.tints.green : tone === 'warn' ? theme.tints.red : theme.tints.orange;
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        display: 'flex',
        gap: 1,
        alignItems: 'flex-start',
        backgroundColor: tint,
        color: theme.brand.ink,
        borderRadius: `${theme.band.radius.sm}px`,
        px: 1.25,
        py: 1,
        mt: 0.75,
        fontSize: theme.band.type.base - 1,
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          flex: 'none',
          width: 18,
          height: 18,
          mt: '1px',
          borderRadius: '999px',
          border: `2px solid ${colour}`,
          backgroundColor: tone === 'todo' ? 'transparent' : colour,
          color: '#FFFFFF',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {icon}
      </Box>
      <span>{children}</span>
    </Box>
  );
}

export function resolveRect(target: TourTarget): TourRect | null {
  const el = target.element();
  if (!el) return null;
  const box = el.getBoundingClientRect();
  const r = target.region ? target.region(box) : { left: box.left, top: box.top, width: box.width, height: box.height };
  const pad = target.pad ?? 0;
  return { left: r.left - pad, top: r.top - pad, width: r.width + 2 * pad, height: r.height + 2 * pad };
}

/** Area of the overlap between two rectangles, 0 when they do not meet. */
function overlap(a: TourRect, b: TourRect | null): number {
  if (!b) return 0;
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Put the spotlight on the target and the card where it is least in the way.
 *
 * Candidate positions (beside the target, then docked to a viewport edge) are
 * each clamped on screen and then SCORED: covering the spotlight itself is
 * worst, covering the region the student must operate is nearly as bad, and
 * sitting far from the target is a mild cost so the card stays associated with
 * what it describes. The old version simply took the first position that fitted,
 * which on a wide screen was always "immediately right of the spotlight" — on
 * top of the apparatus.
 *
 * Writes styles directly, once per frame, rather than through React state: it
 * is animation, and a re-render per frame would be sixty for nothing.
 */
function place(
  spot: HTMLElement | null,
  card: HTMLElement | null,
  r: TourRect | null,
  keepClear: DOMRect | null,
): void {
  if (!spot || !card) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const set = (el: HTMLElement, o: Partial<TourRect>): void => {
    for (const [k, v] of Object.entries(o)) el.style.setProperty(k, `${v}px`);
  };

  set(spot, r ?? { left: vw / 2, top: vh / 2, width: 0, height: 0 });

  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  if (!r) {
    set(card, { left: (vw - cw) / 2, top: (vh - ch) / 2 });
    return;
  }

  const m = 14;
  const edge = 16;
  const clamp = (left: number, top: number): TourRect => ({
    left: Math.max(edge, Math.min(left, vw - cw - edge)),
    top: Math.max(edge, Math.min(top, vh - ch - edge)),
    width: cw,
    height: ch,
  });

  const candidates = [
    clamp(r.left + r.width + m, r.top),
    clamp(r.left - m - cw, r.top),
    clamp(r.left, r.top + r.height + m),
    clamp(r.left, r.top - m - ch),
    clamp(vw, r.top), // docked to the right edge
    clamp(-vw, r.top), // docked to the left edge
  ];

  const centre = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  let best = candidates[0]!;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const distance = Math.hypot(c.left + cw / 2 - centre.x, c.top + ch / 2 - centre.y);
    const score = overlap(c, r) * 4 + overlap(c, keepClear) * 2 + distance * 40;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  set(card, { left: best.left, top: best.top });
}
