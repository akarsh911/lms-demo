import type { Coverage, GapSource, GapStatus, Trend, WeighedEvidence } from '@/types/gap-analyzer';

import { ASSESSED_SOURCES, EXPOSURE_ONLY, SECURE_FROM, SOURCE_LABELS, WEAK_BELOW, percent } from './model';
import type { TopicScore } from './score';

export interface Classified {
  status: GapStatus;
  assessed: boolean;
  reasons: string[];
}

const COVERAGE_REASON: Readonly<Record<Coverage, string>> = {
  taught: 'Taught, according to the lesson record.',
  not_taught: 'Not taught yet, according to the lesson record, so weak practice here is not counted as a gap.',
  unrecorded: 'No lesson record says whether this was taught, so it is treated as taught.',
};

const TREND_REASON: Readonly<Record<Trend, string | null>> = {
  improving: 'The trend is improving over the last three weeks.',
  declining: 'The trend is getting worse over the last three weeks.',
  steady: null,
  unknown: null,
};

function assessments(evidence: readonly WeighedEvidence[]): string[] {
  const seen = new Map<string, string>();
  for (const row of evidence) {
    if (ASSESSED_SOURCES.has(row.source) && !seen.has(row.ref.record_id)) seen.set(row.ref.record_id, `${row.ref.title} (${row.label})`);
  }
  return [...seen.values()];
}

function disagreement(means: ReadonlyMap<GapSource, number>): string | null {
  const ranked = [...means.entries()].filter(([source]) => !EXPOSURE_ONLY.has(source)).sort((a, b) => a[1] - b[1]);
  if (ranked.length < 2) return null;
  const [low, high] = [ranked[0], ranked[ranked.length - 1]];
  if (!low || !high || high[1] - low[1] < 0.35) return null;
  return `The sources disagree: ${SOURCE_LABELS[high[0]]} reads ${percent(high[1])} but ${SOURCE_LABELS[low[0]]} reads ${percent(low[1])}.`;
}

function weakness(score: number, assessed: boolean): GapStatus {
  if (score < WEAK_BELOW) return assessed ? 'gap' : 'at_risk';
  return score < SECURE_FROM ? 'at_risk' : 'strong';
}

function headline(status: GapStatus, score: number | null): string {
  switch (status) {
    case 'gap':
      return 'Taught, tested, weak.';
    case 'at_risk':
      return score !== null && score < WEAK_BELOW ? 'Weak in practice, not yet tested.' : `Borderline, below ${percent(SECURE_FROM)}.`;
    case 'strong':
      return 'Secure.';
    case 'not_taught':
      return 'Not taught yet.';
    case 'no_data':
      return 'No records yet.';
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

export function classify(coverage: Coverage, scored: TopicScore, trend: Trend): Classified {
  const onAssessment = assessments(scored.evidence);
  const assessed = onAssessment.length > 0;
  const status: GapStatus =
    coverage === 'not_taught' ? 'not_taught' : scored.score === null ? 'no_data' : weakness(scored.score, assessed);

  const reasons = [headline(status, scored.score), COVERAGE_REASON[coverage]];
  if (status === 'not_taught' && scored.score !== null && scored.score < WEAK_BELOW) {
    reasons.push(`Early practice is weak (${percent(scored.score)}); worth watching once it is taught.`);
  }
  if (assessed) reasons.push(`Assessed on: ${onAssessment.join('; ')}.`);
  if (!assessed && scored.evidence.some((row) => row.source === 'exam')) {
    reasons.push('Only a whole-paper exam mark touches this topic, which says little about it on its own.');
  }
  const split = disagreement(scored.source_means);
  if (split) reasons.push(split);
  const trendNote = TREND_REASON[trend];
  if (trendNote && status !== 'no_data') reasons.push(trendNote);
  if (scored.score !== null) {
    reasons.push(`Confidence is ${scored.confidence_band}: ${scored.evidence.length} piece${scored.evidence.length === 1 ? '' : 's'} of evidence from ${scored.source_means.size} source${scored.source_means.size === 1 ? '' : 's'}.`);
  }
  return { status, assessed, reasons };
}
