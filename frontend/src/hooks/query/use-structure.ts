import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { structureService } from '@/services/structure';
import type { ClassSubject, DistributionProposal, MergePreview, RoomOption, TeacherOption, YearStructure } from '@/types/structure';

export function useYearStructure(yearId: string | undefined) {
  return useQuery<YearStructure, ApiError>({
    queryKey: queryKeys.structure.year(yearId ?? ''),
    queryFn: () => structureService.getStructure(yearId ?? ''),
    enabled: Boolean(yearId),
    placeholderData: keepPreviousData,
  });
}

export function useClassSubjects(yearId: string, gradeId: string) {
  return useQuery<ClassSubject[], ApiError>({
    queryKey: queryKeys.structure.subjects(yearId, gradeId),
    queryFn: () => structureService.listClassSubjects(yearId, gradeId),
  });
}

export function useMergePreview(fromId: string, intoId: string) {
  return useQuery<MergePreview, ApiError>({
    queryKey: queryKeys.structure.merge(fromId, intoId),
    queryFn: () => structureService.mergePreview(fromId, intoId),
    enabled: Boolean(fromId && intoId),
  });
}

export function useRecommendation(yearId: string, gradeId: string, enabled: boolean) {
  return useQuery<DistributionProposal, ApiError>({
    queryKey: queryKeys.structure.recommendation(yearId, gradeId),
    queryFn: () => structureService.getRecommendation(yearId, gradeId),
    enabled,
  });
}

export function useNextYearProposal(yearId: string, gradeId: string, enabled: boolean) {
  return useQuery<DistributionProposal, ApiError>({
    queryKey: queryKeys.structure.proposal(yearId, gradeId),
    queryFn: () => structureService.getNextYearProposal(yearId, gradeId),
    enabled,
  });
}

export function useRoomOptions(yearId: string, enabled: boolean) {
  return useQuery<RoomOption[], ApiError>({ queryKey: queryKeys.structure.rooms(yearId), queryFn: () => structureService.listRoomOptions(yearId), enabled });
}

export function useTeacherOptions(yearId: string, enabled: boolean) {
  return useQuery<TeacherOption[], ApiError>({ queryKey: queryKeys.structure.teachers(yearId), queryFn: () => structureService.listTeacherOptions(yearId), enabled });
}
