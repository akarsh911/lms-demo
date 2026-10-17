'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { leaveService } from '@/services/leave';
import type { LeaveWrite, StaffLeave } from '@/types/leave';

function useLeaveWrite<TVars>(mutationFn: (vars: TVars) => Promise<StaffLeave>) {
  const queryClient = useQueryClient();
  return useMutation<StaffLeave, ApiError, TVars>({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.leave.all });
      void queryClient.invalidateQueries({ queryKey: ['teaching'] });
    },
  });
}

export const useApplyLeave = () => useLeaveWrite<LeaveWrite>((body) => leaveService.apply(body));
export const useCancelLeave = () => useLeaveWrite<string>((id) => leaveService.cancel(id));
