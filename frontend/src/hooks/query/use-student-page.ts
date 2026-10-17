'use client';

import { useQuery } from '@tanstack/react-query';

import { PERSON_PAGE_SIZE } from '@/constants/people-detail';
import { queryKeys } from '@/constants/query-keys';
import type { DateWindow } from '@/lib/people/window';
import type { ApiError } from '@/services/api';
import { peopleDetailService, targetIdParam } from '@/services/people-detail';
import type {
  AssignmentRow,
  AssignmentSubmissionRow,
  AttendanceDayRow,
  AttendancePeriodRow,
  DetailPage,
  StreamPostRow,
  StudentEnrollmentRow,
  SubjectEnrollmentRow,
} from '@/types/people-detail';

const page = { limit: PERSON_PAGE_SIZE, offset: 0 };

export function useStudentEnrollments(studentId: string) {
  return useQuery<DetailPage<StudentEnrollmentRow>, ApiError>({
    queryKey: queryKeys.person.studentEnrollments(studentId),
    queryFn: ({ signal }) =>
      peopleDetailService.listStudentEnrollments(studentId, page, signal),
    retry: false,
  });
}

export function useStudentSubjects(studentId: string) {
  return useQuery<DetailPage<SubjectEnrollmentRow>, ApiError>({
    queryKey: queryKeys.person.subjectEnrollments(studentId),
    queryFn: ({ signal }) =>
      peopleDetailService.listSubjectEnrollments(studentId, page, signal),
    retry: false,
  });
}

// A whole session reads at the 200-row page ceiling; a full year of school days fits under it.
export function useStudentAttendanceDays(studentId: string, window: DateWindow, limit = page.limit) {
  return useQuery<DetailPage<AttendanceDayRow>, ApiError>({
    queryKey: [...queryKeys.person.attendanceDays(studentId, window.from, window.to), limit],
    queryFn: ({ signal }) =>
      peopleDetailService.listAttendanceDays(
        { ...page, limit, student_id: studentId, from: window.from, to: window.to },
        signal,
      ),
    retry: false,
  });
}

export function useStudentAttendancePeriods(studentId: string, window: DateWindow) {
  return useQuery<DetailPage<AttendancePeriodRow>, ApiError>({
    queryKey: queryKeys.person.attendancePeriods(studentId, window.from, window.to),
    queryFn: ({ signal }) =>
      peopleDetailService.listAttendancePeriods(
        { ...page, student_id: studentId, from: window.from, to: window.to },
        signal,
      ),
    retry: false,
  });
}

export function useStudentAssignments(targetIds: readonly string[]) {
  const targets = targetIdParam(targetIds);
  return useQuery<DetailPage<AssignmentRow>, ApiError>({
    queryKey: queryKeys.person.assignments(targets ?? ''),
    queryFn: ({ signal }) =>
      peopleDetailService.listAssignments({ ...page, target_id: targets }, signal),
    enabled: Boolean(targets),
    retry: false,
  });
}

export function useStudentSubmissions(studentId: string) {
  return useQuery<DetailPage<AssignmentSubmissionRow>, ApiError>({
    queryKey: queryKeys.person.submissions(studentId),
    queryFn: ({ signal }) =>
      peopleDetailService.listSubmissions({ ...page, student_id: studentId }, signal),
    retry: false,
  });
}

export function useStudentStream(targetIds: readonly string[]) {
  const targets = targetIdParam(targetIds);
  return useQuery<DetailPage<StreamPostRow>, ApiError>({
    queryKey: queryKeys.person.stream(targets ?? ''),
    queryFn: ({ signal }) =>
      peopleDetailService.listStreamPosts({ ...page, target_id: targets }, signal),
    enabled: Boolean(targets),
    retry: false,
  });
}
