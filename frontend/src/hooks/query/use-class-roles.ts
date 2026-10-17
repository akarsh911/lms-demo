'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { classRolesService } from '@/services/class-roles';
import type { ClassDuty, ClassRoles, MyClassRole } from '@/types/class-roles';

export const useClassRoles = (sectionId: string) => useQuery<ClassRoles, ApiError>({ queryKey: queryKeys.classRoles.section(sectionId), queryFn: () => classRolesService.get(sectionId) });

export const useMyClassRole = () => useQuery<MyClassRole | null, ApiError>({ queryKey: queryKeys.classRoles.mine(), queryFn: classRolesService.mine });

export function useSetClassRole(sectionId: string) {
  const queryClient = useQueryClient();
  return useMutation<ClassRoles, ApiError, { role: 'monitor' | 'vice_monitor'; studentId: string | null } | { duty: ClassDuty; studentIds: string[] }>({
    mutationFn: (v) => ('role' in v ? classRolesService.setMonitor(sectionId, v.role, v.studentId) : classRolesService.setDuty(sectionId, v.duty, v.studentIds)),
    onSuccess: (data) => queryClient.setQueryData(queryKeys.classRoles.section(sectionId), data),
  });
}
