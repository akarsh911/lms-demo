import { mulberry32 } from './seed';

import type { BenchVivaQuestion } from '@labs/types/lab-bench';

/**
 * THE VIVA DRAW.
 *
 * Each practical carries a bank far larger than the paper it sets, and five
 * questions are drawn per attempt. Before this, every bench asked the same
 * handful in the same order, so a second run was a memory test rather than a
 * second viva.
 *
 * Three properties the draw has to have, and each is a bug if it does not:
 *
 * 1. SPREAD ACROSS THE CATEGORIES. Drawing at random from a bank of thirty
 *    lands five questions about the apparatus often enough to matter. The draw
 *    goes round the categories in turn, so a paper asks about the principle,
 *    the apparatus, the procedure, the errors and the interpretation.
 * 2. THE OPTIONS SHUFFLE. Otherwise the answer to a remembered question is
 *    remembered with it, and on some benches the correct option sits in the
 *    same position often enough to be guessable.
 * 3. THE ANSWER IS CARRIED BY IDENTITY, NEVER BY INDEX. This is the obvious
 *    bug and the reason the shuffle is written out here rather than left to
 *    each bench: shuffling `o` while `a` still points at the old position
 *    silently marks right answers wrong. `drawViva` re-finds the correct option
 *    in the shuffled array by identity.
 *
 * All of it is seeded from the bench seed, so a teacher can reproduce any
 * attempt exactly from the number in its record, and two students sitting the
 * same bench sit the same paper, while a fresh bench sets a fresh one.
 */

/** How many questions a viva asks, on every bench. */
export const VIVA_DRAW = 5;

/** Fisher–Yates, in place, from a seeded source. */
export function shuffle<T>(items: T[], rnd: () => number): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const a = items[i]!;
    const b = items[j]!;
    items[i] = b;
    items[j] = a;
  }
  return items;
}

/**
 * `n` questions spread across the categories, each with its options shuffled.
 *
 * Falls back to filling from whatever is left when a bank is thinner than the
 * paper in some category, so a bench is never short of questions.
 */
export function drawViva(
  bank: readonly BenchVivaQuestion[],
  n: number,
  rnd: () => number,
): readonly BenchVivaQuestion[] {
  const byCat = new Map<string, BenchVivaQuestion[]>();
  for (const q of bank) {
    const pool = byCat.get(q.cat);
    if (pool) pool.push(q);
    else byCat.set(q.cat, [q]);
  }
  for (const pool of byCat.values()) shuffle(pool, rnd);

  const cats = shuffle([...byCat.keys()], rnd);
  const drawn: BenchVivaQuestion[] = [];
  // Bounded: a bank with fewer questions than `n` must not spin here.
  for (let i = 0; drawn.length < n && i < bank.length + cats.length; i += 1) {
    const pool = byCat.get(cats[i % cats.length]!);
    const next = pool?.shift();
    if (next) drawn.push(next);
  }

  return drawn.map((q) => shuffleOptions(q, rnd));
}

/** One question with its options shuffled and `a` moved to follow the answer. */
export function shuffleOptions(q: BenchVivaQuestion, rnd: () => number): BenchVivaQuestion {
  const correct = q.o[q.a];
  const o = shuffle([...q.o], rnd);
  // By identity. An index computed before the shuffle points at a distractor.
  const a = correct === undefined ? q.a : o.indexOf(correct);
  return { ...q, o, a };
}

/**
 * The paper for one attempt at one bench.
 *
 * `shuffled` false is the `vivaShuffle` flag switched off by an administrator:
 * the bank's first `n` are asked in their authored order, with their options in
 * the order they were written. Everything else about the viva is unchanged.
 */
export function vivaPaper(
  bank: readonly BenchVivaQuestion[],
  seed: number,
  { shuffled = true, n = VIVA_DRAW }: { shuffled?: boolean; n?: number } = {},
): readonly BenchVivaQuestion[] {
  if (!shuffled) return bank.slice(0, n);
  // Offset so the paper does not repeat the sequence the apparatus was built
  // from: the same seed drives both, and two draws from one stream would
  // correlate the questions with the bench.
  return drawViva(bank, n, mulberry32(seed * 2654435761 + 0x9e37));
}

/**
 * The same paper, computed once per bench seed.
 *
 * The reducer has to mark each answer against the paper the student was
 * actually shown, and the console has to render it, so both ask for it on every
 * keystroke. Drawing is cheap but not free, and — more to the point — handing
 * back the SAME array keeps the console from re-rendering a question list that
 * has not changed.
 *
 * Keyed by the bank itself as well as the seed, so two benches cannot collide.
 */
export function vivaPaperFor(
  bank: readonly BenchVivaQuestion[],
  seed: number,
  shuffled = true,
): readonly BenchVivaQuestion[] {
  let bySeed = PAPERS.get(bank);
  if (!bySeed) {
    bySeed = new Map();
    PAPERS.set(bank, bySeed);
  }
  // The unshuffled paper is the same whatever the bench, so it is cached under
  // a key no seed can take.
  const key = shuffled ? seed : UNSHUFFLED;
  let paper = bySeed.get(key);
  if (!paper) {
    paper = vivaPaper(bank, seed, { shuffled });
    bySeed.set(key, paper);
  }
  return paper;
}

const UNSHUFFLED = -1;

const PAPERS = new WeakMap<
  readonly BenchVivaQuestion[],
  Map<number, readonly BenchVivaQuestion[]>
>();
