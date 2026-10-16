import type { ComponentType } from 'react';
import type { FeatureKey } from '@/constants/features';

/**
 * A widget — a panel that lives inside a section.
 *
 * The key is nested under the key that owns the page it appears on: a widget
 * keyed `emerge.attendance.summary` renders on the `emerge.attendance` page and
 * nowhere else, and `emerge.learning.mindmap.canvas` renders on the Mind maps
 * page, which is itself a nested sidebar entry. The owner is DERIVED from the
 * key (`parentOf`) rather than declared separately, so the two cannot drift.
 *
 * Widgets have no URL of their own. A panel is not a page, and giving one a
 * route would put a thing in the browser's history that the user never
 * navigated to.
 */
interface WidgetBase {
  /** Unique within its section. */
  key: string;
  /** The owning page's key plus one segment. `parentOf` recovers the owner. */
  feature: FeatureKey;
  title: string;
  /** Order within the section. Lower first. */
  order: number;
  linksTo?: readonly FeatureKey[];
  Component: ComponentType<WidgetProps>;
}

/**
 * How much of the page a widget takes. Declared, like placement, so the grid
 * decides layout and a widget never measures the page it sits on.
 *
 *   card       a panel in the 12-column grid, `span` columns wide, as tall as
 *              its content. The default, and what almost everything is.
 *   wide       the full row, as tall as its content. A table or a chart that
 *              needs the width.
 *   immersive  the full row AND the full viewport height under the top bar,
 *              with its own internal scrolling, and a control to go truly
 *              fullscreen. For a widget that is a workspace rather than a
 *              readout: a lab bench, a mind-map canvas. Below `md` it falls back
 *              to its natural height, because a phone scrolls the page instead.
 */
export type WidgetPresentation = 'card' | 'wide' | 'immersive';

/**
 * `span` exists only where it means something. A full-row widget declaring a
 * span would be a number that is silently ignored, so the type forbids it.
 */
type WidgetLayout =
  | {
      presentation?: 'card';
      /** Grid columns out of 12, from `md` up. Always the full row below that. */
      span: number;
    }
  | { presentation: 'wide' | 'immersive'; span?: never };

export type WidgetDescriptor = WidgetBase & WidgetLayout;

export interface WidgetProps {
  title: string;
  /** The active persona, for widgets whose data differs per hat. */
  personaSlug: string;
  reachableLinks?: readonly FeatureKey[];
}
