import { ApiError } from '@/services/api';

export type ApiFailureKind = 'denied' | 'step_up' | 'signed_out' | 'unavailable';

export const SESSION_ENDED = 'Your session has ended. Sign in again to continue.';

export const STEP_UP_NEEDED = 'This action needs you to confirm it is you. Try again and complete the verification.';

export function apiFailureKind(error: unknown): ApiFailureKind {
  if (!(error instanceof ApiError)) return 'unavailable';
  if (error.isStepUpRequired) return 'step_up';
  if (error.isForbidden) return 'denied';
  if (error.status === 401) return 'signed_out';
  return 'unavailable';
}

export function isDenial(error: unknown): boolean {
  return apiFailureKind(error) === 'denied';
}

export const NOT_A_PERSON_HERE =
  'Your account is not yet a person at this school. emerge-core records who ' +
  'created each row, and it holds nobody against your sign-in, so it cannot ' +
  'record you as the author. An administrator has to add you to the school ' +
  'roster before this will save. Nothing you typed is wrong.';

const NO_PERSON_RECORD = 'has no person record';

export function isNotAPersonHere(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status !== 400 && error.status !== 403) return false;
  return error.message.toLowerCase().includes(NO_PERSON_RECORD);
}
