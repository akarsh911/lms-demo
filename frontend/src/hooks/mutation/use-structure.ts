import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { structureService } from '@/services/structure';
import type { AcademicGroup, ClassSubject, GroupKind, SubjectAdd, RollAssignment, SectionMove, SectionWrite, StructureSection } from '@/types/structure';

// A change to a section reaches the year register, Actions, the directory and the grades rosters, so all of them refresh.
function useStructureWrite<TData, TVars>(mutationFn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVars>({
    mutationFn,
    onSettled: () => {
      for (const key of [queryKeys.structure.all, queryKeys.foundation.all, queryKeys.school.all, queryKeys.mdm.all, queryKeys.directory.all, queryKeys.grades.all]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export const useCreateSection = (yearId: string, gradeId: string) =>
  useStructureWrite<StructureSection, SectionWrite>((body) => structureService.createSection(yearId, gradeId, body));

export const useSetSubjectTeacher = () =>
  useStructureWrite<ClassSubject['sections'][number], { offeringId: string; teacherId: string | null }>(({ offeringId, teacherId }) => structureService.setSubjectTeacher(offeringId, teacherId));

export const useAddSubject = (yearId: string) => useStructureWrite<number, SubjectAdd>((body) => structureService.addSubject(yearId, body));

export const useKeepAsOneClass = (yearId: string, gradeId: string) => useStructureWrite<StructureSection, void>(() => structureService.keepAsOneClass(yearId, gradeId));

export const useUpdateSection = () =>
  useStructureWrite<StructureSection, { sectionId: string; body: SectionWrite }>(({ sectionId, body }) => structureService.updateSection(sectionId, body));

export const useApplyMoves = (yearId: string) =>
  useStructureWrite<number, { moves: readonly SectionMove[]; reason?: string }>(({ moves, reason }) => structureService.applyMoves(yearId, moves, reason));

export const useAssignRolls = () =>
  useStructureWrite<number, { sectionId: string; rolls: readonly RollAssignment[] }>(({ sectionId, rolls }) => structureService.assignRolls(sectionId, rolls));

export const useMergeSections = () =>
  useStructureWrite<number, { fromId: string; intoId: string }>(({ fromId, intoId }) => structureService.mergeSections(fromId, intoId));

export const useCreateGroup = () =>
  useStructureWrite<AcademicGroup, { sectionId: string; name: string; kind: GroupKind }>(({ sectionId, name, kind }) => structureService.createGroup(sectionId, name, kind));

export const useSetGroupMembers = () =>
  useStructureWrite<AcademicGroup, { groupId: string; studentIds: readonly string[] }>(({ groupId, studentIds }) => structureService.setGroupMembers(groupId, studentIds));

export const useRemoveGroup = () => useStructureWrite<void, string>((groupId) => structureService.removeGroup(groupId));

export const useApplyNextYearProposal = (yearId: string, gradeId: string) =>
  useStructureWrite<number, readonly SectionMove[]>((moves) => structureService.applyNextYearProposal(yearId, gradeId, moves));
