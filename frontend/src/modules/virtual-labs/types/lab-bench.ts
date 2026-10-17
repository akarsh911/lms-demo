import type * as React from 'react';
import type { ComponentType } from 'react';

import type { TeachLabel } from '@labs/components/teach-panel';

import type { TourStep } from '@labs/components/guided-tour';
import type { StripStep } from '@/components/ui';
import type { TextbookScope } from '@/hooks/query/use-textbook-passages';
import type { MarkedPart, Message, Mistake } from '@labs/lib/types';

/**
 * THE BENCH CONTRACT.
 *
 * A practical is an ENGINE (pure, in `@labs/lib/<id>/`) plus a STAGE (the
 * apparatus, in `@labs/components/<id>/`). Everything else — the frame, the
 * procedure strip, the assistant, the notebook tabs, the viva, the marking
 * card, the attempt record, the tours, the clock — is shared and lives in
 * `bench-workspace.tsx`.
 *
 * This exists because the standalone engine says plainly what happens
 * otherwise: "all 13 pages duplicate the same shell (design tokens, layout,
 * tutorial engine). Extract a shared shell before adding more benches." A port
 * that copies the workspace per practical inherits that debt fourteen times.
 *
 * A bench therefore writes only what is genuinely its own: how its apparatus
 * behaves, what it looks like, what the student types, and how it is marked.
 */

export type BenchSubject = 'Physics' | 'Chemistry' | 'Biology';

export interface BenchMeta {
  /** URL-safe, stable: it appears in `?practical=` and in attempt records. */
  id: string;
  /** CBSE practical number in the Class X (086) list: `4`, `1A`. */
  cbse: string;
  title: string;
  /** One line under the title: what is actually measured. */
  subtitle: string;
  subject: BenchSubject;
  /** For the catalogue card: why a student would open this. */
  blurb: string;
  aim: string;
  theory: string;
  /** Which chapter grounds its theory and viva in the textbook. */
  textbook: TextbookScope;
  /** What the theory card looks up in that chapter. */
  theoryQuery: string;
  /**
   * What a FRESH bench changes here, as a noun phrase: "a different unknown
   * resistor", "a different leaf". Shown in the Help menu and in the confirm
   * dialog. Omitted where nothing specific is worth naming — better silent than
   * promising a resistor on a microscope.
   */
  newBenchHint?: string;
}

/** One marked part of a practical: its share of the 100, and the rule behind it. */
export interface MarkPartSpec {
  key: string;
  label: string;
  max: number;
  basis: string;
}

/**
 * The five things a viva asks about. A paper draws one from each, so it covers
 * the ground of the practical rather than five questions about the apparatus.
 */
export type BenchVivaCategory =
  | 'principle'
  | 'apparatus'
  | 'procedure'
  | 'errors'
  | 'interpretation';

export interface BenchVivaQuestion {
  q: string;
  /**
   * Index of the correct option — IN `o` AS IT STANDS. The options are shuffled
   * per attempt, so this is rewritten by the draw; never cache it against an
   * unshuffled copy of the bank. See `@labs/lib/viva.ts`.
   */
  a: number;
  o: readonly string[];
  why: string;
  /** Which ground this question covers, for the spread of the draw. */
  cat: BenchVivaCategory;
  /**
   * What to quote from the textbook beside the explanation. Optional: a bank
   * question that names nothing the chapter covers falls back to the bench's
   * own `meta.theoryQuery` rather than inventing a search that returns noise.
   */
  textbookQuery?: string;
}

/**
 * Administrator settings that have to be fixed when the bench is built, not
 * read later.
 *
 * A flag belongs here when the PURE layer needs it — when the reducer's answer
 * would otherwise disagree with what the student was shown. Everything a flag
 * only hides or removes from the screen is decided in the components, which is
 * where the rest of them live.
 */
export interface BenchInitOptions {
  /**
   * Whether this attempt's viva is drawn and shuffled (the default) or is the
   * bank's first five in the order they were authored.
   *
   * It has to be settled at init because the reducer marks each answer against
   * the paper, and a paper that changed halfway through would mark answers
   * already given against questions that were never asked.
   */
  vivaShuffled?: boolean;
}

/**
 * The pure half of a practical. No React, no DOM: it can be driven from plain
 * Node, which is how a bench is checked without a browser.
 */
