import type { ResultAggregation } from '@/types/result-scheme';
import type { PageInfo } from '@/types/roster';

export type ResultOutcome =
  | 'counted'
  | 'not_among_best'
  | 'absent'
  | 'exempt'
  | 'not_entered';

export type ResultSourceKind = 'exam' | 'assignment';

export interface ResultSourceRef {
  kind: ResultSourceKind;
  id: string;
}

export interface ResultSourceOutcome {
  ref: ResultSourceRef;
  label?: string;
  maximum_marks: number;
  obtained?: number;
  fraction?: number;
  outcome: ResultOutcome;
  provisional: boolean;
}

export interface ResultComponentOutcome {
  id: string;
  name: string;
  position: number;
  aggregation: ResultAggregation;
  take_best?: number;
  maximum_marks: number;
  weight: number;
  fraction: number;
  obtained_marks: number;
  contribution: number;
  linked_sources: number;
  counted_sources: number;
  excused: boolean;
  capped?: boolean;
  provisional: boolean;
  sources: ResultSourceOutcome[];
}

export interface ComputedResult {
  result_scheme_id: string;
  total_marks: number;
  component_total: number;
  assessed_total: number;
  score: number;
  complete: boolean;
  provisional: boolean;
  components: ResultComponentOutcome[];
}

export interface PupilResult {
  student_id: string;
  final: boolean;
  result: ComputedResult;
}

export interface ResultSourceGap {
  result_component_id: string;
  component: string;
  ref: ResultSourceRef;
  label?: string;
  reason: string;
}

export interface ResultComponentGap {
  id: string;
  name: string;
  weight: number;
  reason: string;
}

export interface ResultComposition {
  sources_not_set: ResultSourceGap[] | null;
  components_not_scored: ResultComponentGap[] | null;
}

export interface OfferingResults {
  subject_offering_id: string;
  result_scheme_id: string | null;
  composed: boolean;
  reason?: string;
  composition?: ResultComposition;
  results: PupilResult[];
  count: number;
  page?: PageInfo;
}

export const RESULT_SCHEME_UNFILLED = 'result_scheme_unfilled_for_offering';
export const RESULT_NOT_COMPUTABLE = 'result_not_computable';

export interface ResultsRefusal {
  error: string;
  message?: string;
  student_id?: string;
  composition?: ResultComposition;
}
