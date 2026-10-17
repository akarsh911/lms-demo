import type { ConfidenceBand, GapEvidence, GapSource, Trend, TrendPoint, WeighedEvidence } from '@/types/gap-analyzer';

import {
  EXPOSURE_ONLY,
  HALF_LIFE_DAYS,
  HIGH_CONFIDENCE,
  MEDIUM_CONFIDENCE,
  SINGLE_SOURCE_DISCOUNT,
  TREND_STEP,
  TREND_WINDOW_DAYS,
  VOLUME_SCALE,
  clamp01,
  daysBetween,
  round3,
} from './model';

export interface TopicScore {
  score: number | null;
  confidence: number;
  confidence_band: ConfidenceBand;
  agreement: number;
  evidence: WeighedEvidence[];
  source_means: ReadonlyMap<GapSource, number>;
}

export const decay = (date: string, asOf: string): number => 0.5 ** (Math.max(0, daysBetween(date, asOf)) / HALF_LIFE_DAYS);

export function weigh(evidence: readonly GapEvidence[], asOf: string): WeighedEvidence[] {
  return evidence
    .filter((row) => row.date <= asOf)
    .map((row) => ({ ...row, effective_weight: round3(row.weight * decay(row.date, asOf)) }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.effective_weight - a.effective_weight);
}

function weightedMean(rows: readonly WeighedEvidence[]): number | null {
  const total = rows.reduce((sum, row) => sum + row.effective_weight, 0);
  return total > 0 ? rows.reduce((sum, row) => sum + row.signal * row.effective_weight, 0) / total : null;
}

function sourceMeans(rows: readonly WeighedEvidence[]): Map<GapSource, number> {
  const bySource = new Map<GapSource, WeighedEvidence[]>();
  for (const row of rows) bySource.set(row.source, [...(bySource.get(row.source) ?? []), row]);
  const out = new Map<GapSource, number>();
  for (const [source, list] of bySource) {
    const mean = weightedMean(list);
    if (mean !== null) out.set(source, round3(mean));
  }
  return out;
}

function agreementOf(evidence: readonly WeighedEvidence[], mean: number): number {
  const rows = evidence.filter((row) => !EXPOSURE_ONLY.has(row.source));
  const total = rows.reduce((sum, row) => sum + row.effective_weight, 0);
  if (total === 0) return 0;
  const variance = rows.reduce((sum, row) => sum + row.effective_weight * (row.signal - mean) ** 2, 0) / total;
  return clamp01(1 - 2 * Math.sqrt(variance));
}

export const bandOf = (confidence: number): ConfidenceBand =>
  confidence >= HIGH_CONFIDENCE ? 'high' : confidence >= MEDIUM_CONFIDENCE ? 'medium' : 'low';

export function scoreTopic(evidence: readonly GapEvidence[], asOf: string): TopicScore {
  const weighed = weigh(evidence, asOf);
  const score = weightedMean(weighed);
  const means = sourceMeans(weighed);
  if (score === null) return { score: null, confidence: 0, confidence_band: 'low', agreement: 0, evidence: weighed, source_means: means };
  const volume = 1 - Math.exp(-weighed.reduce((sum, row) => sum + row.effective_weight, 0) / VOLUME_SCALE);
  const agreement = agreementOf(weighed, score);
  const diversity = means.size >= 2 ? 1 : SINGLE_SOURCE_DISCOUNT;
  const confidence = round3(volume * (0.4 + 0.6 * agreement) * diversity);
  return { score: round3(score), confidence, confidence_band: bandOf(confidence), agreement: round3(agreement), evidence: weighed, source_means: means };
}

export function trendSeries(evidence: readonly GapEvidence[], asOf: string): TrendPoint[] {
  const dates = [...new Set(evidence.map((row) => row.date).filter((date) => date <= asOf))].sort();
  return dates.flatMap((date) => {
    const score = weightedMean(weigh(evidence, date));
    return score === null ? [] : [{ date, score: round3(score) }];
  });
}

export function trendOf(points: readonly TrendPoint[]): Trend {
  const last = points[points.length - 1];
  if (!last || points.length < 2) return 'unknown';
  const earlier = [...points].reverse().find((point) => daysBetween(point.date, last.date) >= TREND_WINDOW_DAYS) ?? points[0];
  if (!earlier || earlier === last) return 'unknown';
  const change = last.score - earlier.score;
  if (change > TREND_STEP) return 'improving';
  if (change < -TREND_STEP) return 'declining';
  return 'steady';
}
