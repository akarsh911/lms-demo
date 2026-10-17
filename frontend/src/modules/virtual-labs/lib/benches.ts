/**
 * EVERY PRACTICAL THAT EXISTS, as plain data.
 *
 * `@labs/components/bench-registry.ts` is the registry the workspace renders
 * from, but it pulls in each bench's apparatus, which is React. This list is
 * the same set reached through `lib/` only, so the SERVER can read it: the dev
 * bypass validates an attempt's bench against it, and anything else server-side
 * that needs to know a bench id can ask here instead of hardcoding one.
 *
 * Built from the engines rather than written out, so a bench cannot be added to
 * the syllabus and forgotten here — the ids come from the same `meta` the
 * catalogue and the attempt record use.
 */
import { aceticAcidEngine } from './acetic-acid/engine';
import { acidBaseEngine } from './acid-base/engine';
import { cellDivisionEngine } from './cell-division/engine';
import { dicotSeedEngine } from './dicot-seed/engine';
import { focalLengthEngine } from './focal-length/engine';
import { glassSlabEngine } from './glass-slab/engine';
import { ohmsLawEngine } from './ohms-law/engine';
import { phSamplesEngine } from './ph-samples/engine';
import { prismEngine } from './prism/engine';
import { reactionTypesEngine } from './reaction-types/engine';
import { reactivitySeriesEngine } from './reactivity-series/engine';
import { respirationEngine } from './respiration/engine';
import { seriesParallelEngine } from './series-parallel/engine';
import { soapEngine } from './soap/engine';
import { stomataEngine } from './stomata/engine';

const ENGINES = [
  phSamplesEngine,
  acidBaseEngine,
  reactionTypesEngine,
  reactivitySeriesEngine,
  ohmsLawEngine,
  seriesParallelEngine,
  stomataEngine,
  respirationEngine,
  aceticAcidEngine,
  soapEngine,
  focalLengthEngine,
  glassSlabEngine,
  prismEngine,
  cellDivisionEngine,
  dicotSeedEngine,
] as const;

/** Bench ids, in the order CBSE lists the practicals. */
export const BENCH_IDS: readonly string[] = ENGINES.map((e) => e.meta.id);

export function isBenchId(value: unknown): value is string {
  return typeof value === 'string' && BENCH_IDS.includes(value);
}