export interface BenchEngine<S, A> {
  meta: BenchMeta;
  /** The procedure, as the student sees it in the strip. */
  steps: readonly StripStep[];
  marks: readonly MarkPartSpec[];
  /**
   * THE BANK, not the paper. Every question this practical could ask, across
   * the five categories; a single attempt is asked `VIVA_DRAW` of them.
   *
   * Read `vivaFor(state)` to render or mark a viva. Reading this list directly
   * asks the wrong questions and, because the draw shuffles the options,
   * marks them against the wrong indices.
   */
  viva: readonly BenchVivaQuestion[];
  /**
   * The paper this attempt is sitting: drawn from the bank, seeded by the
   * bench, options shuffled. A pure function of the state, so it need not be
   * stored and cannot drift from the attempt it belongs to.
   */
  vivaFor(state: S): readonly BenchVivaQuestion[];

  init(seed: number, now: number, message?: Message, options?: BenchInitOptions): S;
  reducer(state: S, action: A): S;

  /** Which step is live; `steps.length` once the practical is complete. */
  step(state: S): number;
  done(state: S): boolean;
  /** What the assistant is saying right now. */
  message(state: S): Message;
  /** Marks per part key, plus the rounded total. */
  score(state: S): Record<string, number> & { total: number };
  /** One line summarising the attempt, shown above the marks. */
  summary(state: S): string;
  /** The record handed to the labs service. Shape is the bench's own. */
  attempt(state: S): Record<string, unknown>;
  /** Slips worth showing back at the end, newest last. */
  log?(state: S): readonly Mistake[];

  /** The viva answer for each question, or null while unanswered. */
  vivaPicks(state: S): readonly (number | null)[];
  /** The action that answers a viva question. */
  answerViva(question: number, option: number, now: number): A;
  /**
   * A physics/chemistry clock, if the bench has one: heating, a reaction
   * proceeding, a slide drying. Called at 10 Hz. Return the SAME state for an
   * idle tick and nothing re-renders.
   */
  tick?(dt: number, now: number): A;
  /** True while the student is still setting up, so the seed may be re-rolled. */
  restartable?(state: S): boolean;
}

/** What every bench-specific component is handed. */
export interface BenchViewProps<S, A> {
  state: S;
  /** Applies an action and returns the resulting state, synchronously. */
  dispatch: (action: A) => S;
  /** Stamp actions with this rather than reading a clock in the engine. */
  now: () => number;
}

export interface BenchStageProps<S, A> extends BenchViewProps<S, A> {
  /** Hand back the element a tour spotlights regions of (the apparatus drawing). */
  onStageElement: (el: Element | null) => void;
  /** How much room the stage has, for a bench that adapts its apparatus. */
  compact: boolean;
  /** Parts a tour step or a bought hint is pointing at, for the stage to pulse. */
  highlights: readonly string[];
}

export interface BenchTeachProps<S, A> extends BenchViewProps<S, A> {
  /**
   * True once the part this panel could give away has been submitted and the
   * marks for it are settled. Until then the panel explains the method and
   * nothing else; after it, it may name the values outright.
   *
   * A panel that has nothing to give away can ignore this and read the same
   * either way — which is the stronger design, because then there is nothing
   * for a later edit to leak.
   */
  revealed: boolean;
}

export interface BenchTab<S> {
  id: string;
  label: string;
  Panel: ComponentType<{ state: S }>;
}

export interface BenchTourContext<S, A> extends BenchViewProps<S, A> {
  /** The apparatus drawing, for region targets. */
  stage: () => Element | null;
  /** Anything the workspace tagged with `data-tour`. */
  find: (name: string) => Element | null;
}

/** The bench-specific half of the interface. */
export interface BenchUi<S, A> {
  /**
   * Wraps the whole workspace, for state the stage and the console must SHARE
   * and recompute together: meter needles animating from one solver result,
   * a colour chart derived from what is in a tube. Without it the two halves
   * animate independently and drift apart.
   */
  Provider?: ComponentType<BenchViewProps<S, A> & { children: React.ReactNode }>;
  Stage: ComponentType<BenchStageProps<S, A>>;
  /** The current step's instruction and its input, at the top of the console. */
  Task: ComponentType<BenchViewProps<S, A>>;
  /** The notebook. The workspace picks which is open, unless `tabForStep` says. */
  tabs: readonly BenchTab<S>[];
  /** Which tab suits a step, when the student has not chosen one. */
  tabForStep?: (state: S) => string;
  /** Drawn under the apparatus, beside the assistant: chips, undo, a status lamp. */
  Controls?: ComponentType<BenchViewProps<S, A>>;
  /** Docked beside the task: a magnified meter, a colour chart. */
  Aside?: ComponentType<BenchViewProps<S, A> & { maxWidth: number }>;
  /** Whether `Aside` earns its space right now. */
  showAside?: (state: S) => boolean;

