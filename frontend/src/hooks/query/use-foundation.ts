'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { foundationService } from '@/services/foundation';
import type {
  PendingTask,
  RoomInsight,
  SchoolOverview,
  SchoolProfile,
  SchoolSetup,
  WorkingWeek,
  YearClassRow,
  YearEnrollment,
  YearRegister,
  YearSetupArea,
  YearEvent,
  YearTeaching,
  YearTransition,
} from '@/types/foundation';

export function useSchoolOverview() {
  return useQuery<SchoolOverview, ApiError>({
    queryKey: queryKeys.foundation.overview(),
    queryFn: () => foundationService.getOverview(),
  });
}

export function useSchoolSetup() {
  return useQuery<SchoolSetup, ApiError>({
    queryKey: queryKeys.foundation.setup(),
    queryFn: () => foundationService.getSetup(),
  });
}

export function useSchoolProfile() {
  return useQuery<SchoolProfile, ApiError>({
    queryKey: queryKeys.foundation.profile(),
    queryFn: () => foundationService.getProfile(),
  });
}

export function useWorkingWeek(yearId: string) {
  return useQuery<WorkingWeek, ApiError>({
    queryKey: queryKeys.foundation.workingWeek(yearId),
    queryFn: () => foundationService.getWorkingWeek(yearId),
  });
}

export function useRoomInsights() {
  return useQuery<RoomInsight[], ApiError>({
    queryKey: queryKeys.foundation.roomInsights(),
    queryFn: () => foundationService.listRoomInsights(),
  });
}

export function useRoomInsight(roomId: string) {
  return useQuery<RoomInsight, ApiError>({
    queryKey: queryKeys.foundation.roomInsight(roomId),
    queryFn: () => foundationService.getRoomInsight(roomId),
  });
}

export function useYearRegisters() {
  return useQuery<YearRegister[], ApiError>({
    queryKey: queryKeys.foundation.yearRegisters(),
    queryFn: () => foundationService.listYearRegisters(),
  });
}

export function useYearRegister(yearId: string) {
  return useQuery<YearRegister, ApiError>({
    queryKey: queryKeys.foundation.yearRegister(yearId),
    queryFn: () => foundationService.getYearRegister(yearId),
  });
}

// Every student view of a year reads this one list and filters it; none of them fetches its own.
export function useYearEnrollments(yearId: string) {
  return useQuery<YearEnrollment[], ApiError>({
    queryKey: queryKeys.foundation.yearEnrollments(yearId),
    queryFn: () => foundationService.listYearEnrollments(yearId),
    enabled: Boolean(yearId),
  });
}

export function useSetupAreas(yearId: string) {
  return useQuery<YearSetupArea[], ApiError>({
    queryKey: queryKeys.foundation.setupAreas(yearId),
    queryFn: () => foundationService.listSetupAreas(yearId),
  });
}

export function usePendingTasks(yearId: string) {
  return useQuery<PendingTask[], ApiError>({
    queryKey: queryKeys.foundation.pendingTasks(yearId),
    queryFn: () => foundationService.listPendingTasks(yearId),
  });
}

export function useYearClasses(yearId: string) {
  return useQuery<YearClassRow[], ApiError>({
    queryKey: queryKeys.foundation.yearClasses(yearId),
    queryFn: () => foundationService.listYearClasses(yearId),
  });
}

export function useYearTeaching(yearId: string) {
  return useQuery<YearTeaching, ApiError>({
    queryKey: queryKeys.foundation.yearTeaching(yearId),
    queryFn: () => foundationService.getYearTeaching(yearId),
  });
}

export function useYearEvents(yearId: string) {
  return useQuery<YearEvent[], ApiError>({
    queryKey: queryKeys.foundation.yearEvents(yearId),
    queryFn: () => foundationService.listYearEvents(yearId),
  });
}


export function useYearTransition(yearId: string) {
  return useQuery<YearTransition, ApiError>({
    queryKey: queryKeys.foundation.yearTransition(yearId),
    queryFn: () => foundationService.getYearTransition(yearId),
  });
}
