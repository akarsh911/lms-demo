'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { ROSTER_PAGE_SIZE } from '@/constants/roster';
import { rosteringService } from '@/services/rostering';
import { rosterService } from '@/services/roster';
import { MAX_PAGE } from '@/services/school';
import type { ApiError } from '@/services/api';
import type { EnrollmentRow, TeacherAssignmentRow } from '@/types/academic';
import type { SubjectEnrollmentRow } from '@/types/people-detail';
import type { RosterPage, StudentRow } from '@/types/roster';
import type { SchoolPage } from '@/types/school';

export function useSectionEnrolments(sectionId: string | null) {
  return useQuery<SchoolPage<EnrollmentRow>, ApiError>({
    queryKey: queryKeys.rostering.enrolments(sectionId ?? ''),
    queryFn: ({ signal }) =>
      rosteringService.listEnrollments({ section_id: sectionId! }, signal),
    enabled: Boolean(sectionId),
  });
}

export function useSectionRollNames(sectionId: string | null) {
  return useQuery<RosterPage<StudentRow>, ApiError>({
    queryKey: queryKeys.rostering.roll(sectionId ?? ''),
    queryFn: ({ signal }) =>
      rosterService.list<StudentRow>(
        'students',
        { limit: MAX_PAGE, offset: 0, filters: { section_id: sectionId! } },
        signal,
      ),
    enabled: Boolean(sectionId),
    retry: false,
  });
}

export function useStudentCandidates(search: string) {
  const term = search.trim();
  return useQuery<RosterPage<StudentRow>, ApiError>({
    queryKey: queryKeys.rostering.candidates(term),
    queryFn: ({ signal }) =>
      rosterService.list<StudentRow>(
        'students',
        { limit: ROSTER_PAGE_SIZE, offset: 0, q: term },
        signal,
      ),
    enabled: term.length >= 2,
    retry: false,
  });
}

export function useSectionTeaching(sectionId: string | null) {
  return useQuery<SchoolPage<TeacherAssignmentRow>, ApiError>({
    queryKey: queryKeys.rostering.teaching(sectionId ?? ''),
    queryFn: ({ signal }) =>
      rosteringService.listTeacherAssignments({ section_id: sectionId! }, signal),
    enabled: Boolean(sectionId),
  });
}

export function useOfferingEnrolments(offeringId: string | null) {
  return useQuery<SchoolPage<SubjectEnrollmentRow>, ApiError>({
    queryKey: queryKeys.rostering.subjectEnrolments(offeringId ?? ''),
    queryFn: ({ signal }) =>
      rosteringService.listSubjectEnrollments(
        { subject_offering_id: offeringId! },
        signal,
      ),
    enabled: Boolean(offeringId),
  });
}

export function useOfferingPupils(offeringId: string | null) {
  return useQuery<RosterPage<StudentRow>, ApiError>({
    queryKey: queryKeys.rostering.offeringPupils(offeringId ?? ''),
    queryFn: ({ signal }) =>
      rosterService.list<StudentRow>(
        'students',
        { limit: MAX_PAGE, offset: 0, filters: { subject_offering_id: offeringId! } },
        signal,
      ),
    enabled: Boolean(offeringId),
    retry: false,
  });
}
