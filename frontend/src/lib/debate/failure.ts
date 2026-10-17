import { ApiError } from '@/services/api';

const MESSAGES: Readonly<Record<string, string>> = {
  topic_not_debatable: 'That motion cannot be argued both ways. Try a question people genuinely disagree on.',
  turn_not_allowed: 'It is not your turn to speak yet.',
  debate_over: 'The debate has already ended.',
  segments_pending: 'Part of your turn is still being transcribed. Try again in a moment.',
  ai_turn_in_progress: 'Your opponent is already preparing a reply.',
  empty_turn: 'Nothing was heard or typed for this turn. Speak, or type your argument, then finish your turn.',
  turn_limit_reached: 'This turn has reached its maximum length. Finish it to hear your opponent.',
  audio_invalid: 'That recording could not be read. Try speaking again.',
  audio_too_large: 'That recording was too long to send in one piece.',
  speech_recognition_failed: 'Your speech could not be transcribed just now. Try again.',
  speech_synthesis_failed: 'Your opponent’s voice could not be prepared. The words are shown instead.',
  generation_failed: 'Your opponent could not reply. Try again.',
  provider_rate_limited: 'The debate service is busy. Wait a few seconds and try again.',
  provider_unavailable: 'The debate service is unavailable right now.',
  provider_not_configured: 'The debate engine has no speech or language provider configured.',
  report_not_ready: 'The report is not ready yet.',
  session_not_found: 'That debate could not be found.',
  invalid_transition: 'That step is no longer possible in this debate.',
  tenant_required: 'The debate service needs a school to be identified.',
};

export function debateErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const details = error.details;
  if (typeof details === 'object' && details !== null) {
    const code = (details as { error?: unknown }).error;
    if (typeof code === 'string') return code;
  }
  return error.code;
}

export function debateErrorMessage(error: unknown): string {
  const code = debateErrorCode(error);
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (error instanceof ApiError) {
    const detail = (error.details as { detail?: unknown } | null | undefined)?.detail;
    if (typeof detail === 'string' && detail.trim() !== '') return detail;
    if (error.status === 404 && code === 'dev_bypass_no_fixture') return 'The debate engine is not reachable from this server.';
    if (error.status >= 500) return 'The debate engine is not reachable right now.';
    return error.message;
  }
  return 'Something went wrong. Try again.';
}
