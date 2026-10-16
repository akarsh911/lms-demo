/**
 * Grade bands — the rotatable layer.
 *
 * # What rotates, and what does not
 *
 * The palette, the typeface and the logo are FIXED (`tokens.ts`). One school is
 * one brand. What rotates is the physical character of the interface, along a
 * single axis: **playful → composed**.
 *
 * That axis is not a vibe. It was measured off the Emerge student-portal design
 * sets, comparing the Junior and Senior treatments of the same screens:
 *
 *   | | Junior | Senior |
 *   |---|---|---|
 *   | largest radius   | 36px | 18px (some 2-3px) |
 *   | smallest type    | 10.5px | 9.5px |
 *   | illustrations    | 31 inline SVG | 17 |
 *   | gradients        | 1 | 0 |
 *
 * So: rounder, larger, more illustrated for younger; tighter, sharper, denser
 * and plainer as they get older. A Class 12 student wants information density
 * and gets patronised by bubbles; a six-year-old cannot parse a 9.5px table.
 *
 * # Why bands and not a slider
 *
 * A continuous scale would be untestable and would drift — every screen would
 * end up tuned to a slightly different value. Three named bands can each be
 * looked at, signed off, and screenshotted.
 *
 * # Adding a band
 *
 * Add an entry to `GRADE_BANDS` and map grades to it in `bandForGrade`. Nothing
 * else changes: the theme factory reads whatever is here.
 */

export type GradeBandId = 'foundation' | 'middle' | 'senior';

export interface GradeBand {
  id: GradeBandId;
  /** Shown in the UI when a band is being previewed or chosen. */
  label: string;
  /** Roughly which grades this covers. Documentation, not logic. */
  grades: string;

  /** Corner rounding, px. `pill` stays 999 everywhere. */
  radius: { sm: number; md: number; lg: number; xl: number };

  /**
   * Type scale, px. `base` is body text.
   * Younger bands are larger AND have a higher floor — the smallest text on a
   * foundation screen must still be comfortably readable.
   *
   * `min` is a FLOOR, not an invitation: it is the smallest type the product
   * ever sets, used for chip text and field labels. It was 10px on the senior
   * band, which put roughly a dozen labels at 10–10.5px — legible to the
   * designer on a 27" display and not to a fourteen-year-old on a school
   * tablet. A caption is not a place to save space.
   */
  type: { min: number; base: number; h4: number; h3: number; h2: number; h1: number };

  /** Multiplies the 8px spacing unit. Bigger = airier. */
  spacing: number;

  /** Control heights, px. Bigger targets for smaller hands. */
  control: { sm: number; md: number; lg: number };

  /**
   * How much decoration is appropriate.
   *   rich    — illustrations, mascots, gradients, celebratory motion
   *   light   — occasional spot art, flat fills
   *   minimal — icons only; the data is the decoration
   */
  ornament: 'rich' | 'light' | 'minimal';

  /** Whether gradient fills are permitted at all. */
  gradients: boolean;

  /** Motion duration in ms. Younger = slower and more visible. */
  motion: { fast: number; base: number; slow: number };

  /** Default MUI elevation feel. */
  depth: 'raised' | 'card' | 'flat';

  /** Body line-height. */
  lineHeight: number;
}

export const GRADE_BANDS: Record<GradeBandId, GradeBand> = {
  /** Nursery – Class 4. Big, round, illustrated, forgiving. */
  foundation: {
    id: 'foundation',
    label: 'Foundation',
    grades: 'Nursery – 4',
    radius: { sm: 14, md: 20, lg: 28, xl: 36 },
    type: { min: 13, base: 16, h4: 19, h3: 22, h2: 28, h1: 34 },
    spacing: 1.25,
    control: { sm: 36, md: 44, lg: 54 },
    ornament: 'rich',
    gradients: true,
    motion: { fast: 200, base: 320, slow: 480 },
    depth: 'raised',
    lineHeight: 1.6,
  },

  /** Class 5 – 8. The hinge. Still friendly, starting to carry real density. */
  middle: {
    id: 'middle',
    label: 'Middle',
    grades: '5 – 8',
    radius: { sm: 10, md: 14, lg: 18, xl: 22 },
    type: { min: 12, base: 14.5, h4: 16, h3: 19, h2: 24, h1: 29 },
    spacing: 1,
    control: { sm: 32, md: 38, lg: 46 },
    ornament: 'light',
    gradients: false,
    motion: { fast: 160, base: 240, slow: 360 },
    depth: 'card',
    lineHeight: 1.5,
  },

  /** Class 9 – 12. Dense, sharp, plain. Board-exam tooling, not a playground. */
  senior: {
    id: 'senior',
    label: 'Senior',
    grades: '9 – 12',
    radius: { sm: 6, md: 10, lg: 14, xl: 18 },
    type: { min: 11.5, base: 13.5, h4: 15, h3: 17, h2: 21, h1: 26 },
    spacing: 0.875,
    control: { sm: 28, md: 34, lg: 40 },
    ornament: 'minimal',
    gradients: false,
    motion: { fast: 120, base: 180, slow: 260 },
    depth: 'flat',
    lineHeight: 1.45,
  },
};

export const DEFAULT_BAND: GradeBandId = 'middle';

export function isGradeBandId(value: string): value is GradeBandId {
  return Object.prototype.hasOwnProperty.call(GRADE_BANDS, value);
}

/**
 * Grade number → band.
 *
 * Nursery/LKG/UKG map to 0 and land in `foundation`. Anything unrecognised
 * falls back to `middle` — the least wrong answer for an unknown audience,
 * because it neither patronises a teenager nor shrinks type for a child.
 */
export function bandForGrade(grade: number | string | null | undefined): GradeBandId {
  if (grade === null || grade === undefined) return DEFAULT_BAND;

  const n =
    typeof grade === 'number'
      ? grade
      : /^(nursery|lkg|ukg|pre)/i.test(grade.trim())
        ? 0
        : Number.parseInt(String(grade).replace(/\D+/g, ''), 10);

  if (!Number.isFinite(n)) return DEFAULT_BAND;
  if (n <= 4) return 'foundation';
  if (n <= 8) return 'middle';
  return 'senior';
}

/**
 * CAS group key → band.
 *
 * Class groups are keyed `emerge-class-06`, `emerge-class-10`, so the grade is
 * readable straight off the key. A user in several class groups takes the
 * HIGHEST — a Class 10 student who is also in a Class 6 remedial set should get
 * the Class 10 interface, not the younger one.
 */
export function bandForGroupKeys(keys: readonly (string | null)[]): GradeBandId {
  const grades = keys
    .filter((k): k is string => Boolean(k))
    .map((k) => /class-(\d+)/i.exec(k)?.[1])
    .filter((g): g is string => Boolean(g))
    .map((g) => Number.parseInt(g, 10))
    .filter((n) => Number.isFinite(n));

  if (grades.length === 0) return DEFAULT_BAND;
  return bandForGrade(Math.max(...grades));
}
