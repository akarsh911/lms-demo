'use client';

import { useQuery } from '@tanstack/react-query';

import { PERSON_PAGE_SIZE } from '@/constants/people-detail';
import { queryKeys } from '@/constants/query-keys';
import type { DateWindow } from '@/lib/people/window';
import type { ApiError } from '@/services/api';
import { peopleDetailService } from '@/services/people-detail';
import type {
  DetailPage,
  OccurrenceAnswer,
  StreamPostRow,
  TeacherAssignmentRow,
} from '@/types/people-detail';

const page = { limit: PERSON_PAGE_SIZE, offset: 0 };

export function useTeacherAssignments(teacherId: string) {
  return useQuery<DetailPage<TeacherAssignmentRow>, ApiError>({
    queryKey: queryKeys.person.teacherAssignments(teacherId),
    queryFn: ({ signal }) =>
      peopleDetailService.listTeacherAssignments(teacherId, page, signal),
    retry: false,
  });
}

export function useTeacherTimetable(
  teacherId: string,
  branchId: string | null,
  window: DateWindow,
) {
  return useQuery<OccurrenceAnswer, ApiError>({
    queryKey: queryKeys.person.occurrences(
      teacherId,
      branchId ?? '',
      window.from,
      window.to,
    ),
    queryFn: ({ signal }) =>
      peopleDetailService.resolveOccurrences(
        {
          teacher_id: teacherId,
          branch_id: branchId!,
          from: window.from,
          to: window.to,
        },
        signal,
      ),
    enabled: Boolean(branchId),
    retry: false,
  });
}

export function useAuthoredStream(authorPersonId: string | null) {
  return useQuery<DetailPage<StreamPostRow>, ApiError>({
    queryKey: queryKeys.person.stream(`author:${authorPersonId ?? ''}`),
    queryFn: ({ signal }) => peopleDetailService.listStreamPosts(page, signal),
    enabled: Boolean(authorPersonId),
    retry: false,
  });
}
