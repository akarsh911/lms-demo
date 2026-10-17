'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { CLASSROOM_PAGE_SIZE } from '@/constants/classroom';
import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { classroomService } from '@/services/classroom';
import { libraryService } from '@/services/library';
import type { Week } from '@/lib/classroom/week';
import type {
  AssignmentItemRow,
  AssignmentRow,
  AssignmentSubmissionRow,
  ClassroomPage,
  OccurrenceWindow,
  StreamCommentRow,
  StreamPostRow,
} from '@/types/classroom';
import type { LibraryPage } from '@/types/library';

export function useSectionWeek(
  branchId: string | undefined,
  sectionId: string,
  week: Week,
) {
  return useQuery<OccurrenceWindow, ApiError>({
    queryKey: queryKeys.classroom.week(sectionId, week.from, week.to),
    queryFn: ({ signal }) =>
      classroomService.resolveOccurrences(
        branchId!,
        sectionId,
        week.from,
        week.to,
        signal,
      ),
    enabled: Boolean(branchId),
    placeholderData: keepPreviousData,
  });
}

export function useStreamPosts(
  targetIds: readonly string[],
  offset: number,
  liveOnly = true,
) {
  const targets = [...targetIds].sort().join(',');
  return useQuery<ClassroomPage<StreamPostRow>, ApiError>({
    queryKey: queryKeys.classroom.stream(targets, offset, liveOnly),
    queryFn: ({ signal }) =>
      classroomService.listStreamPosts(
        targetIds,
        { limit: CLASSROOM_PAGE_SIZE, offset },
        liveOnly,
        signal,
      ),
    enabled: targetIds.length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useStreamComments(postId: string, open: boolean) {
  return useQuery<ClassroomPage<StreamCommentRow>, ApiError>({
    queryKey: queryKeys.classroom.comments(postId),
    queryFn: ({ signal }) =>
      classroomService.listStreamComments(
        postId,
        { limit: CLASSROOM_PAGE_SIZE, offset: 0 },
        signal,
      ),
    enabled: open,
  });
}

export function useAssignments(offeringId: string, offset: number) {
  return useQuery<ClassroomPage<AssignmentRow>, ApiError>({
    queryKey: queryKeys.classroom.assignments(offeringId, offset),
    queryFn: ({ signal }) =>
      classroomService.listAssignments(
        offeringId,
        { limit: CLASSROOM_PAGE_SIZE, offset },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
}

export function useAssignmentItems(assignmentId: string, open: boolean) {
  return useQuery<ClassroomPage<AssignmentItemRow>, ApiError>({
    queryKey: queryKeys.classroom.assignmentItems(assignmentId),
    queryFn: ({ signal }) =>
      classroomService.listAssignmentItems(
        assignmentId,
        { limit: CLASSROOM_PAGE_SIZE, offset: 0 },
        signal,
      ),
    enabled: open,
  });
}

export function useAssignmentSubmissions(assignmentId: string, open: boolean) {
  return useQuery<ClassroomPage<AssignmentSubmissionRow>, ApiError>({
    queryKey: queryKeys.classroom.submissions(assignmentId),
    queryFn: ({ signal }) =>
      classroomService.listSubmissions(
        assignmentId,
        { limit: CLASSROOM_PAGE_SIZE, offset: 0 },
        signal,
      ),
    enabled: open,
  });
}

export function useFiledContent(
  filters: Record<string, string | undefined>,
  enabled: boolean,
) {
  const scope = Object.entries(filters)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('&');

  return useQuery<LibraryPage, ApiError>({
    queryKey: queryKeys.library.filed(scope),
    queryFn: ({ signal }) =>
      libraryService.listItems(
        { limit: CLASSROOM_PAGE_SIZE, offset: 0, filters },
        signal,
      ),
    enabled: enabled && scope !== '',
  });
}
