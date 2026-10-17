'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { ApiError } from '@/services/api';
import { rosteringService } from '@/services/rostering';
import type { EnrollmentRow, TeacherAssignmentRow } from '@/types/academic';
import type { SubjectEnrollmentRow } from '@/types/people-detail';
import type {
  EnrollmentWrite,
  SubjectEnrollmentWrite,
  TeacherAssignmentWrite,
} from '@/types/rostering';

function useRosteringWrite<TData, TVars>(mutationFn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVars>({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.rostering.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.academic.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.roster.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.school.all });
    },
  });
}

export function useCreateEnrolment() {
  return useRosteringWrite<EnrollmentRow, EnrollmentWrite>((body) =>
    rosteringService.createEnrollment(body),
  );
}

export function useUpdateEnrolment() {
  return useRosteringWrite<EnrollmentRow, { id: string; patch: EnrollmentWrite }>(
    ({ id, patch }) => rosteringService.updateEnrollment(id, patch),
  );
}

export function useDeleteEnrolment() {
  return useRosteringWrite<void, string>((id) => rosteringService.deleteEnrollment(id));
}

export function useCreateTeaching() {
  return useRosteringWrite<TeacherAssignmentRow, TeacherAssignmentWrite>((body) =>
    rosteringService.createTeacherAssignment(body),
  );
}

export function useUpdateTeaching() {
  return useRosteringWrite<
    TeacherAssignmentRow,
    { id: string; patch: TeacherAssignmentWrite }
  >(({ id, patch }) => rosteringService.updateTeacherAssignment(id, patch));
}

export function useDeleteTeaching() {
  return useRosteringWrite<void, string>((id) =>
    rosteringService.deleteTeacherAssignment(id),
  );
}

export function useCreateSubjectEnrolment() {
  return useRosteringWrite<SubjectEnrollmentRow, SubjectEnrollmentWrite>((body) =>
    rosteringService.createSubjectEnrollment(body),
  );
}

export function useUpdateSubjectEnrolment() {
  return useRosteringWrite<
    SubjectEnrollmentRow,
    { id: string; patch: SubjectEnrollmentWrite }
  >(({ id, patch }) => rosteringService.updateSubjectEnrollment(id, patch));
}

export function useDeleteSubjectEnrolment() {
  return useRosteringWrite<void, string>((id) =>
    rosteringService.deleteSubjectEnrollment(id),
  );
}
