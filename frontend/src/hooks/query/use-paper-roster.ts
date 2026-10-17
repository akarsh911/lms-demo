'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { academicService } from '@/services/academic';
import { EXAM_MAX_PAGE } from '@/services/exams';
import { rosterService } from '@/services/roster';
import { paperRoster, takerIds, type PaperRosterRow } from '@/lib/exams/paper-roster';
import type { ApiError } from '@/services/api';
import type { AcademicPage, EnrollmentRow } from '@/types/academic';
import type { SubjectEnrollmentRow } from '@/types/people-detail';
import type { RosterPage, StudentRow } from '@/types/roster';

export interface PaperRoster {
  rows: PaperRosterRow[];
  isPending: boolean;
  isSettled: boolean;
  /** The whole roster failed and there is nothing to draw. */
  isEmptyFailure: boolean;
  takersError: ApiError | null;
  studentsError: ApiError | null;
  enrollmentsError: ApiError | null;
  /** True when nobody could say who actually takes this subject. */
  takersUnknown: boolean;
  truncated: boolean;
  refetch: () => void;
}

export function usePaperRoster(
  offeringId: string | null,
  sectionId: string | null,
): PaperRoster {
  const takers = useQuery<AcademicPage<SubjectEnrollmentRow>, ApiError>({
    queryKey: queryKeys.academic.offeringEnrollments(offeringId ?? ''),
    queryFn: ({ signal }) =>
      academicService.listOfferingEnrollments(
        offeringId!,
        { limit: EXAM_MAX_PAGE, offset: 0 },
        signal,
      ),
    enabled: Boolean(offeringId),
  });

  const students = useQuery<RosterPage<StudentRow>, ApiError>({
    queryKey: queryKeys.academic.classStudents(sectionId ?? ''),
    queryFn: ({ signal }) =>
      rosterService.list<StudentRow>(
        'students',
        { limit: EXAM_MAX_PAGE, offset: 0, filters: { section_id: sectionId! } },
        signal,
      ),
    enabled: Boolean(sectionId),
  });

  const enrollments = useQuery<AcademicPage<EnrollmentRow>, ApiError>({
    queryKey: queryKeys.academic.classEnrollments(sectionId ?? ''),
    queryFn: ({ signal }) =>
      academicService.listEnrollments(
        sectionId!,
        { limit: EXAM_MAX_PAGE, offset: 0 },
        signal,
      ),
    enabled: Boolean(sectionId),
  });

  const takerList = React.useMemo(
    () => (takers.data ? takerIds(takers.data.rows) : null),
    [takers.data],
  );

  const rows = React.useMemo(
    () =>
      paperRoster(
        students.data?.rows ?? [],
        enrollments.data?.rows ?? [],
        takerList,
      ),
    [students.data, enrollments.data, takerList],
  );

  const asked = Boolean(offeringId) && Boolean(sectionId);

  return {
    rows,
    isPending: asked && (takers.isPending || students.isPending || enrollments.isPending),
    isSettled:
      asked && takers.isFetched && students.isFetched && enrollments.isFetched,
    isEmptyFailure:
      takers.isError &&
      students.isError &&
      enrollments.isError,
    takersError: takers.isError ? takers.error : null,
    studentsError: students.isError ? students.error : null,
    enrollmentsError: enrollments.isError ? enrollments.error : null,
    takersUnknown: takers.isError,
    truncated: Boolean(
      takers.data?.page.has_more ||
        students.data?.page.has_more ||
        enrollments.data?.page.has_more,
    ),
    refetch: () => {
      void takers.refetch();
      void students.refetch();
      void enrollments.refetch();
    },
  };
}
