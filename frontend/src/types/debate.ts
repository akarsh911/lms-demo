export type DebatePosition = 'FOR' | 'AGAINST';
export type DebatePositionChoice = DebatePosition | 'AUTO';
export type DebateSpeaker = 'student' | 'ai';
export type DebateDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type DebatePhase =
  | 'ready'
  | 'host_intro'
  | 'student_turn'
  | 'processing'
  | 'ai_turn'
  | 'finalizing'
  | 'evaluating'
  | 'report_ready'
  | 'report_failed'
  | 'cancelled';

export type DebateEndReason = 'manual' | 'time_limit' | 'turn_limit' | 'cancelled' | 'abandoned';

export interface DebateHealth {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  durable_backend: string;
  auth_mode: string;
  providers: { stt: string; tts: string; llm: string; knowledge: string };
  ready: boolean;
  test_mode: boolean;
  max_duration_s: number;
}

export interface DebateTopic {
  id: string;
  text: string;
}

export interface DebateCatalog {
  categories: { id: string; label: string; topics: DebateTopic[] }[];
  positions: { id: DebatePositionChoice; label: string; description: string }[];
  first_speakers: { id: DebateSpeaker; label: string; description: string }[];
  difficulties: { id: DebateDifficulty; label: string; summary: string }[];
  languages: { code: string; name: string; native: string }[];
  durations: { seconds: number; label: string }[];
  limits: {
    max_duration_s: number;
    topic_min_chars: number;
    topic_max_chars: number;
    context_max_chars: number;
  };
  voice: { capture_sample_rate: number; max_segment_s: number; max_student_turn_s: number };
}

export interface CreateDebateRequest {
  topic_id?: string;
  topic?: string;
  position: DebatePositionChoice;
  first_speaker: DebateSpeaker;
  difficulty: DebateDifficulty;
  language: string;
  duration_s: number;
  student_context?: string;
}

export interface DebateClip {
  id: string;
  text: string;
}

export interface HostClip extends DebateClip {
  lines: string[];
}

export interface DebateTurn {
  index: number;
  speaker: DebateSpeaker;
  status: 'open' | 'complete' | 'cut_off' | 'empty';
  text: string;
  clips?: DebateClip[];
}

export interface DebateSegment {
  turn_index: number;
  seq: number;
  text: string;
  duration_ms: number;
}

export interface DebateSession {
  id: string;
  topic: string;
  topic_id: string | null;
  category: string | null;
  student_position: DebatePosition;
  ai_position: DebatePosition;
  position_assigned_by: 'student' | 'system';
  first_speaker: DebateSpeaker;
  difficulty: DebateDifficulty;
  language: string;
  duration_s: number;
  student_context: string;
  phase: DebatePhase;
  end_reason: DebateEndReason | null;
  version: number;
  server_now: string;
  created_at: string;
  started_at: string | null;
  deadline_at: string | null;
  ended_at: string | null;
  remaining_ms: number;
  active_turn_index: number | null;
  turns: DebateTurn[];
  open_segments: DebateSegment[];
  pending_error: string | null;
  host: {
    language: string;
    translated: boolean;
    opening: HostClip[];
    closing: HostClip[] | null;
  } | null;
  report_stage: string | null;
  report_error: string | null;
  overall_score: number | null;
  test_mode: boolean;
  limits: { max_segment_s: number; max_student_turn_s: number; final_segment_grace_s: number };
}

export interface SegmentMetrics {
  voiced_ms: number;
  pause_before_ms: number;
  long_pauses: number;
  longest_pause_ms: number;
}

export type ReportStatus = 'finalizing' | 'running' | 'ready' | 'failed';

export interface DebateReportEnvelope {
  session_id: string;
  phase: DebatePhase;
  status: ReportStatus;
  stage: string | null;
  error: string | null;
  report: DebateReport | null;
  server_now: string;
}

export interface ReportPoint {
  title: string;
  detail: string;
  turn: number | null;
  quote: string | null;
}

