/**
 * UI primitives.
 *
 * The portal's reusable pieces, rebuilt band-aware. Every one reads its radius,
 * type scale, control height and motion from the theme, so rotating the grade
 * band re-shapes all of them without a single component knowing which band it
 * is in.
 *
 * Use these instead of styling a `<Box>` from scratch. If a screen needs
 * something that is not here, add it here first — that is what keeps 74 screens
 * looking like one product.
 */
export { EmergeChip, tintForeground } from './chip';
export type { ChipTone, EmergeChipProps } from './chip';

export { Stat } from './stat';
export type { StatProps } from './stat';

export { ProgressBar, ProgressRing } from './progress';
export { Row, Avatar } from './row';
export { Tile } from './tile';
export { Segmented } from './segmented';
export type { SegmentedOption } from './segmented';
export { EmptyState } from './empty-state';
export { PageHeader, SectionHeader, Grid, Divider } from './layout';
export { RouteBreadcrumbs } from './route-breadcrumbs';
export type { Crumb } from './route-breadcrumbs';

// Interactive-learning primitives: shared by every guided or marked activity
// (lab benches today), so each new one is assembled rather than rebuilt.
export { RichText } from './rich-text';
export { CoachMessage } from './coach-message';
export type { CoachTone } from './coach-message';
export { StepStrip } from './step-strip';
export type { StripStep } from './step-strip';
export { NumberField } from './number-field';
export { ChoiceQuiz } from './choice-quiz';
export type { ChoiceQuestion } from './choice-quiz';
export { ScoreCard } from './score-card';
export type { ScorePart } from './score-card';
export { Metric } from './metric';

export { MonthGrid } from './month-grid';
export type { MonthGridDay } from './month-grid';
export { SlotGrid } from './slot-grid';
export type { SlotGridColumn, SlotGridRow } from './slot-grid';
