import { type LiquidId, POUR, type TubeContents } from './chemistry';

/**
 * The rack: six tubes, each labelled underneath with what belongs in it.
 *
 * The labels are the whole setup instruction, and they are also what the setup
 * marks are judged against — a tube holding something that is not on its label
 * is a spoiled sample, whatever is tested in it afterwards.
 */
export interface RackSlot {
  /** 1-based, as it is spoken and labelled. */
  n: number;
  label: string;
  /** mL of each liquid this tube should end up with. */
  want: Partial<Record<LiquidId, number>>;
  /** Why this tube is in the rack. */
  job: string;
}

export const RACK: readonly RackSlot[] = [
  { n: 1, label: '1 · acetic acid', want: { acid: POUR }, job: 'odour and litmus' },
  { n: 2, label: '2 · acid + water', want: { acid: POUR, water: POUR }, job: 'solubility in water' },
  { n: 3, label: '3 · oil + water', want: { oil: POUR, water: POUR }, job: 'a liquid that does not dissolve' },
  { n: 4, label: '4 · acid + NaHCO₃', want: { acid: POUR }, job: 'reaction with sodium hydrogen carbonate' },
  { n: 5, label: '5 · lime water', want: { lime: POUR }, job: 'the gas test' },
  { n: 6, label: '6 · dil. HCl', want: { hcl: POUR }, job: 'a strong acid to compare against' },
];

/** Which tube each part of the practical is about. */
export const TUBE = {
  sample: 0,
  diluted: 1,
  oil: 2,
  carbonate: 3,
  lime: 4,
  strong: 5,
} as const;

export function wantedIds(index: number): LiquidId[] {
  return Object.keys(RACK[index]!.want) as LiquidId[];
}

/** A tube holding a liquid its label does not mention. */
export function tubeSpoiled(index: number, t: TubeContents): boolean {
  const want = RACK[index]!.want;
  return (Object.keys(t.liq) as LiquidId[]).some((id) => (t.liq[id] ?? 0) > 0 && !want[id]);
}

export function tubeReady(index: number, t: TubeContents): boolean {
  const want = RACK[index]!.want;
  return wantedIds(index).every((id) => (t.liq[id] ?? 0) >= (want[id] ?? 0)) && !tubeSpoiled(index, t);
}