export interface ReportCategory {
  key: string;
  label: string;
  score: number;
  rationale: string;
}

export interface ReportFallacy {
  type: string;
  label: string;
  turn: number;
  quote: string;
  why_weak: string;
  how_to_improve: string;
  confidence: 'high' | 'medium';
}

export interface ReportArgument {
  turn: number;
  quote: string;
  why_it_worked?: string;
  why_weak?: string;
  what_was_missing?: string;
  how_to_improve?: string;
  why_strong?: string;
  how_you_could_have_responded?: string;
}

export interface ImprovedArgument {
  turn: number;
  original: string;
  stronger_version: string;
  what_changed: string;
}

export type FactAssessment = 'correct' | 'mostly_correct' | 'partially_correct' | 'incorrect' | 'unverified';

export interface FactSource {
  title: string;
  url: string;
  publisher: string;
  quote: string;
}

export interface FactCheckItem {
  turn: number;
  quote: string;
  claim: string;
  assessment: FactAssessment;
  explanation: string;
  better_formulation: string;
  confidence: 'high' | 'medium' | 'low';
  sources: FactSource[];
  verified: boolean;
  reason: 'verification_unavailable' | 'no_sources_found' | 'sources_inconclusive' | null;
}

export interface FactCheck {
  status: 'complete' | 'unavailable' | 'no_claims' | 'skipped';
  source: string;
  items: FactCheckItem[];
}

export const TYPED_REASON = 'typed';

export interface DeliveryMetrics {
  measured: boolean;
  reason?: string;
  language?: string;
  student_turns?: number;
  word_count?: number;
  average_turn_words?: number;
  short_turns?: number;
  speaking_time_s?: number;
  words_per_minute?: number | null;
  pace?: 'slow' | 'balanced' | 'fast' | null;
  long_pauses?: number;
  longest_pause_s?: number;
  fillers_measured?: boolean;
  interruptions?: null;
  interruptions_note?: string;
  sources?: string[];
  hesitations?: Record<string, number>;
  filler_phrases?: Record<string, number>;
  filler_total?: number;
  fillers_per_100_words?: number;
  possible_restarts?: number;
  filler_note?: string;
  observed?: string[];
}

export interface DebateReport {
  session_id: string;
  topic: string;
  student_position: DebatePosition;
  ai_position: DebatePosition;
  position_assigned_by: 'student' | 'system';
  first_speaker: DebateSpeaker;
  difficulty: DebateDifficulty;
  difficulty_label: string;
  language: string;
  language_name: string;
  configured_duration_s: number;
  actual_duration_s: number;
  end_reason: DebateEndReason;
  turn_count: number;
  student_turns: number;
  ai_turns: number;
  student_words: number;
  transcript: { index: number; speaker: DebateSpeaker; text: string; status: DebateTurn['status'] }[];
  generated_by: { llm: string; knowledge: string };
  insufficient: boolean;
  insufficient_reason: string | null;
  summary: string;
  overall_score: number | null;
  categories: ReportCategory[];
  strengths: ReportPoint[];
  weaknesses: ReportPoint[];
  fallacies: ReportFallacy[];
  best_argument: ReportArgument | null;
  weakest_argument: ReportArgument | null;
  ai_strongest_counterargument: ReportArgument | null;
  improved_arguments: ImprovedArgument[];
  structure: {
    made_clear_claims: boolean;
    gave_reasons: boolean;
    used_evidence_or_examples: boolean;
    drew_conclusions: boolean;
    note: string;
  } | null;
  fact_check: FactCheck;
  delivery: {
    metrics: DeliveryMetrics;
    observed: string[];
    interpretation: string;
    suggestion: string;
  };
  practice_plan: string[];
  next_challenge: { topic: string; duration_minutes: number; focus: string };
  generated_at: string;
}

export interface DebateEngineError {
  error: string;
  detail: string;
}
