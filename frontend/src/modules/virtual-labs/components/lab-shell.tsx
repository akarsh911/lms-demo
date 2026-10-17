'use client';

import * as React from 'react';
import Box from '@mui/material/Box';

/**
 * The frame a practical is worked in: apparatus on the left, a console on the
 * right, the assistant's voice under the apparatus, and the procedure as one
 * slim line across the top.
 *
 *   ┌ steps ─────────────────────────────────┐
 *   │ bench (fills, keeps its aspect)  │ con │
 *   │                                  │ sol │
 *   ├ assistant ───────────────────────┤ e   │
 *   └──────────────────────────────────┴─────┘
 *
 * Three decisions, all about not making a student hunt:
 *
 *   - The BENCH takes every pixel left over. It is the thing being
 *     manipulated, and a bench too small to read a needle on is useless.
 *   - The CONSOLE is one column with one job at a time (the current step's
 *     instruction and its input), so nothing stacks up behind a scrollbar.
 *     It is the only region allowed to scroll, and only when its content
 *     genuinely does not fit.
 *   - The ASSISTANT sits directly under the apparatus, because it is always
 *     reacting to what just happened there. Full width of the bench, so three
 *     sentences are two lines rather than eight in a narrow column.
 *
 * Below ~980px there is no room for two columns, so everything stacks in
 * reading order and the page scrolls: one scrollbar, the browser's own.
 *
 * Laid out by the width this component ACTUALLY has, never the viewport: the
 * same practical runs beside a sidebar, in fullscreen and on a phone.
 */
export type LabShellMode = 'split' | 'stacked';

/**
 * Below this the bench and console cannot both be useful side by side.
 *
 * 900, not 1000: a 1280px laptop beside the 268px sidebar leaves the widget
 * about 970px, and that is the machine a school most often has. Stacking there
 * would put the console below the bench and reintroduce the scroll between
 * reading a meter and typing what it says.
 */
const SPLIT_MIN = 900;

/** The mode a given width calls for. The owner measures, so it can adapt too. */
export function labShellMode(width: number | null): LabShellMode {
  // Until measured, assume split: it is what almost every screen gets, and it
  // avoids a visible reflow from stacked to split on load.
  return width !== null && width < SPLIT_MIN ? 'stacked' : 'split';
}

export function LabShell({
  mode,
  width,
  measureRef,
  steps,
  stage,
  coach,
  console: consolePane,
  /** `console` widens it for reading-heavy stages (the viva, the result). */
  emphasis = 'bench',
}: {
  mode: LabShellMode;
  width: number | null;
  measureRef: (el: HTMLElement | null) => void;
  steps: React.ReactNode;
  stage: React.ReactNode;
  coach: React.ReactNode;
  console: React.ReactNode;
  emphasis?: 'bench' | 'console';
}): React.ReactElement {
  // Wide enough to hold a five-option viva answer on one or two lines, never so
  // wide that the bench stops being the subject of the screen. It gives way
  // first on a small screen, because the bench has a minimum useful size and a
  // column of text does not.
  const consoleWidth =
    emphasis === 'console'
      ? Math.min(480, Math.max(340, (width ?? 1200) * 0.42))
      : width && width >= 1500
        ? 420
        : width && width < 1080
          ? 340
          : 380;

  if (mode === 'stacked') {
    return (
      <Box ref={measureRef} data-shell="stacked" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 1.5 }}>
        {steps}
        {stage}
        {coach}
        {consolePane}
      </Box>
    );
  }

  return (
    <Box
      ref={measureRef}
      data-shell="split"
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'grid',
        gap: 1.5,
        p: 1.5,
        gridTemplateColumns: `minmax(0, 1fr) ${consoleWidth}px`,
        gridTemplateRows: 'auto minmax(0, 1fr) auto',
        gridTemplateAreas: '"steps steps" "stage console" "coach console"',
        transition: 'grid-template-columns 200ms',
      }}
    >
      <Box sx={{ gridArea: 'steps', minWidth: 0 }}>{steps}</Box>
      <Box sx={{ gridArea: 'stage', minWidth: 0, minHeight: 0, display: 'flex' }}>{stage}</Box>
      <Box sx={{ gridArea: 'coach', minWidth: 0 }}>{coach}</Box>
      <Box sx={{ gridArea: 'console', minWidth: 0, minHeight: 0, display: 'flex' }}>{consolePane}</Box>
    </Box>
  );
}
