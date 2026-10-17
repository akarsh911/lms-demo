'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { attendanceService } from '@/services/attendance';
import { ApiError } from '@/services/api';
import type {
  AttendanceRoster,
  MarkAttendanceInput,
  MarkAttendanceResult,
} from '@/types/attendance';

/**
 * REFERENCE MUTATION HOOK — copy this shape.
 *
 * Shows the full optimistic-update cycle, which is the part teams usually get
 * half-right:
 *
 *   onMutate   cancel in-flight reads, snapshot, apply the optimistic change
 *   onError    roll back to the snapshot
 *   onSettled  invalidate so the server's answer wins in the end
 *
 * `cancelQueries` is not optional. A refetch already in flight will resolve
 * AFTER the optimistic write and overwrite it with pre-mutation data — the
 * change appears to apply and then silently reverts a moment later.
 *
 * On authorization: a 403 here is the real answer. The UI gate decided this
 * button was worth OFFERING; CAS decides whether the action is PERMITTED. They
 * are different questions and a 403 is a legitimate outcome, not a bug — which
 * is exactly why the frontend gate is never a security boundary.
 */
export function useMarkAttendance(classId: string, date: string) {
  const queryClient = useQueryClient();
  const rosterKey = queryKeys.attendance.roster(classId, date);

  return useMutation<
    MarkAttendanceResult,
    ApiError,
    MarkAttendanceInput,
    { previous: AttendanceRoster | undefined }
  >({
    mutationFn: (input) => attendanceService.mark(input),

    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: rosterKey });
      const previous = queryClient.getQueryData<AttendanceRoster>(rosterKey);

      if (previous) {
        const byStudent = new Map(input.marks.map((m) => [m.studentId, m.status]));
        queryClient.setQueryData<AttendanceRoster>(rosterKey, {
          ...previous,
          entries: previous.entries.map((entry) =>
            byStudent.has(entry.studentId)
              ? { ...entry, status: byStudent.get(entry.studentId)! }
              : entry,
          ),
        });
      }

      return { previous };
    },

    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(rosterKey, context.previous);
    },

    onSettled: () => {
      // The whole attendance prefix: marking a roster changes the summary too,
      // and invalidating only the roster leaves the counts visibly stale.
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all });
    },
  });
}
