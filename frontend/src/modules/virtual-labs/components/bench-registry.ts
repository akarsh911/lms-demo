import type { BenchDefinition } from '@labs/types/lab-bench';

import { aceticAcidBench } from './acetic-acid/definition';
import { acidBaseBench } from './acid-base/definition';
import { cellDivisionBench } from './cell-division/definition';
import { dicotSeedBench } from './dicot-seed/definition';
import { focalLengthBench } from './focal-length/definition';
import { glassSlabBench } from './glass-slab/definition';
import { ohmsLawBench } from './ohms-law/definition';
import { phSamplesBench } from './ph-samples/definition';
import { prismBench } from './prism/definition';
import { reactionTypesBench } from './reaction-types/definition';
import { reactivitySeriesBench } from './reactivity-series/definition';
import { respirationBench } from './respiration/definition';
import { seriesParallelBench } from './series-parallel/definition';
import { soapBench } from './soap/definition';
import { stomataBench } from './stomata/definition';

/**
 * THE BENCH REGISTRY: every practical the front end can run.
 *
 * One entry per bench. Adding a practical is this line plus its own two
 * folders — `@labs/lib/<id>/` for the science and `@labs/components/<id>/` for
 * the apparatus. Nothing about the page, the widget, the workspace or the
 * catalogue changes, which is the point of `@labs/types/lab-bench.ts`.
 *
 * Ordered as CBSE lists them, so the catalogue reads like the syllabus.
 */
/**
 * Heterogeneous by design: each bench has its own state and action types, and
 * the workspace only ever runs one at a time. `unknown` keeps the list honest —
 * nothing outside a bench may reach into its state.
 */
export const BENCHES: readonly BenchDefinition<never, never>[] = [
  phSamplesBench as unknown as BenchDefinition<never, never>,
  acidBaseBench as unknown as BenchDefinition<never, never>,
  reactionTypesBench as unknown as BenchDefinition<never, never>,
  reactivitySeriesBench as unknown as BenchDefinition<never, never>,
  ohmsLawBench as unknown as BenchDefinition<never, never>,
  seriesParallelBench as unknown as BenchDefinition<never, never>,
  stomataBench as unknown as BenchDefinition<never, never>,
  respirationBench as unknown as BenchDefinition<never, never>,
  aceticAcidBench as unknown as BenchDefinition<never, never>,
  soapBench as unknown as BenchDefinition<never, never>,
  focalLengthBench as unknown as BenchDefinition<never, never>,
  glassSlabBench as unknown as BenchDefinition<never, never>,
  prismBench as unknown as BenchDefinition<never, never>,
  cellDivisionBench as unknown as BenchDefinition<never, never>,
  dicotSeedBench as unknown as BenchDefinition<never, never>,
];

export function benchById(id: string | null | undefined): BenchDefinition<never, never> | null {
  if (!id) return null;
  return BENCHES.find((b) => b.engine.meta.id === id) ?? null;
}

/** What the catalogue lists. */
export const BENCH_METAS = BENCHES.map((b) => b.engine.meta);
