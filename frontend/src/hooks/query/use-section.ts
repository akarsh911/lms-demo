'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { CLASSROOM_PAGE_SIZE } from '@/constants/classroom';
import type { ApiError } from '@/services/api';
import { academicService } from '@/services/academic';
import type {
  AcademicPage,
  SectionRow,
  SubjectOfferingRow,
  TeacherAssignmentRow,
} from '@/types/academic';

export function useSection(sectionId: string) {
  return useQuery<SectionRow, ApiError>({
    queryKey: queryKeys.academic.section(sectionId),
    queryFn: ({ signal }) => academicService.getSection(sectionId, signal),
  });
}

export function useOffering(offeringId: string) {
  return useQuery<SubjectOfferingRow, ApiError>({
    queryKey: queryKeys.academic.offering(offeringId),
    queryFn: ({ signal }) => academicService.getOffering(offeringId, signal),
    enabled: offeringId !== '',
  });
}

export function useTeacherAssignments(sectionId: string) {
  return useQuery<AcademicPage<TeacherAssignmentRow>, ApiError>({
    queryKey: queryKeys.academic.teachersOf(sectionId),
    queryFn: ({ signal }) =>
      academicService.listTeacherAssignments(
        sectionId,
        { limit: CLASSROOM_PAGE_SIZE, offset: 0 },
        signal,
      ),
  });
}
