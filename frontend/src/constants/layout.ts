/**
 * Dimensions of the persona shell that more than one component depends on.
 *
 * An immersive widget fills the viewport under the top bar, so it must know
 * the bar's height and the content padding. Pinned here, and used by the shell
 * itself, so the two cannot drift apart and leave a scrollbar's worth of gap.
 */

/** Top bar height per breakpoint, px, excluding any bottom border. MUI's Toolbar defaults, pinned. */
export const TOP_BAR_HEIGHT = { xs: 56, sm: 64 } as const;

/** The top bar's bottom border, px. Zero: the bar floats on the ground with no rule under it. */
export const TOP_BAR_BORDER = 0;

/** Padding around the main content area, in theme spacing units. */
export const MAIN_PADDING = 3;

/** An immersive widget never gets shorter than this, px, however small the window. */
export const IMMERSIVE_MIN_HEIGHT = 560;

/**
 * The content column's maximum width, px.
 *
 * Wide enough for a lab bench and a console side by side on a 1440 laptop;
 * short enough that a paragraph or a table row does not sprawl across a 27"
 * screen with a label at one end and its value at the other.
 */
export const CONTENT_MAX_WIDTH = 1600;
