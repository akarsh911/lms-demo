import type { ChipTone } from '@/components/ui/chip';
import { trimNumber } from '@/lib/exams/exam';
import { AGGREGATION_LABELS, sameMarks } from '@/lib/school/result-composition';
import { shortId } from '@/lib/school/names';
import { ApiError } from '@/services/api';
import type {
  ComputedResult,
  ResultComponentOutcome,
  PupilResult,
  ResultComponentGap,
  ResultComposition,
  ResultOutcome,
  ResultSourceGap,
  ResultSourceOutcome,
  ResultsRefusal,
} from '@/types/results';

export const OUTCOME_LABELS: Record<ResultOutcome, string> = {
  counted: 'Counted',
  not_among_best: 'Not among the best',
  absent: 'Absent',
  exempt: 'Exempt',
  not_entered: 'Not entered',
};

export const OUTCOME_TONES: Record<ResultOutcome, ChipTone> = {
  counted: 'green',
  not_among_best: 'blue',
  absent: 'amber',
  exempt: 'teal',
  not_entered: 'coral',
};

export const OUTCOME_NOTES: Record<ResultOutcome, string> = {
  counted: 'Marked, and counted toward this part.',
  not_among_best: 'Marked, and not among the best this part takes.',
  absent: 'Away for this one. An absence is not a mark of zero.',
  exempt: 'Excused from this one. An exemption is not a mark of zero.',
  not_entered: 'Nobody has entered a mark for this yet, so it is not a zero either.',
};

export function outcomeLabel(outcome: string): string {
  return OUTCOME_LABELS[outcome as ResultOutcome] ?? outcome;
}

export function outcomeTone(outcome: string): ChipTone {
  return OUTCOME_TONES[outcome as ResultOutcome] ?? 'grey';
}

export function outcomeNote(outcome: string): string | null {
  return OUTCOME_NOTES[outcome as ResultOutcome] ?? null;
}

export function sourceMarkText(source: ResultSourceOutcome): string {
  if (source.obtained === undefined) return '—';
  return `${trimNumber(source.obtained)} of ${trimNumber(source.maximum_marks)}`;
}

export function marksOf(obtained: number, maximum: number): string {
  return `${trimNumber(obtained)} of ${trimNumber(maximum)}`;
}

export function sourceName(source: ResultSourceOutcome): string {
  if (source.label) return source.label;
  const kind = source.ref.kind === 'assignment' ? 'Assignment' : 'Exam';
  return `${kind} ${shortId(source.ref.id)}`;
}

export function gapName(gap: ResultSourceGap): string {
  if (gap.label) return gap.label;
  const kind = gap.ref.kind === 'assignment' ? 'Assignment' : 'Exam';
  return `${kind} ${shortId(gap.ref.id)}`;
}

export function combinesLine(component: ResultComponentOutcome): string {
  if (component.aggregation === 'best_of' && component.take_best !== undefined) {
    return `Best ${component.take_best} of ${component.linked_sources}`;
  }
  return AGGREGATION_LABELS[component.aggregation] ?? 'One sitting';
}

export type Standing = 'final' | 'provisional' | 'incomplete' | 'partial';

export interface StandingChip {
  key: Standing;
  label: string;
  tone: ChipTone;
  note: string;
}

const PROVISIONAL: StandingChip = {
  key: 'provisional',
  label: 'Provisional',
  tone: 'amber',
  note: 'Part of this was marked by machine and a teacher has still to read the written answers, so this total can still move.',
};

const INCOMPLETE: StandingChip = {
  key: 'incomplete',
  label: 'Incomplete',
  tone: 'coral',
  note: 'Something this result is made of has no mark entered against it yet.',
};

const PARTIAL: StandingChip = {
  key: 'partial',
  label: 'Scheme not whole',
  tone: 'orange',
  note: 'Part of the scheme was left out of this subject, so this result is out of less than the scheme is.',
};

const FINAL: StandingChip = {
  key: 'final',
  label: 'Final',
  tone: 'green',
  note: 'Every mark this is made of is in, read by a teacher, and every part of the scheme was scored.',
};

export function standingChips(pupil: PupilResult, compositionWhole: boolean): StandingChip[] {
  if (pupil.final) return [FINAL];

  const chips: StandingChip[] = [];
  if (pupil.result.provisional) chips.push(PROVISIONAL);
  if (!pupil.result.complete) chips.push(INCOMPLETE);
  if (!compositionWhole) chips.push(PARTIAL);
  return chips;
}

export interface CompositionGaps {
  sources: ResultSourceGap[];
  components: ResultComponentGap[];
  whole: boolean;
}

export function compositionGaps(
  composition: ResultComposition | undefined,
): CompositionGaps {
  const sources = composition?.sources_not_set ?? [];
  const components = composition?.components_not_scored ?? [];
  return {
    sources,
    components,
    whole: sources.length === 0 && components.length === 0,
  };
}

export interface ScoreScale {
  assessed: number;
  scheme: number;
  excused: boolean;
  short: boolean;
}

export function scoreScale(result: ComputedResult): ScoreScale {
  return {
    assessed: result.assessed_total,
    scheme: result.total_marks,
    excused: !sameMarks(result.assessed_total, result.component_total),
    short: !sameMarks(result.component_total, result.total_marks),
  };
}

export function refusalOf(error: unknown): ResultsRefusal | null {
  if (!(error instanceof ApiError) || error.status !== 422) return null;
  const body = error.details;
  if (typeof body !== 'object' || body === null) return null;
  const refusal = body as ResultsRefusal;
  return typeof refusal.error === 'string' ? refusal : null;
}
