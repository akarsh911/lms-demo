'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { mdmService } from '@/services/mdm';
import type { ApiError } from '@/services/api';
import type { SchoolPage, SchoolOfferingRow, SectionRow } from '@/types/school';
import type {
  AcademicSession,
  Branch,
  GradeLevel,
  SchoolHouse,
  Subject,
  SubjectGroup,
} from '@/types/mdm';

export function useMdmBranches() {
  return useQuery<SchoolPage<Branch>, ApiError>({
    queryKey: queryKeys.mdm.branches(),
    queryFn: ({ signal }) => mdmService.listBranches(signal),
  });
}

export function useMdmSessions() {
  return useQuery<SchoolPage<AcademicSession>, ApiError>({
    queryKey: queryKeys.mdm.sessions(),
    queryFn: ({ signal }) => mdmService.listSessions(signal),
  });
}

export function useMdmGradeLevels() {
  return useQuery<SchoolPage<GradeLevel>, ApiError>({
    queryKey: queryKeys.mdm.gradeLevels(),
    queryFn: ({ signal }) => mdmService.listGradeLevels(signal),
  });
}

export function useMdmHouses() {
  return useQuery<SchoolPage<SchoolHouse>, ApiError>({
    queryKey: queryKeys.mdm.houses(),
    queryFn: ({ signal }) => mdmService.listHouses(signal),
  });
}

export function useMdmSubjects() {
  return useQuery<SchoolPage<Subject>, ApiError>({
    queryKey: queryKeys.mdm.subjects(),
    queryFn: ({ signal }) => mdmService.listSubjects(signal),
  });
}

export function useMdmSubjectGroups() {
  return useQuery<SchoolPage<SubjectGroup>, ApiError>({
    queryKey: queryKeys.mdm.subjectGroups(),
    queryFn: ({ signal }) => mdmService.listSubjectGroups(signal),
  });
}

export function useMdmSections(branchId: string | null, sessionId: string | null) {
  return useQuery<SchoolPage<SectionRow>, ApiError>({
    queryKey: queryKeys.mdm.sections(branchId ?? '', sessionId ?? ''),
    queryFn: ({ signal }) =>
      mdmService.listSections(
        {
          branch_id: branchId!,
          ...(sessionId ? { academic_session_id: sessionId } : {}),
        },
        signal,
      ),
    enabled: Boolean(branchId),
  });
}

export function useMdmOfferings(sectionId: string | null) {
  return useQuery<SchoolPage<SchoolOfferingRow>, ApiError>({
    queryKey: queryKeys.mdm.offerings(sectionId ?? ''),
    queryFn: ({ signal }) =>
      mdmService.listOfferings({ section_id: sectionId! }, signal),
    enabled: Boolean(sectionId),
  });
}
