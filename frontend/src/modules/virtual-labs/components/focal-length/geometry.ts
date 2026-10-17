/**
 * Where the optical bench is drawn.
 *
 * The engine in `@labs/lib/focal-length/` works only in centimetres along the
 * metre scale; this is the one place centimetres become pixels, so a student's
 * reading and the drawing can never drift apart. The scale runs 0 cm at
 * x = 60 to 100 cm at x = 940 on a 1000 × 600 canvas.
 */
export const BENCH_WIDTH = 1000;
export const BENCH_HEIGHT = 600;

/** Pixel of the 0 cm mark, and pixels per centimetre. */
export const X0 = 60;
export const PXCM = 8.8;

/** The principal axis, the bench top, and the printed scale. */
export const AXIS = 330;
export const BENCH_TOP = 440;
export const SCALE_TOP = 470;
export const SCALE_BOT = 504;

/** Bench centimetres to canvas pixels, and back. */
export const X = (cm: number): number => X0 + cm * PXCM;
export const CMX = (px: number): number => (px - X0) / PXCM;

/** The spare optic waiting at the front of the bench. */
export const SPARE = { x: 46, y: SCALE_BOT + 8, w: 68, h: 44 } as const;

/**
 * THE ZOOM PANEL, in the empty air above the bench.
 *
 * It goes here and not under the drawing for one reason: the bench SVG scales
 * to fit its box, so anything added below it takes width away from the metre
 * scale. This strip is room the canvas already has — the window starts at
 * y = 190 and the only thing above it is a caption — so the panel costs the
 * apparatus nothing and sits directly over the stretch of bench it magnifies.
 */
export const ZOOM = { x: 196, y: 14, w: 772, h: 154 } as const;

/** How much bench the panel spans either side of the image, cm. */
export const ZOOM_HALF_SPAN = 3.5;

/** Regions a tour points at, in bench coordinates. */
export type Region = readonly [x: number, y: number, w: number, h: number];

export const RG_WINDOW: Region = [0, 170, 180, 270];
export const RG_ZOOM: Region = [ZOOM.x - 6, ZOOM.y - 6, ZOOM.w + 12, ZOOM.h + 12];
export const RG_SCALE: Region = [40, 462, 920, 54];
export const RG_SPARE: Region = [34, SCALE_BOT - 4, 92, 84];

/**
 * The stretches of bench the two stands live in, from `LIMITS`. A tour points
 * at the whole run rather than at wherever a stand happens to be, so the
 * spotlight cannot go stale the moment the student slides one.
 */
export const RG_MIRROR_RUN: Region = [X(53), AXIS - 76, X(97) - X(53), SCALE_TOP - AXIS + 96];
export const RG_SCREEN_RUN: Region = [X(3), AXIS - 60, X(94) - X(3), SCALE_TOP - AXIS + 80];
