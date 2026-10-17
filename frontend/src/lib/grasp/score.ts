import type { Band, BandCounts, ReadbackItem, ReadbackResponse, Verdict } from '@/types/grasp';

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? null) : Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
};

// The fast/slow pair: missing the timed questions while getting the untimed twin right is what an outside source looks like.
export function judge(items: readonly ReadbackItem[], responses: readonly ReadbackResponse[]): Verdict {
  const byItem = new Map(responses.map((r) => [r.itemId, r]));
  const correct = (item: ReadbackItem): boolean => byItem.get(item.id)?.choice === item.answer;
  const fast = items.filter((i) => i.kind === 'fast');
  const slow = items.filter((i) => i.kind === 'slow');
  const fastCorrect = fast.filter(correct).length;
  const slowOk = slow.length > 0 && slow.every(correct);
  const passed = fastCorrect >= Math.max(1, fast.length - 1);
  const band: Band = passed ? (slowOk ? 'understood' : 'unclear') : slowOk ? 'not_written' : 'not_learnt';
  const fastTimes = fast.flatMap((i) => {
    const r = byItem.get(i.id);
    return r && r.choice !== null ? [r.ms] : [];
  });
  return {
    band,
    fastCorrect,
    fastTotal: fast.length,
    slowOk,
    medianMs: median(fastTimes),
    timeouts: fast.filter((i) => byItem.get(i.id)?.choice == null).length,
  };
}

export const emptyBands = (): Record<Band, number> => ({ understood: 0, not_written: 0, not_learnt: 0, unclear: 0 });

export function countBands(verdicts: readonly (Verdict | null)[]): BandCounts {
  const counts = emptyBands();
  for (const v of verdicts) if (v) counts[v.band] += 1;
  return counts;
}
