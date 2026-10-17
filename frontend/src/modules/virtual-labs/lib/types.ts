/**
 * Vocabulary shared by every lab bench. Pure types, no behaviour.
 */

/**
 * The tone of anything the bench says to the student. The same four tones are
 * understood by `components/ui/coach-message.tsx`, which is how a pure engine
 * can decide what to say without knowing how it is drawn.
 */
export type Tone = 'info' | 'good' | 'warn' | 'bad';

/**
 * Text the bench says, in a deliberately tiny markup: `**bold**`, `_italic_`
 * and newlines. Rendered by `components/ui/rich-text.tsx`. Kept as markup
 * rather than HTML so an engine in `lib/` never produces markup a component has
 * to trust.
 */
export type RichText = string;

export interface Message {
  text: RichText;
  tone: Tone;
}

/** One entry in the log of things to work on, stamped with the bench clock. */
export interface Mistake {
  /** Bench clock at the time, `m:ss`. */
  t: string;
  what: string;
  /** Marks it cost, 0 when it is only logged. */
  pts: number;
}

/** One marked part of a practical, as carried in the attempt record. */
export interface MarkedPart {
  earned: number;
  max: number;
  /** The rule the marks were computed by, so the grade can be audited later. */
  basis: string;
}