  /**
   * THE TEACHING LAYER: "What's happening", or on the optics benches the light
   * path itself, which does the same job for a ray nobody can see.
   *
   * Off by default and switched on from the bench bar, because in a real lab
   * there is nothing here to see and a student should first look at their own
   * apparatus. Removed entirely when an administrator turns the `teach` flag
   * off — never rendered, never built.
   *
   * THE RULE IT MUST OBEY: demonstrate the method, never hand over a marked
   * value. It explains the chemistry, the circuit or the optics underneath and
   * refuses to say what THIS apparatus did, because that is the observation and
   * that is what the marks are for. Once the part it would give away has been
   * submitted, it may open up and show the numbers — `revealed` says when.
   *
   * Make that structural where you can rather than filtered: a panel whose text
   * is identical whatever is in the tubes cannot leak, while one that carefully
   * omits the answer can be made to leak by the next edit.
   */
  Teach?: ComponentType<BenchTeachProps<S, A>>;
  /**
   * What the bench bar calls it, defaulting to "What's happening". Give
   * `{ show, hide }` when the two states need different words — "Reveal the
   * light path" / "Hide the light path".
   */
  teachLabel?: TeachLabel;
  /** Whether the teaching layer has anything to say yet. */
  showTeach?: (state: S) => boolean;
  /**
   * For a bench whose teaching layer CHANGES THE APPARATUS — the optics
   * benches, where it is the light path itself being drawn, not a panel beside
   * it. Give both and the workspace's switch drives the bench's own state
   * instead of keeping its own, so the drawing and the switch cannot disagree.
   */
  teachOpen?: (state: S) => boolean;
  teachToggle?: (open: boolean) => A;
  /**
   * This bench's panel is an INSTRUMENT, not an explanation: live readouts and
   * controls that read and write the bench, rather than prose about it.
   *
   * The glass slab is the one. Its panel measures the ray it is drawing — the
   * angles, the shift, the ratio — and carries the slider that aims it, so it
   * belongs beside the apparatus and nowhere else. Set this and the workspace
   * stops offering to open it in the reading sheet, which exists to give long
   * prose a comfortable measure and would only take a working instrument away
   * from the thing it is measuring.
   */
  teachIsInstrument?: boolean;
  /** Hands-on tours. `controls` opens itself on a first visit. */
  tours?: (ctx: BenchTourContext<S, A>) => {
    controls?: readonly TourStep<BenchTourContext<S, A>>[];
    build?: readonly TourStep<BenchTourContext<S, A>>[];
  };
  /**
   * THE VISUAL TRAINER: "Show me this step", per step of the procedure, keyed
   * by the step's index.
   *
   * Unlike a tour, this demonstrates on the STUDENT'S OWN BENCH as it stands —
   * that is the point, since the question it answers is "what do I do *here*".
   * The workspace takes a snapshot before it runs and restores it byte for byte
   * afterwards, so nothing the demonstration does can change a mark.
   *
   * Return nothing for a step that needs no demonstration.
   *
   * IT IS A HOOK, and named so that the rules-of-hooks lint can see it. Every
   * bench needs `useLabFeature('teach')` inside, to leave out the cards that
   * demonstrate a teaching layer an administrator has switched off. It was
   * called `trainer` and typed as a plain function, and thirteen benches duly
   * passed a hook into a field nothing could check — which the workspace then
   * called inside a `useMemo`. React caught it at runtime; lint could not.
   */
  useTrainer?: (ctx: BenchTourContext<S, A>) => Readonly<
    Record<number, readonly TourStep<BenchTourContext<S, A>>[]>
  >;
  /** A warning shown on every tour step while it is non-null (a stray wire). */
  tourNotice?: (state: S) => string | null;
  /** Terminals, tubes or parts a tour step names, for the stage to highlight. */
  highlightsFor?: (step: TourStep<BenchTourContext<S, A>> | undefined, state: S) => readonly string[];
}

export interface BenchDefinition<S = unknown, A = unknown> {
  engine: BenchEngine<S, A>;
  ui: BenchUi<S, A>;
}

/** A part's marks as they travel in an attempt record. */
export type BenchMarkRecord = Record<string, MarkedPart>;
