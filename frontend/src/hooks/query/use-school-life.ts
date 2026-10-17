'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { schoolLifeService } from '@/services/school-life';
import type { FeeOverview, MyFees } from '@/types/fees';
import type { IncidentReport } from '@/types/incident';
import type { MyCalendar } from '@/types/my-calendar';
import type { MyPupilLeave, PupilLeave, PupilLeaveWrite } from '@/types/pupil-leave';

export const useMyCalendar = () => useQuery<MyCalendar, ApiError>({ queryKey: queryKeys.myCalendar(), queryFn: schoolLifeService.calendar });
export const usePupilLeave = () => useQuery<MyPupilLeave, ApiError>({ queryKey: queryKeys.pupilLeave(), queryFn: schoolLifeService.pupilLeave });
export const useMyFees = () => useQuery<MyFees, ApiError>({ queryKey: queryKeys.fees.mine(), queryFn: schoolLifeService.myFees });
export const useFeeOverview = () => useQuery<FeeOverview, ApiError>({ queryKey: queryKeys.fees.overview(), queryFn: schoolLifeService.feeOverview });

export function useApplyPupilLeave() {
  const queryClient = useQueryClient();
  return useMutation<PupilLeave, ApiError, PupilLeaveWrite>({ mutationFn: schoolLifeService.applyPupilLeave, onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.pupilLeave() }) });
}

export function useCancelPupilLeave() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({ mutationFn: schoolLifeService.cancelPupilLeave, onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.pupilLeave() }) });
}

// A report shows up in Actions for the class teacher and the office.
export function useReportIncident() {
  const queryClient = useQueryClient();
  return useMutation<{ id: string }, ApiError, IncidentReport>({ mutationFn: schoolLifeService.reportIncident, onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.actions.all }) });
}
