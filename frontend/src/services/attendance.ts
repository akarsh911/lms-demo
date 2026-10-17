import { config } from '@/config';
import * as fixtures from '@/fixtures/daily';

import { attendanceApi } from './api';
import { dev } from './dev-bypass';
import type {
  AttendanceRoster,
  AttendanceSummary,
  ClassesResponse,
  MarkAttendanceInput,
  MarkAttendanceResult,
  RegisterProgress,
  StudentLeave,
} from '@/types/attendance';
import { ApiError } from './api';

/**
 * The attendance service.
 *
 * This layer is transport only: it names endpoints and their types and does
 * nothing else. No caching (that is the query hook), no React (so it can be
 * called from anywhere), no error interpretation beyond what `api.ts` already
 * does. Keeping it this thin is what makes the hooks readable.
 */
export const attendanceService = {
  /** The classes this user can take attendance for. */
  listClasses: (signal?: AbortSignal) =>
    config.devBypass ? dev(fixtures.classes) : attendanceApi.get<ClassesResponse>('classes', undefined, signal),

  getSummary: (classId: string, date: string, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => fixtures.attendanceSummary(classId, date))
      : attendanceApi.get<AttendanceSummary>('summary', { classId, date }, signal),

  getRoster: (classId: string, date: string, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => fixtures.attendanceRoster(classId, date))
      : attendanceApi.get<AttendanceRoster>('roster', { classId, date }, signal),

  // Leave and the school-wide register view have no attendance endpoint yet.
  leaves: (classId: string, date: string): Promise<StudentLeave[]> =>
    config.devBypass ? dev(() => fixtures.leavesOn(classId, date)) : Promise.reject(new ApiError(501, 'not_built', 'Leave records are not connected yet.')),

  registers: (date: string): Promise<RegisterProgress[]> =>
    config.devBypass ? dev(() => fixtures.registersOn(date)) : Promise.reject(new ApiError(501, 'not_built', 'The school-wide register is not connected yet.')),

  mark: (input: MarkAttendanceInput) =>
    config.devBypass
      ? dev(() => fixtures.markAttendance(input))
      : attendanceApi.post<MarkAttendanceResult>('marks', input),
};
