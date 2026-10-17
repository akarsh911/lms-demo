'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { ApiError } from '@/services/api';
import { mdmService } from '@/services/mdm';
import type { SchoolOfferingRow, SectionRow } from '@/types/school';
import type {
  AcademicSession,
  AcademicSessionWrite,
  Branch,
  BranchWrite,
  GradeLevel,
  GradeLevelWrite,
  OfferingWrite,
  SchoolHouse,
  SchoolHouseWrite,
  SectionWrite,
  Subject,
  SubjectGroup,
  SubjectGroupWrite,
  SubjectWrite,
} from '@/types/mdm';

function useMdmWrite<TData, TVars>(mutationFn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVars>({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.mdm.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.school.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.academic.all });
    },
  });
}

export function useCreateBranch() {
  return useMdmWrite<Branch, BranchWrite>((body) => mdmService.createBranch(body));
}

export function useUpdateBranch() {
  return useMdmWrite<Branch, { id: string; patch: BranchWrite }>(({ id, patch }) =>
    mdmService.updateBranch(id, patch),
  );
}

export function useDeleteBranch() {
  return useMdmWrite<void, string>((id) => mdmService.deleteBranch(id));
}

export function useCreateSession() {
  return useMdmWrite<AcademicSession, AcademicSessionWrite>((body) =>
    mdmService.createSession(body),
  );
}

export function useUpdateSession() {
  return useMdmWrite<AcademicSession, { id: string; patch: AcademicSessionWrite }>(
    ({ id, patch }) => mdmService.updateSession(id, patch),
  );
}

export function useDeleteSession() {
  return useMdmWrite<void, string>((id) => mdmService.deleteSession(id));
}

export function useCreateGradeLevel() {
  return useMdmWrite<GradeLevel, GradeLevelWrite>((body) =>
    mdmService.createGradeLevel(body),
  );
}

export function useUpdateGradeLevel() {
  return useMdmWrite<GradeLevel, { id: string; patch: GradeLevelWrite }>(
    ({ id, patch }) => mdmService.updateGradeLevel(id, patch),
  );
}

export function useDeleteGradeLevel() {
  return useMdmWrite<void, string>((id) => mdmService.deleteGradeLevel(id));
}

export function useCreateHouse() {
  return useMdmWrite<SchoolHouse, SchoolHouseWrite>((body) =>
    mdmService.createHouse(body),
  );
}

export function useUpdateHouse() {
  return useMdmWrite<SchoolHouse, { id: string; patch: SchoolHouseWrite }>(
    ({ id, patch }) => mdmService.updateHouse(id, patch),
  );
}

export function useDeleteHouse() {
  return useMdmWrite<void, string>((id) => mdmService.deleteHouse(id));
}

export function useCreateSubject() {
  return useMdmWrite<Subject, SubjectWrite>((body) => mdmService.createSubject(body));
}

export function useUpdateSubject() {
  return useMdmWrite<Subject, { id: string; patch: SubjectWrite }>(({ id, patch }) =>
    mdmService.updateSubject(id, patch),
  );
}

export function useDeleteSubject() {
  return useMdmWrite<void, string>((id) => mdmService.deleteSubject(id));
}

export function useCreateSubjectGroup() {
  return useMdmWrite<SubjectGroup, SubjectGroupWrite>((body) =>
    mdmService.createSubjectGroup(body),
  );
}

export function useUpdateSubjectGroup() {
  return useMdmWrite<SubjectGroup, { id: string; patch: SubjectGroupWrite }>(
    ({ id, patch }) => mdmService.updateSubjectGroup(id, patch),
  );
}

export function useDeleteSubjectGroup() {
  return useMdmWrite<void, string>((id) => mdmService.deleteSubjectGroup(id));
}

export function useCreateSection() {
  return useMdmWrite<SectionRow, SectionWrite>((body) => mdmService.createSection(body));
}

export function useUpdateSection() {
  return useMdmWrite<SectionRow, { id: string; patch: SectionWrite }>(({ id, patch }) =>
    mdmService.updateSection(id, patch),
  );
}

export function useDeleteSection() {
  return useMdmWrite<void, string>((id) => mdmService.deleteSection(id));
}

export function useCreateOffering() {
  return useMdmWrite<SchoolOfferingRow, OfferingWrite>((body) =>
    mdmService.createOffering(body),
  );
}

export function useUpdateOffering() {
  return useMdmWrite<SchoolOfferingRow, { id: string; patch: OfferingWrite }>(
    ({ id, patch }) => mdmService.updateOffering(id, patch),
  );
}

export function useDeleteOffering() {
  return useMdmWrite<void, string>((id) => mdmService.deleteOffering(id));
}
