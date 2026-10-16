export const GENERATION_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'infeasible',
  'failed',
] as const;

export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export const GENERATION_FAILURE_REASONS = [
  'invalid',
  'unreachable',
  'refused',
  'timeout',
  'clash',
  'internal',
] as const;

export type GenerationFailureReason = (typeof GENERATION_FAILURE_REASONS)[number];

export const MINUTES_BASES = ['nominal', 'realised'] as const;

export type MinutesBasis = (typeof MINUTES_BASES)[number];

export const GENERATION_WEIGHT_NAMES = [
  'stack',
  'last_period',
  'teacher_gap',
  'room_move',
  'minutes_short',
  'daily_contact',
] as const;

export type GenerationWeightName = (typeof GENERATION_WEIGHT_NAMES)[number];

export const MIN_SOLVE_SECONDS = 1;
export const MAX_SOLVE_SECONDS = 120;
export const DEFAULT_SOLVE_SECONDS = 60;

export interface GenerationCell {
  day_of_week: number;
  period_id: string;
}

export interface DailyContactRule {
  section_id: string;
  offering_ids?: string[];
  class_teacher?: boolean;
  min_per_day?: number;
}

export interface GenerationRequest {
  max_seconds?: number;
  replace_existing?: boolean;
  hint?: boolean;
  minutes_basis?: MinutesBasis;
  demand?: Record<string, number>;
  pins?: Record<string, Record<string, number>>;
  unavailable?: Record<string, GenerationCell[]>;
  required_room_type?: Record<string, string>;
  heavy_subjects?: string[];
  weights?: Partial<Record<GenerationWeightName, number>>;
  daily_contact?: DailyContactRule[];
}

export interface SolverViolation {
  kind: string;
  key: string;
  target: number;
  actual: number;
  amount: number;
  message: string;
}

export interface GenerationJob {
  id: string;
  timetable_id: string;
  status: GenerationStatus;
  terminal: boolean;
  max_seconds: number;
  requested_by?: string | null;
  created_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
  slots_written: number;
  wall_time_ms: number;
  solver_status?: string | null;
  verdict?: string | null;
  objective?: number | null;
  failure_reason?: GenerationFailureReason | null;
  detail?: string | null;
  core_keys?: string[] | null;
  warnings?: string[] | null;
  soft_violations?: SolverViolation[] | null;
}
