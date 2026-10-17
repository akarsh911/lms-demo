import type * as React from 'react';

/**
 * A guided tour: a spotlight over the REAL interface and a coach card beside
 * it, stepping through what to look at and what to try.
 *
 * Generic over `C`, the context a host passes in: whatever its steps need to
 * read (a lab's state, a form's values). Steps are plain data plus small pure
 * functions of that context, so a tour is authored like content, not wired
 * like a component.
 *
 * A "your turn" step completes when the student has actually done the thing,
 * which the tour notices by re-evaluating `done` every time the context
 * changes. Nothing is simulated: the tour watches the real controls.
 */

export interface TourRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where a step points. Resolved every frame, so it tracks scrolling and resizing. */
export interface TourTarget {
  /** The element to spotlight, or the element that contains the region. */
  element: () => Element | null;
  /**
   * A region inside that element, from its bounding box. For pointing at part
   * of a canvas or an SVG drawing rather than a whole DOM node.
   */
  region?: (box: DOMRect) => TourRect;
  /** Breathing room around the spotlight, px. */
  pad?: number;
}

/** What an interactive step's content can do. */
export interface StepApi<C> {
  ctx: C;
  /** True once this step has been completed. */
  completed: boolean;
  /** Mark the step completed (a practice check was answered, say). */
  complete: () => void;
}

export interface TourStep<C> {
  title: string;
  /** Engine markup: `**bold**`, `_italic_`, newlines. */
  body: string | ((ctx: C) => string);
  target?: TourTarget;
  /** Drawn under the body on every visit: a diagram, a schematic. */
  media?: (ctx: C) => React.ReactNode;

  /**
   * "Your turn" instruction. Required when `done` is given.
   *
   * A function when the instruction changes with what the student has already
   * managed: "wire laid ✓ — now remove the red one" says more than repeating
   * the original instruction beside a warning.
   */
  task?: string | ((ctx: C) => string);
  /**
   * Completion, detected. `entry` is the context as it was when the step
   * opened, so "do it twice" or "move it by a quarter" compare against where
   * the student started rather than against zero.
   */
  done?: (ctx: C, entry: C) => boolean;
  /** Shown in place of the task once done. */
  doneMessage?: string;
  /** Shown under the task once done. Can compare with what came before. */
  after?: (ctx: C, entry: C) => string;
  /**
   * Stay on the step once done instead of moving on after a beat. For a step
   * whose result the student should read before continuing.
   */
  stay?: boolean;

  /** Interactive content (a practice question). Completing it is up to the content. */
  content?: (api: StepApi<C>) => React.ReactNode;
  /** Whether Next waits for completion. Default: true when `done` or `content` is given. */
  gated?: boolean;

  /** Anything the HOST wants to key off the active step: terminals to pulse, say. */
  highlight?: readonly string[];
}
